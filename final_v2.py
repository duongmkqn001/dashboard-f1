#!/usr/bin/env python3
"""
Final Confluence Template Export — Accurate extraction.
====================================================
Confluence SOP pages contain PROCEDURAL tables (# | Steps | Actions | Visuals).
The actual canned response template NAMES are found in the Change Log table
(8 columns: Change #, Date, Effective Date, QC Impact, Who This Affects).

Strategy:
  1. Parse Change Log tables for all change entries (AOPS + FMOP)
  2. Categorize by Change # prefix (AOPS-### vs FMOP-### vs WCRT-###)
  3. Cross-reference with SOP page list
  4. Export CSV with Project → Category → Template structure
"""
import re, csv, os, json
from html.parser import HTMLParser

os.makedirs("confluence_export", exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# Table Parser
# ─────────────────────────────────────────────────────────────────────────────
class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = self.in_row = self.in_cell = False
        self.current_row = []
        self.tables = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.in_table = True; self.tables.append([])
        elif tag == "tr" and self.in_table:
            self.in_row = True; self.current_row = []
        elif tag in ("td","th") and self.in_row:
            self.in_cell = True; self._cell = ""

    def handle_endtag(self, tag):
        if tag == "table": self.in_table = False
        elif tag == "tr" and self.in_row:
            self.in_row = False
            if self.current_row and self.tables: self.tables[-1].append(self.current_row[:])
        elif tag in ("td","th") and self.in_cell:
            self.in_cell = False; self.current_row.append(self._cell.strip())

    def handle_data(self, data):
        if self.in_cell: self._cell += data

def parse_tables(html):
    p = TableParser(); p.feed(html); return p.tables

def c(t): return re.sub(r'\s+', ' ', t).strip()
def is_cjk(t): return bool(re.search(r'[\u4e00-\u9fff]', t))

# ─────────────────────────────────────────────────────────────────────────────
# Load data
# ─────────────────────────────────────────────────────────────────────────────
with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}

# Change Log (the main table with all template changes)
cl_data = sop_data.get(1256143084, {})
cl_body = cl_data.get("body", "")

# Canonical page for the tabs structure
with open("confluence_export/dcs2s_storage_raw.html", encoding="utf-8") as f:
    canonical = f.read()

print("=" * 70)
print("EXTRACTING TEMPLATES FROM CHANGE LOG TABLE")
print("=" * 70)

tables = parse_tables(cl_body)
print(f"Change Log tables found: {len(tables)}")

# Find the main change table (8 columns)
change_table = None
for t in tables:
    if len(t) > 5 and len(t[0]) >= 5:
        h = [c(cell) for cell in t[0]]
        print(f"  Table headers: {h}")
        if "Change" in h[0] and "Date" in "".join(h):
            change_table = t
            print("  => SELECTED AS CHANGE TABLE")

if change_table:
    rows = change_table
    print(f"\nChange table: {len(rows)} rows × {len(rows[0]) if rows else 0} cols")

    # Print header
    print(f"  Header: {[c(h) for h in rows[0]]}")
    print(f"\n  First 5 data rows:")
    for row in rows[1:6]:
        print(f"    {[c(cell)[:60] for cell in row]}")
else:
    rows = []
    print("No change table found")

# ─────────────────────────────────────────────────────────────────────────────
# Parse change entries into structured template data
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("PARSING CHANGE ENTRIES")
print("=" * 70)

def parse_change_row(row):
    """Parse a change log row into structured data."""
    if len(row) < 5:
        return None
    cells = [c(cell) for cell in row]
    change_num = cells[0] if len(cells) > 0 else ""
    date_added = cells[1] if len(cells) > 1 else ""
    effective_date = cells[2] if len(cells) > 2 else ""
    qc_impact = cells[3] if len(cells) > 3 else ""
    who_affected = cells[4] if len(cells) > 4 else ""
    template_name = cells[5] if len(cells) > 5 else ""
    version = cells[6] if len(cells) > 6 else ""
    return {
        "change_num": change_num,
        "date_added": date_added,
        "effective_date": effective_date,
        "qc_impact": qc_impact,
        "who_affected": who_affected,
        "template_name": template_name,
        "version": version,
    }

