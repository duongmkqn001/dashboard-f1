#!/usr/bin/env python3
"""
Export Confluence Canned Responses templates to CSV (final version).
=================================================================
Architecture discovered:
  - Canned Responses/Templates (DSC2S) canonical page (1256153038, v210)
    - AOPS / POS Templates tab (724K chars)
      - NA Specific section (English)
      - EU Specific section
      - ZH section (Mandarin)
      - Category sections (WCRT, PWAO, Cancellation, Reroutes, etc.)
        - Each category references an SOP page via ri:page
    - FMOP Templates tab (196K chars)
      - Supplier Templates
      - Carrier Templates
      - WCRT Templates
      - etc.

Each ri:page has:
  - content-title  → SOP page title
  - version-at-save → Confluence version number

Strategy:
  - Extract ALL ri:page entries
  - Map to Project (AOPS/POS or FMOP) by section boundary
  - Map to Category by keyword matching
  - Detect EN/ZH by presence of CJK characters
  - Use the SOP page title as the template name
"""

import re, csv, os
from collections import Counter, defaultdict

# ── Load saved HTML ─────────────────────────────────────────────────────────
os.makedirs("confluence_export", exist_ok=True)
with open("confluence_export/dcs2s_storage_raw.html", encoding="utf-8") as f:
    storage = f.read()
with open("confluence_export/change_log_view.html", encoding="utf-8") as f:
    cl_view = f.read()
with open("confluence_export/change_log_storage_raw.html", encoding="utf-8") as f:
    cl_storage = f.read()

# ── Helpers ────────────────────────────────────────────────────────────────
def c(text):
    return re.sub(r'\s+', ' ', text).strip()

