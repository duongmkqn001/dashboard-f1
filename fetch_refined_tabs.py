#!/usr/bin/env python3
"""
Fetch DSC2S page tab content from Refined Theme dynamic macros.
The main page body uses ui-tabs/ui-expand macros that render content
server-side at us.macro.refined-toolkit.com.

Strategy:
  1. Extract JWT tokens + macro IDs from the view HTML
  2. Call us.macro.refined-toolkit.com to get tab/expand content
  3. Parse the rendered tab structure (AOPS, FMOP, etc.)
  4. Output a CSV
"""
import sys, re, json, base64
import requests
from urllib.parse import urlencode, quote
from html.parser import HTMLParser

EMAIL   = "lle31@wayfair.com"
API_KEY = "ATATT3xFfGF0MylzpU43ITGrELXebo0zEdBvAdsWRWn4_M5ItRNHW_q6voY4YZbzwBURgN1od6o55TlXaCzI5Tf7hrdSkdIfhYCJEwpyN3bZ_aCrTG5caT7CNP4mnPqUpSNcNtcUvZGPzN3_s9sEet_jjxTfVYM-VPm1Gfn3Ob6SEI-G3QmC4AI=53EFE2CE"
BASE    = "https://wayfaircorp.atlassian.net/wiki"
API     = f"{BASE}/rest/api"
REFINED = "https://us.macro.refined-toolkit.com"

PAGE_ID = 1256153038

s = requests.Session()
s.auth = (EMAIL, API_KEY)
s.headers.update({"Accept": "application/json", "User-Agent": "dashboard-f1-confluence-export/1.0"})
s2 = requests.Session()
s2.headers.update({"User-Agent": "dashboard-f1-confluence-export/1.0", "Accept": "text/html,*/*"})

def get(path, params=None):
    r = s.get(f"{API}{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()

# ── Step 1: Get view HTML ──────────────────────────────────────────────────
print("Fetching page view HTML...")
data = get(f"/content/{PAGE_ID}", params={"expand": "version,body.view,metadata.labels"})
body_view = data.get("body", {}).get("view", {}).get("value", "")
title = data.get("title", "")
ver = data.get("version", {})
print(f"  Title: {title} | v{ver.get('number')} | {len(body_view):,} chars")
print()

# ── Step 2: Extract all Refined macro URLs from the view HTML ─────────────
print("Scanning for Refined Theme macro URLs...")

# The macros are in script CDATA sections with `var data = { ... "url": "..." }`
url_pattern = re.compile(
    r'"url"\s*:\s*"(https://us\.macro\.refined-toolkit\.com/dynamic-macros/[^\"]+)"'
)
urls_found = url_pattern.findall(body_view)
print(f"  Found {len(urls_found)} Refined macro URL(s)")

macro_urls = {}
for url in urls_found:
    # Extract macro name from URL path
    name = re.search(r'dynamic-macros/([^?]+)', url)
    name = name.group(1) if name else "unknown"
    macro_urls[name] = url
    print(f"  [{name}] {url[:120]}")

print()

# ── Step 3: Try each macro URL to get rendered content ──────────────────────
def fetch_refined(url, referer=None):
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": referer or f"{BASE}/wiki/spaces/GPS/pages/{PAGE_ID}",
    }
    try:
        r = s2.get(url, headers=headers, timeout=30, allow_redirects=True)
        return r.status_code, r.text, r.headers
    except Exception as e:
        return 0, str(e), {}

# Fetch ui-tabs content
tabs_html = ""
tabs_macro_id = ""
if "refined-tabs" in macro_urls:
    url = macro_urls["refined-tabs"]
    status, text, headers = fetch_refined(url)
    print(f"Fetching refined-tabs: HTTP {status}")
    print(f"  Content-Type: {headers.get('Content-Type', 'unknown')}")
    print(f"  Content length: {len(text):,}")
    if status == 200 and text:
        tabs_html = text
        # Save for analysis
        import os; os.makedirs("confluence_export", exist_ok=True)
        with open("confluence_export/refined_tabs.html", "w", encoding="utf-8") as f:
            f.write(text)
        print(f"  Saved to confluence_export/refined_tabs.html")

        # Also look for tab names in the HTML
        tab_names = re.findall(r'data-tab-title="([^"]+)"', text)
        if tab_names:
            print(f"  Tab names found: {tab_names}")

        # Look for AOPS/FMOP/FMOC patterns
        for term in ["AOPS", "POS", "FMOP", "FMOC"]:
            if term in text:
                print(f"  FOUND '{term}' in tabs HTML!")

        # Also try to find table rows
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', text, re.DOTALL | re.IGNORECASE)
        print(f"  Table rows found: {len(rows)}")
else:
    print("No refined-tabs URL found in page body")

print()