entries = []
if change_table:
    for row in change_table[1:]:  # skip header
        entry = parse_change_row(row)
        if entry and entry["change_num"]:
            entries.append(entry)

print(f"Parsed {len(entries)} change log entries")

# Categorize entries by Change # prefix
for e in entries:
    cn = e["change_num"]
    if re.match(r'AOPS-\d+', cn):
        e["project"] = "AOPS/POS Templates"
    elif re.match(r'FMOP-\d+', cn):
        e["project"] = "FMOP Templates"
    elif re.match(r'WCRT-\d+', cn):
        e["project"] = "AOPS/POS Templates"
        e["category"] = "WCRT - Wrong Catalog Received"
    elif re.match(r'FMOC-\d+', cn):
        e["project"] = "FMOP Templates"
    else:
        e["project"] = "AOPS/POS Templates"  # default

# Count by prefix
prefixes = {}
for e in entries:
    pn = re.match(r'([A-Z]+)-\d+', e["change_num"])
    if pn:
        p = pn.group(1)
        prefixes[p] = prefixes.get(p, 0) + 1

print("\nChange number prefixes:")
for p, n in sorted(prefixes.items(), key=lambda x: -x[1]):
    print(f"  {p}: {n}")

print("\nSample entries:")
for e in entries[:10]:
    print(f"  {e['change_num']:10} | {e['template_name'][:60]}")

# ─────────────────────────────────────────────────────────────────────────────
# Build full CSV with all columns
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("BUILDING CSV")
print("=" * 70)

COLUMNS = [
    "Change #",
    "Project",
    "Category",
    "Template Name",
    "Date Added",
    "Effective Date",
    "QC Impact Date",
    "Who This Affects",
    "Version",
    "Change # Link",
    "Notes",
]

rows_out = [COLUMNS]

# SOP page ID map
sop_id_map = {
    "Cancellation Inquiry SOP (DSC2S) - VCN": 1256144980,
    "Cannot Print a BOL / Packing Slip or Shipping Label SOP (DSC2S) - VCN": 1256144848,
    "Change Ship Method on PO - Not Shipped SOP (DSC2S) - VCN": 1256187304,
    "Change Ship Method or Carrier on PO Due to Item Count / Size (Supplier Entered) SOP (DSC2S) - VCN": 1256177851,
    "Escalating for Onshore Support (Tier 0 to Tier 1) SOP (DSC2S) - VCN": 1256143521,
    "Global Transfer Matrix SOP (DSC2S)": 1256175181,
    "Global Transfer Matrix SOP (DSC2S) - VCN": 1256116838,
    "Lead Times SOP (DSC2S) - VCN": 1256095751,
    "Multiple Damages SOP (DSC2S) - VCN": 1256177249,
    "NMFC and Freight Code Requests SOP (DSC2S)": 1256164604,
    "Need PO to be Resent SOP (DSC2S) - VCN": 1256143524,
    "Onshore Escalations SOP (DSC2S)": 1256125472,
    "PO Reroutes SOP (DSC2S)": 1256145383,
    "PO Reroutes SOP (DSC2S) - VCN": 1256152114,
    "PO has a Wrong Price SOP (DSC2S) - VCN": 1256143020,
    "Problem with an Order (PWAO) SOP (DSC2S)": 1256152285,
    "Product Out of Stock SOP (DSC2S) - VCN": 1256143448,
    "Shipping/Carrier Questions SOP (DSC2S) - VCN": 1256161082,
    "Split PO SOP (DSC2S) - VCN": 1256187459,
    "Tier 1 Ad Hoc Requests SOP (DSC2S)": 1256149108,
    "Update Tracking Number/Order Status SOP (DSC2S) - VCN": 1256153189,
    "WDN Supplier Outreach SOP (DSC2S) - VCN": 1256154202,
    "WIMS - Large Parcel SOP (DSC2S)": 1256174350,
    "WIMS - Ship Status SOP (DSC2S)": 1256176186,
}

