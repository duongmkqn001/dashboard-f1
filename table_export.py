#!/usr/bin/env python3
"""
Extract canned response template names from SOP page table structures.
The SOP pages have tables with columns:
  Template Name | Description | Version | Last Updated
We parse the HTML table cells to extract actual template names.
"""
import re, csv, os, json
from html.parser import HTMLParser

os.makedirs("confluence_export", exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# HTML Table Parser
# ─────────────────────────────────────────────────────────────────────────────
class TableCellParser(HTMLParser):
    """Extract all table cells with their row context."""
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.current_row = []
        self.current_cell_text = ""
        self.tables = []  # list of lists

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        cls = attrs_dict.get("class", "")
        if tag == "table":
            self.in_table = True
            self.tables.append([])
        elif tag == "tr" and self.in_table:
            self.in_row = True
            self.current_row = []
        elif tag in ("td", "th") and self.in_row:
            self.in_cell = True
            self.current_cell_text = ""

    def handle_endtag(self, tag):
        if tag == "table":
            self.in_table = False
        elif tag == "tr" and self.in_row:
            self.in_row = False
            if self.current_row and self.tables:
                self.tables[-1].append(self.current_row[:])
        elif tag in ("td", "th") and self.in_cell:
            self.in_cell = False
            self.current_row.append(self.current_cell_text.strip())

    def handle_data(self, data):
        if self.in_cell:
            self.current_cell_text += data

def parse_tables(html):
    parser = TableCellParser()
    parser.feed(html)
    return parser.tables

# ─────────────────────────────────────────────────────────────────────────────
# Load SOP data
# ─────────────────────────────────────────────────────────────────────────────
with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}

# ─────────────────────────────────────────────────────────────────────────────
# Parse each SOP page for table content
# ─────────────────────────────────────────────────────────────────────────────
def clean(text):
    return re.sub(r'\s+', ' ', text).strip()

