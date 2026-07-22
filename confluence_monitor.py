#!/usr/bin/env python3
"""
Confluence Page Monitor — GitHub Actions entry point
====================================================

Compares the current state of Confluence GPS-space pages against
`public.confluence_pages` in Supabase and:
  1. Upserts changed pages via `track_confluence_change()`.
  2. Picks up any un-notified changelog rows and fires them to Discord.
  3. Marks successfully notified rows via `mark_confluence_notified()`.

Secrets required (GitHub Actions → Settings → Secrets → Actions):
  CONFLUENCE_EMAIL       — Atlassian account email
  CONFLUENCE_API_KEY     — Atlassian API token  (ATATT... format)
  DISCORD_WEBHOOK_URL    — Discord incoming webhook URL
  SUPABASE_URL           — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — Supabase service_role key (bypasses RLS)

Run locally for testing:
  python confluence_monitor.py

Run dry-run (skip Discord + skip Supabase writes):
  python confluence_monitor.py --dry-run

Run for a specific page ID only:
  python confluence_monitor.py --page-id 1256185536
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import textwrap
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

# ---------------------------------------------------------------------------
# Vendor libraries
# ---------------------------------------------------------------------------
import requests

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    sys.stderr.write(
        "psycopg2 not installed. Run: pip install psycopg2-binary\n"
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("confluence_monitor")

# ---------------------------------------------------------------------------
# Defaults / constants
# ---------------------------------------------------------------------------
CONFLUENCE_BASE   = "https://wayfaircorp.atlassian.net"
CONFLUENCE_API    = f"{CONFLUENCE_BASE}/wiki/rest/api"
SPACE_KEY         = "GPS"
DEFAULT_PAGES     = [1256185536]          # Order to Delivery Journey - VCN
CHANGE_LOG_PAGES  = [
    1256143037,   # Change Log CG C2S - VCN
    1256145007,   # Change Log OP - VCN
    1256148486,   # Change Log DSC2S - VCN (existing)
]
DISCORD_TIMEOUT   = 10                     # seconds
CONFLUENCE_RTYPE  = 5                     # retry attempts
CONFLUENCE_BDELAY = 2                     # base delay seconds between retries

# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class ConfluencePage:
    id:             int
    title:          str
    version_number: int
    version_when:   Optional[datetime]
    version_by_name: Optional[str]
    body_content:   str
    labels:         list[str]
    parent_id:      Optional[int]
    space_key:      str = SPACE_KEY
    body_hash:      str = ""

    def compute_hash(self) -> str:
        if not self.body_hash:
            self.body_hash = hashlib.sha256(
                self.body_content.encode("utf-8")
            ).hexdigest()
        return self.body_hash

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "title":           self.title,
            "version_number":  self.version_number,
            "version_when":    self.version_when.isoformat() if self.version_when else None,
            "version_by_name": self.version_by_name,
            "body_content":    self.body_content,
            "labels":          self.labels,
            "parent_id":       self.parent_id,
            "space_key":       self.space_key,
        }


@dataclass
class ChangeResult:
    change_type:  str
    old_version: Optional[int]
    new_version: int
    log_id:      Optional[int]
    summary:     str
    page_title:  str
    page_id:     int
    url:         str


# ---------------------------------------------------------------------------
# Confluence API client
# ---------------------------------------------------------------------------

class ConfluenceClient:
    """Lightweight Confluence REST API client using requests + basic-auth."""

    def __init__(self, email: str, api_key: str, base_url: str = CONFLUENCE_BASE):
        self.session = requests.Session()
        self.session.auth = (email, api_key)
        self.session.headers.update({
            "Accept":        "application/json",
            "Content-Type":  "application/json",
            # Supabase is strict about user-agent
            "User-Agent":    "dashboard-f1-confluence-monitor/1.0",
        })
        self.api_root = f"{base_url}/wiki/rest/api"

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def get_current_user(self) -> dict:
        """Verify credentials by fetching the current user."""
        return self._get("/user/current")

    def get_page(self, page_id: int, *, expand: str = "version,body.storage,metadata.labels,history") -> ConfluencePage:
        """
        Fetch a single Confluence page by ID.

        expand Controls what data is returned:
          version          → {number, when, by {displayName}}
          body.storage     → {value}  (rendered HTML)
          metadata.labels  → {results [{name}]}
          history          → {createdBy {displayName}, parentId}
        """
        data = self._get(f"/content/{page_id}", params={"expand": expand})
        return self._parse_page(data)

    def get_all_pages_in_space(
        self,
        space: str = SPACE_KEY,
        limit: int = 100,
        content_type: str = "page",
    ) -> list[ConfluencePage]:
        """
        List all pages in the GPS space (or another space).
        Use this for initial discovery; then cache known page IDs.
        """
        pages = []
        start = 0
        while True:
            data = self._get(
                "/content",
                params={
                    "space":       space,
                    "type":        content_type,
                    "limit":       limit,
                    "start":       start,
                    "expand":      "version,metadata.labels",
                },
            )
            results = data.get("results", [])
            for raw in results:
                try:
                    pages.append(self._parse_page(raw, lightweight=True))
                except Exception as exc:
                    log.warning("Skipping page %s: %s", raw.get("id", "?"), exc)
            if not data.get("size") or start + data["size"] >= data.get("totalSize", start + len(results)):
                break
            start += data["size"]
        return pages

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{self.api_root}{path}"
        for attempt in range(1, CONFLUENCE_RTYPE + 1):
            try:
                resp = self.session.get(url, params=params, timeout=30)
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", CONFLUENCE_BDELAY * 2 ** attempt))
                    log.warning("Rate-limited (429). Waiting %ds (attempt %d/%d)", retry_after, attempt, CONFLUENCE_RTYPE)
                    time.sleep(retry_after)
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                if attempt == CONFLUENCE_RTYPE:
                    log.error("Confluence API failed after %d attempts: %s %s", CONFLUENCE_RTYPE, path, exc)
                    raise
                delay = CONFLUENCE_BDELAY * 2 ** (attempt - 1)
                log.warning("Confluence API error (attempt %d/%d, retrying in %ds): %s", attempt, CONFLUENCE_RTYPE, delay, exc)
                time.sleep(delay)
        return {}   # unreachable

    @staticmethod
    def _parse_page(data: dict, *, lightweight: bool = False) -> ConfluencePage:
        """Map raw Confluence JSON → ConfluencePage dataclass."""
        page_id = int(data["id"])

        # Version
        ver = data.get("version", {})
        ver_number = int(ver.get("number", 0) or 0)
        ver_when   = None
        ver_by_name = None
        if ver.get("when"):
            try:
                ver_when = datetime.fromisoformat(ver["when"].replace("Z", "+00:00"))
            except ValueError:
                pass
        ver_by_name = ver.get("by", {}).get("displayName")

        # Body
        body_content = ""
        if not lightweight:
            body_content = data.get("body", {}).get("storage", {}).get("value", "")

        # Labels
        labels: list[str] = []
        raw_labels = data.get("metadata", {}).get("labels", {}).get("results", [])
        labels = [lbl["name"] for lbl in raw_labels if lbl.get("name")]

        # Parent
        parent_id = None
        if not lightweight:
            parent_id = data.get("history", {}).get("parentId")

        return ConfluencePage(
            id=page_id,
            title=data.get("title", ""),
            version_number=ver_number,
            version_when=ver_when,
            version_by_name=ver_by_name,
            body_content=body_content,
            labels=labels,
            parent_id=parent_id,
            space_key=data.get("space", {}).get("key", SPACE_KEY),
        )


# ---------------------------------------------------------------------------
# Supabase client (raw psycopg2)
# ---------------------------------------------------------------------------

class SupabaseDB:
    """
    Direct PostgreSQL connection to Supabase using psycopg2.
    Uses the service_role key so we bypass RLS and can write.
    """

    def __init__(self, url: str, service_role_key: str):
        # Supabase connection string format:
        # postgresql://postgres.[project_ref]:[password]@[host]/postgres
        # Password is encoded in the JWT-style service_role key, so we
        # extract the project ref from the URL and use a standard connection.
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key

        # Parse project ref from URL: https://xxxx.supabase.co → xxxx
        try:
            self.project_ref = self.url.split("//")[1].split(".")[0]
        except Exception as exc:
            log.error("Could not parse Supabase project ref from URL '%s': %s", self.url, exc)
            raise

        # Build connection string
        # The password is actually the service_role key's signature portion;
        # Supabase accepts service_role key as password directly via PG 15+ auth.
        # For older clients we use a placeholder — Supabase will verify the JWT.
        self._conn_string = (
            f"postgresql://postgres.{self.project_ref}:{service_role_key}"
            f"@{self.project_ref}.supabase.co:5432/postgres"
        )

    def connect(self):
        try:
            conn = psycopg2.connect(self._conn_string, connect_timeout=15)
            conn.autocommit = True
            return conn
        except psycopg2.OperationalError as exc:
            log.error("Cannot connect to Supabase: %s", exc)
            raise

    def get_monitored_page_ids(self, conn) -> list[int]:
        """Return all page IDs currently in public.confluence_pages."""
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM public.confluence_pages")
            return [row[0] for row in cur.fetchall()]

    def upsert_page_and_log(self, conn, page: ConfluencePage) -> ChangeResult | None:
        """
        Call track_confluence_change() and return a ChangeResult if the version changed.
        Returns None if no version change was detected.
        """
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT track_confluence_change(
                        %(id)s,
                        %(title)s,
                        %(space_key)s,
                        %(version_number)s,
                        %(version_when)s,
                        %(version_by_name)s,
                        %(body_content)s,
                        %(labels)s,
                        %(parent_id)s,
                        %(change_type)s
                    )
                    """,
                    {
                        "id":               page.id,
                        "title":            page.title,
                        "space_key":        page.space_key,
                        "version_number":   page.version_number,
                        "version_when":     page.version_when,
                        "version_by_name":  page.version_by_name,
                        "body_content":     page.body_content,
                        "labels":           page.labels,
                        "parent_id":        page.parent_id,
                        "change_type":      "updated",
                    },
                )
                row = cur.fetchone()
                if row is None:
                    return None
                result: dict = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                log_id = result.get("log_id")
                change_type = result.get("change_type", "unchanged")

                if change_type == "unchanged":
                    return None

                return ChangeResult(
                    change_type=change_type,
                    old_version=result.get("old_version"),
                    new_version=result.get("new_version"),
                    log_id=log_id,
                    summary=result.get("summary", ""),
                    page_title=page.title,
                    page_id=page.id,
                    url=f"{CONFLUENCE_BASE}/wiki/spaces/{page.space_key}/pages/{page.id}",
                )
        except psycopg2.Error as exc:
            log.error("Supabase upsert failed for page %d: %s", page.id, exc)
            raise

    def get_pending_notifications(self, conn) -> list[dict]:
        """Return rows from confluence_pending_notifications view."""
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM public.confluence_pending_notifications ORDER BY changed_at DESC"
            )
            return list(cur.fetchall())

    def mark_notified(self, conn, log_id: int):
        """Mark a changelog row as notified."""
        with conn.cursor() as cur:
            cur.execute(
                "SELECT public.mark_confluence_notified(%s)",
                (log_id,)
            )

    def upsert_monitored_page_id(self, conn, page_id: int):
        """
        Ensure a page ID is in confluence_pages before monitoring.
        If it doesn't exist, insert a stub row so track_confluence_change() can update it.
        """
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.confluence_pages
                    (id, title, space_key, version_number, last_checked_at)
                VALUES (%s, 'unknown', %s, 0, NOW())
                ON CONFLICT (id) DO NOTHING
                """,
                (page_id, SPACE_KEY)
            )


# ---------------------------------------------------------------------------
# Discord webhook
# ---------------------------------------------------------------------------

def send_discord_notification(
    webhook_url: str,
    changes: list[ChangeResult],
    *,
    channel_mention: str = "",
    footer_text: str = "dashboard-f1 Confluence Monitor",
) -> bool:
    """
    Send a rich Discord embed to a webhook URL.

    - Max 1 request per call (Discord webhook accepts up to 10 embeds per payload).
    - Changes are grouped into a single embed with a field per page.
    - Up to 25 fields per embed, so we cap at 25.
    """
    if not changes:
        return True

    # Build field list
    fields = []
    for chg in changes[:25]:
        version_info = f"v{chg.old_version or '?'} → **v{chg.new_version}**" if chg.old_version else f"**v{chg.new_version}** (new)"
        field_value = f"[View page]({chg.url}) | {chg.summary}"
        fields.append({
            "name":   f"{chg.change_type.upper()} — {chg.page_title}",
            "value":  field_value[:1024],  # Discord field value limit
            "inline": False,
        })

    # Change-type colour map
    COLOUR_MAP = {
        "new":              0x57F287,   # green
        "updated":          0xFEE75C,   # yellow
        "content_changed":   0xFF6B6B,   # red
        "relabeled":        0x9B59B6,   # purple
    }
    colour = COLOUR_MAP.get(changes[0].change_type, 0x5865F2)  # default blurple

    payload = {
        "content": channel_mention or None,
        "embeds": [{
            "title":       f"📘 Confluence GPS Space — {len(changes)} change(s) detected",
            "color":       colour,
            "url":         f"{CONFLUENCE_BASE}/wiki/spaces/{SPACE_KEY}/overview",
            "description": f"**Space:** `{SPACE_KEY}` — Global Partner Retail Enablement\n"
                           f"**Pages checked:** {len(changes)}",
            "fields":      fields,
            "footer": {
                "text": footer_text,
            },
            "timestamp":   datetime.now(timezone.utc).isoformat(),
        }],
    }

    try:
        resp = requests.post(
            webhook_url,
            json=payload,
            timeout=DISCORD_TIMEOUT,
            headers={"User-Agent": "dashboard-f1-confluence-monitor/1.0"},
        )
        if resp.status_code == 204:
            log.info("Discord webhook sent successfully (%d changes)", len(changes))
            return True
        log.warning("Discord webhook returned %d: %s", resp.status_code, resp.text[:200])
        return False
    except requests.RequestException as exc:
        log.error("Discord webhook request failed: %s", exc)
        return False


def send_discord_daily_summary(webhook_url: str, stats: dict, footer_text: str = "dashboard-f1 Confluence Monitor") -> bool:
    """Send a daily summary embed when --dry-run is used (for testing)."""
    payload = {
        "embeds": [{
            "title":       "📋 Confluence Monitor — Dry Run Summary",
            "color":       0x5865F2,
            "description": "No actual changes were written or notified (dry-run mode).",
            "fields": [
                {"name": "Pages monitored", "value": str(stats.get("pages_checked", 0)), "inline": True},
                {"name": "Changes detected", "value": str(stats.get("changes_found", 0)), "inline": True},
                {"name": "New pages", "value": str(stats.get("new_pages", 0)), "inline": True},
            ],
            "footer": {"text": footer_text},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }],
    }
    try:
        resp = requests.post(webhook_url, json=payload, timeout=DISCORD_TIMEOUT)
        return resp.status_code == 204
    except requests.RequestException as exc:
        log.error("Discord dry-run summary failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def run_monitor(
    page_ids: list[int] | None,
    dry_run: bool = False,
    confluence_email: str | None = None,
    confluence_api_key: str | None = None,
    discord_webhook: str | None = None,
    supabase_url: str | None = None,
    supabase_srk: str | None = None,
    channel_mention: str = "",
) -> dict:
    """
    Full monitor run:
      1. Build page list (IDs from args OR from confluence_pages table).
      2. Fetch each page from Confluence API.
      3. Upsert + changelog via Supabase (skip if dry_run).
      4. Send Discord notifications for un-notified changes.
    """
    # --- Resolve secrets ---
    confluence_email    = confluence_email    or os.environ.get("CONFLUENCE_EMAIL", "")
    confluence_api_key  = confluence_api_key  or os.environ.get("CONFLUENCE_API_KEY", "")
    discord_webhook     = discord_webhook     or os.environ.get("DISCORD_WEBHOOK_URL", "")
    supabase_url        = supabase_url        or os.environ.get("SUPABASE_URL", "")
    supabase_srk        = supabase_srk        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    missing_secrets: list[str] = []
    if not confluence_email: missing_secrets.append("CONFLUENCE_EMAIL")
    if not confluence_api_key: missing_secrets.append("CONFLUENCE_API_KEY")
    if not supabase_url: missing_secrets.append("SUPABASE_URL")
    if not supabase_srk: missing_secrets.append("SUPABASE_SERVICE_ROLE_KEY")

    if missing_secrets:
        log.error("Missing required secrets: %s", ", ".join(missing_secrets))
        raise SystemExit(1)

    log.info("Starting Confluence monitor run — %d page(s)", len(page_ids) if page_ids else "all")

    # --- Supabase connection ---
    db = SupabaseDB(supabase_url, supabase_srk)

    try:
        conn = db.connect()
        log.info("Supabase connected OK")
    except Exception as exc:
        log.error("Cannot connect to Supabase: %s", exc)
        raise SystemExit(1)

    # Resolve page list - use DEFAULT_PAGES as source of truth for monitored pages
    if page_ids:
        # User provided specific page IDs - monitor only those
        target_ids = page_ids
        for pid in target_ids:
            db.upsert_monitored_page_id(conn, pid)
    else:
        # No specific pages provided - use DEFAULT_PAGES + CHANGE_LOG_PAGES
        target_ids = DEFAULT_PAGES.copy()
        # Also add change log pages to default monitoring
        target_ids.extend(CHANGE_LOG_PAGES)
        for pid in target_ids:
            db.upsert_monitored_page_id(conn, pid)

    # --- Confluence connection ---
    try:
        cf = ConfluenceClient(confluence_email, confluence_api_key)
        user = cf.get_current_user()
        log.info("Confluence authenticated as: %s", user.get("displayName", "unknown"))
    except Exception as exc:
        log.error("Confluence API authentication failed: %s", exc)
        raise SystemExit(1)

    # --- Fetch & process each page ---
    all_changes: list[ChangeResult] = []
    stats = {
        "pages_checked": 0,
        "changes_found": 0,
        "new_pages":     0,
    }

    for page_id in target_ids:
        log.info("Fetching page %d from Confluence …", page_id)
        try:
            page = cf.get_page(page_id)
        except Exception as exc:
            log.error("Failed to fetch page %d: %s", page_id, exc)
            continue

        stats["pages_checked"] += 1
        log.info(
            "  %s (ID %d) — v%d | author=%s",
            page.title, page.id, page.version_number,
            page.version_by_name or "unknown",
        )

        if dry_run:
            log.info("  [DRY-RUN] Would upsert page %d v%d", page.id, page.version_number)
            continue

        try:
            result = db.upsert_page_and_log(conn, page)
        except Exception as exc:
            log.error("Failed to upsert page %d to Supabase: %s", page_id, exc)
            continue

        if result:
            stats["changes_found"] += 1
            if result.change_type == "new":
                stats["new_pages"] += 1
            all_changes.append(result)
            log.warning(
                "  ⚠ CHANGE DETECTED: %s (%s) v%d → v%d",
                result.change_type.upper(),
                result.page_title,
                result.old_version or 0,
                result.new_version,
            )

    # --- Discord notifications ---
    if not dry_run and discord_webhook and all_changes:
        ok = send_discord_notification(discord_webhook, all_changes, channel_mention=channel_mention)
        if ok:
            for chg in all_changes:
                if chg.log_id:
                    db.mark_notified(conn, chg.log_id)
                    log.info("Marked changelog row %d as notified", chg.log_id)
        else:
            log.warning("Discord notification failed — %d rows left as un-notified", len(all_changes))

    elif dry_run and discord_webhook:
        send_discord_daily_summary(discord_webhook, stats)

    # --- Summary ---
    log.info("=" * 60)
    log.info("Run complete — pages_checked=%d changes=%d new=%d",
             stats["pages_checked"], stats["changes_found"], stats["new_pages"])
    if all_changes:
        for chg in all_changes:
            log.info("  %s: %s", chg.change_type.upper(), chg.summary)
    log.info("=" * 60)

    return stats


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Confluence GPS Space Monitor — compare pages against Supabase and notify Discord.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Secrets (all optional if already set as environment variables):
              CONFLUENCE_EMAIL          — Atlassian account email
              CONFLUENCE_API_KEY        — Atlassian API token (ATATT...)
              DISCORD_WEBHOOK_URL       — Discord incoming webhook
              SUPABASE_URL             — https://xxxx.supabase.co
              SUPABASE_SERVICE_ROLE_KEY — Supabase service role key

            Example (local, secrets via env):
              CONFLUENCE_EMAIL=you@wayfair.com CONFLUENCE_API_KEY=ATATT... \\
                DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \\
                SUPABASE_URL=https://xxx.supabase.co \\
                SUPABASE_SERVICE_ROLE_KEY=ey... \\
                python confluence_monitor.py

            Example (dry-run, no Supabase/Discord writes):
              python confluence_monitor.py --dry-run --page-id 1256185536
        """),
    )
    parser.add_argument(
        "--page-id", dest="page_id", type=int, action="append", default=[],
        help="Specific Confluence page ID to check (repeatable). "
             "If omitted, all page IDs from confluence_pages table are used.",
    )
    parser.add_argument(
        "--dry-run", dest="dry_run", action="store_true",
        help="Fetch from Confluence and print what would change, but do NOT "
             "write to Supabase or send Discord notifications.",
    )
    parser.add_argument(
        "--channel-mention", dest="channel_mention", default="",
        help="Discord channel mention string to prepend to the webhook (e.g. '<#123456789>')",
    )
    parser.add_argument(
        "--verbose", "-v", dest="verbose", action="store_true",
        help="Enable DEBUG-level logging.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    logging.getLogger().setLevel(logging.DEBUG if args.verbose else logging.INFO)

    page_ids = args.page_ids if args.page_ids else None

    run_monitor(
        page_ids=page_ids,
        dry_run=args.dry_run,
        channel_mention=args.channel_mention,
    )


if __name__ == "__main__":
    main()
