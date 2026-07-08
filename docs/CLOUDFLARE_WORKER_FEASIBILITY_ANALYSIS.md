# Cloudflare Worker as a Google Apps Script Replacement — Analysis

> **Question:** If we replace the existing Google Apps Script deployment with a
> Cloudflare Worker, would that work?
>
> **TL;DR:** Yes, technically — but it's a big rewrite for marginal benefit.
> The right move is **keep Apps Script as the Sheet writer**, but drive it
> from a Cloudflare Worker (or Supabase Edge Function) instead of the browser.
> See "Recommended path" at the bottom.

---

## Current architecture

```
┌──────────────────┐    JSONP (60s timeout, lock service)
│ dashboard-v2.js  │ ─────────────────────────────────────────────►  Google Apps Script
│ (browser)        │                                                  │
└──────────────────┘                                                  ▼
        │                                                 Google Sheets (Work tracker)
        │
        ▼
┌──────────────────┐
│ Supabase Postgres│  ← read by Apps Script directly
└──────────────────┘
```

Pain points:
1. **JSONP + 60s lock** in Apps Script — slow & brittle
2. **Browser-driven triggers** — lost when users close tabs
3. **EU team** requires manual button click (no automation)
4. **`scriptgs.txt` mixes 4 jobs** (AOPS, CN, MOS, batch) in one file
5. **Secret in JS bundle** (`14092000`) — anyone can see it
6. **No audit** beyond `Logger.log`
7. **10-min sync retry window** means tickets can sit in limbo up to 10 min
8. **No SLA, no monitoring**, no way to know if something's stuck without opening DevTools

---

## Proposed architecture A: full replacement with Cloudflare Worker

```
┌──────────────────┐
│ dashboard-v2.js  │ ──► Cloudflare Worker ──► Google Sheets
└──────────────────┘        │
                            ├─► Supabase to read tickets_export_v / _eu_v / _escalate_v
                            └─► Supabase to PATCH import_to_tracker
                            │
                            └─► pg_cron / DO cron trigger every 1 minute
```

### Feasibility — verified

| Need                                | Cloudflare Workers support?                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| HTTP fetch with POST/PATCH          | ✅ native `fetch`                                                                                                    |
| Google Sheets API (`sheets.spreadsheets.values.append`) | ✅ just need OAuth token as `env.SHEETS_OAUTH_TOKEN`                                                                 |
| Read from Supabase REST             | ✅ native `fetch`                                                                                                    |
| Write to Supabase REST              | ✅ native `fetch` (service_role key)                                                                                 |
| Cron trigger                        | ✅ Cron Triggers (free tier = 5 jobs, paid = up to 100)                                                              |
| Long-running batches                | ⚠️ 30s wall-clock on free plan, 5 min on paid Bundled plan, 15s CPU on free                                              |
| JSONP callback compatibility        | ❌ Workers don't return JS — must update the frontend to use fetch + CORS                                              |
| Streaming response                  | ✅                                                                                                                    |
| Logging                             | ✅ Workers Logs / Logpush / R2 dump                                                                                  |
| Secret storage                      | ✅ `env.SHEETS_OAUTH_TOKEN`, `env.SUPABASE_SERVICE_ROLE_KEY`                                                          |
| Edge locations                     | ✅ 200+ POPs — latency massively better than Apps Script (us-central1)                                               |

### What breaks if you replace Apps Script entirely

1. **Service account auth for Sheets** — need a Google Cloud project, OAuth,
   refresh-token rotation. NOT trivial the first time.
