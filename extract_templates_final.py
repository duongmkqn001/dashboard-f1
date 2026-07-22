#!/usr/bin/env python3
"""
Final template extraction — clean noun-phrase filtering.
Real template names: short, noun-phrase style, no periods, no leading verbs.
Noise: instruction sentences, visual refs, dates, multi-clause explanations.
"""
import re, csv, os, json
from collections import Counter

os.makedirs("confluence_export", exist_ok=True)

def c(t): return re.sub(r'\s+', ' ', t).strip()
def is_cjk(t): return bool(re.search(r'[\u4e00-\u9fff]', t))
def clean_html(t): return re.sub(r'<[^>]+>', '', t).strip()

# ── Load SOP data ────────────────────────────────────────────────────────────
with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}

SOP_META = {
    1256144980: {"title": "Cancellation Inquiry SOP (DSC2S) - VCN",        "project": "AOPS/POS Templates", "category": "Cancellation Inquiries"},
    1256144848: {"title": "Cannot Print BOL / Packing Slip SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Cannot Print BOL / Shipping Label"},
    1256187304: {"title": "Change Ship Method on PO - Not Shipped SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Change Ship Method (CS Entered)"},
    1256177851: {"title": "Change Ship Method/Carrier on PO - Item Count/Size SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Change Ship Method (Supplier Entered)"},
    1256143521: {"title": "Escalating for Onshore Support (Tier 0 to Tier 1) SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Escalating for Onshore Support"},
    1256116838: {"title": "Global Transfer Matrix SOP (DSC2S) - VCN",       "project": "AOPS/POS Templates", "category": "Global Transfer Matrix"},
    1256095751: {"title": "Lead Times SOP (DSC2S) - VCN",                  "project": "AOPS/POS Templates", "category": "Lead Times"},
    1256177249: {"title": "Multiple Damages SOP (DSC2S) - VCN",            "project": "AOPS/POS Templates", "category": "Multiple Damages"},
    1256164604: {"title": "NMFC and Freight Code Requests SOP (DSC2S)",   "project": "AOPS/POS Templates", "category": "NMFC and Freight Code Requests"},
    1256143524: {"title": "Need PO to be Resent SOP (DSC2S) - VCN",       "project": "AOPS/POS Templates", "category": "Need PO to be Resent"},
    1256125472: {"title": "Onshore Escalations SOP (DSC2S)",               "project": "FMOP Templates", "category": "Onshore Escalations"},
    1256145383: {"title": "PO Reroutes SOP (DSC2S)",                      "project": "AOPS/POS Templates", "category": "PO Reroutes"},
    1256152114: {"title": "PO Reroutes SOP (DSC2S) - VCN",                "project": "AOPS/POS Templates", "category": "PO Reroutes"},
    1256143020: {"title": "PO has a Wrong Price SOP (DSC2S) - VCN",      "project": "AOPS/POS Templates", "category": "PO Has a Wrong Price"},
    1256152285: {"title": "Problem with an Order (PWAO) SOP (DSC2S)",    "project": "AOPS/POS Templates", "category": "Problem with an Order (PWAO)"},
    1256143448: {"title": "Product Out of Stock SOP (DSC2S) - VCN",       "project": "AOPS/POS Templates", "category": "Product Out of Stock"},
    1256161082: {"title": "Shipping/Carrier Questions SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Shipping/Carrier Questions"},
    1256187459: {"title": "Split PO SOP (DSC2S) - VCN",                   "project": "AOPS/POS Templates", "category": "Split PO"},
    1256149108: {"title": "Tier 1 Ad Hoc Requests SOP (DSC2S)",           "project": "AOPS/POS Templates", "category": "Tier 1 Ad Hoc Requests"},
    1256153189: {"title": "Update Tracking Number/Order Status SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Update Tracking Number/Order Status"},
    1256154202: {"title": "WDN Supplier Outreach SOP (DSC2S) - VCN",      "project": "FMOP Templates", "category": "WDN Supplier Outreach"},
    1256174350: {"title": "WIMS - Large Parcel SOP (DSC2S)",              "project": "AOPS/POS Templates", "category": "WIMS - Large Parcel"},
    1256176186: {"title": "WIMS - Ship Status SOP (DSC2S)",               "project": "AOPS/POS Templates", "category": "WIMS - Ship Status"},
}

# ── Smart filter ──────────────────────────────────────────────────────────────
# Real template names look like: "Cancellation Wizard", "Supplier Cancelled, We Did Not"
# NOT: "Click the dropdown", "December 15, 2025", "Important Guidelines"

LEADING_VERBS = {
    "click", "select", "navigate", "review", "check", "send", "utilize",
    "open", "close", "cancel", "confirm", "submit", "log", "access",
    "run", "step", "note", "tip", "continue", "enter", "fill", "ensure",
    "verify", "proceed", "request", "add", "edit", "update", "create",
    "delete", "remove", "insert", "attach", "download", "upload",
    "go to", "use", "see", "find", "identify", "apply", "wait", "retry",
    "search", "locate", "see", "look", "be sure", "remember", "note that",
    "if ", "for ", "before", "after", "when", "then", "or", "and",
    "this is", "this article", "the following", "contact",
}

