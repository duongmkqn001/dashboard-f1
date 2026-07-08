// Supabase Edge Function: tickets-import-drain
// ----------------------------------------------
// Continuously drains the tickets_import_queue and forwards each
// pending row to the appropriate Google Apps Script deployment URL.
//
// Triggered by:
//   1. pg_notify on channel "tickets_import_queue_inserted" (sent by the AFTER INSERT trigger)
//   2. pg_cron / external cron — every 1 minute as a safety net
//
// Auth: must include `x-import-secret` header matching IMPORT_DRAIN_SECRET env var.
//       The function uses service_role to bypass RLS on the queue table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMPORT_DRAIN_SECRET = Deno.env.get("IMPORT_DRAIN_SECRET") ?? "14092000";

const APPS_SCRIPT_URLS = {
  na: "https://script.google.com/macros/s/AKfycbzDXf9HPZi9NiJy-f8Enw9ZINljy2njMSWcZFXnrKCDzRPpAwwipIsTTMjP3lTtPZM07A/exec",
  eu: "https://script.google.com/macros/s/AKfycbxx70shS7RkOO0lWmn3bVSH1Mw5vNprz5RJYHMZakOfZSMbMipciaDBzKaAfU0TbxKl/exec",
  cn: "https://script.google.com/macros/s/AKfycbwNKt6FQzLZ0g7kL6tJ3xGQJv6LqGfT9zVxUcjK1qZpVxJ6Z-5XcYZK9pB/exec",
} as const;

interface QueueRow {
  queue_id: number;
  ticket_id: number;
}

interface AppsScriptResponse {
  success: boolean;
  error?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-import-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Secret-token auth so unauthenticated callers can't drain the queue.
  const providedSecret =
    req.headers.get("x-import-secret") ??
    new URL(req.url).searchParams.get("secret");
  if (providedSecret !== IMPORT_DRAIN_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("target") as keyof typeof APPS_SCRIPT_URLS | null;
  const batchSize = Number(url.searchParams.get("batch_size") ?? "10");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const targets: Array<keyof typeof APPS_SCRIPT_URLS> = target
    ? [target]
    : ["na", "eu", "mos", "cn"];

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ ticket_id: number; target: string; error: string }> = [];

  for (const t of targets) {
    // Claim a batch atomically with FOR UPDATE SKIP LOCKED
    const { data: rows, error: claimError } = await supabase.rpc(
      "claim_import_batch",
      { p_target: t, p_batch_size: batchSize },
    );

    if (claimError) {
      errors.push({ ticket_id: 0, target: t, error: `claim: ${claimError.message}` });
      continue;
    }

    const claimed = (rows ?? []) as QueueRow[];
    if (claimed.length === 0) continue;

    for (const row of claimed) {
      processed++;
      try {
        const ok = await forwardToAppsScript(t, row.ticket_id);
        if (ok) {
          await supabase.rpc("mark_ticket_import_success", {
            p_ticket_id: row.ticket_id,
            p_target: t,
          });
          succeeded++;
        } else {
          await supabase.rpc("mark_ticket_import_failed", {
            p_ticket_id: row.ticket_id,
            p_target: t,
            p_error: "Apps script responded success=false",
          });
          failed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.rpc("mark_ticket_import_failed", {
          p_ticket_id: row.ticket_id,
          p_target: t,
          p_error: msg,
        });
        failed++;
        errors.push({ ticket_id: row.ticket_id, target: t, error: msg });
      }
    }
  }

  return new Response(
    JSON.stringify({
      processed,
      succeeded,
      failed,
      errors: errors.slice(0, 25),
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

async function forwardToAppsScript(
  target: keyof typeof APPS_SCRIPT_URLS,
  ticketId: number,
): Promise<boolean> {
  const baseUrl = APPS_SCRIPT_URLS[target as keyof typeof APPS_SCRIPT_URLS] ??
    APPS_SCRIPT_URLS.na;

  const params = new URLSearchParams({
    secret: "14092000",
    ticketId: String(ticketId),
    source: "edge-drain",
  });

  if (target === "cn") params.set("action", "cn");
  if (target === "mos") params.set("action", "mos");

  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "GET",
    redirect: "follow",
  });

  if (!res.ok) return false;

  const text = await res.text();

  // Apps Script JSONP returns callback(json). Strip the wrapper if present.
  const stripped = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  let parsed: AppsScriptResponse | null = null;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return false;
  }
  return parsed?.success === true;
}
