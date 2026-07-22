#!/usr/bin/env python3
"""
Final extraction: parse SOP page bodies to find actual canned response template names.
Template names appear in the body as:
  - Bold section headers: <strong>Template Name</strong>
  - Followed by text content
  - Or: "Added template – Template Name"
  - Or: "Follow-Up: Template Name"

Strategy:
  1. For each SOP page, extract body text
  2. Find section headers (bold text, H3-H6)
  3. Look for "Added template", "Follow-Up:" patterns
  4. These are the actual canned response template names
  5. Match against category keywords to classify
"""
import re, csv, os, json, time
import requests

EMAIL   = "lle31@wayfair.com"
API_KEY = "ATATT3xFfGF0MylzpU43ITGrELXebo0zEdBvAdsWRWn4_M5ItRNHW_q6voY4YZbzwBURgN1od6o55TlXaCzI5Tf7hrdSkdIfhYCJEwpyN3bZ_aCrTG5caT7CNP4mnPqUpSNcNtcUvZGPzN3_s9sEet_jjxTfVYM-VPm1Gfn3Ob6SEI-G3QmC4AI=53EFE2CE"
BASE    = "https://wayfaircorp.atlassian.net/wiki"
API     = f"{BASE}/rest/api"

os.makedirs("confluence_export", exist_ok=True)

s = requests.Session()
s.auth = (EMAIL, API_KEY)
s.headers.update({"Accept": "application/json", "User-Agent": "dashboard-f1-confluence-tpl/1.0"})

