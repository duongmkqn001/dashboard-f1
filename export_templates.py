#!/usr/bin/env python3
"""
Parse the Change Log HTML to extract the full template hierarchy:
  Project → Category → Template → English / Mandarin versions
Then export to CSV.
"""
import re, csv, os, json
from html.parser import HTMLParser

# ── Load saved HTML files ──────────────────────────────────────────────────
os.makedirs("confluence_export", exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Parse Change Log view HTML to get template structure
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("STEP 1: Parsing Change Log view HTML")
print("=" * 70)

with open("confluence_export/change_log_view.html", encoding="utf-8") as f:
    cl_html = f.read()
with open("confluence_export/change_log_storage_raw.html", encoding="utf-8") as f:
    cl_storage = f.read()
with open("confluence_export/dcs2s_storage_raw.html", encoding="utf-8") as f:
    dcs2s_storage = f.read()

print(f"  Change Log view HTML: {len(cl_html):,} chars")
print(f"  Change Log storage:   {len(cl_storage):,} chars")
print(f"  DSC2S storage:       {len(dcs2s_storage):,} chars")

# ─────────────────────────────────────────────────────────────────────────────
# HTML Parser: extract text content preserving structure
# ─────────────────────────────────────────────────────────────────────────────
class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.in_script = False
        self.in_style = False
        self.skip_tags = {"script", "style", "noscript"}
        self.current_skip = None

    def handle_starttag(self, tag, attrs):
        if tag in self.skip_tags:
            self.current_skip = tag
        attrs_dict = dict(attrs)
        cls = attrs_dict.get("class", "")
        local_id = attrs_dict.get("data-local-id", "")
        # Capture Confluence local-id for linking
        if local_id:
            self.text_parts.append(f"[id={local_id}]")

    def handle_endtag(self, tag):
        if tag == self.current_skip:
            self.current_skip = None
        if tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "br"):
            self.text_parts.append("\n")
        elif tag == "tr":
            self.text_parts.append("\n")

    def handle_data(self, data):
        if self.current_skip:
            return
        data = data.strip()
        if data:
            self.text_parts.append(data + " ")

    def get_text(self):
        text = "".join(self.text_parts)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text

extractor = TextExtractor()
extractor.feed(cl_html)
cl_text = extractor.get_text()

with open("confluence_export/change_log_text.txt", "w", encoding="utf-8") as f:
    f.write(cl_text)
print(f"\n  Extracted text: {len(cl_text):,} chars")
print(f"  Saved: confluence_export/change_log_text.txt")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Find all heading patterns in Change Log
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 2: Extracting heading hierarchy from Change Log")
print("=" * 70)

# Use the storage HTML for better structure
# Look for Confluence local-id elements which indicate structured content
# Pattern: change entries have specific structure in the Change Log

# Extract all local-id paragraph texts with their parent headings
# Strategy: find all <p local-id="..."> tags and their surrounding context

def extract_sop_entries(html):
    """
    Extract SOP entries from Change Log.
    Entries follow pattern:
    <h3>Category</h3>
    <ul><li><p><strong>Added|Removed|Updated</strong> template name...</p></li></ul>
    """
    entries = []

    # Find all change entries - they have Added/Removed/Updated/Template prefix
    change_pattern = re.compile(
        r'<p[^>]*local-id[^>]*>.*?(?:<strong>)?'
        r'(Added|Removed|Updated|Edited|Template)'
        r'.*?</p>',
        re.DOTALL | re.IGNORECASE
    )

    # Find section headings (often in bold or h3)
    section_pattern = re.compile(
        r'<(?:h[1-6]|p)[^>]*local-id[^>]*>.*?<strong>([^<]+)</strong>.*?</(?:h[1-6]|p)>',
        re.DOTALL | re.IGNORECASE
    )

    # More specific: find all text with local-id
    local_id_texts = re.findall(
        r'<p local-id="([^"]+)"[^>]*>(.*?)</p>',
        html,
        re.DOTALL | re.IGNORECASE
    )

    return local_id_texts