# Patterns that are NOT template names
NOISE_PATTERNS = [
    r'\(Visual\s+\d',      # (Visual 1.1)
    r'\(See Visual',       # (See Visual 1.1)
    r'\(Tip\s*\d',         # (Tip 1)
    r'^Visual\s*\d',       # Visual 1:
    r'^Tip\s*\d',          # Tip 1:
    r'^Step\s*\d',         # Step 1
    r'\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}',  # dates
    r'^\d+\.\s+\w',        # "1. Something"
    r'^\d+\s+business',     # "1 business day"
    r'^[A-Z]{3,}\s*$',     # all-caps acronyms
    r'^\([A-Z0-9]{2,}\)',  # (ABC123) style refs
    r'if:\s',              # "IF: ..."
    r'\(IF:',              # (IF: ...)
    r'you must',            # instruction
    r'you can',             # instruction
    r'please',              # instruction
    r'the supplier',        # sentence
    r'you should',          # instruction
    r'follow the',          # instruction
    r'before you',          # instruction
    r'this is a',           # sentence
    r'is a tech',           # sentence
    r'how to',              # heading
    r'what is',             # heading
    r'why do',              # heading
    r'reason for',          # sentence
    r'contact leadership',  # instruction
    r'only relevant',       # sentence
    r'return this',         # instruction
    r'copy the',            # instruction
    r'paste the',           # instruction
    r'edit the',            # instruction
    r'generate the',        # instruction
    r'refresh the',         # instruction
    r'verify the',          # instruction
    r'change the',          # instruction
    r'calculate',           # instruction
    r'input the',           # instruction
    r'move to',             # instruction
    r'flag to',             # instruction
    r'transfer the',        # instruction
    r'send the',            # instruction
    r'run the',             # instruction
    r'complete the',        # instruction
    r'submit the',          # instruction
    r'ensure the',           # instruction
    r'proceed with',        # instruction
    r'delay a',             # instruction
    r'delay multiple',      # instruction
    r'address supplier',    # sentence
    r'content addresses',   # sentence
    r'you can',             # instruction
    r'scenario:',           # label
    r'description:',        # label
    r'^Requirements',       # heading
    r'^Internal',           # heading
    r'^Overview',           # heading
    r'^Introduction',       # heading
    r'^Purpose',            # heading
    r'^Objective',          # heading
    r'^Instruction',        # heading
    r'^Note:',              # note
    r'^Tip:',               # note
    r'^Important',          # heading
    r'^API ',               # heading
    r'^Girth',              # formula
    r'=\s*\d',              # formula
    r'^\w+: ',              # "Title: something"
    r'Filter ',             # action label
    r'Applicable Tab',      # UI label
]

def is_template_name(text):
    """Return True if text looks like a real template name (noun phrase)."""
    if not text or len(text) < 4 or len(text) > 120:
        return False

    # Must start with uppercase (or CJK character)
    if not re.match(r'^[A-Z\u4e00-\u9fff]', text):
        return False

    # No periods in the text (template names don't end with periods)
    if text.endswith('.') or '.\n' in text:
        return False

    # Skip if starts with a verb phrase
    text_lower = text.lower()
    for verb in LEADING_VERBS:
        if text_lower.startswith(verb):
            return False

    # Skip if matches noise patterns
    for pattern in NOISE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return False

    # Skip if it's a long sentence (more than 7 words and contains verbs)
    words = text.split()
    if len(words) > 7:
        # Likely a sentence, not a template name
        return False

    # Skip if it reads like an instruction (starts with verb-like words mid-sentence)
    instruction_starts = ["if ", "then ", "or ", "and ", "but ", "however,", "also,"]
    for inst in instruction_starts:
        if text_lower.startswith(inst):
            return False

    # Skip if contains multiple commas in a list-like pattern
    if text.count(',') > 3:
        return False

    # Skip single words unless they're 10+ chars (like product names)
    if " " not in text and len(text) < 10:
        return False

    return True

# ── Extract from each SOP ───────────────────────────────────────────────────
print("=" * 70)
print("EXTRACTING CLEAN TEMPLATES FROM SOP PAGES")
print("=" * 70)

all_templates = {}  # name -> {sop_id, category, project, ...}

