#!/usr/bin/env python3
"""
Migration Script: Import Extracted SOP & Template Data to Supabase
================================================================

This script imports the already-extracted SOP and Template data from
the extracted_data/ folder into Supabase.

Usage:
    python scripts/migrate_sop_templates.py
    
    # Dry run (show what would be imported)
    python scripts/migrate_sop_templates.py --dry-run
    
    # Specific type only
    python scripts/migrate_sop_templates.py --type templates
    python scripts/migrate_sop_templates.py --type sop

Prerequisites:
    1. Run sql/sop_templates_schema.sql to create the tables
    2. Set environment variables or have secrets configured
"""

import argparse
import json
import logging
import os
import sys
import textwrap
from pathlib import Path

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
log = logging.getLogger("migrate_sop_templates")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SUPABASE_URL = "https://pfbxtbydrjcmqlrklsdr.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYnh0YnlkcmpjbXFscmtsc2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODM2NDksImV4cCI6MjA3MjU1OTY0OX0.bOgnown0UZzstbnYfUSEImwaSGP6lg2FccRg-yDFTPU"

# Page IDs
SOP_PAGE_ID = 1256152285       # PWAO SOP (DSC2S)
TEMPLATES_PAGE_ID = 1256153038  # Canned Responses Templates
CHANGE_LOG_PAGE_ID = 1256148486  # Change Log DSC2S

# Source data files
DATA_DIR = Path(__file__).parent.parent / "extracted_data"

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
            f"postgresql://postgres.{self.project_ref}:{self.service_role_key}"
            f"@{self.project_ref}.supabase.co:5432/postgres"
        )
    
    def connect(self):
        conn = psycopg2.connect(self._conn_string, connect_timeout=15)
        conn.autocommit = True
        return conn
    
    def upsert_sop_data(self, conn, page_id: int, page_title: str, 
                        table_index: int, table_title: str,
                        headers: list, rows: list) -> bool:
        """Insert or update SOP data."""
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT public.upsert_sop_data(
                        %(page_id)s,
                        %(page_title)s,
                        %(table_index)s,
                        %(table_title)s,
                        %(headers)s::jsonb,
                        %(rows)s::jsonb
                    )
                    """,
                    {
                        "page_id": page_id,
                        "page_title": page_title,
                        "table_index": table_index,
                        "table_title": table_title,
                        "headers": json.dumps(headers),
                        "rows": json.dumps(rows),
                    }
                )
                return True
        except psycopg2.Error as exc:
            log.error("Failed to upsert SOP data: %s", exc)
            return False
    
    def upsert_template_data(self, conn, page_id: int, page_title: str,
                             table_index: int, table_title: str,
                             headers: list, rows: list) -> bool:
        """Insert or update template data."""
        try:
            # Parse rows to extract structured fields
            template_use_case = ""
            applicable_sops = []
            english_text = ""
            mandarin_text = ""
            location_color = ""
            is_na_specific = False
            is_eu_specific = False
            is_global = False
            
            if headers and len(headers) >= 3:
                for row in rows:
                    if len(row) >= 1 and row[0]:
                        template_use_case = row[0]
                    if len(row) >= 2 and row[1]:
                        applicable_sops = [s.strip() for s in row[1].split(",") if s.strip()]
                    if len(row) >= 3 and row[2]:
                        english_text = row[2]
                    if len(row) >= 4 and row[3]:
                        mandarin_text = row[3]
                    
                    # Determine location based on use case text
                    use_case_lower = template_use_case.lower()
                    if "na specific" in use_case_lower or "green location" in use_case_lower:
                        is_na_specific = True
                    elif "eu specific" in use_case_lower or "magenta" in use_case_lower:
                        is_eu_specific = True
                    else:
                        is_global = True
                    
                    # Check for color indicator
                    if "green" in use_case_lower:
                        location_color = "green"
                    elif "turquoise" in use_case_lower:
                        location_color = "turquoise"
                    elif "magenta" in use_case_lower:
                        location_color = "magenta"
                    elif "yellow" in use_case_lower:
                        location_color = "yellow"
            
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT public.upsert_template_data(
                        %(page_id)s,
                        %(page_title)s,
                        %(table_index)s,
                        %(table_title)s,
                        %(template_use_case)s,
                        %(applicable_sops)s,
                        %(english_text)s,
                        %(mandarin_text)s,
                        %(location_color)s,
                        %(is_na_specific)s,
                        %(is_eu_specific)s,
                        %(is_global)s,
                        %(headers)s::jsonb,
                        %(rows)s::jsonb
                    )
                    """,
                    {
                        "page_id": page_id,
                        "page_title": page_title,
                        "table_index": table_index,
                        "table_title": table_title,
                        "template_use_case": template_use_case,
                        "applicable_sops": applicable_sops,
                        "english_text": english_text,
                        "mandarin_text": mandarin_text,
                        "location_color": location_color,
                        "is_na_specific": is_na_specific,
                        "is_eu_specific": is_eu_specific,
                        "is_global": is_global,
                        "headers": json.dumps(headers),
                        "rows": json.dumps(rows),
                    }
                )
                return True
        except psycopg2.Error as exc:
            log.error("Failed to upsert template data: %s", exc)
            return False
    
    def upsert_changelog_entry(self, conn, page_id: int, page_title: str,
                               page_url: str, entry: dict) -> bool:
        """Insert or update change log entry."""
        try:
            from datetime import datetime
            
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


