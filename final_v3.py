#!/usr/bin/env python3
"""
Final accurate export from Change Log table.
Columns: Change#, Date Added, Effective Date, QC Impact, Who Affected,
         Applicable SOP/Resource, What is Changing, Reason for Change
Template name is in "What is Changing" (e.g. "AOPS > Change Ship Method
Added template – Changing FedEx Ship Speed")
"""
import re, csv, os, json
from html.parser import HTMLParser

os.makedirs("confluence_export", exist_ok=True)

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_t = self.in_r = self.in_c = False
        self.crow = []
        self.tables = []
    def handle_starttag(self, t, attrs):
        d = dict(attrs)
        if t == "table": self.in_t = True; self.tables.append([])
        elif t == "tr" and self.in_t: self.in_r = True; self.crow = []
        elif t in ("td","th") and self.in_r: self.in_c = True; self._ = ""
    def handle_endtag(self, t):
        if t == "table": self.in_t = False
        elif t == "tr" and self.in_r:
            self.in_r = False
            if self.crow and self.tables: self.tables[-1].append(self.crow[:])
        elif t in ("td","th") and self.in_c:
            self.in_c = False; self.crow.append(self._.strip())
    def handle_data(self, d):
        if self.in_c: self._ += d

def c(t): return re.sub(r'\s+', ' ', t).strip()
def is_cjk(t): return bool(re.search(r'[\u4e00-\u9fff]', t))

# Load data
with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}
cl = sop_data.get(1256143084, {})
body = cl.get("body", "")

tables = TableParser().feed(body) or []
# Actually need to run it
tp = TableParser()
tp.feed(body)
tables = tp.tables

# Find the change table
ctable = None
for t in tables:
    if t and len(t[0]) >= 8:
        h = [c(x) for x in t[0]]
        if "Change" in h[0] and "Date" in h[1] and "What" in "".join(h):
            ctable = t
            print(f"Found change table: {len(t)} rows × {len(t[0])} cols")
            print(f"  Headers: {h}")
            break

if not ctable:
    print("ERROR: Change table not found")
    exit()

# SOP ID map
SOP_IDS = {
    "PO Reroutes SOP (DSC2S)": 1256145383,
    "PO Reroutes SOP (DSC2S) - VCN": 1256152114,
    "Cannot Print a BOL / Packing Slip or Shipping Label SOP (DSC2S) - VCN": 1256144848,
    "Problem with an Order (PWAO) SOP (DSC2S)": 1256152285,
    "Update Tracking Number/Order Status SOP (DSC2S) - VCN": 1256153189,
    "Product Out of Stock SOP (DSC2S) - VCN": 1256143448,
    "Change Ship Method on PO - Not Shipped SOP (DSC2S) - VCN": 1256187304,
    "Change Ship Method or Carrier on PO Due to Item Count / Size (Supplier Entered) SOP (DSC2S) - VCN": 1256177851,
    "Shipping/Carrier Questions SOP (DSC2S) - VCN": 1256161082,
    "Split PO SOP (DSC2S) - VCN": 1256187459,
    "PO has a Wrong Price SOP (DSC2S) - VCN": 1256143020,
    "Cancellation Inquiry SOP (DSC2S) - VCN": 1256144980,
    "Escalating for Onshore Support (Tier 0 to Tier 1) SOP (DSC2S) - VCN": 1256143521,
    "Global Transfer Matrix SOP (DSC2S)": 1256175181,
    "Lead Times SOP (DSC2S) - VCN": 1256095751,
    "WDN Supplier Outreach SOP (DSC2S) - VCN": 1256154202,
    "WIMS - Ship Status SOP (DSC2S)": 1256176186,
    "WIMS - Large Parcel SOP (DSC2S)": 1256174350,
    "NMFC and Freight Code Requests SOP (DSC2S)": 1256164604,
    "Tier 1 Ad Hoc Requests SOP (DSC2S)": 1256149108,
    "Multiple Damages SOP (DSC2S) - VCN": 1256177249,
    "Need PO to be Resent SOP (DSC2S) - VCN": 1256143524,
    "Onshore Escalations SOP (DSC2S)": 1256125472,
    "Best Practices and Ticket Etiquette (DSC2S)": 1256174803,
    "Canned Responses/Templates (DSC2S)": 1256153038,
}

# Parse change log rows
# Column mapping (0-indexed):
# 0=Change#, 1=Date Added, 2=Effective, 3=QC Impact, 4=Who Affected
# 5=Applicable SOP/Resource, 6=What is Changing, 7=Reason

rows_out = []
skipped = 0