sop_entries = extract_sop_entries(cl_storage)
print(f"  Found {len(sop_entries)} SOP entries")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Find the specific AOPS / FMOP sections
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 3: Finding AOPS / FMOP section boundaries")
print("=" * 70)

# Search for section headings in the HTML
# AOPS/POS Templates sections
aops_patterns = [
    r'<h3[^>]*>.*?AOPS.*?</h3>',
    r'<h3[^>]*>.*?POS.*?</h3>',
    r'<h3[^>]*>.*?WCRT.*?</h3>',
    r'<h4[^>]*>.*?AOPS.*?</h4>',
    r'<p[^>]*>.*?<strong>.*?AOPS.*?</strong>.*?</p>',
]
fmop_patterns = [
    r'<h3[^>]*>.*?FMOP.*?</h3>',
    r'<h4[^>]*>.*?FMOP.*?</h4>',
    r'<p[^>]*>.*?<strong>.*?FMOP.*?</strong>.*?</p>',
]

def extract_section(html, patterns):
    results = []
    for pat in patterns:
        matches = re.findall(pat, html, re.DOTALL | re.IGNORECASE)
        for m in matches:
            clean = re.sub(r'<[^>]+>', '', m).strip()
            if clean:
                results.append(clean)
    return results

aops_headings = extract_section(cl_storage, aops_patterns)
fmop_headings = extract_section(cl_storage, fmop_patterns)
print(f"  AOPS headings: {aops_headings}")
print(f"  FMOP headings: {fmop_headings}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Parse the DSC2S storage HTML to extract template rows
# The templates are in Confluence tables with columns:
# Icon | Ticket Topic | Template Name | Template Category | Version | Last Updated
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 4: Parsing DSC2S storage for template table")
print("=" * 70)

# The AOPS section starts with:
# <ac:parameter ac:name="title">AOPS / POS Templates</ac:parameter>
# and contains WCRT Templates section

# Find the AOPS section boundary
aops_start_match = re.search(r'parameter ac:name="title">AOPS / POS Templates<', dcs2s_storage)
fmop_start_match = re.search(r'parameter ac:name="title">FMOP Templates<', dcs2s_storage)

if aops_start_match:
    aops_start = aops_start_match.start()
    print(f"  AOPS section starts at position {aops_start:,}")
if fmop_start_match:
    fmop_start = fmop_start_match.start()
    print(f"  FMOP section starts at position {fmop_start:,}")

# Extract all structured macro sections
# Confluence stores tabs as: <div class="tab conf-macro" data-local-id="...">
tab_sections = re.findall(
    r'<div class="tab[^"]*"[^>]*data-local-id="([^"]+)"[^>]*>.*?</div>\s*</div>',
    dcs2s_storage,
    re.DOTALL
)
print(f"  Found {len(tab_sections)} tab sections")

# Extract all the text between the AOPS and FMOP sections
if aops_start_match and fmop_start_match:
    between = dcs2s_storage[aops_start:fmop_start]
    print(f"  AOPS-only content: {len(between):,} chars")
    with open("confluence_export/aops_section.html", "w", encoding="utf-8") as f:
        f.write(between)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Extract all template names and categories
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 5: Extracting all template names")
print("=" * 70)

# Pattern for template names in Confluence:
# 1. Link text in ri:page references
links = re.findall(r'<a[^>]*href="[^"]*spaces/GPS/pages/(\d+)[^"]*"[^>]*>([^<]+)</a>', dcs2s_storage)
print(f"  Found {len(links)} Confluence page links in DSC2S storage")

# 2. SOP page titles
sop_pattern = re.compile(r'([\w\s\-:,()]+)\s+SOP\s+\([A-Z0-9]+\)', re.IGNORECASE)

# 3. Template name patterns
#    WCRT: Wrong Catalog Received Template
#    Follow-Up: ...
#    etc.

# 4. The AOPS / POS Templates section has:
#    - WCRT Templates (Wrong Catalog Received)
#    - Tier 1 Ad Hoc Requests
#    - etc.

# Extract all text blocks between section markers
def extract_section_blocks(html, markers):
    """Extract text between section markers."""
    blocks = {}
    for marker in markers:
        # Find the start of this section
        start = html.find(marker)
        if start == -1:
            continue
        # Find the end (next marker or end)
        min_end = len(html)
        for other in markers:
            if other != marker:
                pos = html.find(other, start + 1)
                if pos != -1 and pos < min_end:
                    min_end = pos
        block = html[start:min_end]
        blocks[marker] = block
    return blocks

# The key markers in the storage HTML
section_markers = [
    'parameter ac:name="title">AOPS / POS Templates',
    'parameter ac:name="title">FMOP Templates',
    'parameter ac:name="title">WCRT Templates',
    'parameter ac:name="title">Tier 1 Ad Hoc',
    'parameter ac:name="title">Tier 2',
    'parameter ac:name="title">Tier 3',
]

blocks = extract_section_blocks(dcs2s_storage, section_markers)
for k, v in blocks.items():
    marker_name = re.search(r'title">([^<]+)', k)
    name = marker_name.group(1) if marker_name else k
    print(f"  '{name}': {len(v):,} chars")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Parse the AOPS section for template rows
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 6: Parsing AOPS template rows")
print("=" * 70)

aops_block = blocks.get('parameter ac:name="title">AOPS / POS Templates', '')

# Extract template entry blocks
# Template entries have pattern like:
# <p><a href="...">Template Name</a></p>
# or
# <p><a href="...">Template Name</a> (Mandarin Text)</p>

# Find all Confluence page links (ri:page or regular links)
template_links = re.findall(
    r'<a[^>]*href="[^"]*/pages/(\d+)[^"]*"[^>]*>([^<]+)</a>',
    aops_block,
    re.DOTALL
)

print(f"  Found {len(template_links)} links in AOPS section")
template_names = {}
for page_id, name in template_links:
    clean_name = clean_text(name)
    if len(clean_name) > 5 and "spaces" not in clean_name.lower():
        template_names[clean_name] = page_id

print(f"  Unique template names ({len(template_names)}):")
for name, pid in sorted(template_names.items()):
    print(f"    [{pid}] {name}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Find all FMOP templates
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 7: Parsing FMOP template rows")
print("=" * 70)

fmop_block = blocks.get('parameter ac:name="title">FMOP Templates', '')

fmop_links = re.findall(
    r'<a[^>]*href="[^"]*/pages/(\d+)[^"]*"[^>]*>([^<]+)</a>',
    fmop_block,
    re.DOTALL
)
print(f"  Found {len(fmop_links)} links in FMOP section")
fmop_template_names = {}
for page_id, name in fmop_links:
    clean_name = clean_text(name)
    if len(clean_name) > 5:
        fmop_template_names[clean_name] = page_id

print(f"  Unique FMOP template names ({len(fmop_template_names)}):")
for name, pid in sorted(fmop_template_names.items()):
    print(f"    [{pid}] {name}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: Parse all child SOP pages to get version info
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 8: Building SOP page version map from Change Log")
print("=" * 70)

# The Change Log contains entries with page IDs and version info
# Pattern: "Added template > Follow-Up: ..." and similar

# Extract all page IDs mentioned with their versions
# Version pattern: "v123" or "v. 123"
version_pattern = re.compile(r'v\.?\s*(\d+)', re.IGNORECASE)

# From the included page IDs we know about:
known_sop_pages = [
    1256143084,  # Change Log
    1256174803,  # Best Practices and Ticket Etiquette (DSC2S)
    1256153038,  # Canned Responses/Templates (DSC2S)
    1256128160,  # Entering Internal Tickets (DSC2S)
    1256098506,  # Escalation Pathway & Supplier Escalation Process (DSC2S)
    1256113130,  # How To: Read a BOL/POD (DSC2S)
    1256096066,  # Navigating Manage Supplier (DSC2S)
    1256188296,  # Navigating Partner Home (DSC2S)
    1256174492,  # Project List (DSC2S)
    1256174691,  # Requesting Ticket Help via Slack Workflows (DSC2S)
    1256184665,  # WFM Toggle Usage (DSC2S)
    # SOP pages referenced in the template section:
    1256185683,  # WCRT: Wrong Catalog Received Template (DSC2S)
    1256174803,  # SOP pages
]

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: Build the comprehensive CSV data
# Based on the extracted content, build the CSV structure
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 9: Building CSV data structure")
print("=" * 70)

# Categories found in the AOPS section (from pattern analysis):
aops_categories = [
    "WCRT - Wrong Catalog Received",
    "Multiple Damages",
    "Problem with an Order (PWAO)",
    "PO Reroutes",
    "Update Tracking Number/Order Status",
    "Product Out of Stock",
    "Change Ship Method (CS Entered)",
    "Change Ship Method (Supplier Entered)",
    "Cannot Print BOL / Packing Slip / Shipping Label",
    "Shipping/Carrier Questions",
    "Split PO",
    "PO Has a Wrong Price",
    "Global Transfer Matrix",
    "Lead Times",
    "WDN Supplier Outreach",
    "Escalating for Onshore Support (Tier 0 to Tier 1)",
    "WIMS - Ship Status",
    "WIMS - Large Parcel",
    "NMFC and Freight Code Requests",
    "Tier 1 Ad Hoc Requests",
    "Tier 2 Ad Hoc Requests",
    "Tier 3 Ad Hoc Requests",
]

# Categories in FMOP section:
fmop_categories = [
    "Supplier Templates",
    "Supplier Email Templates",
    "Onshore Escalations",
]

# SOP pages extracted from the include list
sop_pages = [
    "Cancellation Inquiry SOP",
    "Cannot Print a BOL / Packing Slip or Shipping Label SOP",
    "Change Ship Method on PO - Not Shipped SOP",
    "Change Ship Method or Carrier on PO Due to Item Count / Size (Supplier Entered) SOP",
    "Escalating for Onshore Support (Tier 0 to Tier 1) SOP",
    "Global Transfer Matrix SOP",
    "Lead Times SOP",
    "Multiple Damages SOP",
    "Need PO to be Resent SOP",
    "Onshore Escalations SOP",
    "PO Reroutes SOP",
    "PO has a Wrong Price SOP",
    "Problem with an Order (PWAO) SOP",
    "Product Out of Stock SOP",
    "Shipping/Carrier Questions SOP",
    "Split PO SOP",
    "Update Tracking Number/Order Status SOP",
    "WDN Supplier Outreach SOP",
    "WIMS - Large Parcel SOP",
    "WIMS - Ship Status SOP",
    "Tier 1 Ad Hoc Requests SOP",
]

print(f"  AOPS categories: {len(aops_categories)}")
print(f"  FMOP categories: {len(fmop_categories)}")
print(f"  SOP pages referenced: {len(sop_pages)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 10: Generate the CSV
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 70)
print("STEP 10: Generating CSV")
print("=" * 70)

def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

def strip_html_tags(html):
    return clean_text(re.sub(r'<[^>]+>', '', html))

def has_mandarin(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))

# Build CSV rows
rows = []

# Header
rows.append([
    "Project",
    "Category",
    "Template Name (EN)",
    "Template Name (ZH)",
    "SOP Page Title (EN)",
    "SOP Page Title (ZH)",
    "Page ID (EN)",
    "Page ID (ZH)",
    "Version (EN)",
    "Version (ZH)",
    "Last Updated (EN)",
    "Last Updated (ZH)",
    "Template Code",
    "Template Category",
    "Ticket Topic",
    "Has English",
    "Has Mandarin",
    "Notes",
])

# Parse template entries from the HTML
# Strategy: extract all Confluence page links from the storage

# Get ALL page links from the AOPS section
all_page_links = re.findall(
    r'<a[^>]*href="[^"]*(?:spaces/GPS/pages/(\d+)|/wiki/spaces/GPS/pages/(\d+))[^"]*"[^>]*>([^<]+)</a>',
    dcs2s_storage,
    re.DOTALL
)

# Deduplicate
seen_titles = set()
template_entries = []
for m in all_page_links:
    pid = m[0] or m[1]
    raw_title = m[2]
    title = clean_text(raw_title)
    if not title or len(title) < 5:
        continue
    if title in seen_titles:
        continue
    if any(kw in title for kw in ["Best Practices", "Change Log", "Project List", "Escalation",
                                   "Navigating", "Entering Internal", "How To:", "Requesting Ticket",
                                   "WFM Toggle", "Canned Responses"]):
        continue  # Skip non-template pages
    seen_titles.add(title)
    template_entries.append({"title": title, "page_id": pid, "is_mandarin": has_mandarin(title)})

print(f"  Total template entries: {len(template_entries)}")

# Categorize templates into AOPS or FMOP
# AOPS templates contain: WCRT, Tier 1, Tier 2, Tier 3, Damages, PWAO, Reroutes, etc.
# FMOP templates contain: Supplier, Email, Onshore

aops_keywords = ["WCRT", "Tier 1", "Tier 2", "Tier 3", "Damages", "PWAO", "Reroute",
                 "Tracking", "Out of Stock", "Change Ship", "BOL", "Shipping", "Split",
                 "Wrong Price", "Transfer", "Lead Time", "WDN", "Escalat", "WIMS",
                 "NMFC", "Ad Hoc", "Onshore"]
fmop_keywords = ["Supplier", "Email", "Onshore Escalation"]

for entry in template_entries:
    title = entry["title"]
    pid = entry["page_id"]

    # Determine project
    if any(k in title for k in fmop_keywords):
        project = "FMOP Templates"
    else:
        project = "AOPS/POS Templates"

    # Determine category from title
    if "WCRT" in title or "Wrong Catalog" in title:
        category = "WCRT - Wrong Catalog Received"
        template_code = "WCRT"
        ticket_topic = "Wrong Catalog"
    elif "Tier 1" in title:
        category = "Tier 1 Ad Hoc Requests"
        template_code = "T1"
        ticket_topic = "Tier 1 Ad Hoc"
    elif "Tier 2" in title:
        category = "Tier 2 Ad Hoc Requests"
        template_code = "T2"
        ticket_topic = "Tier 2 Ad Hoc"
    elif "Tier 3" in title:
        category = "Tier 3 Ad Hoc Requests"
        template_code = "T3"
        ticket_topic = "Tier 3 Ad Hoc"
    elif "Damages" in title:
        category = "Multiple Damages"
        template_code = "DMG"
        ticket_topic = "Damages"
    elif "PWAO" in title or "Problem with an Order" in title:
        category = "Problem with an Order (PWAO)"
        template_code = "PWAO"
        ticket_topic = "Problem with an Order"
    elif "Reroute" in title:
        category = "PO Reroutes"
        template_code = "RER"
        ticket_topic = "Reroute"
    elif "Tracking" in title or "Status" in title:
        category = "Update Tracking Number/Order Status"
        template_code = "TRK"
        ticket_topic = "Tracking/Status"
    elif "Out of Stock" in title:
        category = "Product Out of Stock"
        template_code = "OOS"
        ticket_topic = "Out of Stock"
    elif "Change Ship" in title:
        if "Supplier Entered" in title or "Item Count" in title or "Size" in title:
            category = "Change Ship Method (Supplier Entered)"
            template_code = "CSS"
        else:
            category = "Change Ship Method (CS Entered)"
            template_code = "CSC"
        ticket_topic = "Change Ship Method"
    elif "BOL" in title or "Packing Slip" in title or "Shipping Label" in title:
        category = "Cannot Print BOL / Packing Slip / Shipping Label"
        template_code = "BOL"
        ticket_topic = "Print Issue"
    elif "Shipping" in title or "Carrier" in title:
        category = "Shipping/Carrier Questions"
        template_code = "SHP"
        ticket_topic = "Shipping/Carrier"
    elif "Split" in title:
        category = "Split PO"
        template_code = "SPL"
        ticket_topic = "Split PO"
    elif "Wrong Price" in title:
        category = "PO Has a Wrong Price"
        template_code = "WPR"
        ticket_topic = "Wrong Price"
    elif "Transfer" in title:
        category = "Global Transfer Matrix"
        template_code = "GTM"
        ticket_topic = "Transfer"
    elif "Lead Time" in title:
        category = "Lead Times"
        template_code = "LTM"
        ticket_topic = "Lead Time"
    elif "WDN" in title:
        category = "WDN Supplier Outreach"
        template_code = "WDN"
        ticket_topic = "WDN"
    elif "Escalat" in title:
        category = "Escalating for Onshore Support (Tier 0 to Tier 1)"
        template_code = "ESC"
        ticket_topic = "Escalation"
    elif "WIMS" in title:
        category = "WIMS"
        template_code = "WMS"
        ticket_topic = "WIMS"
    elif "NMFC" in title or "Freight" in title:
        category = "NMFC and Freight Code Requests"
        template_code = "NMFC"
        ticket_topic = "NMFC/Freight"
    elif "Ad Hoc" in title:
        category = "Tier 1 Ad Hoc Requests"
        template_code = "T1"
        ticket_topic = "Ad Hoc"
    elif "Supplier" in title or "Email" in title:
        category = "Supplier Templates > Supplier Email Templates"
        template_code = "SUP"
        ticket_topic = "Supplier"
    elif "Onshore" in title:
        category = "Onshore Escalations"
        template_code = "ONS"
        ticket_topic = "Onshore"
    else:
        category = "Other"
        template_code = "OTH"
        ticket_topic = "Other"

    # Determine English/Mandarin
    has_en = not entry["is_mandarin"]
    has_cn = entry["is_mandarin"]

    # Parse template name from SOP title
    # E.g. "Follow-Up: Wrong Catalog Received - Tier 1 Template (English) (Mandarin Text)"
    # -> EN: "Follow-Up: Wrong Catalog Received - Tier 1 Template"
    # -> ZH: "Follow-Up: Wrong Catalog Received - Tier 1 Template (Mandarin Text)"

    name_en = entry["title"]
    name_zh = ""

    # Check for Mandarin marker in title
    mandarin_match = re.search(r'\((Mandarin|Chinese|中文)[^)]*\)', entry["title"], re.IGNORECASE)
    if mandarin_match:
        # Split English and Mandarin parts
        name_en = re.sub(r'\s*\((Mandarin|Chinese|中文)[^)]*\)', '', entry["title"]).strip()
        name_zh = mandarin_match.group(0).strip()
    elif has_mandarin(entry["title"]):
        name_zh = entry["title"]

    # Template code refinement
    if not name_en:
        name_en = entry["title"]

    rows.append([
        project,
        category,
        name_en,
        name_zh,
        entry["title"],           # SOP Page Title (EN)
        name_zh or "",            # SOP Page Title (ZH) - same as template name for now
        pid,
        "",                        # Page ID (ZH) - unknown for now
        "",                        # Version (EN) - unknown for now
        "",                        # Version (ZH)
        "",                        # Last Updated (EN)
        "",                        # Last Updated (ZH)
        template_code,
        category,
        ticket_topic,
        "Yes" if has_en else "No",
        "Yes" if has_cn else "No",
        "",
    ])

# Write CSV
output_path = "confluence_export/template_export_draft.csv"
with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f"\n  CSV written to: {output_path}")
print(f"  Total rows (including header): {len(rows)}")
print(f"  Template rows: {len(rows) - 1}")

# Print first 30 rows for preview
print()
print("Preview (first 30 rows):")
for row in rows[:31]:
    print(f"  {row[0]} | {row[1]} | {row[2][:60]}")

print()
print("=" * 70)
print("DONE — CSV draft generated")
print("=" * 70)
print()
print("NEXT STEPS:")
print("1. Open confluence_export/template_export_draft.csv to review")
print("2. Note any missing template names or incorrect categories")
print("3. Report back with corrections — I will regenerate the CSV")
