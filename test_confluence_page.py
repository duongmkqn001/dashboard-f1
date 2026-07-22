#!/usr/bin/env python3
"""
Quick test: fetch a specific Confluence page and print its full structure.
Run: python test_confluence_page.py
"""
import base64
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from urllib.parse import quote

import requests

# ── Credentials from CONFLUENCE_API_DOCUMENTATION.md ──────────────────────
EMAIL    = "lle31@wayfair.com"
API_KEY  = "ATATT3xFfGF0MylzpU43ITGrELXebo0zEdBvAdsWRWn4_M5ItRNHW_q6voY4YZbzwBURgN1od6o55TlXaCzI5Tf7hrdSkdIfhYCJEwpyN3bZ_aCrTG5caT7CNP4mnPqUpSNcNtcUvZGPzN3_s9sEet_jjxTfVYM-VPm1Gfn3Ob6SEI-G3QmC4AI=53EFE2CE"
BASE_URL = "https://wayfaircorp.atlassian.net"
WRAPPER_PAGE_ID = 1256148684   # the URL you gave — likely a wrapper
PAGE_ID  = WRAPPER_PAGE_ID     # will be overridden if include macro resolves
# ──────────────────────────────────────────────────────────────────────────

session = requests.Session()
session.auth = (EMAIL, API_KEY)
session.headers.update({
    "Accept":       "application/json",
    "Content-Type": "application/json",
    "User-Agent":   "dashboard-f1-confluence-test/1.0",
})

API_ROOT = f"{BASE_URL}/wiki/rest/api"

def cf_get(path, params=None):
    url = f"{API_ROOT}{path}"
    resp = session.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

def cf_get_raw(path, params=None):
    url = f"{BASE_URL}{path}"
    resp = session.get(url, params=params, timeout=30)
    return resp

# ── 0. Resolve included page ────────────────────────────────────────────────
print("=" * 70)
print("0. RESOLVING INCLUDED PAGE (this page uses {{include}} macro)")
print("=" * 70)
# The include macro embeds: ri:page ri:content-title="Canned Responses/Templates (DSC2S)"
included_title = "Canned Responses/Templates (DSC2S)"
print(f"  Included page title: {included_title}")
# Search for this page
search = cf_get("/content/search", params={
    "cql": f'title="{included_title}" AND space=GPS',
    "limit": 5,
})
print(f"  Search results: {len(search.get('results', []))}")
target_id = None
for r in search.get('results', []):
    print(f"  - ID={r.get('id')} | {r.get('title')} | space={r.get('space', {}).get('key')}")
    if r.get('space', {}).get('key') == 'GPS' and not target_id:
        target_id = r['id']

if not target_id:
    # Fallback: try broad search
    print("  Trying broad search...")
    broad = cf_get("/content/search", params={
        "cql": f'title~"Canned Responses" AND space=GPS',
        "limit": 10,
    })
    for r in broad.get('results', []):
        print(f"  - ID={r.get('id')} | {r.get('title')} | space={r.get('space', {}).get('key')}")
    if broad.get('results'):
        target_id = broad['results'][0]['id']

if target_id:
    PAGE_ID = int(target_id)
    print(f"  => Using RESOLVED page ID: {PAGE_ID}")
else:
    print(f"  => WARNING: Could not resolve. Analyzing wrapper page ID: {PAGE_ID}")
print()

# ── 1. Auth check ──────────────────────────────────────────────────────────
print("=" * 70)
print("1. AUTH CHECK")
print("=" * 70)
user = cf_get("/user/current")
print(f"  Display name : {user.get('displayName')}")
print(f"  Account ID   : {user.get('accountId')}")
print(f"  Email        : {user.get('email')}")
print()