for row in ctable[1:]:  # skip header
    cells = [c(x) for x in row]
    if len(cells) < 8:
        skipped += 1
        continue

    change_num  = cells[0]
    date_added  = cells[1]
    eff_date    = cells[2]
    qc_impact  = cells[3]
    who_affect  = cells[4]
    sop_name    = cells[5].split("SOP (DSC2S)")[0].strip() + " SOP (DSC2S)" if "SOP (DSC2S)" in cells[5] else cells[5]
    what_chg   = cells[6]
    reason     = cells[7]

    # Extract template name from "What is Changing"
    # Pattern: "Added template – Template Name" or "Removed template – Name"
    tpl_match = re.search(
        r'(?:Added|Removed|Updated|Edited)\s*(?:template\s*[-–:]\s*|template\s+)([^\n\r]{3,100})',
        what_chg, re.IGNORECASE
    )
    if tpl_match:
        template_name = c(tpl_match.group(1))
    else:
        # Take first non-empty sentence-like chunk from what_chg
        # Look for "AOPS > Category > Template Name" pattern
        tpl_match2 = re.search(r'>\s*([A-Za-z][^\n\r<]{3,80})', what_chg)
        if tpl_match2:
            template_name = c(tpl_match2.group(1))
        else:
            template_name = c(what_chg[:100])

    # Skip rows without meaningful template name
    if len(template_name) < 3:
        skipped += 1
        continue

    # Get SOP page ID
    sop_id = ""
    for sname, sid in SOP_IDS.items():
        if sname in cells[5]:
            sop_id = str(sid)
            break

    # Categorize by SOP name
    cat_rules = [
        ("PO Reroutes", "PO Reroutes"),
        ("Cannot Print", "Cannot Print BOL / Packing Slip / Shipping Label"),
        ("PWAO", "Problem with an Order (PWAO)"),
        ("Problem with an Order", "Problem with an Order (PWAO)"),
        ("Update Tracking", "Update Tracking Number/Order Status"),
        ("Tracking Number", "Update Tracking Number/Order Status"),
        ("Product Out of Stock", "Product Out of Stock"),
        ("Change Ship on PO", "Change Ship Method (CS Entered)"),
        ("Change Ship Method", "Change Ship Method (CS Entered)"),
        ("Item Count", "Change Ship Method (Supplier Entered)"),
        ("Shipping/Carrier", "Shipping/Carrier Questions"),
        ("Split PO", "Split PO"),
        ("Wrong Price", "PO Has a Wrong Price"),
        ("Cancellation", "Cancellation Inquiries"),
        ("Escalat", "Escalating for Onshore Support"),
        ("Global Transfer", "Global Transfer Matrix"),
        ("Lead Time", "Lead Times"),
        ("WDN Supplier", "WDN Supplier Outreach"),
        ("WIMS", "WIMS"),
        ("NMFC", "NMFC and Freight Code Requests"),
        ("Tier 1", "Tier 1 Ad Hoc Requests"),
        ("Multiple Damages", "Multiple Damages"),
        ("Need PO", "Need PO to be Resent"),
        ("Onshore Escalation", "Onshore Escalations"),
    ]
    cat = "Other"
    for kw, cname in cat_rules:
        if kw in (sop_name + " " + template_name):
            cat = cname; break

    # Determine project
    fmop_kw = ["Supplier", "Email", "Onshore Escalation", "FMOC",
                 "Carrier Template", "FTL"]
    project = "FMOP Templates" if any(k in (sop_name + " " + template_name) for k in fmop_kw) else "AOPS/POS Templates"

    # Build change log link
    cl_link = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/1256143084"
    sop_link = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{sop_id}" if sop_id else ""

    rows_out.append([
        change_num,
        date_added,
        eff_date,
        qc_impact,
        who_affect,
        sop_name,
        template_name,
        reason,
        cl_link,
        sop_link,
    ])

print(f"\nParsed {len(rows_out)} change entries (skipped {skipped} empty rows)")

