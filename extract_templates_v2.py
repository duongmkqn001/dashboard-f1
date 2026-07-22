#!/usr/bin/env python3
"""
Correct template extraction from SOP pages.
Each SOP page has tables: # | Steps | Actions | Visuals
The Actions column contains template names as:
  - Bold phrases: <strong>Template Name Template</strong>
  - Expand macros: <ac:parameter ac:name="title">Expand Title</ac:parameter>
  - Template references: "Send Template" followed by template name
  - "Utilize Template" followed by template name
"""
import re, csv, os, json
from html.parser import HTMLParser

os.makedirs("confluence_export", exist_ok=True)

def c(t): return re.sub(r'\s+', ' ', t).strip()
def is_cjk(t): return bool(re.search(r'[\u4e00-\u9fff]', t))

# ── HTML parser to extract cell content ───────────────────────────────────────
class CellParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_cell = False
        self.current_cell = ""
        self.cells = []
        self.in_row = False
        self.skip_tags = {"script", "style", "noscript"}
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.skip_tags:
            self.skip_depth += 1
            return
        if tag in ("td", "th"):
            self.in_cell = True
            self.current_cell = ""

    def handle_endtag(self, tag):
        if tag in self.skip_tags:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if tag in ("td", "th") and self.in_cell:
            self.in_cell = False
            self.cells.append(self.current_cell.strip())

    def handle_data(self, data):
        if self.in_cell and self.skip_depth == 0:
            self.current_cell += data + " "

    def parse_row(self, html_row):
        self.cells = []
        self.skip_depth = 0
        self.feed(html_row)
        return self.cells

# ── Load SOP data ────────────────────────────────────────────────────────────
with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}