# ── 2. Page metadata (lightweight) ─────────────────────────────────────────
print("=" * 70)
print("2. PAGE METADATA (lightweight)")
print("=" * 70)
meta = cf_get(f"/content/{PAGE_ID}", params={"expand": "version,metadata.labels,history.createdBy,ancestors"})
print(f"  Page ID      : {meta.get('id')}")
print(f"  Title        : {meta.get('title')}")
print(f"  Type         : {meta.get('type')}")
print(f"  Space key    : {meta.get('space', {}).get('key')}")
print(f"  Space name   : {meta.get('space', {}).get('name')}")
ver = meta.get("version", {})
print(f"  Version      : v{ver.get('number')} (by {ver.get('by', {}).get('displayName')})")
print(f"  Last edited  : {ver.get('when')}")
labels = [l["name"] for l in meta.get("metadata", {}).get("labels", {}).get("results", [])]
print(f"  Labels       : {labels if labels else '(none)'}")
ancestors = meta.get("ancestors", [])
print(f"  Ancestors    : {' > '.join(a.get('title', '') or '' for a in ancestors) or '(top-level)'}")
print(f"  Page URL     : {BASE_URL}/wiki/spaces/GPS/pages/{PAGE_ID}")
print()

# ── 3. Page content (full body) ────────────────────────────────────────────
print("=" * 70)
print("3. PAGE CONTENT (storage body)")
print("=" * 70)
full = cf_get(f"/content/{PAGE_ID}", params={
    "expand": "version,body.storage,metadata.labels,history,ancestors"
})
body_html = full.get("body", {}).get("storage", {}).get("value", "")
body_len  = len(body_html)
print(f"  Body length  : {body_len:,} characters")
print(f"  Body hash   (SHA-256): {hashlib.sha256(body_html.encode('utf-8')).hexdigest()}")
print()

# ── 4. Export options ──────────────────────────────────────────────────────
print("=" * 70)
print("4. AVAILABLE EXPORT FORMATS")
print("=" * 70)

export_formats = {
    "export/html":  f"{BASE_URL}/wiki/export/html/{PAGE_ID}",
    "export/view":  f"{BASE_URL}/wiki/export/view/{PAGE_ID}",
    "export/raw":  f"{BASE_URL}/wiki/spaces/GPS/pages/{PAGE_ID}/exportword?format=raw",
}
for name, url in export_formats.items():
    print(f"  {name:<20}: {url}")

# Try PDF export
try:
    pdf_resp = session.head(f"{BASE_URL}/wiki/spaces/GPS/pages/{PAGE_ID}/exportpdf")
    print(f"  export/pdf         : {pdf_resp.status_code} (URL available if 200)")
except Exception as e:
    print(f"  export/pdf         : not accessible ({e})")
print()

# ── 5. Tables in body ───────────────────────────────────────────────────────
print("=" * 70)
print("5. TABLE ANALYSIS")
print("=" * 70)
tables = re.findall(r'<table[^>]*>(.*?)</table>', body_html, re.DOTALL | re.IGNORECASE)
print(f"  Table count   : {len(tables)}")
for i, tbl in enumerate(tables, 1):
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, re.DOTALL | re.IGNORECASE)
    cols = []
    for row in rows[:1]:
        cols = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.DOTALL | re.IGNORECASE)
        cols = [re.sub(r'<[^>]+>', '', c).strip() for c in cols]
    print(f"  Table {i}       : {len(rows)} rows × {len(cols)} cols")
    if cols:
        print(f"    Headers   : {cols}")
print()

# ── 6. Headings structure ─────────────────────────────────────────────────
print("=" * 70)
print("6. HEADING STRUCTURE")
print("=" * 70)
headings = re.findall(r'<h([1-6])[^>]*>(.*?)</h\1>', body_html, re.DOTALL | re.IGNORECASE)
if headings:
    for level, text in headings:
        indent = "  " * (int(level) - 1)
        clean  = re.sub(r'<[^>]+>', '', text).strip()
        print(f"  H{level} {indent}{clean}")
else:
    print("  (no headings found)")
print()

# ── 7. Links in body ──────────────────────────────────────────────────────
print("=" * 70)
print("7. INTERNAL LINKS (to other Confluence pages)")
print("=" * 70)
links = re.findall(r'href="([^"]*wayfaircorp\.atlassian\.net[^"]*)"', body_html)
unique_links = sorted(set(links))
if unique_links:
    for link in unique_links:
        print(f"  {link}")
else:
    print("  (no internal links found)")
print()