def cf_get(path, params=None):
    r = s.get(f"{API}{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def clean(text):
    return re.sub(r'\s+', ' ', text).strip()

def is_cjk(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def strip_lang(title):
    return re.sub(r'\s*[\(\[](?:Mandarin|Chinese|ZH|中文|Mandarin Text)[^\]\)]*[\)\]]', '', title).strip()

# ─────────────────────────────────────────────────────────────────────────────
# Load SOP data saved from previous run
# ─────────────────────────────────────────────────────────────────────────────
print("Loading SOP pages data...")
with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}

print(f"Loaded {len(sop_data)} SOP pages")

# ─────────────────────────────────────────────────────────────────────────────
# Parse body text to find template names
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("EXTRACTING TEMPLATE NAMES FROM SOP PAGE BODIES")
print("=" * 70)

def extract_template_names(body, sop_title):
    """
    Extract actual canned response template names from a SOP page body.
    Template names appear as:
    1. "Added template – Template Name"
    2. "Follow-Up: Template Name"
    3. "Template Name Template" in bold
    4. Section headers (H3-H6)
    """
    if not body:
        return []

    templates = []
    seen = set()

    # Pattern 1: Change Log style entries
    # "Added template – Follow-Up: Address Verification Email Template (English)"
    # "Removed template – Something"
    added_patterns = [
        r'Added template[\s–\-:]*\s*([A-Za-z0-9][^\n\r]{5,120})',
        r'Added[\s–\-:]*\s*template[\s–\-:]*\s*([A-Za-z0-9][^\n\r]{5,120})',
    ]
    for pat in added_patterns:
        for m in re.finditer(pat, body, re.IGNORECASE):
            name = clean(m.group(1))
            # Clean up trailing punctuation
            name = re.sub(r'[\–\-\.\:]+$', '', name).strip()
            if len(name) > 5 and name not in seen:
                seen.add(name)
                templates.append({"name": name, "type": "Added"})

    # Pattern 2: Follow-Up entries
    followup_patterns = [
        r'Follow-Up[\s:–\-]*\s*([^\n\r]{5,100})',
        r'Follow Up[\s:–\-]*\s*([^\n\r]{5,100})',
        r'follow-up[\s:–\-]*\s*([^\n\r]{5,100})',
    ]
    for pat in followup_patterns:
        for m in re.finditer(pat, body, re.IGNORECASE):
            name = clean(m.group(1))
            name = re.sub(r'[\–\-\.\:]+$', '', name).strip()
            if len(name) > 5 and name not in seen:
                seen.add(name)
                templates.append({"name": name, "type": "Follow-Up"})

    # Pattern 3: "Template" keyword entries
    # "Follow-Up: Address Verification Email Template"
    tpl_pattern = r'([A-Z][A-Za-z0-9\s:–\-]{5,80}?Template[A-Za-z0-9\s:–\-]*)'
    for m in re.finditer(tpl_pattern, body):
        name = clean(m.group(1))
        name = re.sub(r'[\–\-\.\:]+$', '', name).strip()
        if len(name) > 5 and name not in seen:
            seen.add(name)
            templates.append({"name": name, "type": "Template"})

    # Pattern 4: Bold section headers in body
    bold_patterns = [
        r'<strong[^>]*>([^<]{5,100})</strong>',
        r'<b[^>]*>([^<]{5,100})</b>',
        r'<h3[^>]*>([^<]{5,100})</h3>',
        r'<h4[^>]*>([^<]{5,100})</h4>',
    ]
    for pat in bold_patterns:
        for m in re.finditer(pat, body, re.IGNORECASE):
            name = clean(m.group(1))
            # Skip common non-template headings
            skip = ["problem", "inquiry", "request", "response", "guideline",
                    "instruction", "policy", "procedure", "section", "step",
                    "table of content", "overview", "introduction", "purpose"]
            if any(s in name.lower() for s in skip):
                continue
            if len(name) > 5 and name not in seen:
                seen.add(name)
                templates.append({"name": name, "type": "Header"})

    # Pattern 5: "Address Verification", "Wrong Catalog", etc. keyword entries
    kw_patterns = [
        r'Address\s+Verification[^\n\r]{0,60}',
        r'Wrong\s+Catalog[^\n\r]{0,60}',
        r'Wrong\s+Price[^\n\r]{0,60}',
        r'Product\s+Out\s+of\s+Stock[^\n\r]{0,60}',
        r'SKU\s+Issue[^\n\r]{0,60}',
        r'Split\s+PO[^\n\r]{0,60}',
        r'Order\s+Cancellation[^\n\r]{0,60}',
        r'Shipping\s+Delay[^\n\r]{0,60}',
        r'Carrier\s+Issue[^\n\r]{0,60}',
        r'Packaging\s+Issue[^\n\r]{0,60}',
        r'Proof\s+of\s+Pickup[^\n\r]{0,60}',
        r'International[^\n\r]{0,60}',
        r'Lead\s+Time[^\n\r]{0,60}',
        r'Tracking\s+Update[^\n\r]{0,60}',
        r'NMFC[^\n\r]{0,60}',
        r'Warehouse[^\n\r]{0,60}',
    ]
    for pat in kw_patterns:
        for m in re.finditer(pat, body, re.IGNORECASE):
            name = clean(m.group(0))
            if len(name) > 8 and name not in seen:
                seen.add(name)
                templates.append({"name": name, "type": "Keyword"})

    return templates

# ─────────────────────────────────────────────────────────────────────────────
# Extract templates from each SOP page
# ─────────────────────────────────────────────────────────────────────────────
all_templates = []

for pid, sop in sorted(sop_data.items()):
    body = sop.get("body", "")
    if not body or sop.get("body_len", 0) < 100:
        continue

    sop_title = sop["title"]
    templates = extract_template_names(body, sop_title)

    if templates:
        print(f"\n  [{sop_title[:50]}]: {len(templates)} templates")
        for t in templates[:5]:
            print(f"    [{t['type']:10}] {t['name'][:60]}")
        if len(templates) > 5:
            print(f"    ... +{len(templates)-5} more")

    for t in templates:
        all_templates.append({
            "sop_title": sop_title,
            "sop_id": pid,
            "sop_version": sop.get("version", 0),
            "sop_author": sop.get("author", ""),
            "template_name": t["name"],
            "template_type": t["type"],
        })

print(f"\nTotal template entries extracted: {len(all_templates)}")

# ─────────────────────────────────────────────────────────────────────────────
# Deduplicate by template name
# ─────────────────────────────────────────────────────────────────────────────
seen = {}
for t in all_templates:
    name = t["template_name"]
    if name not in seen:
        seen[name] = t
all_templates = list(seen.values())
print(f"After dedup: {len(all_templates)} unique template names")

# ─────────────────────────────────────────────────────────────────────────────
# Categorize
# ─────────────────────────────────────────────────────────────────────────────
cat_map = [
    ("WCRT", "Wrong Catalog Received", "WCRT"),
    ("Wrong Catalog", "Wrong Catalog Received", "WCRT"),
    ("Address Verification", "Address Verification", "AVT"),
    ("SKU Issue", "SKU Issue", "SKU"),
    ("NMFC", "NMFC and Freight Code Requests", "NMFC"),
    ("Lead Time", "Lead Times", "LTM"),
    ("Tracking Update", "Update Tracking Number/Order Status", "TRK"),
    ("Tracking Number", "Update Tracking Number/Order Status", "TRK"),
    ("Product Out of Stock", "Product Out of Stock", "OOS"),
    ("Out of Stock", "Product Out of Stock", "OOS"),
    ("Wrong Price", "PO Has a Wrong Price", "WPR"),
    ("PO has a Wrong Price", "PO Has a Wrong Price", "WPR"),
    ("Cancellation", "Cancellation Inquiries", "CAN"),
    ("Order Cancellation", "Cancellation Inquiries", "CAN"),
    ("Reroute", "PO Reroutes", "RER"),
    ("PO Reroute", "PO Reroutes", "RER"),
    ("Change Ship", "Change Ship Method", "CSM"),
    ("Carrier Change", "Change Ship Method", "CSM"),
    ("Ship Method", "Change Ship Method", "CSM"),
    ("Shipping Delay", "Shipping/Carrier Questions", "SHP"),
    ("Carrier Delay", "Shipping/Carrier Questions", "SHP"),
    ("Carrier Issue", "Shipping/Carrier Questions", "SHP"),
    ("Packaging Issue", "Multiple Damages", "DMG"),
    ("Multiple Damage", "Multiple Damages", "DMG"),
    ("Damaged", "Multiple Damages", "DMG"),
    ("Split PO", "Split PO", "SPL"),
    ("Order Split", "Split PO", "SPL"),
    ("Proof of Pickup", "WIMS - Large Parcel", "WMS"),
    ("Large Parcel", "WIMS - Large Parcel", "WMS"),
    ("WIMS", "WIMS", "WMS"),
    ("Warehouse Issue", "WIMS", "WMS"),
    ("International", "International Shipment Issues", "INTL"),
    ("EU Shipment", "EU Shipment Issues", "INTL"),
    ("Onshore Escalation", "Escalating for Onshore Support", "ESC"),
    ("Escalation", "Escalating for Onshore Support", "ESC"),
    ("Transfer", "Global Transfer Matrix", "GTM"),
    ("Global Transfer", "Global Transfer Matrix", "GTM"),
    ("Need PO", "Need PO to be Resent", "NPR"),
    ("Resend PO", "Need PO to be Resent", "NPR"),
    ("WDN", "WDN Supplier Outreach", "WDN"),
    ("Follow-Up", "Follow-Up Templates", "FUP"),
    ("Email Template", "Email Templates", "EML"),
    ("Internal Ticket", "Internal Ticket Types", "INT"),
    ("BOL", "Cannot Print BOL / Packing Slip / Shipping Label", "BOL"),
    ("Packing Slip", "Cannot Print BOL / Packing Slip / Shipping Label", "BOL"),
    ("Shipping Label", "Cannot Print BOL / Packing Slip / Shipping Label", "BOL"),
    ("Cannot Print", "Cannot Print BOL / Packing Slip / Shipping Label", "BOL"),
]

def get_cat(name):
    for kw, cat, code in cat_map:
        if kw.lower() in name.lower():
            return cat, code
    return "Other", "OTH"

# Assign SOP to AOPS or FMOP based on SOP title
fmop_sops = ["Supplier", "Email", "Onshore Escalation", "Onshore Escal", "FMOC",
             "Carrier Template", "FTL"]
aops_sops = ["Cancellation", "BOL", "Packing", "PWAO", "Reroute", "Tracking",
             "Out of Stock", "Wrong Price", "Ship", "Split", "Transfer", "Lead Time",
             "WDN", "Escalat", "WIMS", "NMFC", "Tier 1", "Tier 2", "Tier 3",
             "Ad Hoc", "Damages", "PO has", "Need PO", "Change Ship"]

for t in all_templates:
    sop = t["sop_title"]
    name = t["template_name"]
    if any(k in name for k in ["Supplier", "Email", "Onshore Escalation", "FMOC"]):
        t["project"] = "FMOP Templates"
    elif any(k in name for k in fmop_sops):
        t["project"] = "FMOP Templates"
    else:
        t["project"] = "AOPS/POS Templates"
    cat, code = get_cat(name)
    t["category"] = cat
    t["template_code"] = code

# ─────────────────────────────────────────────────────────────────────────────
# Get page IDs for templates
# ─────────────────────────────────────────────────────────────────────────────
print()
print("Looking up page IDs for template names...")
template_name_to_id = {}

for t in all_templates[:30]:  # limit to avoid too many API calls
    name = t["template_name"]
    if name in template_name_to_id:
        continue
    try:
        result = cf_get("/content/search", params={
            "cql": f'title~"{name[:60]}" AND space=GPS',
            "limit": 3, "expand": "space"
        })
        for p in result.get("results", []):
            if p.get("space", {}).get("key") == "GPS":
                template_name_to_id[name] = int(p["id"])
                break
        time.sleep(0.2)
    except:
        pass

print(f"  Resolved {len(template_name_to_id)} IDs")

for t in all_templates:
    t["template_id"] = template_name_to_id.get(t["template_name"], "")

# ─────────────────────────────────────────────────────────────────────────────
# Write CSV
# ─────────────────────────────────────────────────────────────────────────────
print()
print("Writing CSV...")

COLUMNS = [
    "Project",
    "Category",
    "Template Code",
    "Template Name",
    "Template Page ID",
    "Version",
    "SOP Page Title",
    "SOP Page ID",
    "SOP Version",
    "SOP Author",
    "Is EN",
    "Is ZH",
    "Confluence Link",
    "Notes",
]

rows = [COLUMNS]
for t in sorted(all_templates, key=lambda x: (x["project"], x["category"], x["template_name"])):
    pid = t.get("template_id", "")
    link = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{pid}" if pid else ""
    rows.append([
        t["project"],
        t["category"],
        t["template_code"],
        t["template_name"],
        str(pid),
        "",
        t["sop_title"],
        str(t["sop_id"]),
        str(t["sop_version"]),
        t["sop_author"],
        "Yes" if not is_cjk(t["template_name"]) else "No",
        "Yes" if is_cjk(t["template_name"]) else "No",
        link,
        "",
    ])

output = "confluence_export/template_export_final.csv"
with open(output, "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(rows)

print(f"Written: {output} ({len(rows)} rows)")

# Summary by category
from collections import Counter
cat_count = Counter(t["category"] for t in all_templates)
print("\nCategory breakdown:")
for cat, n in cat_count.most_common():
    print(f"  {n:>3}x | {cat}")

print()
print("=" * 70)
print("DONE — see confluence_export/template_export_final.csv")
print("=" * 70)
