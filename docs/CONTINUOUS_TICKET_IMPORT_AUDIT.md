# Continuous Ticket Import — Audit & Status (2026-07-09)

> **TL;DR** — The architectural fix already shipped in the previous session
> (`sql/create_tickets_import_queue.sql` + Edge Function drain +
> `js/tickets-import-queue.js` bridge).  The only thing missing was wiring the
> bridge script into `dashboard-v2.html`.  This audit delivers that wiring,
> tightens the frontend polling, and confirms the Cloudflare Worker
> alternative is feasible but optional.  No DB-level changes are required —
> applying `sql/create_tickets_import_queue.sql` once plus deploying the Edge
> Function makes every ticket import durable, audited, and retry-safe.

---

## 1. Audit findings

| # | Symptom in pre-fix system | Root cause | Status after this audit |
| - | ------------------------- | ---------- | ----------------------- |
| 1 | Frontend queues requests in `googleSheetsQueue` with 2s delays (`js/dashboard-v2.js`) | Browser-only queue; lost on tab close / network drop | Bridge script (`js/tickets-import-queue.js`) now wraps `googleSheetsQueue` as a fire-and-forget notify; DB owns the queue |
| 2 | `checkAndRetryFailedImports` runs every 10 minutes | Polled `tickets` directly with `eq('import_to_tracker', false)` — did not retry quickly | Replaced with a 60-second **read-only** health poll via `ticketsImportBridge.readHealth()`; the queue itself is drained by pg_cron (1 min) + Edge Function (pg_notify wake) |
| 3 | MOS tracker only fires for Escalate status (`ticket_status_id = 2`) on NA/CN | Trigger logic didn't include CN; EU was completely manual | DB trigger covers NA, EU, CN, MOS via `tickets_import_queue` with `target` discriminator |
| 4 | EU team used a manual button to trigger import | Browser-only path; nothing in DB knew | Trigger enqueues EU tickets on `time_end` transition |
| 5 | Apps Script `LockService` 60s timeout | All concurrent requests serialized through one lock | Edge Function uses `FOR UPDATE SKIP LOCKED` on `tickets_import_queue`; Apps Script remains sheet-write-only |
| 6 | Race condition: multiple users end tickets at once | JSONP callback collided with `LockService` | `EXCLUDE` constraint on `(ticket_id, target) WHERE status IN ('pending','in_progress')` prevents duplicate active rows |

## 2. Files shipped by this audit

| File | Purpose | What changed |
| ---- | ------- | ------------ |
| `dashboard-v2.html` | Entry point | Adds `<script src="./js/tickets-import-queue.js?v=20251206">` before the existing dashboard script (new) |
| `js/dashboard-v2.js` | Dashboard logic | (a) Comment-only clarification next to `sendTicketToGoogleSheets`. (b) Replaced the 10-min browser polling with a 60-second **read-only** health poll using `ticketsImportBridge.readHealth()` |
| `docs/CONTINUOUS_TICKET_IMPORT_AUDIT.md` | Operations doc | This file |

## 3. Files already shipped in earlier sessions (unchanged here)

| File | Role |
| ---- | ---- |
| `sql/create_tickets_import_queue.sql` | Queue table, indexes, AFTER UPDATE trigger, claim/mark RPCs, health view, `pg_notify`, backfill |
| `sql/pg_cron_drain_schedule.sql` | Every-1-min `pg_cron` job that calls the Edge Function |
| `supabase/functions/tickets-import-drain/index.ts` | Edge Function that drains `tickets_import_queue` and forwards rows to Google Apps Script |
| `js/tickets-import-queue.js` | Frontend bridge: replaces legacy `googleSheetsQueue` with thin no-op + notify-to-Edge, plus an operator-visible health badge |

## 4. Current DB state (verified via MCP Supabase on 2026-07-09)

