#!/usr/bin/env python3
"""
Confluence Change Log Sync Script
================================

Extracts change log entries from Confluence pages and syncs to Supabase.
Monitors for new changes and sends Discord notifications.

Usage:
    python scripts/sync_changelogs.py
    
    # Dry run (no database writes)
    python scripts/sync_changelogs.py --dry-run
    
    # Specific page only
    python scripts/sync_changelogs.py --page-id 1256143037

Pages monitored:
    - 1256143037: Change Log CG C2S - VCN
    - 1256145007: Change Log OP - VCN
    - 1256148486: Change Log DSC2S - VCN
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import textwrap
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from html.parser import HTMLParser

import requests

try:
    import psycopg2
except ImportError:
    sys.stderr.write("psycopg2 not installed. Run: pip install psycopg2-binary\n")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("sync_changelogs")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CONFLUENCE_BASE = "https://wayfaircorp.atlassian.net"
CONFLUENCE_API = f"{CONFLUENCE_BASE}/wiki/rest/api"
SPACE_KEY = "GPS"

# Change log pages configuration
CHANGE_LOG_PAGES = {
    1256143037: {
        "title": "Change Log CG C2S - VCN",
        "short_name": "CG"
    },
    1256145007: {
        "title": "Change Log OP - VCN", 
        "short_name": "OP"
    },
    1256148486: {
        "title": "Change Log DSC2S - VCN",
        "short_name": "C2S"
    },
}

DISCORD_TIMEOUT = 10
CONFLUENCE_TIMEOUT = 30
RETRY_ATTEMPTS = 5
RETRY_BASE_DELAY = 2


# ---------------------------------------------------------------------------
# HTML Table Parser
# ---------------------------------------------------------------------------
class TableParser(HTMLParser):
    """Simple HTML table parser to extract rows and cells."""
    
    def __init__(self):
        super().__init__()
        self.tables = []
        self.current_table = []
        self.current_row = []
        self.current_cell = ""
        self.in_table = False
        self.in_row = False
        self.in_cell = False
    
    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.in_table = True
            self.current_table = []
        elif tag == "tr":
            self.in_row = True
            self.current_row = []
        elif tag in ("td", "th"):
            self.in_cell = True
            self.current_cell = ""
    
    def handle_endtag(self, tag):
        if tag == "table":
            if self.current_table:
                self.tables.append(self.current_table)
            self.in_table = False
        elif tag == "tr":
            if self.current_row:
                self.current_table.append(self.current_row)
            self.in_row = False
        elif tag in ("td", "th"):
            self.in_cell = False
            self.current_row.append(self.current_cell.strip())
    
    def handle_data(self, data):
        if self.in_cell:
            self.current_cell += data


def strip_html(html: str) -> str:
    """Remove HTML tags and decode common entities."""
    if not html:
        return ""
    
    # Remove all tags
    text = re.sub(r'<[^>]+>', ' ', html)
    
    # Decode entities
    entities = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&ndash;': '-',
        '&mdash;': '--',
        '&ldquo;': '"',
        '&rdquo;': '"',
        '&lsquo;': "'",
        '&rsquo;': "'",
    }
    for entity, char in entities.items():
        text = text.replace(entity, char)
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse date string like '02 Jul 2026' to date."""
    if not date_str:
        return None
    
    date_str = date_str.strip()
    formats = [
        "%d %b %Y",      # 02 Jul 2026
        "%Y-%m-%d",      # 2026-07-02
        "%d/%m/%Y",      # 02/07/2026
        "%m/%d/%Y",      # 07/02/2026
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    
    return None


def extract_change_logs(html_content: str) -> list[dict]:
    """Extract change log entries from HTML content."""
    parser = TableParser()
    parser.feed(html_content)
    
    entries = []
    
    for table in parser.tables:
        if not table:
            continue
        
        headers = table[0] if table else []
        
        # Find column indices based on headers
        col_map = {}
        for i, h in enumerate(headers):
            h_lower = h.lower().strip()
            if 'change' in h_lower and '#' in h_lower:
                col_map['change_num'] = i
            elif 'date added' in h_lower or 'added' in h_lower:
                col_map['date_added'] = i
            elif 'effective' in h_lower:
                col_map['effective_date'] = i
            elif 'qc' in h_lower and 'impact' in h_lower:
                col_map['qc_impact'] = i
            elif 'who' in h_lower or 'affect' in h_lower:
                col_map['who_affects'] = i
            elif 'applicable' in h_lower or 'sop' in h_lower or 'resource' in h_lower:
                col_map['applicable_sop'] = i
            elif 'what' in h_lower or 'changing' in h_lower:
                col_map['what_changing'] = i
            elif 'reason' in h_lower or 'change' in h_lower and 'reason' in h_lower:
                col_map['reason_change'] = i
        
        # If no headers found, assume standard structure
        if not col_map:
            col_map = {
                'change_num': 0,
                'date_added': 1,
                'effective_date': 2,
                'qc_impact': 3,
                'who_affects': 4,
                'applicable_sop': 5,
                'what_changing': 6,
                'reason_change': 7,
            }
        
        # Parse rows (skip header row)
        for row in table[1:]:
            if not row or len(row) < 2:
                continue
            
            entry = {
                'change_number': None,
                'date_added': None,
                'effective_date': None,
                'qc_impact_date': None,
                'who_affects': '',
                'applicable_sop': '',
                'what_changing': '',
                'reason_change': '',
            }
            
            # Extract values using column map
            for key, idx in col_map.items():
                if idx < len(row):
                    value = strip_html(row[idx])
                    if key == 'change_num':
                        try:
                            entry['change_number'] = int(value)
                        except ValueError:
                            entry['change_number'] = None
                    elif key in ('date_added', 'effective_date', 'qc_impact'):
                        entry[f'{key}_date' if key != 'change_num' and 'date' not in key else key] = value
                        parsed = parse_date(value)
                        if parsed:
                            entry[f'{key}_date' if key in ('date_added', 'effective_date') else f'{key}_date'] = parsed
                    else:
                        entry[key] = value
            
            # Only add if we have a valid change number
            if entry['change_number'] is not None:
                entries.append(entry)
    
    return entries


# ---------------------------------------------------------------------------
# Confluence Client
# ---------------------------------------------------------------------------
class ConfluenceClient:
    """Lightweight Confluence REST API client."""
    
    def __init__(self, email: str, api_key: str):
        self.session = requests.Session()
        self.session.auth = (email, api_key)
        self.session.headers.update({
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "dashboard-f1-changelog-sync/1.0",
        })
        self.api_root = f"{CONFLUENCE_API}"
    
    def get_page(self, page_id: int) -> dict:
        """Fetch a single Confluence page."""
        url = f"{self.api_root}/content/{page_id}"
        
        for attempt in range(1, RETRY_ATTEMPTS + 1):
            try:
                resp = self.session.get(
                    url,
                    params={"expand": "version,body.storage,history"},
                    timeout=CONFLUENCE_TIMEOUT
                )
                
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", RETRY_BASE_DELAY * 2 ** attempt))
                    log.warning("Rate-limited (429). Waiting %ds", retry_after)
                    time.sleep(retry_after)
                    continue
                
                resp.raise_for_status()
                return resp.json()
                
            except requests.RequestException as exc:
                if attempt == RETRY_ATTEMPTS:
                    log.error("Failed to fetch page %d after %d attempts: %s", page_id, RETRY_ATTEMPTS, exc)
                    raise
                delay = RETRY_BASE_DELAY * 2 ** (attempt - 1)
                log.warning("Error (attempt %d/%d, retrying in %ds): %s", attempt, RETRY_ATTEMPTS, delay, exc)
                time.sleep(delay)
        
        return {}


# ---------------------------------------------------------------------------
# Supabase Client
# ---------------------------------------------------------------------------
class SupabaseDB:
    """Direct PostgreSQL connection to Supabase."""
    
    def __init__(self, url: str, service_role_key: str):
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key
        
        try:
            self.project_ref = self.url.split("//")[1].split(".")[0]
        except Exception as exc:
            log.error("Could not parse Supabase project ref: %s", exc)
            raise
        
        self._conn_string = (
            f"postgresql://postgres.{self.project_ref}:{service_role_key}"
            f"@{self.project_ref}.supabase.co:5432/postgres"
        )
    
    def connect(self):
        conn = psycopg2.connect(self._conn_string, connect_timeout=15)
        conn.autocommit = True
        return conn
    
    def upsert_changelog_entry(self, conn, page_id: int, page_title: str, page_url: str, entry: dict) -> bool:
        """Insert or update a change log entry."""
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT public.upsert_changelog_entry(
                        %(page_id)s,
                        %(page_title)s,
                        %(page_url)s,
                        %(change_number)s,
                        %(date_added)s,
                        %(effective_date)s,
                        %(qc_impact_date)s,
                        %(who_affects)s,
                        %(applicable_sop)s,
                        %(what_changing)s,
                        %(reason_change)s
                    )
                    """,
                    {
                        "page_id": page_id,
                        "page_title": page_title,
                        "page_url": page_url,
                        "change_number": entry.get("change_number"),
                        "date_added": entry.get("date_added"),
                        "effective_date": entry.get("effective_date"),
                        "qc_impact_date": entry.get("qc_impact_date"),
                        "who_affects": entry.get("who_affects", ""),
                        "applicable_sop": entry.get("applicable_sop", ""),
                        "what_changing": entry.get("what_changing", ""),
                        "reason_change": entry.get("reason_change", ""),
                    }
                )
                return True
        except psycopg2.Error as exc:
            log.error("Failed to upsert changelog entry: %s", exc)
            return False
    
    def get_latest_change_number(self, conn, page_id: int) -> Optional[int]:
        """Get the latest change number for a page."""
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT MAX(change_number) 
                    FROM public.confluence_changelog_entries 
                    WHERE page_id = %s
                    """,
                    (page_id,)
                )
                result = cur.fetchone()
                return result[0] if result and result[0] else None
        except psycopg2.Error:
            return None
    
    def count_entries(self, conn, page_id: int) -> int:
        """Count entries for a page."""
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM public.confluence_changelog_entries WHERE page_id = %s",
                    (page_id,)
                )
                result = cur.fetchone()
                return result[0] if result else 0
        except psycopg2.Error:
            return 0


