#!/usr/bin/env python3
"""
Export Confluence Canned Responses templates to CSV.
==================================================
Uses ri:page tags from body.storage.raw to extract:
  - Template/SOP page titles
  - Version numbers (from ri:version-at-save)
  - Group into Project (AOPS/POS | FMOP) → Category
  - Detect English vs Mandarin by text analysis
"""
import re, csv, os

# ── Load saved HTML ─────────────────────────────────────────────────────────
os.makedirs("confluence_export", exist_ok=True)
with open("confluence_export/dcs2s_storage_raw.html", encoding="utf-8") as f:
    storage = f.read()
with open("confluence_export/change_log_view.html", encoding="utf-8") as f:
    cl_view = f.read()

# ── Helpers ────────────────────────────────────────────────────────────────
def clean(text):
    return re.sub(r'\s+', ' ', text).strip()

def has_mandarin(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def get_section(html, start_marker, end_markers):
    """Extract text between a start marker and the nearest end marker."""
    s = html.find(start_marker)
    if s == -1:
        return ""
    s = html.index(">", s) + 1
    ends = [html.find(e, s) for e in end_markers if html.find(e, s) != -1]
    e = min(ends) if ends else len(html)
    return html[s:e]

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1b: Extract page IDs from Change Log HTML
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 1b: Extracting page IDs from Change Log")
print("=" * 70)

# Page IDs appear in Change Log as Confluence internal links like:
# /spaces/GPS/pages/123456789/Title
# or in ri:page tags

# Find all Confluence internal page links with IDs
id_link_pattern = re.compile(
    r'/spaces/GPS/pages/(\d{7,})/([^"?\s]+)'
)
cl_id_matches = id_link_pattern.findall(cl_view)
print(f"  Found {len(cl_id_matches)} page ID links in Change Log")

# Build ID map
page_id_map = {}
for pid_str, slug in id_link_pattern.findall(cl_view):
    pid = int(pid_str)
    # Extract title from slug
    title = slug.replace("+", " ").replace("-", " ").replace("%20", " ")
    title = clean(title)
    if title and len(title) > 3:
        if title not in page_id_map:
            page_id_map[title] = pid

print(f"  Unique page ID mappings: {len(page_id_map)}")

# Also find from storage raw (AOPS section)
storage_id_matches = id_link_pattern.findall(aops_section if 'aops_section' in dir() else storage)
print(f"  Found {len(storage_id_matches)} page ID links in storage")

for pid_str, slug in storage_id_matches:
    pid = int(pid_str)
    title = slug.replace("+", " ").replace("-", " ").replace("%20", " ")
    title = clean(title)
    if title and len(title) > 3:
        if title not in page_id_map:
            page_id_map[title] = pid

# Also extract from ri:page tags in storage (they have version-at-save)
# These DON'T have page IDs, but we can match titles to known IDs

# Build title -> ID lookup for our SOP/template pages
def find_page_id(title):
    """Find page ID for a given title."""
    if title in page_id_map:
        return page_id_map[title]
    # Try partial match
    for known_title, pid in page_id_map.items():
        if title in known_title or known_title in title:
            return pid
    return ""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Extract ALL ri:page entries with version info
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 1: Extracting ri:page entries with version info")
print("=" * 70)

# Pattern: <ri:page ri:content-title="..." ri:version-at-save="N" .../>
ri_page_pattern = re.compile(
    r'<ri:page\b[^>]*ri:content-title="([^"]+)"[^>]*/>',
    re.DOTALL
)
ri_pages = re.findall(ri_page_pattern, storage)
print(f"  Total ri:page references: {len(ri_pages)}")

# More detailed extraction including version
ri_full = re.compile(
    r'<ri:page\b([^>]+)/>'
)
all_ri_raw = re.findall(ri_full, storage)

entries = []
for raw in all_ri_raw:
    title_m = re.search(r'ri:content-title="([^"]+)"', raw)
    version_m = re.search(r'ri:version-at-save="(\d+)"', raw)
    if title_m:
        entries.append({
            "raw": raw,
            "title": title_m.group(1),
            "version": int(version_m.group(1)) if version_m else 0,
        })

# Deduplicate by title
seen = {}
for e in entries:
    t = e["title"]
    if t not in seen or e["version"] > seen[t]["version"]:
        seen[t] = e
entries = list(seen.values())

print(f"  Unique SOP/template pages: {len(entries)}")

# Separate SOP pages from non-template pages
skip_prefixes = [
    "Best Practices", "Change Log", "Project List", "Escalation Pathway",
    "Navigating", "Entering Internal", "How To:", "Requesting Ticket",
    "WFM Toggle", "Canned Responses", "GPS QC",
]
skip_pattern = '|'.join(skip_prefixes)

template_entries = [e for e in entries
                    if not re.search(skip_pattern, e["title"])]
sop_pages = [e for e in entries
             if re.search(skip_pattern, e["title"])]

print(f"  Template entries: {len(template_entries)}")
print(f"  SOP/Reference pages: {len(sop_pages)}")

# Print template entries
print("\n  Template pages:")
for e in sorted(template_entries, key=lambda x: x["title"]):
    print(f"    v{e['version']:>3} | {e['title'][:70]}")

print("\n  SOP/Reference pages:")
for e in sorted(sop_pages, key=lambda x: x["title"]):
    print(f"    v{e['version']:>3} | {e['title'][:70]}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Find section boundaries (AOPS vs FMOP)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 2: Finding AOPS / FMOP section boundaries")
print("=" * 70)

# The storage HTML has tabs/sections indicated by:
# <ac:parameter ac:name="title">AOPS / POS Templates</ac:parameter>
# <ac:parameter ac:name="title">FMOP Templates</ac:parameter>

# Find all section markers
section_markers = re.findall(
    r'<ac:parameter ac:name="title">([^<]+)</ac:parameter>',
    storage
)
section_markers = [clean(m) for m in section_markers if clean(m)]
print(f"  Section markers found: {section_markers}")

# Find positions of AOPS and FMOP sections
aops_pos = storage.find('parameter ac:name="title">AOPS / POS Templates<')
fmop_pos = storage.find('parameter ac:name="title">FMOP Templates<')
print(f"  AOPS starts at:  {aops_pos:,}")
print(f"  FMOP starts at:  {fmop_pos:,}")

if aops_pos != -1 and fmop_pos != -1:
    aops_section = storage[aops_pos:fmop_pos]
    fmop_section = storage[fmop_pos:]
    print(f"  AOPS section: {len(aops_section):,} chars")
    print(f"  FMOP section: {len(fmop_section):,} chars")

    # Check which templates appear in which section
    aops_titles = set()
    fmop_titles = set()

    for e in template_entries:
        if e["title"] in aops_section:
            aops_titles.add(e["title"])
        elif e["title"] in fmop_section:
            fmop_titles.add(e["title"])

    print(f"\n  Templates in AOPS section: {len(aops_titles)}")
    print(f"  Templates in FMOP section: {len(fmop_titles)}")

    # Check for ambiguous (in both sections - possible due to includes)
    both = aops_titles & fmop_titles
    if both:
        print(f"  Templates in BOTH sections: {len(both)}")

    # Reassign: if a template is in AOPS section, it's AOPS; otherwise FMOP
    for e in template_entries:
        if e["title"] in aops_titles:
            e["project"] = "AOPS/POS Templates"
        elif e["title"] in fmop_titles:
            e["project"] = "FMOP Templates"
        else:
            # Default based on title keywords
            fmop_kw = ["Supplier", "Email", "Onshore Escalation", "FMOC", "Follow-Up:"]
            if any(kw in e["title"] for kw in fmop_kw):
                e["project"] = "FMOP Templates"
            else:
                e["project"] = "AOPS/POS Templates"

    aops_count = sum(1 for e in template_entries if e["project"] == "AOPS/POS Templates")
    fmop_count = sum(1 for e in template_entries if e["project"] == "FMOP Templates")
    print(f"\n  AOPS/POS Templates: {aops_count}")
    print(f"  FMOP Templates:     {fmop_count}")
else:
    for e in template_entries:
        e["project"] = "AOPS/POS Templates"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Categorize templates
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 3: Categorizing templates")
print("=" * 70)

category_map = [
    ("WCRT", "Wrong Catalog Received", "WCRT - Wrong Catalog Received", "WCRT", "Wrong Catalog"),
    ("Tier 1 Ad Hoc", "Tier 1", "Tier 1 Ad Hoc Requests", "T1", "Tier 1"),
    ("Tier 2 Ad Hoc", "Tier 2", "Tier 2 Ad Hoc Requests", "T2", "Tier 2"),
    ("Tier 3 Ad Hoc", "Tier 3", "Tier 3 Ad Hoc Requests", "T3", "Tier 3"),
    ("Multiple Damages", "Damages", "Multiple Damages", "DMG", "Multiple Damages"),
    ("Problem with an Order", "PWAO", "Problem with an Order (PWAO)", "PWAO", "PWAO"),
    ("PO Reroute", "Reroute", "PO Reroutes", "RER", "PO Reroute"),
    ("Reroutes SOP", "Reroute", "PO Reroutes", "RER", "PO Reroute"),
    ("Update Tracking", "Tracking", "Update Tracking Number/Order Status", "TRK", "Tracking"),
    ("Tracking SOP", "Tracking", "Update Tracking Number/Order Status", "TRK", "Tracking"),
    ("Product Out of Stock", "OOS", "Product Out of Stock", "OOS", "Out of Stock"),
    ("Out of Stock SOP", "OOS", "Product Out of Stock", "OOS", "Out of Stock"),
    ("Change Ship Method", "CSM", "Change Ship Method", "CSM", "Change Ship Method"),
    ("Change Ship on PO", "CSM", "Change Ship Method", "CSM", "Change Ship Method"),
    ("BOL", "BOL", "Cannot Print BOL / Packing Slip / Shipping Label", "BOL", "Print Issue"),
    ("Cannot Print", "BOL", "Cannot Print BOL / Packing Slip / Shipping Label", "BOL", "Print Issue"),
    ("Shipping/Carrier", "SHP", "Shipping/Carrier Questions", "SHP", "Shipping"),
    ("Split PO", "SPL", "Split PO", "SPL", "Split PO"),
    ("Wrong Price", "WPR", "PO Has a Wrong Price", "WPR", "Wrong Price"),
    ("Global Transfer", "GTM", "Global Transfer Matrix", "GTM", "Transfer"),
    ("Lead Time", "LTM", "Lead Times", "LTM", "Lead Time"),
    ("WDN Supplier", "WDN", "WDN Supplier Outreach", "WDN", "WDN"),
    ("Escalat", "ESC", "Escalating for Onshore Support (Tier 0 to Tier 1)", "ESC", "Escalation"),
    ("WIMS", "WMS", "WIMS", "WMS", "WIMS"),
    ("NMFC", "NMFC", "NMFC and Freight Code Requests", "NMFC", "NMFC/Freight"),
    ("Ad Hoc", "ADH", "Tier 1 Ad Hoc Requests", "T1", "Ad Hoc"),
    ("Supplier Template", "SUP", "Supplier Templates", "SUP", "Supplier"),
    ("Supplier Email", "SEM", "Supplier Email Templates", "SEM", "Supplier Email"),
    ("Onshore Escalation", "ONS", "Onshore Escalations", "ONS", "Onshore"),
    ("Cancellation", "CAN", "Cancellation Inquiry", "CAN", "Cancellation"),
    ("Follow-Up", "FUP", "Follow-Up Templates", "FUP", "Follow-Up"),
    ("NMFC", "NMFC", "NMFC and Freight Code Requests", "NMFC", "NMFC"),
]

def categorize(title):
    for keyword, code, category, template_code, topic in category_map:
        if keyword in title:
            return category, code, template_code, topic
    return "Other", "OTH", "OTH", "Other"

for e in template_entries:
    e["page_id"] = find_page_id(e["title"])

for e in sop_pages:
    e["page_id"] = find_page_id(e["title"])
    e["has_en"] = not has_mandarin(e["title"])
    e["has_cn"] = has_mandarin(e["title"])

# Print categories
from collections import Counter
cat_counts = Counter(e["category"] for e in template_entries)
print("  Categories found:")
for cat, count in cat_counts.most_common():
    print(f"    {count:>3}x | {cat}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Handle English / Mandarin pairs
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 4: Detecting English / Mandarin pairs")
print("=" * 70)

# Group by base name (strip language suffix)
def base_name(title):
    # Remove common language markers
    t = re.sub(r'\s*[\(\[](Mandarin|Chinese|中文|EN|ZH)[^\]\)]*[\)\]]\s*', '', title)
    return t.strip()

grouped = {}
for e in template_entries:
    base = base_name(e["title"])
    if base not in grouped:
        grouped[base] = {"en": None, "zh": None, "raw": []}
    grouped[base]["raw"].append(e)
    if e["has_en"]:
        grouped[base]["en"] = e
    if e["has_cn"]:
        grouped[base]["zh"] = e

print(f"  Base groups: {len(grouped)}")
pairs = {k: v for k, v in grouped.items() if v["en"] and v["zh"]}
en_only = {k: v for k, v in grouped.items() if v["en"] and not v["zh"]}
zh_only = {k: v for k, v in grouped.items() if not v["en"] and v["zh"]}
print(f"  EN+ZH pairs:  {len(pairs)}")
print(f"  EN only:      {len(en_only)}")
print(f"  ZH only:      {len(zh_only)}")

# Print pairs
if pairs:
    print("\n  EN+ZH Pairs:")
    for base, g in sorted(pairs.items()):
        print(f"    EN: {g['en']['title'][:50]} v{g['en']['version']}")
        print(f"    ZH: {g['zh']['title'][:50]} v{g['zh']['version']}")
        print()

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Build and write CSV
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 5: Writing CSV")
print("=" * 70)

rows = []
# Header
rows.append([
    "Project",
    "Category",
    "Template Name (EN)",
    "Template Name (ZH)",
    "Template Page ID (EN)",
    "Template Page ID (ZH)",
    "Version (EN)",
    "Version (ZH)",
    "Template Code",
    "Ticket Topic",
    "Has English",
    "Has Mandarin",
    "Is EN+ZH Pair",
    "Notes",
])

# Write one row per base template (showing EN, ZH side by side)
for base, g in sorted(grouped.items()):
    en = g["en"]
    zh = g["zh"]

    name_en = en["title"] if en else ""
    name_zh = zh["title"] if zh else ""
    id_en = en.get("page_id", "") or en.get("id", "")
    id_zh = zh.get("page_id", "") or zh.get("id", "")
    ver_en = str(en["version"]) if en else ""
    ver_zh = str(zh["version"]) if zh else ""

    # Determine category from whichever entry has data
    entry = en or zh
    rows.append([
        entry.get("project", ""),
        entry.get("category", ""),
        name_en,
        name_zh,
        id_en,
        id_zh,
        ver_en,
        ver_zh,
        entry.get("template_code", ""),
        entry.get("topic", ""),
        "Yes" if en else "No",
        "Yes" if zh else "No",
        "Yes" if (en and zh) else "No",
        "",
    ])

output_path = "confluence_export/template_export_draft.csv"
with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f"  Written: {output_path}")
print(f"  Rows (incl header): {len(rows)}")

# Print preview
print()
print("Preview (first 40 rows):")
for row in rows[:41]:
    aops_fmop = row[0][:12] if row[0] else ""
    cat = row[1][:30] if row[1] else ""
    name = row[2][:50] if row[2] else "(ZH only)"
    has_cn = row[10]
    print(f"  {aops_fmop:<12} | {cat:<30} | {name:<50} | ZH={has_cn}")

print()
print("=" * 70)
print(f"CSV GENERATED: confluence_export/template_export_draft.csv")
print("=" * 70)
print()
print("Column guide:")
print("  Project         : AOPS/POS Templates  |  FMOP Templates")
print("  Category        : Specific category within project")
print("  Template Name EN: English template page title")
print("  Template Name ZH: Mandarin template page title (if exists)")
print("  Version EN/ZH   : Confluence version number")
print("  Is EN+ZH Pair   : Yes if both EN and ZH versions exist")
print("  Notes           : Blank — fill in after review")
print()
print("Please review the CSV and report back with any corrections.")
print("Known limitations:")
print("  - Page IDs may need to be fetched individually")
print("  - Version numbers come from ri:version-at-save attribute")
print("  - Mandarin detection based on Unicode characters in title")
print("  - Some SOP page titles may need re-categorization")