# ── 8. Attachments ─────────────────────────────────────────────────────────
print("=" * 70)
print("8. ATTACHMENTS")
print("=" * 70)
attachments = cf_get(f"/content/{PAGE_ID}/child/attachment", params={"limit": 50})
att_results = attachments.get("results", [])
print(f"  Attachment count: {len(att_results)}")
for att in att_results:
    print(f"  - {att.get('title')} ({att.get('fileSize', '?')} bytes)")
    print(f"    mediaType : {att.get('mediaType')}")
    links = att.get('_links', {})
    print(f"    download  : {BASE_URL}{links.get('download', '')}")
print()

# ── 9. Child pages ─────────────────────────────────────────────────────────
print("=" * 70)
print("9. CHILD PAGES")
print("=" * 70)
children = cf_get(f"/content/{PAGE_ID}/child/page", params={"limit": 50})
child_results = children.get("results", [])
print(f"  Child page count: {len(child_results)}")
for child in child_results:
    cver = child.get("version", {})
    print(f"  - {child.get('title')} (ID: {child.get('id')}, v{cver.get('number')})")
print()

# ── 10. Comments ───────────────────────────────────────────────────────────
print("=" * 70)
print("10. RECENT COMMENTS")
print("=" * 70)
comments = cf_get(f"/content/{PAGE_ID}/child/comment", params={"limit": 5, "expand": "version"})
comm_results = comments.get("results", [])
print(f"  Comment count: {len(comm_results)} (showing first 5)")
for c in comm_results:
    cver = c.get("version", {})
    body_short = re.sub(r'<[^>]+>', '', c.get("body", {}).get("storage", {}).get("value", ""))[:120]
    print(f"  - by {cver.get('by', {}).get('displayName', '?')} at {cver.get('when', '?')}")
    print(f"    {body_short}")
print()

# ── 11. Version history ────────────────────────────────────────────────────
print("=" * 70)
print("11. VERSION HISTORY (last 5)")
print("=" * 70)
history = cf_get(f"/content/{PAGE_ID}/history", params={"expand": "history"})
versions = history.get("history", {}).get("allVersions", {}).get("results", [])
print(f"  Total versions: {len(versions)}")
for v in versions[:5]:
    print(f"  v{v.get('number')} by {v.get('by', {}).get('displayName')} at {v.get('when')}")
print()

# ── 12. Labels detail ────────────────────────────────────────────────────
print("=" * 70)
print("12. LABELS (full)")
print("=" * 70)
labels_data = cf_get(f"/content/{PAGE_ID}/label")
for lbl in labels_data or []:
    if isinstance(lbl, dict):
        print(f"  - {lbl.get('name')} (prefix: {lbl.get('prefix')})")
    else:
        print(f"  - {lbl}")
print()

# ── 13. Permissions / restrictions ───────────────────────────────────────
print("=" * 70)
print("13. PAGE RESTRICTIONS")
print("=" * 70)
restrictions = cf_get(f"/content/{PAGE_ID}/restriction")
read_r = restrictions.get("read", {})
update_r = restrictions.get("update", {})
print(f"  Read restrictions   : {read_r}")
print(f"  Update restrictions : {update_r}")
print()

# ── 14. Properties (user-defined) ─────────────────────────────────────────
print("=" * 70)
print("14. USER-DEFINED PROPERTIES")
print("=" * 70)
props = cf_get(f"/content/{PAGE_ID}/property", params={"limit": 50})
for p in props.get("results", []):
    print(f"  - {p.get('key')} = {str(p.get('value'))[:80]}")
if not props.get("results"):
    print("  (none)")
print()

# ── 15. Content preview ────────────────────────────────────────────────────
print("=" * 70)
print("15. CONTENT PREVIEW (first 2000 chars of HTML)")
print("=" * 70)
try:
    print(body_html[:2000])
    if len(body_html) > 2000:
        print("...")
except UnicodeEncodeError:
    # Fallback: write to file
    import sys
    print(f"  [Body written to stdout — UTF-8 issue. Length: {len(body_html):,} chars]")
    print()
print()

print("=" * 70)
print("DONE — all API calls successful")
print("=" * 70)
