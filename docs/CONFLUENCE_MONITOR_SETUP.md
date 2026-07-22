# Confluence Monitor — Setup & Operations Guide

> Watches Confluence GPS space for page changes, stores a changelog in Supabase,
> and notifies your Discord server via webhook whenever a page is updated.

---

## Architecture Overview

```
GitHub Actions (cron: every 6 hours)
  └─► confluence_monitor.py
        │
        ├─► Confluence API ── fetch page version, body hash, labels
        │
        ├─► Supabase ── upsert page + write changelog
        │
        └─► Discord webhook ── send rich embed notification
```

**Trigger:** Every 6 hours (cron) OR manually from GitHub Actions UI.

---

## 0. Prerequisites

- GitHub repo: `https://github.com/duongmkqn001/dashboard-f1`
- Confluence access: `lle31@wayfair.com` (Wayfaircorp Atlassian)
- Supabase project: `pfbxtbydrjcmqlrklsdr`
- Discord server with a webhook-enabled channel

---

## 1. Run the SQL Migration (once)

This creates the database schema in Supabase.

**Option A — via Supabase SQL Editor (browser):**

1. Open: https://supabase.com/dashboard/project/pfbxtbydrjcmqlrklsdr/sql-editor
2. Click **New Query**
3. Paste the contents of `sql/confluence_changelog_setup.sql`
4. Click **Run**

**Option B — via Supabase CLI (local terminal):**

```bash
cd G:\web\dashboard-f1
npx supabase db execute --project-id pfbxtbydrjcmqlrklsdr \
  --file sql/confluence_changelog_setup.sql
```

Expected output:
```
✅ CONFLUENCE CHANGELOG MIGRATION COMPLETE
   • Tables:      public.confluence_pages, public.confluence_changelog
   • Functions:   track_confluence_change, mark_confluence_notified
   • Views:       confluence_pending_notifications, confluence_recent_changes
   • Seeded:      1 page (ID 1256185536 — Order to Delivery Journey - VCN)
```

**Verify the migration:**

```sql
SELECT * FROM public.confluence_pages;
-- Should show 1 row: ID 1256185536

SELECT * FROM public.confluence_recent_changes LIMIT 10;
-- Empty (no changes yet)
```

---

## 2. Add GitHub Secrets

Go to: `https://github.com/duongmkqn001/dashboard-f1/settings/secrets/actions`

Click **New repository secret** for each of these:

### Required Secrets

| Secret Name | Value | Where to get it |
|---|---|---|
| `CONFLUENCE_EMAIL` | `lle31@wayfair.com` | Your Atlassian email |
| `CONFLUENCE_API_KEY` | `ATATT3x...` | See instructions below |
| `SUPABASE_URL` | `https://pfbxtbydrjcmqlrklsdr.supabase.co` | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` | Supabase project → API → `service_role` key |
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/...` | See instructions below |

### How to get CONFLUENCE_API_KEY

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Label it: `dashboard-f1 monitor`
4. Copy the token (starts with `ATATT...`)
5. Paste as `CONFLUENCE_API_KEY` in GitHub Secrets

### How to get SUPABASE_SERVICE_ROLE_KEY

1. Go to https://supabase.com/dashboard/project/pfbxtbydrjcmqlrklsdr/settings/api
2. Under **service_role** (secret), click **Copy**
3. Paste as `SUPABASE_SERVICE_ROLE_KEY` in GitHub Secrets

> ⚠️ The `SERVICE_ROLE` key bypasses Row Level Security. Only store it in GitHub Secrets — never in frontend code or public files.

### How to get DISCORD_WEBHOOK_URL

1. Open Discord → Server → channel settings → Integrations → Webhooks
2. Click **Create Webhook** (or copy existing)
3. Name it: `Confluence Monitor`
4. Copy the webhook URL (format: `https://discord.com/api/webhooks/WEBHOOK_ID/TOKEN`)
5. Paste as `DISCORD_WEBHOOK_URL` in GitHub Secrets

**Optional:** If you want to ping a specific Discord channel role, note the channel ID and use `--channel-mention "<@&CHANNEL_ROLE_ID>"` in the workflow. For now, leave it blank.

---

## 3. Push the new files to GitHub

```bash
cd G:\web\dashboard-f1

git add sql/confluence_changelog_setup.sql
git add confluence_monitor.py
git add requirements.txt
git add .github/workflows/confluence-monitor.yml

git status
# Should show:
#   new file:   confluence_monitor.py
#   new file:   requirements.txt
#   new file:   .github/workflows/confluence-monitor.yml
#   new file:   sql/confluence_changelog_setup.sql

git commit -m "feat: add Confluence GPS space changelog monitor + Discord webhook

- sql/confluence_changelog_setup.sql: pages table, changelog, tracking functions
- confluence_monitor.py: Python monitor (Confluence API → Supabase → Discord)
- .github/workflows/confluence-monitor.yml: GitHub Actions (cron every 6h)
- requirements.txt: psycopg2-binary, atlassian-python-api, requests

Secrets required (add to GitHub Settings → Secrets → Actions):
  CONFLUENCE_EMAIL, CONFLUENCE_API_KEY, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, DISCORD_WEBHOOK_URL"

git push origin main
```

