#!/usr/bin/env python3
"""
Correct approach: decode macroBody from the view HTML URL-encoded content,
parse the tab structure (AOPS/POS | FMOP > Category > sub-tabs),
then for each sub-tab, find the SOP page that contains the actual template table.

The template table in each SOP has columns like:
  Ticket Topic | Template Name | Category | Version | Last Updated
"""
import re, csv, os, json, time, base64
from urllib.parse import unquote, parse_qs, urlparse
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

def c(t): return re.sub(r'\s+', ' ', t).strip()
def is_cjk(t): return bool(re.search(r'[\u4e00-\u9fff]', t))

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Load the view HTML and extract macroBody from ui-tabs URL
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("STEP 1: Extracting macroBody from view HTML")
print("=" * 70)

with open("confluence_export/dcs2s_view.html", encoding="utf-8") as f:
    view_html = f.read()

# Find the ui-tabs URL from the view HTML
url_m = re.search(
    r'"url"\s*:\s*"(https://us\.macro\.refined-toolkit\.com/dynamic-macros/refined-tabs\?[^"]+)"',
    view_html
)
if not url_m:
    # Try without the protocol prefix
    url_m = re.search(
        r'"url"\s*:\s*"(us\.macro\.refined-toolkit\.com/dynamic-macros/refined-tabs\?[^"]+)"',
        view_html
    )

if url_m:
    full_url = "https://" + url_m.group(1) if not url_m.group(1).startswith("http") else url_m.group(1)
    print(f"  Found URL: {full_url[:120]}")
    # Extract macroBody
    parsed = urlparse(full_url)
    qs = parse_qs(parsed.query)
    macro_body_encoded = qs.get("macroBody", [""])[0]
    print(f"  macroBody length: {len(macro_body_encoded):,} chars")

    # Decode
    macro_body_decoded = unquote(macro_body_encoded)
    print(f"  Decoded macroBody: {len(macro_body_decoded):,} chars")

    # Save decoded content
    with open("confluence_export/macro_body_decoded.html", "w", encoding="utf-8") as f:
        f.write(macro_body_decoded)
    print("  Saved: confluence_export/macro_body_decoded.html")
else:
    print("  ERROR: Could not find ui-tabs URL")
    macro_body_decoded = ""

# Also try to find the raw content from the page body.storage.raw
print()
print("Fetching canonical page storage to find tab definitions...")
canonical_data = cf_get("/content/1256153038", params={
    "expand": "version,body.storage.raw,metadata.labels"
})
canonical_body = ""
body_obj = canonical_data.get("body", {})
for key in ["storage", "view"]:
    obj = body_obj.get(key, {})
    if isinstance(obj, dict):
        raw = obj.get("raw", {}) or obj.get("value", {})
        if isinstance(raw, dict):
            val = raw.get("value", "")
        elif isinstance(raw, str):
            val = raw
        else:
            val = ""
        if len(val) > len(canonical_body):
            canonical_body = val

print(f"  Canonical body.storage.raw: {len(canonical_body):,} chars")

if canonical_body:
    with open("confluence_export/dcs2s_storage_raw.html", "w", encoding="utf-8") as f:
        f.write(canonical_body)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Parse the macroBody to extract tab structure
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 2: Parsing tab structure from macroBody")
print("=" * 70)