def is_cjk(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

print("=" * 70)
print("PARSING SOP PAGE TABLES FOR TEMPLATE NAMES")
print("=" * 70)

all_template_rows = []

for pid, sop in sorted(sop_data.items()):
    body = sop.get("body", "")
    if not body or sop.get("body_len", 0) < 500:
        continue

    title = sop["title"]
    tables = parse_tables(body)
    print(f"\n  [{title[:50]}]: {len(tables)} tables")

    for i, table in enumerate(tables):
        if not table:
            continue

        # Get header row to understand columns
        header_row = table[0] if table else []
        header_text = [clean(h) for h in header_row]
        n_cols = len(header_row)

        # Print header to understand structure
        print(f"    Table {i+1}: {len(table)} rows × {n_cols} cols | {header_text[:5]}")

        # Look for templates table: typically has "Template" in first column header
        is_template_table = any(
            "template" in h.lower() or "topic" in h.lower() or "name" in h.lower()
            for h in header_text
        )

        if not is_template_table and n_cols < 3:
            continue

        # Skip tables that are just navigation/menu
        if n_cols == 1 or all(len(clean(c)) < 2 for c in header_row):
            continue

        # Extract data rows (skip header)
        for row_idx, row in enumerate(table[1:], start=1):
            if len(row) < 2:
                continue

            cells = [clean(c) for c in row]
            if all(not c for c in cells):
                continue

            # Determine which columns contain template info
            # Template name usually in col 0 or 1
            # Version usually in col with "v" or "version" or "last updated"
            # Determine template name
            template_name = ""
            version_str = ""
            ticket_topic = ""

            # Try to identify template name column
            for ci, cell in enumerate(cells):
                if not cell or len(cell) < 3:
                    continue
                # Skip obvious non-template cells
                skip = ["click", "select", "navigate", "go to", "template dropdown",
                        "pop up menu", "scroll", "note:", "step ", "instruction"]
                if any(s in cell.lower() for s in skip):
                    continue
                if "template" in cell.lower() and ("menu" in cell.lower() or "dropdown" in cell.lower()):
                    continue
                if template_name == "":
                    template_name = cell

            # Try to find version
            for cell in cells:
                vm = re.search(r'v\.?\s*(\d+)', cell, re.IGNORECASE)
                if vm:
                    version_str = vm.group(1)
                    break

            if template_name and len(template_name) > 5 and len(template_name) < 200:
                # Determine language
                has_zh = is_cjk(template_name)
                has_en = not has_zh

                # Categorize
                if any(k in template_name for k in ["WCRT", "Wrong Catalog"]):
                    cat = "WCRT - Wrong Catalog Received"
                    code = "WCRT"
                elif any(k in template_name for k in ["Cancellation", "Cancel"]):
                    cat = "Cancellation Inquiries"; code = "CAN"
                elif any(k in template_name for k in ["BOL", "Packing Slip", "Shipping Label"]):
                    cat = "Cannot Print BOL / Packing Slip / Shipping Label"; code = "BOL"
                elif any(k in template_name for k in ["PWAO", "Problem with an Order"]):
                    cat = "Problem with an Order (PWAO)"; code = "PWAO"
                elif "Reroute" in template_name:
                    cat = "PO Reroutes"; code = "RER"
                elif "Tracking" in template_name:
                    cat = "Update Tracking Number/Order Status"; code = "TRK"
                elif "Out of Stock" in template_name:
                    cat = "Product Out of Stock"; code = "OOS"
                elif "Change Ship" in template_name:
                    if "Supplier" in template_name or "Item Count" in template_name:
                        cat = "Change Ship Method (Supplier Entered)"; code = "CSS"
                    else:
                        cat = "Change Ship Method (CS Entered)"; code = "CSC"
                elif "Shipping" in template_name or "Carrier" in template_name:
                    cat = "Shipping/Carrier Questions"; code = "SHP"
                elif "Split PO" in template_name:
                    cat = "Split PO"; code = "SPL"
                elif "Wrong Price" in template_name:
                    cat = "PO Has a Wrong Price"; code = "WPR"
                elif "Transfer" in template_name or "Global Transfer" in template_name:
                    cat = "Global Transfer Matrix"; code = "GTM"
                elif "Lead Time" in template_name:
                    cat = "Lead Times"; code = "LTM"
                elif "WDN" in template_name:
                    cat = "WDN Supplier Outreach"; code = "WDN"
                elif "Escalat" in template_name:
                    cat = "Escalating for Onshore Support"; code = "ESC"
                elif "WIMS" in template_name:
                    cat = "WIMS"; code = "WMS"
                elif "NMFC" in template_name or "Freight" in template_name:
                    cat = "NMFC and Freight Code Requests"; code = "NMFC"
                elif "Tier 1" in template_name or "Ad Hoc" in template_name:
                    cat = "Tier 1 Ad Hoc Requests"; code = "T1"
                elif "Tier 2" in template_name:
                    cat = "Tier 2 Ad Hoc Requests"; code = "T2"
                elif "Tier 3" in template_name:
                    cat = "Tier 3 Ad Hoc Requests"; code = "T3"
                elif "Onshore" in template_name:
                    cat = "Onshore Escalations"; code = "ONS"
                elif "Damage" in template_name:
                    cat = "Multiple Damages"; code = "DMG"
                elif "Need PO" in template_name or "Resend" in template_name:
                    cat = "Need PO to be Resent"; code = "NPR"
                elif "Follow-Up" in template_name or "Follow Up" in template_name:
                    cat = "Follow-Up Templates"; code = "FUP"
                elif "Email" in template_name:
                    cat = "Email Templates"; code = "EML"
                elif "Supplier" in template_name and code != "EML":
                    cat = "Supplier Templates"; code = "SUP"
                elif "FTL" in template_name:
                    cat = "FTL (Full Truckload)"; code = "FTL"
                elif "Carrier" in template_name:
                    cat = "Carrier Templates"; code = "CAR"
                elif "Internal" in template_name:
                    cat = "Internal Templates"; code = "INT"
                elif "Customer" in template_name:
                    cat = "Customer Templates"; code = "CUS"
                else:
                    cat = "Other"; code = "OTH"

                # Determine project
                fmop_kw = ["Supplier", "Email Template", "Onshore Escalation", "FTL",
                            "Carrier Template", "Internal Template", "Customer Template"]
                if any(k in template_name for k in fmop_kw):
                    project = "FMOP Templates"
                else:
                    project = "AOPS/POS Templates"

                all_template_rows.append({
                    "project": project,
                    "category": cat,
                    "code": code,
                    "template_name": template_name,
                    "version": version_str,
                    "sop_title": title,
                    "sop_id": pid,
                    "sop_version": sop.get("version", 0),
                    "sop_author": sop.get("author", ""),
                    "has_en": has_en,
                    "has_zh": has_zh,
                    "n_cols": n_cols,
                })

# Deduplicate by template name
seen = {}
for r in all_template_rows:
    name = r["template_name"]
    if name not in seen:
        seen[name] = r

deduped = list(seen.values())
print(f"\nTotal rows after dedup: {len(deduped)}")

# Filter out obvious non-templates
skip_words = [
    "template dropdown", "pop up menu", "scroll down", "scroll to",
    "click the", "select the", "navigate to", "go to the",
    "step ", "instruction", "table of content", "overview",
    "general lead time", "lead time expectation",
    "review the ticket", "review the order", "review the description",
    "visual ", "(visual ", "note:", "tip:", "applies to:",
    "applicable tab", "send template", "insert template",
    "select template", "utilize template", "provide template",
    "complete template", "navigate to the templates",
    "click templates pop up menu", "add escalation template",
]
quality_rows = [r for r in deduped
                if len(r["template_name"]) > 8
                and not any(s in r["template_name"].lower() for s in skip_words)
                and not r["template_name"].startswith("http")
                and not re.match(r'^[A-Z]\s+[a-z]', r["template_name"]) == None  # must look like a title
]

# More aggressive filtering: must start with uppercase
quality_rows = [r for r in quality_rows
                if re.match(r'^[A-Z]', r["template_name"])]

print(f"Quality rows after filtering: {len(quality_rows)}")

# Print first 30
print("\nFirst 30 quality rows:")
for r in quality_rows[:30]:
    print(f"  [{r['project'][:10]:10}] [{r['category'][:30]:30}] {r['template_name'][:60]}")

# ─────────────────────────────────────────────────────────────────────────────
# Write CSV
# ─────────────────────────────────────────────────────────────────────────────
COLUMNS = [
    "Project",
    "Category",
    "Template Code",
    "Template Name (EN)",
    "Template Name (ZH)",
    "Template Page ID",
    "Version",
    "SOP Page Title",
    "SOP Page ID",
    "SOP Version",
    "SOP Author",
    "Has EN",
    "Has ZH",
    "Is Pair",
    "Confluence Link",
    "Notes",
]

rows = [COLUMNS]

def strip_lang(title):
    return re.sub(r'\s*[\(\[](?:Mandarin|Chinese|ZH|中文|Mandarin Text)[^\]\)]*[\)\]]', '', title).strip()

# Group by base name for EN/ZH pairing
grouped = {}
for r in quality_rows:
    base = strip_lang(r["template_name"])
    if base not in grouped:
        grouped[base] = {"en": [], "zh": []}
    if r["has_zh"]:
        grouped[base]["zh"].append(r)
    else:
        grouped[base]["en"].append(r)

def best(entries):
    if not entries:
        return None
    return entries[0]

en_pairs = {k: v for k, v in grouped.items() if best(v["en"]) and best(v["zh"])}
en_only  = {k: v for k, v in grouped.items() if best(v["en"]) and not best(v["zh"])}

for base in sorted(en_pairs.keys()) + sorted(en_only.keys()):
    g = en_pairs.get(base) or en_only.get(base)
    en = best(g["en"]) if g else None
    zh = best(g["zh"]) if g else None

    entry = en or zh or {}
    name_en = en["template_name"] if en else ""
    name_zh = zh["template_name"] if zh else ""

    rows.append([
        entry.get("project", ""),
        entry.get("category", ""),
        entry.get("code", ""),
        name_en,
        name_zh,
        "",  # page ID
        en["version"] if en else "",
        entry.get("sop_title", ""),
        str(entry.get("sop_id", "")),
        str(entry.get("sop_version", "")),
        entry.get("sop_author", ""),
        "Yes" if en else "No",
        "Yes" if zh else "No",
        "Yes" if (en and zh) else "No",
        "",  # Confluence link
        "",  # Notes
    ])

output = "confluence_export/template_export_final.csv"
with open(output, "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(rows)

print(f"\nWritten: {output} ({len(rows)} rows incl. header)")

# Category summary
from collections import Counter
cat_count = Counter(r["category"] for r in quality_rows)
print("\nCategory summary:")
for cat, n in cat_count.most_common(30):
    print(f"  {n:>3}x | {cat}")

print(f"\nTotal quality template rows: {len(quality_rows)}")
print("Done — see confluence_export/template_export_final.csv")