# Preview
print("\nFirst 15 rows:")
print(f"{'#':>4} | {'Project':<15} | {'Category':<50} | {'Template Name':<50}")
print("-" * 130)
for r in rows_out[:15]:
    cat2 = "Other"
    for kw, cname in [
        ("PO Reroutes","PO Reroutes"), ("Cannot Print","Cannot Print BOL"),
        ("PWAO","PWAO"), ("Update Tracking","Update Tracking"),
        ("Out of Stock","Product Out of Stock"), ("Change Ship","Change Ship"),
        ("Shipping","Shipping/Carrier"), ("Split PO","Split PO"),
        ("Wrong Price","Wrong Price"), ("Cancellation","Cancellation"),
        ("Escalat","Escalat"), ("Global Transfer","Transfer"),
        ("Lead Time","Lead Time"), ("WDN","WDN"), ("WIMS","WIMS"),
        ("NMFC","NMFC"), ("Tier 1","Tier 1"), ("Multiple Damages","DMG"),
    ]:
        if kw in r[5] + " " + r[6]:
            cat2 = cname; break
    fmop_kw2 = ["Supplier", "Email", "Onshore Escalation", "FMOC"]
    proj = "FMOP" if any(k in r[5] + " " + r[6] for k in fmop_kw2) else "AOPS"
    print(f"{r[0]:>4} | {proj:<15} | {cat2:<50} | {r[6][:50]}")

# Write CSV
COLUMNS = [
    "Change #",
    "Project",
    "Category",
    "Applicable SOP Page",
    "SOP Page ID",
    "SOP Link",
    "Template Name (What is Changing)",
    "Reason for Change",
    "Date Added",
    "Effective Date",
    "QC Impact Date",
    "Who This Affects",
    "Change Log Link",
    "Notes",
]

csv_rows = [COLUMNS]
for r in rows_out:
    change_num, date_added, eff_date, qc_impact, who_affect, sop_name, template_name, reason, cl_link, sop_link = r

    # Determine project
    fmop_kw2 = ["Supplier", "Email", "Onshore Escalation", "FMOC", "Carrier Template", "FTL"]
    project = "FMOP Templates" if any(k in sop_name + " " + template_name for k in fmop_kw2) else "AOPS/POS Templates"

    # Categorize
    cat = "Other"
    for kw, cname in [
        ("PO Reroutes","PO Reroutes"), ("Cannot Print","Cannot Print BOL / Packing Slip / Shipping Label"),
        ("PWAO","Problem with an Order (PWAO)"), ("Problem with an Order","Problem with an Order (PWAO)"),
        ("Update Tracking","Update Tracking Number/Order Status"), ("Tracking Number","Update Tracking Number/Order Status"),
        ("Product Out of Stock","Product Out of Stock"), ("Out of Stock","Product Out of Stock"),
        ("Change Ship on PO","Change Ship Method (CS Entered)"),
        ("Change Ship Method","Change Ship Method (CS Entered)"),
        ("Item Count","Change Ship Method (Supplier Entered)"), ("Size","Change Ship Method (Supplier Entered)"),
        ("Shipping/Carrier","Shipping/Carrier Questions"), ("Carrier Question","Shipping/Carrier Questions"),
        ("Split PO","Split PO"), ("Wrong Price","PO Has a Wrong Price"),
        ("Cancellation","Cancellation Inquiries"),
        ("Escalat","Escalating for Onshore Support"), ("Onshore Support","Escalating for Onshore Support"),
        ("Global Transfer","Global Transfer Matrix"), ("Lead Time","Lead Times"),
        ("WDN Supplier","WDN Supplier Outreach"), ("WIMS","WIMS"),
        ("NMFC","NMFC and Freight Code Requests"), ("Freight","NMFC and Freight Code Requests"),
        ("Tier 1","Tier 1 Ad Hoc Requests"), ("Tier 2","Tier 2 Ad Hoc Requests"), ("Tier 3","Tier 3 Ad Hoc Requests"),
        ("Multiple Damages","Multiple Damages"), ("Need PO","Need PO to be Resent"),
        ("Onshore Escalation","Onshore Escalations"),
    ]:
        if kw in (sop_name + " " + template_name):
            cat = cname; break

    # Get SOP ID
    sop_id = ""
    for sname, sid in SOP_IDS.items():
        if sname in sop_name:
            sop_id = str(sid); break

    sop_link2 = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{sop_id}" if sop_id else ""

    csv_rows.append([
        change_num,
        project,
        cat,
        sop_name,
        sop_id,
        sop_link2,
        template_name,
        reason,
        date_added,
        eff_date,
        qc_impact,
        who_affect,
        cl_link,
        "",
    ])

output = "confluence_export/template_export_final.csv"
with open(output, "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(csv_rows)

print(f"\nWritten: {output} ({len(csv_rows)} rows incl. header)")

# Category summary
from collections import Counter
cat_count = Counter(r[2] for r in csv_rows[1:])
print("\nCategory breakdown:")
for cat, n in cat_count.most_common():
    print(f"  {n:>3}x | {cat}")

print(f"\nTotal: {len(csv_rows)-1} change log entries")
print("Done!")