# ---------------------------------------------------------------------------
# Discord Notifications
# ---------------------------------------------------------------------------
def send_discord_notification(webhook_url: str, page_id: int, page_title: str, 
                              short_name: str, new_entries: list, 
                              footer_text: str = "dashboard-f1 Changelog Sync") -> bool:
    """Send Discord notification for new changelog entries."""
    if not new_entries:
        return True
    
    # Build embed
    fields = []
    for entry in new_entries[:10]:  # Max 10 entries per notification
        change_num = entry.get('change_number', '?')
        date_added = str(entry.get('date_added', 'N/A'))
        what = entry.get('what_changing', 'No description')
        
        # Truncate if too long
        if len(what) > 200:
            what = what[:200] + "..."
        
        fields.append({
            "name": f"Change #{change_num} - {date_added}",
            "value": what,
            "inline": False,
        })
    
    page_url = f"{CONFLUENCE_BASE}/wiki/spaces/GPS/pages/{page_id}"
    
    payload = {
        "embeds": [{
            "title": f"📋 Change log của {short_name} có update mới!",
            "color": 0x57F287,  # Green
            "description": f"**{len(new_entries)} new entry/entries detected**\n\n[View full change log]({page_url})",
            "fields": fields,
            "url": page_url,
            "footer": {"text": footer_text},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }]
    }
    
    try:
        resp = requests.post(webhook_url, json=payload, timeout=DISCORD_TIMEOUT)
        return resp.status_code == 204
    except requests.RequestException as exc:
        log.error("Discord notification failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Main Sync Logic
# ---------------------------------------------------------------------------
def sync_changelogs(
    page_ids: list[int] | None = None,
    dry_run: bool = False,
    confluence_email: str | None = None,
    confluence_api_key: str | None = None,
    discord_webhook: str | None = None,
    supabase_url: str | None = None,
    supabase_srk: str | None = None,
) -> dict:
    """Main sync function."""
    
    # Resolve secrets
    confluence_email = confluence_email or os.environ.get("CONFLUENCE_EMAIL", "")
    confluence_api_key = confluence_api_key or os.environ.get("CONFLUENCE_API_KEY", "")
    discord_webhook = discord_webhook or os.environ.get("DISCORD_WEBHOOK_URL", "")
    supabase_url = supabase_url or os.environ.get("SUPABASE_URL", "")
    supabase_srk = supabase_srk or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    
    # Validate secrets
    missing = []
    if not confluence_email: missing.append("CONFLUENCE_EMAIL")
    if not confluence_api_key: missing.append("CONFLUENCE_API_KEY")
    if not supabase_url: missing.append("SUPABASE_URL")
    if not supabase_srk: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    
    if missing:
        log.error("Missing required secrets: %s", ", ".join(missing))
        raise SystemExit(1)
    
    log.info("Starting changelog sync")
    
    # Initialize clients
    cf = ConfluenceClient(confluence_email, confluence_api_key)
    db = SupabaseDB(supabase_url, supabase_srk)
    
    conn = db.connect()
    log.info("Connected to Supabase")
    
    # Determine pages to sync
    if page_ids:
        pages_to_sync = {pid: CHANGE_LOG_PAGES.get(pid, {"title": "Unknown", "short_name": "?"}) 
                         for pid in page_ids}
    else:
        pages_to_sync = CHANGE_LOG_PAGES.copy()
    
    stats = {
        "pages_checked": 0,
        "new_entries": 0,
        "notifications_sent": 0,
    }
    
    for page_id, page_info in pages_to_sync.items():
        log.info("Processing page %d: %s", page_id, page_info["title"])
        
        try:
            # Fetch page from Confluence
            data = cf.get_page(page_id)
            
            if not data:
                log.warning("No data returned for page %d", page_id)
                continue
            
            # Extract body content
            body_html = data.get("body", {}).get("storage", {}).get("value", "")
            
            if not body_html:
                log.warning("Empty body for page %d", page_id)
                continue
            
            # Parse change logs
            entries = extract_change_logs(body_html)
            log.info("  Found %d change log entries", len(entries))
            
            stats["pages_checked"] += 1
            
            if dry_run:
                log.info("  [DRY-RUN] Would insert %d entries", len(entries))
                continue
            
            # Get current latest entry for comparison
            current_latest = db.get_latest_change_number(conn, page_id)
            
            # Filter to only new entries
            new_entries = []
            for entry in entries:
                change_num = entry.get("change_number")
                if change_num and (current_latest is None or change_num > current_latest):
                    new_entries.append(entry)
            
            if new_entries:
                log.info("  %d new entries detected (latest local: %s)", len(new_entries), current_latest)
                
                # Insert new entries
                page_url = f"{CONFLUENCE_BASE}/wiki/spaces/GPS/pages/{page_id}"
                for entry in new_entries:
                    db.upsert_changelog_entry(
                        conn, page_id, page_info["title"], page_url, entry
                    )
                
                stats["new_entries"] += len(new_entries)
                
                # Send Discord notification
                if discord_webhook:
                    ok = send_discord_notification(
                        discord_webhook,
                        page_id,
                        page_info["title"],
                        page_info["short_name"],
                        new_entries
                    )
                    if ok:
                        stats["notifications_sent"] += 1
                        log.info("  Discord notification sent")
            else:
                log.info("  No new entries (latest local: %s)", current_latest)
        
        except Exception as exc:
            log.error("Error processing page %d: %s", page_id, exc)
            continue
    
    log.info("=" * 60)
    log.info("Sync complete — pages=%d new_entries=%d notifications=%d",
             stats["pages_checked"], stats["new_entries"], stats["notifications_sent"])
    log.info("=" * 60)
    
    return stats


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------
def parse_args():
    parser = argparse.ArgumentParser(
        description="Sync Confluence Change Logs to Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Secrets (or environment variables):
              CONFLUENCE_EMAIL
              CONFLUENCE_API_KEY
              DISCORD_WEBHOOK_URL
              SUPABASE_URL
              SUPABASE_SERVICE_ROLE_KEY
        """),
    )
    parser.add_argument("--page-id", type=int, action="append", default=[],
                        help="Specific page ID to sync (repeatable)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be synced without writing to database")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Enable verbose logging")
    return parser.parse_args()


def main():
    args = parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    sync_changelogs(
        page_ids=args.page_id if args.page_id else None,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