---

## 4. Verify the GitHub Actions workflow

1. Open: https://github.com/duongmkqn001/dashboard-f1/actions
2. You should see a new workflow **Confluence Monitor**
3. Click **Confluence Monitor** → **Run workflow** → **Run workflow**
4. Wait ~30 seconds for the run to complete
5. Click the run → check **monitor** job

Expected output (success):
```
2026-07-15Txx:xx:xx [INFO] Starting Confluence monitor run — 1 page(s)
2026-07-15Txx:xx:xx [INFO] Confluence authenticated as: Lam Le
2026-07-15Txx:xx:xx [INFO]   Order to Delivery Journey - VCN (ID 1256185536) — v2 | author=...
2026-07-15Txx:xx:xx [INFO] ============================================================
2026-07-15Txx:xx:xx [INFO] Run complete — pages_checked=1 changes=0 new=0
2026-07-15Txx:xx:xx [INFO] ============================================================
```

> First run: `changes=0` because the page is already in the DB with v2 — no version change.
> If the page had been updated since the last run, you'd see `changes=1` and a Discord notification.

---

## 5. Check the Discord notification

Open your Discord server → the channel where you created the webhook.

If a page version changes, you'll receive a rich embed like:

```
📘 Confluence GPS Space — 1 change(s) detected
Space: GPS — Global Partner Retail Enablement

⚠ CONTENT_CHANGED — Order to Delivery Journey - VCN
[View page](https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/1256185536)
v2 → v3

Footer: dashboard-f1 Confluence Monitor
Timestamp: 2026-07-15Txx:xx:xxZ
```

---

## 6. Monitor the changelog

Query in Supabase SQL Editor:

```sql
-- Recent changes (last 7 days)
SELECT * FROM public.confluence_recent_changes
ORDER BY changed_at DESC
LIMIT 20;

-- Pending notifications (not yet sent to Discord)
SELECT * FROM public.confluence_pending_notifications;

-- Full changelog
SELECT * FROM public.confluence_changelog
ORDER BY changed_at DESC
LIMIT 50;
```

---

## 7. Adding more pages to monitor

Edit the **SEED** section in `sql/confluence_changelog_setup.sql`:

```sql
INSERT INTO public.confluence_pages
    (id, title, space_key, version_number, root_url, last_checked_at)
VALUES
    (1256185536, 'Order to Delivery Journey - VCN', 'GPS', 2,
     'https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/1256185536', NOW()),
    -- ADD MORE PAGES HERE:
    -- (1234567890, 'Page Title', 'GPS', 1,
    --  'https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/1234567890', NOW())
ON CONFLICT (id) DO NOTHING;
```

Then re-run the migration (it's idempotent — `INSERT ... ON CONFLICT DO NOTHING`).

---

## 8. Changing the schedule

Edit `.github/workflows/confluence-monitor.yml`:

```yaml
schedule:
  # Every 6 hours (default)
  - cron: "0 */6 * * *"

  # Every hour:
  - cron: "0 */1 * * *"

  # Every 15 minutes:
  - cron: "*/15 * * * *"

  # Every day at 8am UTC:
  - cron: "0 8 * * *"
```

Push the change to trigger a new run.

---

## 9. Manual trigger

Go to: https://github.com/duongmkqn001/dashboard-f1/actions → Confluence Monitor → **Run workflow**

Options:
- **dry_run**: check pages without writing to Supabase or sending Discord
- **page_id**: check a specific page ID only
- **verbose**: show debug-level output

---

## 10. Troubleshooting

### `401 Unauthorized` — Confluence API
- Wrong email or API key
- API token expired → recreate at https://id.atlassian.com/manage-profile/security/api-tokens

### `could not read Username for 'https://github.com'` — push fails
- GitHub credentials not cached → run `gh auth login` or add a PAT

### Discord webhook returns `404`
- Webhook URL is wrong or the webhook was deleted/regenerated
- Re-create the webhook in Discord and update `DISCORD_WEBHOOK_URL` in GitHub Secrets

### Supabase connection fails
- `SUPABASE_SERVICE_ROLE_KEY` is wrong → copy fresh from Supabase dashboard
- Project is paused (free tier) → wake it up at https://supabase.com/dashboard

### Workflow doesn't appear in Actions tab
- Check that `.github/workflows/confluence-monitor.yml` is pushed to `main`
- The file must be on the default branch to trigger auto-discovery

### No changes detected even when Confluence page was updated
- The workflow may have run before the Confluence update propagated
- Check `confluence_pages.version_number` in Supabase — it should match Confluence
- Run the workflow manually to force a check

### Slack notification step fails (failure step)
- `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` are optional
- If not configured, the step is `continue-on-error: true` so it won't block
- Ignore this step — it's optional

---

## File Summary

| File | Purpose |
|------|---------|
| `sql/confluence_changelog_setup.sql` | Supabase schema (run once) |
| `confluence_monitor.py` | Python monitor script (runs in GitHub Actions) |
| `requirements.txt` | Python dependencies |
| `.github/workflows/confluence-monitor.yml` | GitHub Actions workflow (cron scheduler) |
| `docs/CONFLUENCE_API_DOCUMENTATION.md` | Existing API reference (already in repo) |