def is_cjk(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Find section boundaries
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("STEP 1: Finding section boundaries")
print("=" * 70)

aops_pos = storage.find('<ac:parameter ac:name="title">AOPS / POS Templates<')
fmop_pos = storage.find('<ac:parameter ac:name="title">FMOP Templates<')

if aops_pos == -1:
    aops_pos = storage.find('title">AOPS / POS Templates<')
if fmop_pos == -1:
    fmop_pos = storage.find('title">FMOP Templates<')

print(f"  AOPS starts at: {aops_pos:,}")
print(f"  FMOP starts at: {fmop_pos:,}")

aops_sec = storage[aops_pos:fmop_pos] if aops_pos != -1 and fmop_pos != -1 else storage
fmop_sec = storage[fmop_pos:] if fmop_pos != -1 else ""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Extract all ri:page entries
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 2: Extracting ri:page entries")
print("=" * 70)

# Find all ri:page tags
ri_full_re = re.compile(r'<ri:page\b([^>]+)/>', re.DOTALL)
raw_tags = ri_full_re.findall(storage)

entries = []
for raw in raw_tags:
    title_m = re.search(r'ri:content-title="([^"]+)"', raw)
    ver_m   = re.search(r'ri:version-at-save="(\d+)"', raw)
    if title_m:
        entries.append({
            "title":   title_m.group(1),
            "version": int(ver_m.group(1)) if ver_m else 0,
            "in_aops": title_m.group(1) in aops_sec,
            "in_fmop": title_m.group(1) in fmop_sec,
        })

# Deduplicate (keep highest version)
seen = {}
for e in entries:
    t = e["title"]
    if t not in seen or e["version"] > seen[t]["version"]:
        seen[t] = e
entries = list(seen.values())
print(f"  Unique SOP pages: {len(entries)}")

# Classify as template vs reference
skip = ["Best Practices", "Change Log", "Project List", "Escalation Pathway",
        "Navigating", "Entering Internal", "How To:", "Requesting Ticket",
        "WFM Toggle", "Canned Responses", "GPS QC", "Suggestion Box"]
is_ref = lambda t: any(s in t for s in skip)

templates = [e for e in entries if not is_ref(e["title"])]
refs      = [e for e in entries if     is_ref(e["title"])]

print(f"  Template pages: {len(templates)}")
print(f"  Reference pages: {len(refs)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Assign Project (AOPS/POS or FMOP)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 3: Assigning Project (AOPS/POS or FMOP)")
print("=" * 70)

# Also check from section content detection
aops_titles = {e["title"] for e in entries if e["in_aops"]}
fmop_titles = {e["title"] for e in entries if e["in_fmop"]}

for e in templates:
    if e["title"] in fmop_titles:
        e["project"] = "FMOP Templates"
    elif e["title"] in aops_titles:
        e["project"] = "AOPS/POS Templates"
    else:
        # Fallback: keyword matching
        if any(k in e["title"] for k in ["Supplier", "Email", "Onshore Escalation"]):
            e["project"] = "FMOP Templates"
        else:
            e["project"] = "AOPS/POS Templates"

for e in templates:
    e["has_en"] = not is_cjk(e["title"])
    e["has_zh"] =     is_cjk(e["title"])

aops_n = sum(1 for e in templates if e["project"] == "AOPS/POS Templates")
fmop_n = sum(1 for e in templates if e["project"] == "FMOP Templates")
print(f"  AOPS/POS Templates: {aops_n}")
print(f"  FMOP Templates:    {fmop_n}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Assign Category
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 4: Assigning Category")
print("=" * 70)

cat_rules = [
    # (keyword, category)
    ("WCRT",                "WCRT - Wrong Catalog Received"),
    ("Wrong Catalog",       "WCRT - Wrong Catalog Received"),
    ("Cancellation",       "Cancellation Inquiries"),
    ("Cannot Print",        "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("BOL",                 "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("Packing Slip",        "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("Shipping Label",      "Cannot Print BOL / Packing Slip / Shipping Label"),
    ("Problem with an Order", "Problem with an Order (PWAO)"),
    ("PWAO",               "Problem with an Order (PWAO)"),
    ("PO Reroute",         "PO Reroutes"),
    ("Reroutes",           "PO Reroutes"),
    ("Update Tracking",     "Update Tracking Number/Order Status"),
    ("Tracking Number",     "Update Tracking Number/Order Status"),
    ("Product Out of Stock","Product Out of Stock"),
    ("Out of Stock",        "Product Out of Stock"),
    ("Change Ship on PO",  "Change Ship Method (CS Entered)"),
    ("Change Ship Method",  "Change Ship Method (CS Entered)"),
    ("Carrier on PO",       "Change Ship Method (Supplier Entered)"),
    ("Item Count",          "Change Ship Method (Supplier Entered)"),
    ("Size",               "Change Ship Method (Supplier Entered)"),
    ("Shipping/Carrier",   "Shipping/Carrier Questions"),
    ("Carrier Questions",   "Shipping/Carrier Questions"),
    ("Split PO",           "Split PO"),
    ("Wrong Price",         "PO Has a Wrong Price"),
    ("PO has a Wrong Price","PO Has a Wrong Price"),
    ("Global Transfer",     "Global Transfer Matrix"),
    ("Lead Time",           "Lead Times"),
    ("WDN Supplier",        "WDN Supplier Outreach"),
    ("Escalat",             "Escalating for Onshore Support"),
    ("WIMS",               "WIMS"),
    ("NMFC",               "NMFC and Freight Code Requests"),
    ("Freight Code",        "NMFC and Freight Code Requests"),
    ("Tier 1 Ad Hoc",      "Tier 1 Ad Hoc Requests"),
    ("Tier 2",             "Tier 2 Ad Hoc Requests"),
    ("Tier 3",             "Tier 3 Ad Hoc Requests"),
    ("Onshore Escalation",  "Onshore Escalations"),
    ("Multiple Damages",    "Multiple Damages"),
    ("Need PO",            "Need PO to be Resent"),
    ("Suppliers",          "Supplier Templates"),
    ("Supplier Template",   "Supplier Templates"),
    ("Supplier Email",      "Supplier Email Templates"),
    ("FTL",                "FTL (Full Truckload)"),
    ("Carrier Template",    "Carrier Templates"),
    ("Education Needed",    "Education Needed Scripts"),
    ("Internal Template",   "Internal Templates"),
    ("Customer Template",   "Customer Templates"),
    ("UK/IE",              "UK/IE"),
]

def get_category(title):
    for kw, cat in cat_rules:
        if kw in title:
            return cat
    return "Other"

for e in templates:
    e["category"] = get_category(e["title"])

cat_counts = Counter(e["category"] for e in templates)
for cat, n in cat_counts.most_common():
    print(f"  {n:>3}x | {cat}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Handle EN/ZH pairs
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 5: Grouping EN/ZH pairs")
print("=" * 70)

def strip_lang(title):
    # Remove "(Mandarin Text)", "(Mandarin)", "(Chinese)", "(ZH)" etc.
    return re.sub(r'\s*[\(\[](?:Mandarin|Chinese|ZH|中文)[^\]\)]*[\)\]]', '', title).strip()

grouped = defaultdict(lambda: {"en": None, "zh": None})
for e in templates:
    base = strip_lang(e["title"])
    if e["has_zh"]:
        grouped[base]["zh"] = e
    else:
        grouped[base]["en"] = e

en_pairs  = {k: v for k, v in grouped.items() if v["en"] and v["zh"]}
en_only   = {k: v for k, v in grouped.items() if v["en"] and not v["zh"]}
zh_only   = {k: v for k, v in grouped.items() if not v["en"] and v["zh"]}

print(f"  EN+ZH pairs: {len(en_pairs)}")
print(f"  EN only:    {len(en_only)}")
print(f"  ZH only:    {len(zh_only)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Extract page IDs from Change Log
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 6: Extracting page IDs from Change Log")
print("=" * 70)

# Confluence page links: /spaces/GPS/pages/12345678/Title-slug
id_re = re.compile(r'/spaces/GPS/pages/(\d{7,})/([^"?\s&]+)')

id_map = {}
for pid_str, slug in id_re.findall(cl_view):
    pid = int(pid_str)
    slug_clean = slug.replace("+", " ").replace("-", " ").replace("%20", " ").replace("_", " ")
    title = c(slug_clean)
    if title and len(title) > 3:
        if title not in id_map:
            id_map[title] = pid

print(f"  Title -> ID mappings from Change Log: {len(id_map)}")

def lookup_id(title):
    if title in id_map:
        return id_map[title]
    for known, pid in id_map.items():
        if title in known or known in title:
            return pid
    return ""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Build and write CSV
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 7: Writing CSV")
print("=" * 70)

COLUMNS = [
    "Project",
    "Category",
    "Template Name (EN)",
    "Template Name (ZH)",
    "Page ID (EN)",
    "Page ID (ZH)",
    "Version (EN)",
    "Version (ZH)",
    "Last Updated (EN)",
    "Last Updated (ZH)",
    "Template Code",
    "Ticket Topic",
    "Has EN",
    "Has ZH",
    "Is Pair",
    "Confluence Link (EN)",
    "Confluence Link (ZH)",
    "Notes",
]

rows = [COLUMNS]

# Write EN+ZH pairs first, then EN only
def write_group(base, g, pair_label):
    en = g["en"]
    zh = g["zh"]
    name_en = en["title"] if en else ""
    name_zh = zh["title"] if zh else ""
    pid_en = str(lookup_id(name_en)) if name_en else ""
    pid_zh = str(lookup_id(name_zh)) if zh else ""

    ver_en = str(en["version"]) if en else ""
    ver_zh = str(zh["version"]) if zh else ""

    entry = en or zh or {}
    project = entry.get("project", "")
    category = entry.get("category", "")

    # Template code from first letters of category
    code_map = {
        "WCRT": "WCRT", "Cancellation": "CAN", "Problem with an Order": "PWAO",
        "PO Reroute": "RER", "Update Tracking": "TRK", "Product Out of Stock": "OOS",
        "Change Ship Method (CS": "CSC", "Change Ship Method (S": "CSS",
        "Cannot Print BOL": "BOL", "Shipping/Carrier": "SHP", "Split PO": "SPL",
        "PO Has a Wrong Price": "WPR", "Global Transfer": "GTM", "Lead Times": "LTM",
        "WDN Supplier": "WDN", "Escalat": "ESC", "WIMS": "WMS", "NMFC": "NMFC",
        "Tier 1": "T1", "Tier 2": "T2", "Tier 3": "T3", "Onshore": "ONS",
        "Multiple Damages": "DMG", "Need PO": "NPR", "Supplier Templates": "SUP",
        "Supplier Email": "SEM", "FTL": "FTL", "Carrier Templates": "CAR",
        "Education": "EDU", "Internal": "INT", "Customer": "CUS",
        "UK/IE": "UKI",
    }
    tpl_code = ""
    topic = ""
    for kw, code in code_map.items():
        if kw in category:
            tpl_code = code
            topic = kw
            break

    link_en = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{pid_en}" if pid_en else ""
    link_zh = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{pid_zh}" if pid_zh else ""

    rows.append([
        project,
        category,
        name_en,
        name_zh,
        pid_en,
        pid_zh,
        ver_en,
        ver_zh,
        "",       # Last Updated EN (would need API call per page)
        "",       # Last Updated ZH
        tpl_code,
        topic,
        "Yes" if en else "No",
        "Yes" if zh else "No",
        "Yes" if (en and zh) else "No",
        link_en,
        link_zh,
        "",
    ])

for base in sorted(en_pairs.keys()):
    write_group(base, en_pairs[base], "pair")
for base in sorted(en_only.keys()):
    write_group(base, en_only[base], "en_only")

# Write SOP pages as reference section
rows.append(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
rows.append(["=== SOP PAGES (Reference) ===", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])

for e in sorted(refs, key=lambda x: x["title"]):
    pid = str(lookup_id(e["title"]))
    link = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{pid}" if pid else ""
    rows.append([
        "Reference", "Reference SOP", e["title"], "",
        pid, "", str(e["version"]), "", "", "",
        "", "", "Yes", "No", "No", link, "", ""
    ])

output_path = "confluence_export/template_export_draft.csv"
with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f"  Written: {output_path}")
print(f"  Total rows: {len(rows)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: Summary
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("CSV GENERATED SUCCESSFULLY")
print("=" * 70)
print()
print(f"File: confluence_export/template_export_draft.csv")
print(f"Total rows: {len(rows)} (incl. header)")
print()
print("Structure:")
for e in templates[:5]:
    print(f"  {e['project']:<20} | {e['category']:<50} | v{e['version']} | EN={e['has_en']} ZH={e['has_zh']}")
print(f"  ... ({len(templates)-5} more)")
print()
print("Please open the CSV and review.")
print("Report back any corrections needed — I will regenerate.")