# ---------------------------------------------------------------------------
# Migration Functions
# ---------------------------------------------------------------------------
def load_json_file(filepath: Path) -> dict | list | None:
    """Load JSON file, return None if not found."""
    if not filepath.exists():
        log.warning("File not found: %s", filepath)
        return None
    
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def migrate_sop_data(db: SupabaseDB, conn, dry_run: bool = False) -> dict:
    """Migrate SOP tables from extracted data."""
    log.info("=" * 60)
    log.info("Migrating SOP data...")
    log.info("=" * 60)
    
    # Load SOP tables JSON
    sop_data_file = DATA_DIR / "sop_tables.json"
    data = load_json_file(sop_data_file)
    
    if not data or "tables" not in data:
        log.error("Invalid SOP data format in %s", sop_data_file)
        return {"imported": 0, "errors": 0}
    
    stats = {"imported": 0, "errors": 0}
    tables = data.get("tables", [])
    
    log.info("Found %d SOP tables to import", len(tables))
    
    for i, table in enumerate(tables):
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        table_title = f"Table {i + 1}"
        
        if dry_run:
            log.info("  [DRY-RUN] Would import: %s (%d rows)", table_title, len(rows))
        else:
            ok = db.upsert_sop_data(
                conn,
                SOP_PAGE_ID,
                "Problem with an Order (PWAO) SOP (DSC2S) - VCN",
                i + 1,
                table_title,
                headers,
                rows
            )
            
            if ok:
                stats["imported"] += 1
                log.info("  Imported: %s (%d rows)", table_title, len(rows))
            else:
                stats["errors"] += 1
                log.error("  Failed: %s", table_title)
    
    log.info("SOP migration complete: %d imported, %d errors", 
             stats["imported"], stats["errors"])
    return stats


def migrate_template_data(db: SupabaseDB, conn, dry_run: bool = False) -> dict:
    """Migrate template tables from extracted data."""
    log.info("=" * 60)
    log.info("Migrating Template data...")
    log.info("=" * 60)
    
    # Load template tables JSON
    template_data_file = DATA_DIR / "templates_tables.json"
    data = load_json_file(template_data_file)
    
    if not data or "tables" not in data:
        log.error("Invalid template data format in %s", template_data_file)
        return {"imported": 0, "errors": 0}
    
    stats = {"imported": 0, "errors": 0}
    tables = data.get("tables", [])
    
    log.info("Found %d template tables to import", len(tables))
    
    for i, table in enumerate(tables):
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        table_title = f"Template Table {i + 1}"
        
        if dry_run:
            log.info("  [DRY-RUN] Would import: %s (%d rows)", table_title, len(rows))
        else:
            ok = db.upsert_template_data(
                conn,
                TEMPLATES_PAGE_ID,
                "Canned Responses/Templates (DSC2S) - VCN",
                i + 1,
                table_title,
                headers,
                rows
            )
            
            if ok:
                stats["imported"] += 1
                log.info("  Imported: %s (%d rows)", table_title, len(rows))
            else:
                stats["errors"] += 1
                log.error("  Failed: %s", table_title)
    
    log.info("Template migration complete: %d imported, %d errors",
             stats["imported"], stats["errors"])
    return stats


