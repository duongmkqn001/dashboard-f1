#!/usr/bin/env python3
"""
Deep extraction: fetch the full body.storage.raw (925KB) from the canonical
DSC2S page and the Change Log page. Parse the HTML to extract the full
template hierarchy (AOPS, FMOP, categories, English/Mandarin versions).
"""
import re, json, os
import requests
from html.parser import HTMLParser

EMAIL   = "lle31@wayfair.com"
API_KEY = os.environ.get("CONFLUENCE_API_KEY", "YOUR_API_KEY_HERE")
BASE    = "https://wayfaircorp.atlassian.net/wiki"
API     = f"{BASE}/rest/api"

os.makedirs("confluence_export", exist_ok=True)

s = requests.Session()
s.auth = (EMAIL, API_KEY)
s.headers.update({"Accept": "application/json", "User-Agent": "dashboard-f1-confluence-export/1.0"})

def get(path, params=None):
    r = s.get(f"{API}{path}", params=params, timeout=60)
    r.raise_for_status()
    return r.json()

# ─────────────────────────────────────────────────────────────────────────────
# Helper: strip HTML tags
# ─────────────────────────────────────────────────────────────────────────────
def strip_html(html):
    return re.sub(r'<[^>]+>', ' ', html).strip()

def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

# ─────────────────────────────────────────────────────────────────────────────
# 1. FETCH CANONICAL PAGE body.storage.raw (925KB)
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("1. FETCHING: Canned Responses/Templates (DSC2S) body.storage.raw")
print("=" * 70)
def get_body_raw(data):
    """Navigate the Confluence body storage structure safely."""
    body = data.get("body", {})
    # Try various paths for the raw storage body
    for path in [
        ("storage", "raw", "value"),
        ("storage", "raw"),
        ("storage", "value"),
    ]:
        try:
            val = body
            for key in path:
                val = val[key]
            if isinstance(val, str) and len(val) > 100:
                return val
        except (KeyError, TypeError):
            continue
    return ""

data = get(f"/content/1256153038", params={
    "expand": "version,body.storage.raw,body.storage,metadata.labels"
})
body_raw = get_body_raw(data)
print(f"   Length: {len(body_raw):,} chars")

with open("confluence_export/dcs2s_storage_raw.html", "w", encoding="utf-8") as f:
    f.write(body_raw)
print("   Saved: confluence_export/dcs2s_storage_raw.html")

# Search for key patterns
print()
print("Pattern search in raw storage:")
for term in ["AOPS", "POS Templates", "FMOP", "FMOC", "Mandarin", "WCRT",
             "English Version", "Chinese", "Tier 1", "Tier 2"]:
    count = body_raw.count(term)
    if count:
        idx = body_raw.index(term)
        ctx = clean_text(body_raw[max(0,idx-30):idx+100])
        print(f"  '{term}': {count}x | '{ctx}'")

# ─────────────────────────────────────────────────────────────────────────────
# 2. FETCH CHANGE LOG PAGE (has AOPS + FMOP history)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("2. FETCHING: Change Log (DSC2S) — full storage")
print("=" * 70)
cl = get(f"/content/1256143084", params={
    "expand": "version,body.storage.raw,body.view,metadata.labels"
})
cl_title = cl.get("title", "")
cl_ver = cl.get("version", {})
cl_body_raw = get_body_raw(cl)
cl_body_view = (cl.get("body", {}).get("view", {}) or {}).get("value", "")
print(f"   Title: {cl_title} | v{cl_ver.get('number')}")
print(f"   Body storage.raw: {len(cl_body_raw):,} chars")
print(f"   Body view:       {len(cl_body_view):,} chars")

with open("confluence_export/change_log_storage_raw.html", "w", encoding="utf-8") as f:
    f.write(cl_body_raw)
with open("confluence_export/change_log_view.html", "w", encoding="utf-8") as f:
    f.write(cl_body_view)
print("   Saved: confluence_export/change_log_*.html")

# Search Change Log for template references
print()
print("Change Log pattern search:")
for term in ["AOPS", "FMOP", "FMOC", "WCRT", "POS", "Supplier Email",
             "Tier 1", "Tier 2", "Tier 3", "Mandarin", "Template"]:
    count = cl_body_view.count(term)
    if count:
        print(f"  '{term}': {count}x")

# ─────────────────────────────────────────────────────────────────────────────
# 3. SCAN ALL GPS CANNED RESPONSE PAGES — find English/Mandarin pairs
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("3. SCANNING ALL GPS CANNED RESPONSE PAGES")
print("=" * 70)
all_pages = get("/content/search", params={
    "cql": 'title~"Canned Responses" AND space=GPS',
    "limit": 50,
    "expand": "version,metadata.labels,space"
})