# ── Step 4: Also try ui-expand macros ─────────────────────────────────────
expand_urls = [u for name, u in macro_urls.items() if "expand" in name]
if expand_urls:
    print(f"Trying {len(expand_urls)} ui-expand macro(s)...")
    for url in expand_urls[:2]:  # try first 2
        status, text, _ = fetch_refined(url)
        print(f"  [{status}] {len(text):,} chars: {url[:100]}")
        if "AOPS" in text or "FMOP" in text or "FMOC" in text:
            print("  *** CONTAINS AOPS/FMOP/FMOC! ***")
else:
    print("No ui-expand macros found")

print()

# ── Step 5: Try the direct refined-tabs endpoint with a fresh request ───────
# The JWT in the page body may be expired; let's try without it first
print("=" * 70)
print("TRYING REFINED-TABS DIRECT (without JWT)")
print("=" * 70)
# Try the public/lightweight version
base_tabs_url = (
    f"{REFINED}/dynamic-macros/refined-tabs?"
    f"pageId={PAGE_ID}&pageVersion={ver.get('number', 210)}"
    f"&macroId=5fba72c1-3d9c-424f-ad63-ab02a0005c09"
    f"&outputType=display"
)
status, text, headers = fetch_refined(base_tabs_url)
print(f"  Status: {status}")
print(f"  Content-Type: {headers.get('Content-Type', 'unknown')}")
print(f"  Length: {len(text):,}")
if text:
    with open("confluence_export/refined_tabs_direct.html", "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  Saved to confluence_export/refined_tabs_direct.html")

    # Find tab names
    tab_names = re.findall(r'data-tab-title="([^"]+)"', text)
    tab_titles = re.findall(r'class="[^"]*tab[^"]*"[^>]*>([^<]+)<', text, re.IGNORECASE)
    tab_headers = re.findall(r'<h[123][^>]*>([^<]+)</h[123]>', text, re.IGNORECASE)
    print(f"  data-tab-title attrs: {tab_names}")
    print(f"  Tab headers: {tab_headers[:20]}")

    # Find any AOPS/FMOP/FMOC content
    for term in ["AOPS", "POS Templates", "FMOP", "FMOC"]:
        count = text.count(term)
        if count:
            print(f"  '{term}': found {count} times")

    # Extract table data
    tables = re.findall(r'<table[^>]*>(.*?)</table>', text, re.DOTALL | re.IGNORECASE)
    print(f"  Tables: {len(tables)}")
    for i, tbl in enumerate(tables[:3]):
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, re.DOTALL | re.IGNORECASE)
        print(f"    Table {i+1}: {len(rows)} rows")
        for row in rows[:5]:
            cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.DOTALL | re.IGNORECASE)
            cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
            if any(cells):
                print(f"      {' | '.join(cells)}")

print()

# ── Step 6: Try the REST API to get the page with macro body expanded ───────
print("=" * 70)
print("TRYING REST API WITH MACRO_BODY EXPANSION")
print("=" * 70)
# Try different expand options
expand_options = [
    "version,body.storage,metadata.labels,body.view",
    "version,body.storage,metadata.labels,body.storage.raw",
    "version,body.view.raw",
]
for exp in expand_options:
    try:
        r = s.get(f"{API}/content/{PAGE_ID}", params={"expand": exp}, timeout=30)
        body_raw = r.json().get("body", {}).get("view", {}).get("value", "") or \
                   r.json().get("body", {}).get("storage", {}).get("value", "") or \
                   r.json().get("body", {}).get("storage", {}).get("raw", {}).get("value", "")
        print(f"  expand={exp}: {len(body_raw):,} chars")
    except Exception as e:
        print(f"  expand={exp}: error - {e}")
print()

# ── Step 7: Look at child pages directly ───────────────────────────────────
print("=" * 70)
print("FETCHING CHILD PAGES OF Tools & Resources (DSC2S)")
print("=" * 70)
# The ancestorId for search was 1256176381
# Let's find the actual Tools & Resources page
tools_pages = get("/content/search", params={
    "cql": 'title="Tools & Resources (DSC2S)" AND space=GPS',
    "limit": 5, "expand": "version"
})
for p in tools_pages.get("results", []):
    parent_id = p["id"]
    print(f"Found: ID={parent_id} | {p['title']} | v{p.get('version',{}).get('number')}")
    children = get(f"/content/{parent_id}/child/page", params={
        "limit": 20, "expand": "version,body.view,metadata.labels"
    })
    for c in children.get("results", []):
        cver = c.get("version", {})
        cbody = c.get("body", {}).get("view", {}).get("value", "")
        print(f"  - [{cver.get('number')}] {c['title']} | {len(cbody):,} chars view")
        # Check for AOPS/FMOP
        for term in ["AOPS", "FMOP", "FMOC"]:
            if term in cbody:
                print(f"    *** '{term}' FOUND in this page ***")
                # Try to extract some content
                idx = cbody.index(term)
                print(f"    context: ...{cbody[max(0,idx-50):idx+200]}...")

print()
print("=" * 70)
print("ANALYSIS COMPLETE")
print("=" * 70)