def migrate_change_log_data(db: SupabaseDB, conn, dry_run: bool = False) -> dict:
    """Migrate change log entries from extracted data."""
    log.info("=" * 60)
    log.info("Migrating Change Log data...")
    log.info("=" * 60)
    
    # Load change log JSON
    changelog_data_file = DATA_DIR / "change_log.json"
    data = load_json_file(changelog_data_file)
    
    if not data or "tables" not in data or not data["tables"]:
        log.warning("No change log data found in %s", changelog_data_file)
        return {"imported": 0, "errors": 0}
    
    stats = {"imported": 0, "errors": 0}
    table = data["tables"][0]
    rows = table.get("rows", [])
    headers = table.get("headers", [])
    
    log.info("Found %d change log entries to import", len(rows))
    
    page_url = f"https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/{CHANGE_LOG_PAGE_ID}"
    page_title = "Change Log DSC2S - VCN"
    
    # Parse headers to column mapping
    col_map = {}
    for i, h in enumerate(headers):
        h_lower = h.lower()
        if 'change' in h_lower:
            col_map['change_number'] = i
        elif 'date added' in h_lower:
            col_map['date_added'] = i
        elif 'effective' in h_lower:
            col_map['effective_date'] = i
        elif 'qc' in h_lower:
            col_map['qc_impact_date'] = i
        elif 'who' in h_lower:
            col_map['who_affects'] = i
        elif 'applicable' in h_lower:
            col_map['applicable_sop'] = i
        elif 'what' in h_lower:
            col_map['what_changing'] = i
        elif 'reason' in h_lower:
            col_map['reason_change'] = i
    
    for row in rows:
        if len(row) < 2:
            continue
        
        entry = {
            "change_number": None,
            "date_added": None,
            "effective_date": None,
            "qc_impact_date": None,
            "who_affects": "",
            "applicable_sop": "",
            "what_changing": "",
            "reason_change": "",
        }
        
        # Extract values
        for key, idx in col_map.items():
            if idx < len(row):
                entry[key] = row[idx]
        
        # Parse change number
        if entry["change_number"]:
            try:
                entry["change_number"] = int(entry["change_number"])
            except ValueError:
                continue
        
        if dry_run:
            log.info("  [DRY-RUN] Would import: Change #%s", entry["change_number"])
        else:
            ok = db.upsert_changelog_entry(
                conn,
                CHANGE_LOG_PAGE_ID,
                page_title,
                page_url,
                entry
            )
            
            if ok:
                stats["imported"] += 1
            else:
                stats["errors"] += 1
    
    log.info("Change log migration complete: %d imported, %d errors",
             stats["imported"], stats["errors"])
    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Migrate extracted SOP & Template data to Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Prerequisites:
              1. Run sql/sop_templates_schema.sql first
              2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
            
            Example:
              python scripts/migrate_sop_templates.py --dry-run
              python scripts/migrate_sop_templates.py --type templates
        """),
    )
    parser.add_argument("--type", choices=["sop", "templates", "changelog", "all"],
                        default="all",
                        help="Type of data to migrate (default: all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be imported without writing")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Enable verbose logging")
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Get Supabase credentials
    supabase_url = os.environ.get("SUPABASE_URL", SUPABASE_URL)
    supabase_srk = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    
    if not supabase_srk:
        log.error("SUPABASE_SERVICE_ROLE_KEY not set")
        sys.exit(1)
    
    # Initialize DB
    db = SupabaseDB(supabase_url, supabase_srk)
    conn = db.connect()
    log.info("Connected to Supabase")
    
    total_stats = {"imported": 0, "errors": 0}
    
    if args.type in ("sop", "all"):
        stats = migrate_sop_data(db, conn, args.dry_run)
        total_stats["imported"] += stats["imported"]
        total_stats["errors"] += stats["errors"]
    
    if args.type in ("templates", "all"):
        stats = migrate_template_data(db, conn, args.dry_run)
        total_stats["imported"] += stats["imported"]
        total_stats["errors"] += stats["errors"]
    
    if args.type in ("changelog", "all"):
        stats = migrate_change_log_data(db, conn, args.dry_run)
        total_stats["imported"] += stats["imported"]
        total_stats["errors"] += stats["errors"]
    
    log.info("=" * 60)
    log.info("Migration complete!")
    log.info("  Total imported: %d", total_stats["imported"])
    log.info("  Total errors: %d", total_stats["errors"])
    log.info("=" * 60)
    
    return total_stats


if __name__ == "__main__":
    main()