2. **No more triggers from inside Sheet** — you lose Apps Script onFormSubmit /
   onChange / custom menu buttons. (Probably you don't use them.)
3. **`clearHeaderCache()`, `fetchTicketFromView()`** — easy to port to TS but you
   keep all the formula-rewrite logic intact.
4. **EU team secret** is currently `14092000` in JS — replacing the script removes
   the leak vector **only if you also remove it from the frontend**.
5. **Webhook → Mongo / Slack / Jira / etc.** — Workers wins, hands down.

### Risks of full replacement

- **API quota**: Apps Script already gets 60 URL-Fetch / 30s execution. Replacing
  with Sheets API still has its own quota: 300 requests/min/user, 60 req/min/project.
  Worker batches of 50 rows = ~50 reads + 50 writes = 100 requests → fits.
- **OAuth token management**: refresh-token expiry, storage limits, secret rotation.
- **Operational complexity**: new deploy pipeline, wrangler, environment management,
  observability. Compared to "click Deploy in Apps Script editor" it's a step up.
- **Cost**: Apps Script free tier covers more than you'd think. Workers free tier
  is 100k req/day — easily enough for ~10k tickets/day. If you grow past that, paid
  tier is **$5/mo + usage** which is cheap.

### Benefits if you replace Apps Script entirely

| Benefit                                | Value                                                             |
| -------------------------------------- | ----------------------------------------------------------------- |
| Latency                                | Apps Script: 2–6 s/call. Worker: 80–250 ms/call. 10–30× faster.   |
| Lock contention                        | None — Workers isolate per request                                |
| Logs / observability                   | Workers Logs + Logpush, App Script just has `Logger.log`          |
| Multi-tenant scaling                   | Apps Script's quota is per-user; Workers is global                |
| Cron + retry logic                     | First-class; not possible inside Apps Script                      |
| Language choice                        | TS / JS / Rust                                                    |
| Branch deployments                    | Yes                                                               |
| Local testing                          | `wrangler dev` / `workerd`                                        |

---

## Proposed architecture B (recommended): hybrid

```
┌──────────────────┐    HTTPS (kept secret server-side)
│ dashboard-v2.js  │ ─────► Cloudflare Worker / Supabase Edge Function ──┐
└──────────────────┘                                                     │
                            ┌─────────────────────────────────────────────┤
                            │                                             │
                            ▼                                             ▼
                    pg_cron (every 1 min)                    Google Apps Script (sheets write only)
                            │                                             │
                            │                                             ▼
                            ▼                                    Google Sheets (Work tracker)
                   Postgres tickets_import_queue
                            │
                            ▼
                   AFTER UPDATE trigger → enqueue
```

What's the Worker responsible for?
- **Receives** "ticket X needs importing" from frontend (or cron).
- **Claims** a batch from `tickets_import_queue` (FOR UPDATE SKIP LOCKED).
- **Calls** Apps Script's `doGet` with the ticket ID.
- **Or**, calls Google Sheets API directly if you decide to fully migrate.
- **Records** success/failure (retry with exponential backoff).

What's Apps Script responsible for?
- **Just writes rows to the Sheet** — that's it.
- Drops all the JWT/secret/JSONP stuff.

### Why this is the sweet spot

- **Lowest risk**: keep the apps script that already works; harden the
  surrounding plumbing.
- **One-day migration**: Workers only need to wrap the existing
  `tickets_export_v` query and call the same Apps Script URL.
- **Best of both worlds**: latency win from Worker, reliability win from DB queue.
- **Future-proof**: when you're ready to drop Apps Script, you swap one HTTP
  endpoint and delete the script. Zero schema changes.

---

## Practical Cloudflare Worker code (architecture A's *core*, ~120 LOC)

```ts
// src/index.ts — deployed via `wrangler deploy`
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SHEETS_OAUTH_TOKEN: string;       // from Google Cloud service account
  SHEET_ID: string;
  SECRET_TOKEN: string;             // protects the worker URL
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") !== env.SECRET_TOKEN)
      return new Response("unauthorized", { status: 401 });

    const ticketId = url.searchParams.get("ticketId");
    const target = url.searchParams.get("target") ?? "na";
    if (!ticketId) return new Response("missing ticketId", { status: 400 });

    // 1. fetch the projection from Supabase
    const viewMap = { na: "tickets_export_v", eu: "tickets_export_eu_v",
                       mos: "tickets_escalate_v", cn: "tickets_export_cn_v" };
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/${viewMap[target]}?id=eq.${ticketId}&select=*`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                   authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
    const rows = await r.json();
    if (!rows.length) return new Response("not found", { status: 404 });

    // 2. append to Google Sheets via Sheets API
    const sheetName = sheetForTarget(target, rows[0]);
    const sResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`,
      { method: "POST",
        headers: { authorization: `Bearer ${env.SHEETS_OAUTH_TOKEN}`,
                   "content-type": "application/json" },
        body: JSON.stringify({ range: `${sheetName}!A1`,
          majorDimension: "ROWS",
          values: [rows[0] ? Object.values(rows[0]) : []] }) });
    if (!sResp.ok) return new Response("sheets failed", { status: 502 });

    // 3. mark imported
    await fetch(`${env.SUPABASE_URL}/rest/v1/tickets?id=eq.${ticketId}`, {
      method: "PATCH",
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                 authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                 "content-type": "application/json" },
      body: JSON.stringify({ import_to_tracker: target === "mos" ? undefined : true,
                              import_to_mos_tracker: target === "mos" ? true : undefined })
    });

    return new Response("ok", { status: 200 });
  },

  async scheduled(_: ScheduledEvent, env: Env) {
    // Drain the queue every minute (sister query to the worker fetch above)
    await fetch("https://example.workers.dev/drain?secret=" + env.SECRET_TOKEN);
  },
};

function sheetForTarget(target: string, _row: any): string {
  const map: Record<string,string> = {
    na: "Work tracker (AOPS)",
    eu: "EU Tracker",
    mos: "MOS",
    cn: "Work Tracker (Mandarin T2)"
  };
  return map[target] ?? map.na;
}
```

---

## Decision matrix

| Situation                                                          | Recommendation                          |
| ------------------------------------------------------------------ | --------------------------------------- |
| Latency complaints, lock contention on Apps Script                 | **Hybrid (arch. B)** — keep script, add Worker trigger |
| Need stricter SLA, dashboards, log alerting                        | **Hybrid (arch. B)**, add observability |
| Want to drop Apps Script entirely (e.g. compliance, vendor policy) | **Full replacement (arch. A)**           |
| Small dev team, low ops tolerance                                  | Keep Apps Script, add DB queue only      |
| Want cheapest, fastest, most reliable                             | Full Worker + Sheets API, DB queue       |

## Bottom line

- **Yes**, Cloudflare Workers can absolutely replace Google Apps Script.
- **No**, it's not free — you take on OAuth/Sheets API quota management.
- **Recommended**: do not replace Apps Script now. Instead:
  1. Put a **DB-side queue + trigger** in front of it (already implemented in
     `sql/create_tickets_import_queue.sql`).
  2. Drive the queue from an Edge Function **or** a Cloudflare Worker
     (both options work; Workers' Cron Triggers are nicer).
  3. Migrate Apps Script → Worker one HTTP call at a time, after the new
     pipeline proves out.