if macro_body_decoded:
    # Find all tab divs
    tab_divs = re.findall(
        r'<div[^>]*class="[^"]*tab[^"]*"[^>]*data-local-id="([^"]+)"[^>]*>(.*?)</div>\s*</div>',
        macro_body_decoded, re.DOTALL | re.IGNORECASE
    )
    print(f"  Found {len(tab_divs)} tab divs")

    # Also look for tab titles
    tab_titles = re.findall(
        r'<div[^>]*class="[^"]*tab[^"]*"[^>]*data-local-id="([^"]+)"',
        macro_body_decoded, re.IGNORECASE
    )
    print(f"  Tab local-ids: {tab_titles}")

    # Extract structured tab content
    # Look for tab panel headers
    panel_headers = re.findall(
        r'<div[^>]*class="[^"]*ap-tab-panel[^"]*"[^>]*data-local-id="([^"]+)"',
        macro_body_decoded, re.IGNORECASE
    )
    print(f"  Tab panel IDs: {panel_headers[:10]}")

    # Find the tab titles from the structured macro div
    tab_sections = re.findall(
        r'class="[^"]*ap-tab[^"]*"[^>]*data-local-id="([^"]+)"',
        macro_body_decoded, re.IGNORECASE
    )
    print(f"  ap-tab local-ids: {tab_sections[:10]}")

    # Search for "AOPS / POS Templates" and "FMOP Templates" in decoded content
    for marker in ["AOPS / POS Templates", "FMOP Templates", "Problem with an Order",
                   "Cancellation Inquiries", "PO Reroutes", "NA Specific", "EU Specific"]:
        count = macro_body_decoded.count(marker)
        idx = macro_body_decoded.find(marker)
        if idx != -1:
            ctx = c(macro_body_decoded[max(0,idx-50):idx+100])
            print(f"  '{marker}': {count}x | ctx: {ctx[:100]}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: The REAL template data is in the SOP pages themselves
# We need to fetch each SOP page and look for the "Canned Responses Templates"
# table which has the actual template names
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 3: Fetching SOP pages to find template tables")
print("=" * 70)

# Load SOP data from previous run
with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}

# The key insight from the screenshot: each SOP page has a table with:
# Ticket Topic | Template Name | Category | Version | Last Updated
# Let's look at the PWAO SOP (169KB) to find this table structure

# Fetch the Problem with an Order (PWAO) SOP page directly
pwao_id = 1256152285
print(f"  Fetching PWAO SOP page (ID={pwao_id})...")
pwao = cf_get(f"/content/{pwao_id}", params={
    "expand": "version,body.storage.raw,metadata.labels"
})
pwao_body = ""
pwao_obj = pwao.get("body", {})
for key in ["storage", "view"]:
    obj = pwao_obj.get(key, {})
    if isinstance(obj, dict):
        raw = obj.get("raw", {}) or obj.get("value", {})
        if isinstance(raw, dict):
            val = raw.get("value", "")
        elif isinstance(raw, str):
            val = raw
        else:
            val = ""
        if len(val) > len(pwao_body):
            pwao_body = val

print(f"  PWAO body length: {len(pwao_body):,} chars")

with open("confluence_export/pwao_sop_storage.html", "w", encoding="utf-8") as f:
    f.write(pwao_body)

# Look for table structures in PWAO body
print()
print("  Searching for template table in PWAO body...")

# Find all table headers
table_headers = re.findall(
    r'<th[^>]*>(.*?)</th>',
    pwao_body, re.DOTALL | re.IGNORECASE
)
table_headers_clean = [c(h) for h in table_headers]
print(f"  All TH cells ({len(table_headers_clean)} total):")
for h in table_headers_clean[:30]:
    if len(h) > 2:
        print(f"    '{h[:80]}'")

# Look specifically for columns with "Template" or "Topic" in header
template_headers = [h for h in table_headers_clean
                   if any(kw in h.lower() for kw in ["template", "topic", "version", "updated", "name"])]
print(f"\n  Template-related headers: {template_headers}")

# Look for Confluence rich-text table format
rich_tables = re.findall(
    r'<ac:structured-macro[^>]*ac:name="table-filter"[^>]*>(.*?)</ac:structured-macro>',
    pwao_body, re.DOTALL
)
print(f"\n  Confluence table-filter macros: {len(rich_tables)}")

# Look for the Canned Responses table (typically in a custom table format)
# The table might be in a <table> tag with specific class
tables_in_pwao = re.findall(r'<table[^>]*>(.*?)</table>', pwao_body, re.DOTALL | re.IGNORECASE)
print(f"\n  HTML tables in PWAO body: {len(tables_in_pwao)}")

