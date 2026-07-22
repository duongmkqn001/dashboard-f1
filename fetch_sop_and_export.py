#!/usr/bin/env python3
"""
Fetch each SOP page to extract actual template names.
Then build the final complete CSV.
"""
import re, csv, os, json, time
import requests

EMAIL   = "lle31@wayfair.com"
API_KEY = os.environ.get("CONFLUENCE_API_KEY", "YOUR_API_KEY_HERE")
BASE    = "https://wayfaircorp.atlassian.net/wiki"
API     = f"{BASE}/rest/api"

os.makedirs("confluence_export", exist_ok=True)

s = requests.Session()
s.auth = (EMAIL, API_KEY)
s.headers.update({"Accept": "application/json", "User-Agent": "dashboard-f1-confluence-fetch/1.0"})

def cf_get(path, params=None):
    url = f"{API}{path}"
    r = s.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def clean(text):
    return re.sub(r'\s+', ' ', text).strip()

def is_cjk(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def strip_lang(title):
    return re.sub(r'\s*[\(\[](?:Mandarin|Chinese|ZH|中文|Mandarin Text)[^\]\)]*[\)\]]', '', title).strip()

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Load existing data
# ─────────────────────────────────────────────────────────────────────────────
with open("confluence_export/change_log_view.html", encoding="utf-8") as f:
    cl_view = f.read()
with open("confluence_export/dcs2s_storage_raw.html", encoding="utf-8") as f:
    storage = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Extract page IDs from all sources
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("STEP 1: Building page ID map")
print("=" * 70)

# Strategy: search for each SOP page title to get its ID
sop_titles = [
    "Cancellation Inquiry SOP (DSC2S) - VCN",
    "Cannot Print a BOL / Packing Slip or Shipping Label SOP (DSC2S) - VCN",
    "Change Ship Method on PO - Not Shipped SOP (DSC2S) - VCN",
    "Change Ship Method or Carrier on PO Due to Item Count / Size (Supplier Entered) SOP (DSC2S) - VCN",
    "Escalating for Onshore Support (Tier 0 to Tier 1) SOP (DSC2S) - VCN",
    "Global Transfer Matrix SOP (DSC2S)",
    "Global Transfer Matrix SOP (DSC2S) - VCN",
    "Lead Times SOP (DSC2S) - VCN",
    "Multiple Damages SOP (DSC2S) - VCN",
    "NMFC and Freight Code Requests SOP (DSC2S)",
    "Need PO to be Resent SOP (DSC2S) - VCN",
    "Onshore Escalations SOP (DSC2S)",
    "PO Reroutes SOP (DSC2S)",
    "PO Reroutes SOP (DSC2S) - VCN",
    "PO has a Wrong Price SOP (DSC2S) - VCN",
    "Problem with an Order (PWAO) SOP (DSC2S)",
    "Product Out of Stock SOP (DSC2S) - VCN",
    "Shipping/Carrier Questions SOP (DSC2S) - VCN",
    "Split PO SOP (DSC2S) - VCN",
    "Tier 1 Ad Hoc Requests SOP (DSC2S)",
    "Update Tracking Number/Order Status SOP (DSC2S) - VCN",
    "WDN Supplier Outreach SOP (DSC2S) - VCN",
    "WIMS - Large Parcel SOP (DSC2S)",
    "WIMS - Ship Status SOP (DSC2S)",
    "Best Practices and Ticket Etiquette (DSC2S)",
    "Change Log (DSC2S)",
    "Project List (DSC2S)",
]

# First try to get IDs from the Confluence search API
id_map = {}  # title -> id

print(f"  Searching Confluence for {len(sop_titles)} SOP pages...")

for title in sop_titles:
    try:
        result = cf_get("/content/search", params={
            "cql": f'title="{title}" AND space=GPS',
            "limit": 3,
            "expand": "version,space"
        })
        for p in result.get("results", []):
            if p.get("space", {}).get("key") == "GPS":
                id_map[title] = int(p["id"])
                print(f"  FOUND: {title} -> {p['id']}")
                break
        time.sleep(0.2)  # rate limit
    except Exception as e:
        print(f"  ERROR searching for '{title}': {e}")

print(f"\n  IDs found: {len(id_map)} / {len(sop_titles)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Fetch each SOP page and extract template info
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 2: Fetching SOP pages to extract template names")
print("=" * 70)

sop_data = {}  # page_id -> data

for title, pid in id_map.items():
    print(f"  Fetching: {title[:60]} (ID={pid})")
    try:
        data = cf_get(f"/content/{pid}", params={
            "expand": "version,body.storage.raw,metadata.labels"
        })
        body = ""
        # Navigate the body structure
        body_obj = data.get("body", {})
        for key in ["storage", "view"]:
            obj = body_obj.get(key, {})
            if isinstance(obj, dict):
                body = obj.get("raw", "") or obj.get("value", "")
                if body:
                    break

        if not body:
            # Try storage raw
            raw = body_obj.get("storage", {}).get("raw", {})
            if isinstance(raw, dict):
                body = raw.get("value", "")
            elif isinstance(raw, str):
                body = raw

        ver = data.get("version", {})
        labels = [l["name"] for l in data.get("metadata", {}).get("labels", {}).get("results", [])]

        sop_data[pid] = {
            "title": title,
            "id": pid,
            "version": ver.get("number", 0),
            "when": ver.get("when", ""),
            "author": ver.get("by", {}).get("displayName", ""),
            "body": body,
            "body_len": len(body),
            "labels": labels,
        }
        print(f"    v{ver.get('number', 0)} | body={len(body):,} chars | {ver.get('by', {}).get('displayName', '')}")
        time.sleep(0.3)
    except Exception as e:
        print(f"    ERROR: {e}")

print(f"\n  Fetched: {len(sop_data)} / {len(id_map)} pages")

# Save SOP data
with open("confluence_export/sop_pages_data.json", "w", encoding="utf-8") as f:
    json.dump({str(k): v for k, v in sop_data.items()}, f, ensure_ascii=False, indent=2)
print("  Saved: confluence_export/sop_pages_data.json")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Extract template names from each SOP page body
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 3: Extracting template names from SOP pages")
print("=" * 70)

all_templates = []

for pid, sop in sop_data.items():
    body = sop["body"]
    if not body:
        continue

    title = sop["title"]

    # Extract all ri:page links (these are the actual templates)
    ri_pages = re.findall(
        r'<ri:page\b[^>]*ri:content-title="([^"]+)"[^>]*/>',
        body
    )
    ri_ver_re = re.compile(r'<ri:page\b([^>]+)/>', re.DOTALL)
    all_ri_raw = ri_ver_re.findall(body)

    ri_map = {}
    for raw in all_ri_raw:
        t_m = re.search(r'ri:content-title="([^"]+)"', raw)
        v_m = re.search(r'ri:version-at-save="(\d+)"', raw)
        if t_m:
            t = t_m.group(1)
            v = int(v_m.group(1)) if v_m else 0
            if t not in ri_map or v > ri_map[t]:
                ri_map[t] = v

    # Also extract text-based template names from the body
    # Look for patterns like "Template Name: ..." or headers
    template_names = set()
    for t in ri_map:
        if t != title:  # don't include self-reference
            template_names.add(t)

    print(f"\n  {title[:60]} ({len(template_names)} templates):")
    for t in sorted(template_names):
        print(f"    - {t[:70]}")

    # Categorize based on parent SOP
    if "WCRT" in title or "Wrong Catalog" in title:
        cat = "WCRT - Wrong Catalog Received"
    elif "Cancellation" in title:
        cat = "Cancellation Inquiries"
    elif "BOL" in title or "Packing Slip" in title or "Shipping Label" in title:
        cat = "Cannot Print BOL / Packing Slip / Shipping Label"
    elif "PWAO" in title or "Problem with an Order" in title:
        cat = "Problem with an Order (PWAO)"
    elif "PO Reroute" in title or "Reroutes" in title:
        cat = "PO Reroutes"
    elif "Update Tracking" in title or "Tracking Number" in title:
        cat = "Update Tracking Number/Order Status"
    elif "Out of Stock" in title:
        cat = "Product Out of Stock"
    elif "Change Ship on PO" in title or "Change Ship Method" in title:
        if "Item Count" in title or "Size" in title or "Supplier Entered" in title:
            cat = "Change Ship Method (Supplier Entered)"
        else:
            cat = "Change Ship Method (CS Entered)"
    elif "Shipping/Carrier" in title or "Carrier Questions" in title:
        cat = "Shipping/Carrier Questions"
    elif "Split PO" in title:
        cat = "Split PO"
    elif "Wrong Price" in title:
        cat = "PO Has a Wrong Price"
    elif "Global Transfer" in title:
        cat = "Global Transfer Matrix"
    elif "Lead Time" in title:
        cat = "Lead Times"
    elif "WDN" in title:
        cat = "WDN Supplier Outreach"
    elif "Escalat" in title or "Onshore" in title:
        cat = "Escalating for Onshore Support"
    elif "WIMS" in title:
        cat = "WIMS"
    elif "NMFC" in title or "Freight" in title:
        cat = "NMFC and Freight Code Requests"
    elif "Tier 1" in title or "Ad Hoc" in title:
        cat = "Tier 1 Ad Hoc Requests"
    elif "Need PO" in title:
        cat = "Need PO to be Resent"
    else:
        cat = "Other"

    # Determine project
    if any(k in title for k in ["Supplier", "Email", "Onshore Escalation"]):
        project = "FMOP Templates"
    else:
        project = "AOPS/POS Templates"

    for tpl_name in sorted(template_names):
        all_templates.append({
            "sop_title": title,
            "sop_id": pid,
            "sop_version": sop["version"],
            "sop_author": sop["author"],
            "sop_when": sop["when"],
            "template_name": tpl_name,
            "template_version": ri_map.get(tpl_name, 0),
            "project": project,
            "category": cat,
            "is_zh": is_cjk(tpl_name),
            "is_en": not is_cjk(tpl_name),
        })

print(f"\n  Total template entries extracted: {len(all_templates)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Build page ID map for templates
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 4: Resolving template page IDs")
print("=" * 70)

# For each unique template name, find its page ID
unique_template_names = list({t["template_name"] for t in all_templates})
template_id_map = {}

for tpl_name in unique_template_names:
    if tpl_name in template_id_map:
        continue
    try:
        result = cf_get("/content/search", params={
            "cql": f'title="{tpl_name}" AND space=GPS',
            "limit": 3,
            "expand": "version,space"
        })
        for p in result.get("results", []):
            if p.get("space", {}).get("key") == "GPS":
                template_id_map[tpl_name] = int(p["id"])
                break
        time.sleep(0.15)
    except Exception as e:
        pass

# Assign IDs to template entries
for t in all_templates:
    t["template_id"] = template_id_map.get(t["template_name"], "")

print(f"  Resolved IDs for {len(template_id_map)} / {len(unique_template_names)} templates")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Group EN/ZH pairs
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 5: Grouping EN/ZH pairs")
print("=" * 70)

grouped = {}
for t in all_templates:
    base = strip_lang(t["template_name"])
    if base not in grouped:
        grouped[base] = {"en": [], "zh": []}
    if t["is_zh"]:
        grouped[base]["zh"].append(t)
    else:
        grouped[base]["en"].append(t)

# Deduplicate within each group (take highest version)
def best(entries):
    if not entries:
        return None
    return max(entries, key=lambda x: x["template_version"])

en_pairs = {k: v for k, v in grouped.items() if best(v["en"]) and best(v["zh"])}
en_only  = {k: v for k, v in grouped.items() if best(v["en"]) and not best(v["zh"])}
zh_only  = {k: v for k, v in grouped.items() if not best(v["en"]) and best(v["zh"])}

print(f"  EN+ZH pairs: {len(en_pairs)}")
print(f"  EN only:    {len(en_only)}")
print(f"  ZH only:    {len(zh_only)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Write final CSV
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 6: Writing final CSV")
print("=" * 70)

COLUMNS = [
    "Project",
    "Category",
    "Template Name (EN)",
    "Template Name (ZH)",
    "Template ID (EN)",
    "Template ID (ZH)",
    "Version (EN)",
    "Version (ZH)",
    "SOP Page Title",
    "SOP Page ID",
    "SOP Version",
    "SOP Author",
    "Last Updated (EN)",
    "Last Updated (ZH)",
    "Template Code",
    "Has EN",
    "Has ZH",
    "Is Pair",
    "Confluence Link (EN)",
    "Confluence Link (ZH)",
    "Notes",
]

rows = [COLUMNS]

def write_row(base, g):
    en = best(g["en"])
    zh = best(g["zh"])
    name_en = en["template_name"] if en else ""
    name_zh = zh["template_name"] if zh else ""
    pid_en  = en["template_id"] if en else ""
    pid_zh  = zh["template_id"] if zh else ""
    ver_en  = en["template_version"] if en else ""
    ver_zh  = zh["template_version"] if zh else ""
    entry = en or zh or {}
    project = entry.get("project", "")
    category = entry.get("category", "")
    link_en = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{pid_en}" if pid_en else ""
    link_zh = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{pid_zh}" if pid_zh else ""

    code_map = {
        "WCRT": "WCRT", "Cancellation": "CAN", "Problem with an Order": "PWAO",
        "PO Reroute": "RER", "Update Tracking": "TRK", "Product Out of Stock": "OOS",
        "Change Ship Method (CS": "CSC", "Change Ship Method (S": "CSS",
        "Cannot Print BOL": "BOL", "Shipping/Carrier": "SHP", "Split PO": "SPL",
        "PO Has a Wrong Price": "WPR", "Global Transfer": "GTM", "Lead Times": "LTM",
        "WDN Supplier": "WDN", "Escalat": "ESC", "WIMS": "WMS", "NMFC": "NMFC",
        "Tier 1": "T1", "Tier 2": "T2", "Tier 3": "T3", "Onshore": "ONS",
        "Multiple Damages": "DMG", "Need PO": "NPR", "Supplier": "SUP", "Email": "SEM",
        "FTL": "FTL", "Carrier": "CAR", "Education": "EDU", "Internal": "INT",
        "Customer": "CUS", "UK/IE": "UKI",
    }
    tpl_code = ""
    for kw, code in code_map.items():
        if kw in category:
            tpl_code = code
            break

    rows.append([
        project,
        category,
        name_en,
        name_zh,
        str(pid_en) if pid_en else "",
        str(pid_zh) if pid_zh else "",
        str(ver_en) if ver_en else "",
        str(ver_zh) if ver_zh else "",
        entry.get("sop_title", ""),
        str(entry.get("sop_id", "")),
        str(entry.get("sop_version", "")),
        entry.get("sop_author", ""),
        "",  # Last Updated EN
        "",  # Last Updated ZH
        tpl_code,
        "Yes" if en else "No",
        "Yes" if zh else "No",
        "Yes" if (en and zh) else "No",
        link_en,
        link_zh,
        "",
    ])

# Sort all bases alphabetically
all_bases = sorted(en_pairs.keys()) + sorted(en_only.keys()) + sorted(zh_only.keys())
for base in all_bases:
    if base in en_pairs:
        write_row(base, en_pairs[base])
    elif base in en_only:
        write_row(base, en_only[base])
    elif base in zh_only:
        write_row(base, zh_only[base])

output_path = "confluence_export/template_export_final.csv"
with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f"  Written: {output_path}")
print(f"  Total rows: {len(rows)}")

# Summary
print()
print("=" * 70)
print("CSV GENERATION COMPLETE")
print("=" * 70)
print(f"  File: {output_path}")
print(f"  Total templates: {len(rows)-1}")
print(f"  EN+ZH pairs:    {len(en_pairs)}")
print(f"  EN only:        {len(en_only)}")
print(f"  ZH only:        {len(zh_only)}")

# Print preview
print()
print("Preview (first 20 rows):")
for row in rows[:21]:
    cat = row[1][:35] if row[1] else ""
    name = row[2][:40] if row[2] else "(ZH only)"
    pair = row[16]
    print(f"  [{pair}] {row[0][:10]:<10} | {cat:<35} | {name:<40}")