# Group by base name
pages_by_base = {}
for p in all_pages.get("results", []):
    title = p["title"]
    space = p.get("space", {}).get("key", "")
    ver = p.get("version", {}).get("number", 0)
    labels = [l["name"] for l in p.get("metadata", {}).get("labels", {}).get("results", [])]

    # Detect language
    is_mandarin = bool(re.search(r'[\u4e00-\u9fff]', title)) or "mandarin" in title.lower()
    is_english = not is_mandarin

    # Extract base name (strip parenthetical suffixes)
    # e.g. "Canned Responses/Templates (DSC2S) - VCN" -> "Canned Responses/Templates"
    # e.g. "Canned Responses/Templates - (ISE) - VCN" -> "Canned Responses/Templates - (ISE)"
    base_match = re.match(r'^(.+?)\s*[-–]\s*[A-Z]{2}\s*$', title)
    base_name = base_match.group(1) if base_match else title

    # Extract category/bracket info
    bracket = re.search(r'\(([^)]+)\)', title)
    category = bracket.group(1) if bracket else ""

    key = base_name
    if key not in pages_by_base:
        pages_by_base[key] = []
    pages_by_base[key].append({
        "id": p["id"],
        "title": title,
        "space": space,
        "version": ver,
        "labels": labels,
        "is_mandarin": is_mandarin,
        "is_english": is_english,
        "category": category,
    })

# Print group summary
print(f"Found {len(all_pages.get('results', []))} pages, {len(pages_by_base)} unique base names")
print()
for base, pages in sorted(pages_by_base.items()):
    has_en = any(p["is_english"] for p in pages)
    has_cn = any(p["is_mandarin"] for p in pages)
    en_versions = [p["version"] for p in pages if p["is_english"]]
    cn_versions = [p["version"] for p in pages if p["is_mandarin"]]
    en_ids = [p["id"] for p in pages if p["is_english"]]
    cn_ids = [p["id"] for p in pages if p["is_mandarin"]]
    all_ids = [p["id"] for p in pages]

    print(f"  BASE: {base}")
    if has_en:
        print(f"    EN:     v{max(en_versions)} | IDs: {en_ids}")
    if has_cn:
        print(f"    ZH:     v{max(cn_versions)} | IDs: {cn_ids}")
    if not has_en and not has_cn:
        print(f"    OTHER:  {all_ids} | versions: {[p['version'] for p in pages]}")

print()

# ─────────────────────────────────────────────────────────────────────────────
# 4. EXTRACT CHANGE LOG TEMPLATE STRUCTURE
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("4. PARSING CHANGE LOG TEMPLATE STRUCTURE")
print("=" * 70)

# The change log has entries like:
# "Canned Responses/Templates > AOPS / POS Templates > Tier 1 Ad Hoc Requests"
# "Canned Responses/Templates > FMOP > Supplier Templates > Supplier Email Templates"
# Let's extract all h3/h4 headings and list items that describe template changes

def extract_headings_and_lists(html):
    """Extract all headings and their following list items."""
    # Get all h3, h4, h5, h6
    heading_tags = re.finditer(r'<h([1-6])[^>]*>(.*?)</h\1>', html, re.DOTALL | re.IGNORECASE)
    structure = []
    current_headings = []

    for m in heading_tags:
        level = int(m.group(1))
        text = clean_text(m.group(2))
        if not text or text in ("", " "):
            continue
        # Keep stack of open headings
        current_headings = current_headings[:level-1]
        current_headings.append(text)
        structure.append({
            "level": level,
            "text": text,
            "path": " > ".join(current_headings),
        })

    return structure

headings = extract_headings_and_lists(cl_body_view)
print(f"Found {len(headings)} headings in Change Log")
for h in headings[:50]:
    indent = "  " * (h["level"] - 1)
    print(f"  H{h['level']} {indent}{h['text']}")
    if h["level"] >= 4:  # Show path for deeper headings
        print(f"       path: {h['path']}")

# ─────────────────────────────────────────────────────────────────────────────
# 5. EXTRACT ALL INCLUDED PAGE NAMES FROM BODY.STORAGE.RAW
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("5. INCLUDED PAGE REFERENCES IN body.storage.raw")
print("=" * 70)

# Find all ri:page ri:content-title references
inc_pages = re.findall(r'ri:content-title="([^"]+)"', body_raw)
print(f"Found {len(inc_pages)} page inclusions:")
for t in sorted(set(inc_pages)):
    count = inc_pages.count(t)
    print(f"  [{count}x] {t}")

# ─────────────────────────────────────────────────────────────────────────────
# 6. LOOK AT THE CONFIRM SCREENSHOT (user uploaded) TO UNDERSTAND STRUCTURE
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("6. SCREENSHOT ANALYSIS (user-provided image)")
print("=" * 70)
# The user image shows the table structure. Let me look at what's visible:
# Row: Icon | Ticket Topic/Issue | Template Name | Template Category | Version | Last Updated
# AOPS/POS Templates | WCRT: Wrong Catalog Received... | (has icons)
# It seems to show two main project categories (AOPS/POS Templates and FMOP)

# Let's build the CSV based on what we know from the screenshot:
# - Project 1: AOPS/POS Templates
#   - Category: WCRT - Wrong Catalog Received (Tier 1)
#   - Template: WCRT: Wrong Catalog Received Template (English) + Mandarin version
# - Project 2: FMOP Templates
#   - Supplier Templates > Supplier Email Templates
#   - etc.

print()
print("Based on the screenshot analysis, the structure appears to be:")
print()
print("  PROJECT: AOPS/POS Templates")
print("    CATEGORY: WCRT (Wrong Catalog Received)")
print("      TEMPLATE: [English name] [Mandarin name] vX")
print("    CATEGORY: Other AOPS categories...")
print()
print("  PROJECT: FMOP Templates")
print("    CATEGORY: Supplier Templates > Supplier Email Templates")
print("      TEMPLATE: [English name] [Mandarin name] vX")

print()
print("=" * 70)
print("READY FOR CSV EXPORT — see next script")
print("=" * 70)