SOP_META = {
    "title": "SOP Page Title",
    1256144980: {"title": "Cancellation Inquiry SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Cancellation Inquiries"},
    1256144848: {"title": "Cannot Print a BOL / Packing Slip or Shipping Label SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Cannot Print BOL / Shipping Label"},
    1256187304: {"title": "Change Ship Method on PO - Not Shipped SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Change Ship Method (CS Entered)"},
    1256177851: {"title": "Change Ship Method or Carrier on PO Due to Item Count / Size (Supplier Entered) SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Change Ship Method (Supplier Entered)"},
    1256143521: {"title": "Escalating for Onshore Support (Tier 0 to Tier 1) SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Escalating for Onshore Support"},
    1256175181: {"title": "Global Transfer Matrix SOP (DSC2S)", "project": "AOPS/POS Templates", "category": "Global Transfer Matrix"},
    1256116838: {"title": "Global Transfer Matrix SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Global Transfer Matrix"},
    1256095751: {"title": "Lead Times SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Lead Times"},
    1256177249: {"title": "Multiple Damages SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Multiple Damages"},
    1256164604: {"title": "NMFC and Freight Code Requests SOP (DSC2S)", "project": "AOPS/POS Templates", "category": "NMFC and Freight Code Requests"},
    1256143524: {"title": "Need PO to be Resent SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Need PO to be Resent"},
    1256125472: {"title": "Onshore Escalations SOP (DSC2S)", "project": "FMOP Templates", "category": "Onshore Escalations"},
    1256145383: {"title": "PO Reroutes SOP (DSC2S)", "project": "AOPS/POS Templates", "category": "PO Reroutes"},
    1256152114: {"title": "PO Reroutes SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "PO Reroutes"},
    1256143020: {"title": "PO has a Wrong Price SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "PO Has a Wrong Price"},
    1256152285: {"title": "Problem with an Order (PWAO) SOP (DSC2S)", "project": "AOPS/POS Templates", "category": "Problem with an Order (PWAO)"},
    1256143448: {"title": "Product Out of Stock SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Product Out of Stock"},
    1256161082: {"title": "Shipping/Carrier Questions SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Shipping/Carrier Questions"},
    1256187459: {"title": "Split PO SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Split PO"},
    1256149108: {"title": "Tier 1 Ad Hoc Requests SOP (DSC2S)", "project": "AOPS/POS Templates", "category": "Tier 1 Ad Hoc Requests"},
    1256153189: {"title": "Update Tracking Number/Order Status SOP (DSC2S) - VCN", "project": "AOPS/POS Templates", "category": "Update Tracking Number/Order Status"},
    1256154202: {"title": "WDN Supplier Outreach SOP (DSC2S) - VCN", "project": "FMOP Templates", "category": "WDN Supplier Outreach"},
    1256174350: {"title": "WIMS - Large Parcel SOP (DSC2S)", "project": "AOPS/POS Templates", "category": "WIMS - Large Parcel"},
    1256176186: {"title": "WIMS - Ship Status SOP (DSC2S)", "project": "AOPS/POS Templates", "category": "WIMS - Ship Status"},
}

# ── Template extraction ────────────────────────────────────────────────────────
SKIP_ACTION_WORDS = {
    "click the", "select the", "navigate to", "go to the", "template dropdown",
    "pop up menu", "scroll down", "scroll to", "select template", "send template",
    "utilize template", "insert template", "complete template", "add escalation",
    "navigate to the templates", "template pop up menu", "step ", "note:",
    "tip:", "overview", "introduction", "instruction", "review the ticket",
    "review the order", "check the", "verify the", "confirm the", "check for",
    "send an", "submit", "open the", "close the", "cancel the",
    "review ticket", "run the", "log into", "login to", "access the",
    "utilize the", "select template", "click templates",
}

def extract_templates_from_sop(body, pid):
    """Extract template names from a SOP page body."""
    if not body:
        return []

    templates = []
    seen = set()

    # Strategy 1: Find <strong>bold text</strong> in Actions cells
    # These are often template names
    bold_texts = re.findall(r'<strong[^>]*>([^<]{4,100})</strong>', body, re.DOTALL)
    for text in bold_texts:
        text = c(text)
        # Skip obvious non-template text
        if any(text.lower().startswith(sw) for sw in ["click", "select", "check", "review",
              "send", "open", "close", "cancel", "confirm", "utilize",
              "step ", "run", "access", "navigate", "log in", "submit",
              "insert", "add", "update", "process", "option", "choose"]):
            continue
        if len(text) > 5 and text not in seen:
            # Check it doesn't contain "template dropdown" etc.
            if not any(sw in text.lower() for sw in SKIP_ACTION_WORDS):
                seen.add(text)
                templates.append({"name": text, "source": "bold", "type": "template"})

    # Strategy 2: Find expand macro titles (these are often template/section names)
    expand_titles = re.findall(
        r'<ac:parameter ac:name="title">([^<]{3,100})</ac:parameter>',
        body
    )
    for title in expand_titles:
        title = c(title)
        if len(title) > 3 and title not in seen and not title.lower().startswith(
            ("click", "select", "step", "navigate", "review", "check", "utilize",
             "send", "open", "full ", "for ")):
            seen.add(title)
            templates.append({"name": title, "source": "expand_macro", "type": "expand_section"})

    # Strategy 3: Find table-filter or datatable content (Confluence apps)
    datatable_content = re.findall(
        r'data-cell-value="([^"]{4,100})"',
        body
    )
    for val in datatable_content:
        val = c(val)
        if len(val) > 5 and val not in seen and not any(
            sw in val.lower() for sw in ["step", "action", "visual", "note", "example"]):
            seen.add(val)
            templates.append({"name": val, "source": "datatable", "type": "datatable_value"})

    # Strategy 4: Find <p> text that looks like template names
    # Template names in Confluence often: start with uppercase, 5-80 chars, no verb prefix
    all_p_texts = re.findall(r'<p[^>]*>([^<]{5,120})</p>', body, re.DOTALL)
    for text in all_p_texts:
        text = c(text)
        # Must start with uppercase letter
        if not re.match(r'^[A-Z]', text):
            continue
        # Skip if starts with common verb/action words
        if any(text.lower().startswith(w) for w in [
            "click", "select", "navigate", "review", "check", "send",
            "utilize", "open", "close", "cancel", "confirm", "submit",
            "log", "access", "run", "step", "note:", "tip:", "overview",
            "introduction", "instruction", "process", "option", "continue",
            "use", "enter", "go to", "ensure", "verify", "add new",
            "update", "attach", "download", "upload", "fill in",
            "proceed", "request", "response", "reason", "purpose",
            "description", "scenario", "context"]):
            continue
        # Must not be a URL or email
        if text.startswith("http") or "@" in text:
            continue
        # Check it's not all caps (acronym)
        if text.isupper() and len(text) < 10:
            continue
        if text not in seen and len(text) > 5:
            seen.add(text)
            templates.append({"name": text, "source": "paragraph", "type": "text_paragraph"})

    return templates

# ── Process each SOP page ───────────────────────────────────────────────────
print("=" * 70)
print("EXTRACTING TEMPLATES FROM ALL SOP PAGES")
print("=" * 70)

all_results = []
sop_parser = CellParser()

for pid, sop in sorted(sop_data.items()):
    body = sop.get("body", "")
    if not body or sop.get("body_len", 0) < 500:
        continue

    meta = SOP_META.get(pid, {})
    sop_title = meta.get("title", sop.get("title", f"Unknown SOP {pid}"))
    project = meta.get("project", "AOPS/POS Templates")
    category = meta.get("category", "Other")
    sop_version = sop.get("version", 0)
    sop_author = sop.get("author", "")

    # Extract templates from body
    templates = extract_templates_from_sop(body, pid)

    if templates:
        print(f"\n  [{sop_title[:50]}]: {len(templates)} templates")
        for t in templates[:5]:
            print(f"    [{t['source']:15}] {t['name'][:60]}")
        if len(templates) > 5:
            print(f"    ... +{len(templates)-5} more")

    for t in templates:
        all_results.append({
            "sop_title": sop_title,
            "sop_id": pid,
            "sop_version": sop_version,
            "sop_author": sop_author,
            "project": project,
            "category": category,
            "template_name": t["name"],
            "template_source": t["source"],
        })

print(f"\nTotal template extractions: {len(all_results)}")

# ── Deduplicate and filter ─────────────────────────────────────────────────
print()
print("Deduplicating and filtering...")

seen_names = {}
for r in all_results:
    name = r["template_name"]
    if name not in seen_names:
        seen_names[name] = r

# Filter aggressively
QUALITY_TEMPLATES = []
SKIP_PREFIXES = (
    "Click the", "Select the", "Navigate to", "Go to the", "Template Dropdown",
    "Pop Up Menu", "Scroll Down", "Scroll to", "Select Template", "Send Template",
    "Utilize Template", "Insert Template", "Complete Template", "Add Escalation",
    "Template Pop Up Menu", "Step ", "Note:", "Tip:", "Overview",
    "Introduction", "Instruction", "Review the Ticket", "Review the Order",
    "Check the", "Verify the", "Confirm the", "Check for", "Send an",
    "Submit", "Open the", "Close the", "Cancel the", "Review Ticket",
    "Run the", "Log into", "Login to", "Access the", "Utilize the",
    "Select Template", "Click Templates", "Navigate to the Templates",
    "Full ", "For ", "Full PO", "For Part", "Part Cancellation",
    "PO Cancellation", "Option ", "Proceed", "Scenario",
    "Problem with an Order (PWAO)", "Cancellation Inquiry",
    "PO Reroutes", "Product Out of Stock", "Update Tracking",
    "Change Ship Method", "Split PO", "Lead Time",
    "Global Transfer", "WDN Supplier", "Escalat", "WIMS",
    "Multiple Damages", "NMFC", "Shipping", "Onshore",
    "Cannot Print", "Wrong Price", "Tier 1", "Tier 2", "Tier 3",
    "Tier ", "PO has", "Need PO", "Onshore Internal",
    # These are SOP titles, not template names
    "Key Word", "Definition", "Steps", "Actions", "Visuals",
    "#", "Overview", "Objective", "Resource",
    "Area", "Postcodes", "Carrier", "Description",
    "Automation", "Label", "Scenario",
)

for name, r in seen_names.items():
    name_lower = name.lower()
    # Skip if starts with skip prefix
    skip = False
    for prefix in SKIP_PREFIXES:
        if name.startswith(prefix):
            skip = True
            break
    if skip:
        continue
    # Skip if too short or too long
    if len(name) < 5 or len(name) > 150:
        continue
    # Skip if contains action verb phrases
    skip_verbs = ["click", "select", "navigate", "review", "check", "send",
                   "utilize", "open", "close", "cancel", "submit", "log in",
                   "access", "run the", "step ", "note:", "tip:", "continue",
                   "enter the", "fill in", "ensure that", "verify that",
                   "proceed to", "submit the", "request the", "response to"]
    if any(f"{v} " in name_lower for v in skip_verbs):
        continue
    # Skip numbers or codes
    if re.match(r'^[\d\.\-]+$', name):
        continue
    # Skip if no letters
    if not re.search(r'[a-zA-Z]', name):
        continue
    # Skip single words
    if " " not in name and len(name) < 15:
        continue
    # Skip very long descriptive sentences
    if len(name) > 100 and name.count(" ") > 10:
        continue
    # Skip common SOP heading words
    skip_words = ["table of content", "table of contents", "how to", "what is",
                  "when to", "where to", "purpose of", "objective of",
                  "guideline for", "procedure for", "instruction for"]
    if any(w in name_lower for w in skip_words):
        continue

    QUALITY_TEMPLATES.append(r)

print(f"Quality templates: {len(QUALITY_TEMPLATES)}")

# Print preview by category
from collections import Counter
cat_groups = {}
for r in QUALITY_TEMPLATES:
    cat = r["category"]
    if cat not in cat_groups:
        cat_groups[cat] = []
    cat_groups[cat].append(r)

for cat, items in sorted(cat_groups.items()):
    print(f"\n  [{cat}]: {len(items)} templates")
    for r in items[:8]:
        print(f"    - {r['template_name'][:70]}")
    if len(items) > 8:
        print(f"    ... +{len(items)-8} more")

# ── Write CSV ───────────────────────────────────────────────────────────────
COLUMNS = [
    "Project",
    "Category",
    "Template Name",
    "Source",
    "SOP Page Title",
    "SOP Page ID",
    "SOP Version",
    "SOP Author",
    "Template Code",
    "Has EN",
    "Has ZH",
    "Confluence Link",
    "Notes",
]

rows = [COLUMNS]

CODE_MAP = {
    "Cancellation Inquiries": "CAN",
    "Cannot Print BOL / Shipping Label": "BOL",
    "Change Ship Method (CS Entered)": "CSC",
    "Change Ship Method (Supplier Entered)": "CSS",
    "Escalating for Onshore Support": "ESC",
    "Global Transfer Matrix": "GTM",
    "Lead Times": "LTM",
    "Multiple Damages": "DMG",
    "NMFC and Freight Code Requests": "NMFC",
    "Need PO to be Resent": "NPR",
    "Onshore Escalations": "ONS",
    "PO Reroutes": "RER",
    "PO Has a Wrong Price": "WPR",
    "Problem with an Order (PWAO)": "PWAO",
    "Product Out of Stock": "OOS",
    "Shipping/Carrier Questions": "SHP",
    "Split PO": "SPL",
    "Tier 1 Ad Hoc Requests": "T1",
    "Update Tracking Number/Order Status": "TRK",
    "WDN Supplier Outreach": "WDN",
    "WIMS - Large Parcel": "WMS-L",
    "WIMS - Ship Status": "WMS-S",
    "WIMS": "WMS",
    "Other": "OTH",
}

for r in sorted(QUALITY_TEMPLATES, key=lambda x: (x["project"], x["category"], x["template_name"])):
    code = CODE_MAP.get(r["category"], "OTH")
    has_en = "Yes" if not is_cjk(r["template_name"]) else "No"
    has_zh = "Yes" if is_cjk(r["template_name"]) else "No"
    link = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{r['sop_id']}"
    rows.append([
        r["project"],
        r["category"],
        r["template_name"],
        r["template_source"],
        r["sop_title"],
        str(r["sop_id"]),
        str(r["sop_version"]),
        r["sop_author"],
        code,
        has_en,
        has_zh,
        link,
        "",
    ])

output = "confluence_export/template_export_final.csv"
with open(output, "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(rows)

print(f"\nWritten: {output} ({len(rows)} rows incl. header)")

# Summary
print()
print("=" * 70)
print("EXTRACTION COMPLETE")
print("=" * 70)
print(f"Total quality templates: {len(rows)-1}")
proj_count = Counter(r[0] for r in rows[1:])
cat_count = Counter(r[1] for r in rows[1:])
print("\nBy Project:")
for proj, n in proj_count.most_common():
    print(f"  {n:>3}x | {proj}")
print("\nBy Category:")
for cat, n in cat_count.most_common(20):
    print(f"  {n:>3}x | {cat}")