for i, tbl in enumerate(tables_in_pwao[:5]):
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, re.DOTALL | re.IGNORECASE)
    print(f"\n  Table {i+1} ({len(rows)} rows):")
    for row in rows[:3]:
        cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL | re.IGNORECASE)
        cells = [c(c2) for c2 in cells]
        if any(cells):
            print(f"    {' | '.join(cells[:5])}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Try fetching the SOP page with body.view to get rendered content
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 4: Fetching PWAO with body.view")
print("=" * 70)

pwao_view = cf_get(f"/content/{pwao_id}", params={
    "expand": "version,body.view"
})
pwao_view_body = (pwao_view.get("body", {}).get("view", {}) or {}).get("value", "")
print(f"  PWAO view body: {len(pwao_view_body):,} chars")

if pwao_view_body:
    with open("confluence_export/pwao_sop_view.html", "w", encoding="utf-8") as f:
        f.write(pwao_view_body)

    # Search for template-related content
    for kw in ["Template Name", "Ticket Topic", "Version", "WCRT", "Wrong Catalog",
                "PWAO", "Cancellation", "Reroute", "table-filter"]:
        count = pwao_view_body.count(kw)
        if count:
            idx = pwao_view_body.find(kw)
            ctx = pwao_view_body[max(0,idx-50):idx+100]
            ctx_clean = c(re.sub(r'<[^>]+>', '', ctx))
            print(f"  '{kw}': {count}x | {ctx_clean[:100]}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Try the Confluence Table Filter app endpoint
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 5: Checking Confluence Table REST API")
print("=" * 70)

# Confluence Cloud has a Table REST API
# GET /wiki/rest/api/content/{contentId}/table/{tableId}
# But we need the table ID from the page content

# Try searching for table IDs in the storage
table_ids = re.findall(
    r'data-table-id="([^"]+)"',
    pwao_body
)
print(f"  Table IDs found in PWAO: {table_ids}")

# Try the table API
for tbl_id in table_ids[:3]:
    try:
        tbl_data = cf_get(f"/content/{pwao_id}/table/{tbl_id}")
        print(f"  Table {tbl_id}: {len(str(tbl_data))} chars response")
    except Exception as e:
        print(f"  Table {tbl_id}: error - {e}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Look for JSON-LD structured data or data attributes in view HTML
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 6: Scanning view HTML for structured data")
print("=" * 70)

if pwao_view_body:
    # Look for JSON data embedded in the page
    json_ld = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        pwao_view_body, re.DOTALL | re.IGNORECASE
    )
    print(f"  JSON-LD blocks: {len(json_ld)}")

    # Look for JavaScript data objects
    js_data = re.findall(
        r'var\s+\w+\s*=\s*(\{.*?\});',
        pwao_view_body[:50000], re.DOTALL
    )
    print(f"  JS var assignments: {len(js_data)}")
    for d in js_data[:3]:
        print(f"    {d[:200]}")

    # Look for specific Confluence data attributes
    data_attrs = re.findall(
        r'data-[a-z-]+="([^"]{5,100})"',
        pwao_view_body[:20000]
    )
    print(f"\n  Data attributes found: {len(set(data_attrs))}")
    for attr in sorted(set(data_attrs))[:20]:
        print(f"    data-* = '{attr[:80]}'")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Try fetching the SOP page as HTML export
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 7: Fetching PWAO as HTML export")
print("=" * 70)

try:
    export_resp = s.get(
        f"{BASE}/wiki/export/html/{pwao_id}",
        timeout=30,
        allow_redirects=True
    )
    print(f"  HTML export status: {export_resp.status_code}")
    if export_resp.status_code == 200:
        html_export = export_resp.text
        print(f"  HTML export length: {len(html_export):,} chars")
        with open("confluence_export/pwao_sop_export.html", "w", encoding="utf-8") as f:
            f.write(html_export)

        # Search for template table in export
        export_tables = re.findall(r'<table[^>]*>(.*?)</table>', html_export, re.DOTALL | re.IGNORECASE)
        print(f"  Tables in export: {len(export_tables)}")
        for i, tbl in enumerate(export_tables[:5]):
            rows_found = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, re.DOTALL | re.IGNORECASE)
            print(f"  Table {i+1}: {len(rows_found)} rows")
            for row in rows_found[:5]:
                cells_found = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL | re.IGNORECASE)
                cells_clean = [c(c3) for c3 in cells_found]
                cells_clean = [x for x in cells_clean if x]
                if cells_clean:
                    print(f"    {' | '.join(cells_clean[:5])}")
except Exception as e:
    print(f"  Export failed: {e}")

print()
print("=" * 70)
print("ANALYSIS COMPLETE — results saved in confluence_export/")
print("=" * 70)
