#!/usr/bin/env python3
"""
Test: fetch the Canned Responses DSC2S canonical page and analyze its
table structure to understand what we can extract.

Specifically, look for the "AOPS / POS Templates" / "FMOP Templates" tabs
and the table with English / Mandarin text.
"""
import sys, json, re
import requests
from html.parser import HTMLParser

EMAIL   = "lle31@wayfair.com"
API_KEY = "ATATT3xFfGF0MylzpU43ITGrELXebo0zEdBvAdsWRWn4_M5ItRNHW_q6voY4YZbzwBURgN1od6o55TlXaCzI5Tf7hrdSkdIfhYCJEwpyN3bZ_aCrTG5caT7CNP4mnPqUpSNcNtcUvZGPzN3_s9sEet_jjxTfVYM-VPm1Gfn3Ob6SEI-G3QmC4AI=53EFE2CE"
BASE    = "https://wayfaircorp.atlassian.net/wiki"
API     = f"{BASE}/rest/api"

s = requests.Session()
s.auth = (EMAIL, API_KEY)
s.headers.update({"Accept": "application/json", "User-Agent": "dashboard-f1-confluence-tables/1.0"})

def get(path, params=None):
    r = s.get(f"{API}{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()

# Canonical DSC2S page (v210, 931KB)
PAGE_ID = 1256153038

print("=" * 70)
print(f"FETCHING CANONICAL PAGE: {PAGE_ID}")
print("=" * 70)
data = get(f"/content/{PAGE_ID}", params={
    "expand": "version,body.view,metadata.labels,ancestors"
})

title = data.get("title", "")
body_view = data.get("body", {}).get("view", {}).get("value", "")
body_storage = data.get("body", {}).get("storage", {}).get("value", "")
ver = data.get("version", {})

print(f"Title: {title}")
print(f"Version: v{ver.get('number')} | Author: {ver.get('by', {}).get('displayName')}")
print(f"Body (view): {len(body_view):,} chars")
print(f"Body (storage): {len(body_storage):,} chars")
print()

# Save raw HTML for offline analysis
import os
os.makedirs("confluence_export", exist_ok=True)
with open("confluence_export/dcs2s_view.html", "w", encoding="utf-8") as f:
    f.write(body_view)
with open("confluence_export/dcs2s_storage.html", "w", encoding="utf-8") as f:
    f.write(body_storage)
print(f"Saved to confluence_export/dcs2s_view.html ({len(body_view):,} chars)")
print(f"Saved to confluence_export/dcs2s_storage.html ({len(body_storage):,} chars)")
print()

# Count tables
view_tables = re.findall(r'<table[^>]*>.*?</table>', body_view, re.DOTALL | re.IGNORECASE)
storage_tables = re.findall(r'<table[^>]*>.*?</table>', body_storage, re.DOTALL | re.IGNORECASE)
print(f"Tables in view format:    {len(view_tables)}")
print(f"Tables in storage format: {len(storage_tables)}")
print()

# Look for tab-like structures in view HTML
print("=" * 70)
print("TAB STRUCTURES (looking for AOPS/POS, FMOP, WCRT)")
print("=" * 70)
# Confluence tabs are typically rendered as <a> tags or custom macro UI in view
# Look for text patterns
for term in ["AOPS", "POS", "FMOP", "WCRT"]:
    occurrences_view = body_view.count(term)
    occurrences_storage = body_storage.count(term)
    print(f"  '{term}': {occurrences_view} in view, {occurrences_storage} in storage")

# Look for category headings like "Problem with an Order (PWAO)"
print()
print("=" * 70)
print("CATEGORY HEADINGS (in view HTML)")
print("=" * 70)
categories = [
    "Problem with an Order (PWAO)",
    "Cancellation Inquiries",
    "PO Reroutes",
    "Update Tracking or Ship Status",
    "Product Out of Stock",
    "Change Ship Method (CS Entered)",
    "Change Ship Method (Sub Entered)",
]
for cat in categories:
    if cat in body_view:
        idx = body_view.index(cat)
        ctx = body_view[max(0, idx-50):idx+200]
        print(f"  FOUND: {cat}")
        # print(f"    context: ...{ctx}...")
print()

# Inspect the first table structure
print("=" * 70)
print("FIRST TABLE STRUCTURE (storage HTML)")
print("=" * 70)
if storage_tables:
    first_table = storage_tables[0]
    print(f"Length: {len(first_table):,} chars")
    print(f"First 3000 chars:")
    print(first_table[:3000])
print()

print("=" * 70)
print("DONE")
print("=" * 70)
