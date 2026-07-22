#!/usr/bin/env python3
"""
Final-pass cleanup: remove remaining noise from the 650-template extraction.
Also check for Mandarin versions by re-scanning bodies for Chinese text near template references.
"""
import re, csv, os, json
from collections import Counter

def c(t): return re.sub(r'\s+', ' ', t).strip()
def is_cjk(t): return bool(re.search(r'[\u4e00-\u9fff]', t))

# ── Load previous extraction ─────────────────────────────────────────────────
rows = []
with open("confluence_export/template_export_clean.csv", encoding="utf-8-sig") as f:
    rows = list(csv.reader(f))

header = rows[0]
data   = rows[1:]
print(f"Starting templates: {len(data)}")

# ── Hard cleanup passes ─────────────────────────────────────────────────────
FINAL_SKIP = {
    # dates / numbers / codes
    "December 15, 2025",
    "January ", "February ", "March ", "April ", "May ", "June ",
    "July ", "August ", "September ", "October ", "November ", "December ",
    "1 business day", "2 business days",
    "Girth =",
    "IS NOT MTO", "IS MTO",
    "AOPS SOPs (DSC2S) - VCN",  # SOP title, not template
    "Done > Done Procedure",  # UI action, not template name
    "Global FS&R Toolkit > Lead Time Settings",  # toolkit path, not template
    "Global FS&R Ticket",  # ticket type, not template
    "GSCI Requests",  # seems like a department/team, not a template
    "How do I escalate tickets?",  # question, not template
    "Freight Classes",  # heading, not template
    "NMFC Codes",  # heading, not template
    "General Concepts",  # heading, not template
    "General Lead Time Expectations",  # section header
    "Global Transfer Matrix SOP (DSC2S)",  # SOP name
    "Cannot Print Shipping Documents SOP",  # SOP name
    "Carrier Selection Triage Tool SOP",  # SOP name
    "WIMS SOP",
    "Full PO",  # ambiguous
    "Backordered:",  # label, not template
    "Defaults back to SupportHub",  # instruction
    "Follow-Up: Wayfair Local Dedicated Pickup Delay",  # instruction
    "Follow Up:",  # label
    "Resolve the Ticket",  # instruction
    "Enter a Label Failure ticket",  # instruction
    "Enter Tech ticket",  # instruction
    "Monitor POP Tickets",  # instruction
    "Contact Leadership",  # instruction
    "Consult Leadership",  # instruction
    "Aravind's manager, Jacob Ober",  # person name, not template
    "Onshore Actions",  # section header
}

# Templates that start with action verbs (remaining from previous filter)
SKIP_VERB_PREFIXES = [
    "Can't", "Cant", "Cannot",
    "Determine if", "Determine whether",
    "Provide Supplier",
    "Escalate Ticket", "Escalate ",
    "Transfer ",
    "Flag to ",
    "Input the ",
    "Submit ",
    "Wait for",
    "Retry ",
    "Add new",
    "Update ",
    "Edit the ",
    "Changing a", "Changing FedEx",
    "Edit ",
    "Compare the",
    "Choose the",
    "Search the",
    "Calculate Girth",
    "Calculate ",
    "Go to ",
    "Contact ",
    "Request ",
    "Resolve ",
    "Respond to",
    "Response to",
    "Reply to",
    "Allow ",
    "If the",
    "If ",
    "IS ",
    "API ",
    "EDI ",
    "CG on",
    "Backorder",
    "Bulk ",
    "Export ",
    "Link the",
    "Mark ",
    "Issue ",
    "Pull up",
    "Scroll ",
]

# Templates that contain only one word but less than 10 chars
SKIP_SINGLE_SHORT = {
    "Bulk LT", "IS NOT MTO", "CG on CG orders only",  # these have spaces but weird
    "Wrong PO", "Wrong CRT", "Incorrect CRT",
}

def should_skip(name):
    if name in FINAL_SKIP:
        return True
    for p in SKIP_VERB_PREFIXES:
        if name.startswith(p):
            return True
    for p in SKIP_SINGLE_SHORT:
        if p in name:
            return True
    # Skip if starts with instruction words
    name_lower = name.lower()
    if name_lower.startswith(("go ", "run ", "use ", "see ", "find ",
                              "look ", "ask ", "tell ", "write ")):
        return True
    # Skip if contains "only" or "must" as first clause
    if re.match(r'^(Only |Must |Should |Could |Would )', name):
        return True
    return False

cleaned = []
skipped_reasons = Counter()

for row in data:
    name = row[3] if len(row) > 3 else ""
    if should_skip(name):
        skipped_reasons[name] += 1
        continue
    cleaned.append(row)

print(f"After cleanup: {len(cleaned)} templates")
print(f"Skipped: {sum(skipped_reasons.values())} items")

# ── Also look for Mandarin versions in SOP bodies ──────────────────────────
print("\nSearching for Mandarin translations in SOP bodies...")

with open("confluence_export/sop_pages_data.json", encoding="utf-8") as f:
    sop_data = {int(k): v for k, v in json.load(f).items()}

# Build a name->CJK name mapping by scanning for CJK characters
cjk_mapping = {}
for pid, sop in sop_data.items():
    body = sop.get("body", "")
    if not body:
        continue
    # Find CJK substrings in the body
    cjk_segs = re.findall(r'[\u4e00-\u9fff]{2,30}', body)
    for seg in cjk_segs:
        if len(seg) >= 3:
            cjk_mapping[seg] = pid

print(f"  Found {len(cjk_mapping)} CJK segments")

# Check if any template name has a CJK equivalent nearby
zh_candidates = {seg for seg in cjk_mapping if len(seg) >= 4}
print(f"  Potential ZH candidates: {len(zh_candidates)}")

# ── Final sort and write ───────────────────────────────────────────────────
# Sort: project > category > template name
SORT_KEY = lambda r: (r[1], r[2], r[3])

output_rows = [header] + sorted(cleaned, key=SORT_KEY)

output = "confluence_export/template_export_clean_v2.csv"
with open(output, "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(output_rows)

print(f"\nWritten: {output} ({len(output_rows)-1} templates)")

# ── Summary ───────────────────────────────────────────────────────────────
proj_count = Counter(r[1] for r in output_rows[1:])
cat_count  = Counter(r[2] for r in output_rows[1:])
print(f"\nBy Project:")
for p, n in proj_count.most_common():
    print(f"  {n:>3}x | {p}")
print(f"\nBy Category:")
for c2, n in cat_count.most_common():
    print(f"  {n:>3}x | {c2}")

# Print a sample for each category
print()
cat_groups = {}
for r in output_rows[1:]:
    cat = r[2]
    cat_groups.setdefault(cat, []).append(r)

for cat in sorted(cat_groups):
    items = cat_groups[cat]
    print(f"\n  [{cat}] ({len(items)}):")
    for r in items[:8]:
        print(f"    {r[3][:65]}")
    if len(items) > 8:
        print(f"    ... +{len(items)-8} more")