| Concern | Status |
| ------- | ------ |
| Tables in `public` schema | 22 (`tickets`, `agent`, `ticket_status`, `vcn_agent`, `notifications`, `tickets_export_v`, `tickets_export_eu_v`, `tickets_escalate_v`, `mos_requests`, `kpi_per_task`, `schedule_assignments`, `auto_assignment_settings`, `agent_rotation_list`, `account_rotation_list`, `rotation_state`, `children`, `projects`, `templates`, `placeholders`, `suppliers`, `signatures`, `settings`) |
| Migrations applied | 5 (add_cn_template_columns, add_performance_indexes, add_import_to_mos_tracker_column, create_escalate_export_view, create_escalate_indexes) — the imports queue migration is **NOT** yet listed in `list_migrations` ⇒ must be applied |
| Extensions available | `pg_cron 1.6`, `pg_net 0.19.5`, `pgmq 1.4.4`, `http 1.6` — installed at the platform level; they show under the table but their `installed_version` is `null` for `pg_cron`, `pg_net`, `pgmq` so the operator must `CREATE EXTENSION` them after applying the queue migration if they were not pre-installed |
| Indexes on `tickets` | Existing indexes from `optimize_tickets_performance.sql` + `optimize_mos_system.sql` (incl. partial indexes on `import_to_tracker`, `ticket_status_id`) |
| Triggers on `tickets` | None currently defined — the queue migration adds one |
| Security advisor (critical) | Row Level Security is disabled on 19 public tables, including `tickets` and `agent`. **DO NOT auto-enable**: the anon key used by the dashboard would lose all access. See §6 below for the recommended remediation. |

## 5. Deployment steps

1. **Apply the queue migration** (in Supabase SQL editor or via MCP `apply_migration`):
   ```sql
   -- contents of sql/create_tickets_import_queue.sql
   ```
   Expected outcome: `tickets_import_queue` table, trigger, claim/mark RPCs, `import_queue_health` view, plus 8 backfilled rows (numbers depend on current pending tickets).

2. **(Optional)** Pre-install extensions if they aren't already:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pg_net;
   CREATE EXTENSION IF NOT EXISTS pgmq;
   ```

3. **Replace placeholders and run** `sql/pg_cron_drain_schedule.sql`:
   - `<PROJECT_REF>` → `pfbxtbydrjcmqlrklsdr`
   - `<DRAIN_SECRET>` → the value you set in `supabase secrets` next

4. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy tickets-import-drain --no-verify-jwt
   supabase secrets set IMPORT_DRAIN_SECRET=14092000
   ```

5. **Reload the dashboard** — `dashboard-v2.html` now includes `tickets-import-queue.js`. The legacy 10-min poll is replaced by the 60-second read-only health poll.

6. **Verify**:
   ```sql
   SELECT * FROM import_queue_health ORDER BY target, status;
   SELECT jobname FROM cron.job;
   ```

## 6. Security advisory — RLS deferred

The Supabase advisor flags 19 public tables (incl. `tickets` and `agent`) as
having RLS disabled.  Enabling RLS without policies would break the dashboard
(anon key).  This audit **does not** enable RLS but surfaces the remediation
SQL so the project owner can run it during a maintenance window after writing
policies:

```sql
ALTER TABLE public.settings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placeholders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_status             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vcn_agent                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_per_task              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mos_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_assignment_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rotation_list       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_rotation_list     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_state            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children                  ENABLE ROW LEVEL SECURITY;

-- Then add permissive policies for the dashboard's anon key, e.g.:
-- CREATE POLICY anon_select_tickets ON public.tickets FOR SELECT TO anon USING (true);
-- ... and similar SELECT/UPDATE policies for the columns the dashboard writes.
```

## 7. Cloudflare Worker feasibility

See `docs/CLOUDFLARE_WORKER_FEASIBILITY_ANALYSIS.md` for the long write-up
(already shipped in a prior session).  Summary:

- **Yes**, a Cloudflare Worker can fully replace Apps Script — proven
  approach with Sheets API, OAuth token, native cron triggers.
- **Hybrid is better now**: keep Apps Script for sheet writes, drive it from
  a Cloudflare Worker **or** a Supabase Edge Function.  This audit uses the
  Supabase Edge Function because the project is already on Supabase (no new
  vendor, no new deploy pipeline).
- **When to go full Worker**: if Apps Script's lock-contention becomes
  load-bearing, if you need multi-tenant scaling, or if a vendor policy
  forces you off Apps Script.
