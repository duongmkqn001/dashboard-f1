#!/usr/bin/env python3
"""
Recursive Confluence page analyzer — follows include macros and extracts
all real content from nested pages.
Run: py resolve_and_fetch.py
"""
import re, sys
import requests, hashlib

EMAIL   = "lle31@wayfair.com"
API_KEY = os.environ.get("CONFLUENCE_API_KEY", "YOUR_API_KEY_HERE")
BASE    = "https://wayfaircorp.atlassian.net/wiki"
API     = f"{BASE}/rest/api"

s = requests.Session()
s.auth = (EMAIL, API_KEY)
s.headers.update({"Accept": "application/json", "User-Agent": "dashboard-f1-confluence-resolver/1.0"})

MAX_DEPTH = 5

def get(path, params=None):
    r = s.get(f"{API}{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def extract_included_title(html):
    """Extract the ri:page content-title from an include macro."""
    m = re.search(r'ri:content-title="([^"]+)"', html)
    return m.group(1) if m else None

def get_page_id_by_title(title, space_key="GPS"):
    """Search for a page by title and return its ID."""
    cql = f'title="{title}"'
    result = get("/content/search", params={"cql": cql, "limit": 10})
    for p in result.get("results", []):
        if p.get("space", {}).get("key") == space_key:
            return int(p["id"])
    # fallback: return first match regardless of space
    if result.get("results"):
        return int(result["results"][0]["id"])
    return None

def fetch_page_content(page_id, depth=0):
    """Recursively resolve include macros and return real content."""
    if depth > MAX_DEPTH:
        return {"error": "max depth reached", "id": page_id}

    try:
        data = get(f"/content/{page_id}", params={
            "expand": "version,body.storage,metadata.labels,ancestors"
        })
    except Exception as e:
        return {"error": str(e), "id": page_id}

    title = data.get("title", "")
    body_html = data.get("body", {}).get("storage", {}).get("value", "")
    ver = data.get("version", {})
    ancestors = data.get("ancestors", [])
    space_key = data.get("space", {}).get("key", "UNKNOWN")
    space_name = data.get("space", {}).get("name", "UNKNOWN")

    # Is this an include macro page?
    included_title = extract_included_title(body_html)

    result = {
        "id": page_id,
        "title": title,
        "space_key": space_key,
        "space_name": space_name,
        "version": ver.get("number"),
        "version_by": ver.get("by", {}).get("displayName"),
        "version_when": ver.get("when"),
        "ancestors": [a.get("title") for a in ancestors],
        "body_length": len(body_html),
        "body_hash": hashlib.sha256(body_html.encode()).hexdigest(),
        "is_include_macro": bool(included_title),
        "include_target": included_title,
        "depth": depth,
    }

    if included_title:
        result["include_resolved"] = "pending"
        target_id = get_page_id_by_title(included_title, "GPS")
        if target_id:
            result["include_target_id"] = target_id
            result["include_resolved"] = "found"
            # Recurse
            sub = fetch_page_content(target_id, depth + 1)
            result["resolved_content"] = sub
        else:
            # Try without space filter
            target_id = get_page_id_by_title(included_title)
            if target_id:
                result["include_resolved"] = "found-other-space"
                result["include_target_id"] = target_id
                sub = fetch_page_content(target_id, depth + 1)
                result["resolved_content"] = sub
            else:
                result["include_resolved"] = "NOT FOUND"
    else:
        # Real content
        result["real_body"] = body_html

    return result

def print_tree(data, indent=0):
    prefix = "  " * indent
    i = data
    print(f"{prefix}[depth={i.get('depth')}] {i.get('id')} | {i.get('title')}")
    print(f"{prefix}  space: {i.get('space_key')} | v{i.get('version')} by {i.get('version_by')}")
    print(f"{prefix}  ancestors: {' > '.join(i.get('ancestors') or [])}")
    print(f"{prefix}  body: {i.get('body_length')} chars | hash: {i.get('body_hash')[:16]}...")
    print(f"{prefix}  is_include_macro: {i.get('is_include_macro')}")
    if i.get("include_target"):
        print(f"{prefix}  include_target: {i.get('include_target')}")
        print(f"{prefix}  include_resolved: {i.get('include_resolved')}")
        if i.get("include_target_id"):
            print(f"{prefix}  include_target_id: {i.get('include_target_id')}")
    if i.get("real_body"):
        body = i["real_body"]
        print(f"{prefix}  REAL CONTENT (first 300 chars):")
        for line in body[:300].split("\n"):
            print(f"{prefix}    {line.strip()}")
        if len(body) > 300:
            print(f"{prefix}    ... ({len(body) - 300} more chars)")
    if i.get("resolved_content"):
        print(f"{prefix}  -- RESOLVED SUB-PAGE --")
        print_tree(i["resolved_content"], indent + 1)
    if i.get("error"):
        print(f"{prefix}  ERROR: {i.get('error')}")

# ── Analyze all the Canned Response pages ──────────────────────────────────
pages_to_analyze = [
    (1256148684, "Canned Responses/Templates (DSC2S) - VCN"),  # your URL
    (1256188560, "Canned Responses/Templates - (ISE) - VCN"),
]

# Also search for all Canned Responses in GPS
print("=" * 70)
print("SEARCHING GPS SPACE FOR ALL CANNED RESPONSE PAGES")
print("=" * 70)
all_pages = get("/content/search", params={
    "cql": 'title~"Canned Responses" AND space=GPS',
    "limit": 50,
    "expand": "space,version"
})
print(f"Total found: {all_pages.get('totalSize', len(all_pages.get('results', [])))}")
for p in all_pages.get("results", []):
    space = p.get("space", {})
    ver = p.get("version", {})
    print(f"  ID={p['id']} | {p['title']} | space={space.get('key')} | v{ver.get('number')}")
print()

# Also find the archived pages
print("=" * 70)
print("SEARCHING FOR 'ARCHIVED' CANNED RESPONSE PAGES")
print("=" * 70)
archived = get("/content/search", params={
    "cql": 'title~"ARCHIVED" AND title~"Canned Responses" AND space=GPS',
    "limit": 50,
    "expand": "space,version"
})
for p in archived.get("results", []):
    space = p.get("space", {})
    ver = p.get("version", {})
    print(f"  ID={p['id']} | {p['title']} | space={space.get('key')} | v{ver.get('number')}")
print()

# Also find top-level Canned Responses page
print("=" * 70)
print("SEARCHING FOR ROOT 'Canned Responses/Templates' PAGE")
print("=" * 70)
root = get("/content/search", params={
    "cql": 'title="Canned Responses/Templates" AND space=GPS',
    "limit": 5,
    "expand": "space,version,body.storage,ancestors"
})
for p in root.get("results", []):
    space = p.get("space", {})
    ver = p.get("version", {})
    body = p.get("body", {}).get("storage", {}).get("value", "")
    print(f"  ID={p['id']} | {p['title']} | space={space.get('key')} | v{ver.get('number')}")
    ancestors = p.get("ancestors", [])
    print(f"  ancestors: {' > '.join(a.get('title','') for a in ancestors)}")
    inc = extract_included_title(body)
    if inc:
        print(f"  include_target: {inc}")
print()

# ── Resolve the wrapper page you provided ──────────────────────────────────
print("=" * 70)
print("RESOLVING: 1256148684 (Canned Responses/Templates (DSC2S) - VCN)")
print("=" * 70)
result = fetch_page_content(1256148684)
print_tree(result)
print()

# ── Find all child pages of Tools & Resources (DSC2S) ──────────────────────
print("=" * 70)
print("CHILD PAGES OF 'Tools & Resources (DSC2S) - VCN'")
print("=" * 70)
# Search for the parent first
tr_search = get("/content/search", params={
    "cql": 'title="Tools & Resources (DSC2S)" AND space=GPS',
    "limit": 5,
    "expand": "version"
})
for p in tr_search.get("results", []):
    parent_id = p["id"]
    print(f"Found parent: ID={parent_id} | {p['title']}")
    children = get(f"/content/{parent_id}/child/page", params={"limit": 50, "expand": "version"})
    for c in children.get("results", []):
        cver = c.get("version", {})
        print(f"  - ID={c['id']} | {c['title']} | v{cver.get('number')}")
print()

# ── Also check page 1256185536 (the Order to Delivery Journey page) ─────────
print("=" * 70)
print("COMPARISON: PAGE 1256185536 (Order to Delivery Journey - VCN)")
print("=" * 70)
data_otd = get("/content/1256185536", params={
    "expand": "version,body.storage,metadata.labels,ancestors"
})
body_otd = data_otd.get("body", {}).get("storage", {}).get("value", "")
print(f"  Title     : {data_otd.get('title')}")
print(f"  Version   : v{data_otd.get('version', {}).get('number')}")
print(f"  Body len  : {len(body_otd):,} chars")
print(f"  Ancestors : {' > '.join(a.get('title','') for a in data_otd.get('ancestors', []))}")
print(f"  Labels    : {[l['name'] for l in data_otd.get('metadata',{}).get('labels',{}).get('results',[])]}")
print(f"  Content preview: {body_otd[:500]}")

print()
print("=" * 70)
print("ANALYSIS COMPLETE")
print("=" * 70)