for pid, sop in sorted(sop_data.items()):
    body = sop.get("body", "")
    if not body or sop.get("body_len", 0) < 500:
        continue

    meta = SOP_META.get(pid, {})
    if not meta:
        continue

    project  = meta["project"]
    category = meta["category"]

    # Extract <strong> text from the body
    bold_texts = re.findall(r'<strong[^>]*>([^<]{4,120})</strong>', body, re.DOTALL)
    for raw in bold_texts:
        name = c(raw)
        # Decode HTML entities
        name = name.replace("&amp;", "&").replace("&apos;", "'").replace("&quot;", '"')
        name = name.replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")

        if not is_template_name(name):
            continue

        if name not in all_templates:
            all_templates[name] = {
                "template_name": name,
                "sop_title":    meta.get("title", f"SOP {pid}"),
                "sop_id":       pid,
                "project":      project,
                "category":     category,
                "sop_version":  sop.get("version", ""),
                "sop_author":   sop.get("author", ""),
                "language":     "ZH" if is_cjk(name) else "EN",
            }
        else:
            # Add category if new
            if category not in all_templates[name].get("_cats", []):
                all_templates[name].setdefault("_cats", []).append(category)

    # Also extract from expand macro titles (often template-like names)
    expand_titles = re.findall(
        r'<ac:parameter ac:name="title">([^<]{4,120})</ac:parameter>',
        body
    )
    for raw in expand_titles:
        name = c(raw)
        name = name.replace("&amp;", "&").replace("&apos;", "'").replace("&quot;", '"')
        if not is_template_name(name):
            continue
        if name not in all_templates:
            all_templates[name] = {
                "template_name": name,
                "sop_title":    meta.get("title", f"SOP {pid}"),
                "sop_id":       pid,
                "project":      project,
                "category":     category,
                "sop_version":  sop.get("version", ""),
                "sop_author":   sop.get("author", ""),
                "language":     "ZH" if is_cjk(name) else "EN",
            }

print(f"\nTotal unique template names found: {len(all_templates)}")

# ── Print preview ───────────────────────────────────────────────────────────
cat_groups = {}
for name, r in sorted(all_templates.items()):
    cat = r["category"]
    cat_groups.setdefault(cat, []).append(r)

for cat in sorted(cat_groups):
    items = cat_groups[cat]
    print(f"\n  [{cat}] ({len(items)} templates):")
    for r in items[:12]:
        print(f"    {r['template_name'][:65]}")
    if len(items) > 12:
        print(f"    ... +{len(items)-12} more")

# ── Write final CSV ─────────────────────────────────────────────────────────
CODE_MAP = {
    "Cancellation Inquiries":                   "CAN",
    "Cannot Print BOL / Shipping Label":        "BOL",
    "Change Ship Method (CS Entered)":           "CSC",
    "Change Ship Method (Supplier Entered)":    "CSS",
    "Escalating for Onshore Support":           "ESC",
    "Global Transfer Matrix":                   "GTM",
    "Lead Times":                               "LTM",
    "Multiple Damages":                         "DMG",
    "NMFC and Freight Code Requests":          "NMFC",
    "Need PO to be Resent":                     "NPR",
    "Onshore Escalations":                      "ONS",
    "PO Reroutes":                              "RER",
    "PO Has a Wrong Price":                     "WPR",
    "Problem with an Order (PWAO)":            "PWAO",
    "Product Out of Stock":                     "OOS",
    "Shipping/Carrier Questions":              "SHP",
    "Split PO":                                "SPL",
    "Tier 1 Ad Hoc Requests":                  "T1",
    "Update Tracking Number/Order Status":      "TRK",
    "WDN Supplier Outreach":                   "WDN",
    "WIMS - Large Parcel":                      "WMS-L",
    "WIMS - Ship Status":                       "WMS-S",
    "Other":                                   "OTH",
}

COLUMNS = [
    "Template Code",
    "Project",
    "Category",
    "Template Name",
    "Language",
    "SOP Page Title",
    "SOP Page ID",
    "SOP Version",
    "Author",
    "Confluence Link",
    "Notes",
]

rows = [COLUMNS]

for name, r in sorted(all_templates.items(), key=lambda x: (x[1]["project"], x[1]["category"], x[0])):
    code = CODE_MAP.get(r["category"], "OTH")
    link = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{r['sop_id']}"
    rows.append([
        code,
        r["project"],
        r["category"],
        r["template_name"],
        r["language"],
        r["sop_title"],
        str(r["sop_id"]),
        str(r["sop_version"]),
        r["sop_author"],
        link,
        "",
    ])

output = "confluence_export/template_export_clean.csv"
with open(output, "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(rows)

print(f"\nWritten: {output} ({len(rows)-1} templates)")

# ── Summary ────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("FINAL SUMMARY")
print("=" * 70)
proj_count  = Counter(r[1] for r in rows[1:])
cat_count   = Counter(r[2] for r in rows[1:])
lang_count  = Counter(r[4] for r in rows[1:])
print(f"\nTotal unique templates: {len(rows)-1}")
print(f"\nBy Project:")
for proj, n in proj_count.most_common():
    print(f"  {n:>3}x | {proj}")
print(f"\nBy Category (top 20):")
for cat, n in cat_count.most_common(20):
    print(f"  {n:>3}x | {cat}")
print(f"\nBy Language:")
for lang, n in lang_count.most_common():
    print(f"  {n:>3}x | {lang}")