# Categorize based on template name keywords
cat_rules = [
    ("WCRT", "WCRT - Wrong Catalog Received"),
    ("Wrong Catalog", "WCRT - Wrong Catalog Received"),
    ("Cancellation", "Cancellation Inquiries"),
    ("Cannot Print", "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("BOL", "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("Packing Slip", "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("Shipping Label", "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("PWAO", "Problem with an Order (PWAO)"),
    ("Problem with an Order", "Problem with an Order (PWAO)"),
    ("PO Reroute", "PO Reroutes"),
    ("Reroutes", "PO Reroutes"),
    ("Update Tracking", "Update Tracking Number/Order Status"),
    ("Tracking Number", "Update Tracking Number/Order Status"),
    ("Product Out of Stock", "Product Out of Stock"),
    ("Out of Stock", "Product Out of Stock"),
    ("Change Ship on PO", "Change Ship Method (CS Entered)"),
    ("Change Ship Method", "Change Ship Method (CS Entered)"),
    ("Carrier on PO", "Change Ship Method (Supplier Entered)"),
    ("Item Count", "Change Ship Method (Supplier Entered)"),
    ("Shipping/Carrier", "Shipping/Carrier Questions"),
    ("Carrier Question", "Shipping/Carrier Questions"),
    ("Split PO", "Split PO"),
    ("Wrong Price", "PO Has a Wrong Price"),
    ("PO has a Wrong Price", "PO Has a Wrong Price"),
    ("Global Transfer", "Global Transfer Matrix"),
    ("Lead Time", "Lead Times"),
    ("WDN Supplier", "WDN Supplier Outreach"),
    ("Escalat", "Escalating for Onshore Support"),
    ("WIMS", "WIMS"),
    ("NMFC", "NMFC and Freight Code Requests"),
    ("Freight Code", "NMFC and Freight Code Requests"),
    ("Tier 1", "Tier 1 Ad Hoc Requests"),
    ("Tier 2", "Tier 2 Ad Hoc Requests"),
    ("Tier 3", "Tier 3 Ad Hoc Requests"),
    ("Onshore Escalation", "Onshore Escalations"),
    ("Multiple Damages", "Multiple Damages"),
    ("Need PO", "Need PO to be Resent"),
    ("Resend PO", "Need PO to be Resent"),
]

def get_cat(name):
    for kw, cat in cat_rules:
        if kw in name:
            return cat
    return "Other"

for e in entries:
    template = e["template_name"]
    if not template or len(template) < 3:
        continue
    cat = get_cat(template)
    link = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/1256143084"
    rows_out.append([
        e["change_num"],
        e["project"],
        cat,
        template,
        e["date_added"],
        e["effective_date"],
        e["qc_impact"],
        e["who_affected"],
        e["version"],
        link,
        "",
    ])

output = "confluence_export/template_export_final.csv"
with open(output, "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(rows_out)

print(f"Written: {output} ({len(rows_out)} rows incl. header)")

# Summary
from collections import Counter
cat_count = Counter(r[2] for r in rows_out[1:])
print("\nCategory breakdown:")
for cat, n in cat_count.most_common():
    print(f"  {n:>3}x | {cat}")

proj_count = Counter(r[1] for r in rows_out[1:])
print("\nProject breakdown:")
for proj, n in proj_count.most_common():
    print(f"  {n:>3}x | {proj}")

print()
print("=" * 70)
print(f"DONE — {len(rows_out)-1} templates exported to:")
print(f"  confluence_export/template_export_final.csv")
print("=" * 70)
