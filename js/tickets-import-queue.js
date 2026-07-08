/**
 * TICKETS IMPORT QUEUE - FRONTEND INTEGRATION
 * -------------------------------------------
 * The previous "send ticket to Apps Script via JSONP" flow has been replaced
 * with a DB-side queue + Edge Function drain. The frontend now:
 *
 *   1. Reads tickets_import_queue (server is source of truth)
 *   2. Shows operator-visible count of pending/failed imports
 *   3. On end-ticket, optimistically pings Edge Function for instant processing
 *      but does NOT block on success - the cron job / pg_notify will retry.
 *
 * The OLD googleSheetsQueue is kept as a thin compatibility wrapper so that
 * existing call sites (sendTicketToGoogleSheets, etc.) continue to work, but
 * internally they now just notify the Edge Function and return. The Apps
 * Script URL is no longer called directly from the browser.
 */

const EDGE_DRAIN_URL_BASE = 'https://pfbxtbydrjcmqlrklsdr.supabase.co/functions/v1/tickets-import-drain';
const EDGE_DRAIN_SECRET = '14092000';  // Same secret token as Apps Script

const ticketsImportBridge = {
    /**
     * Notify the Edge Function drainer that work is available.
     * fire-and-forget; failures are silently absorbed because the pg_cron
     * safety-net job will pick up the same tickets within 60s.
     */
    async notify(target = 'na') {
        try {
            const url = `${EDGE_DRAIN_URL_BASE}?target=${encodeURIComponent(target)}&batch_size=20&secret=${encodeURIComponent(EDGE_DRAIN_SECRET)}`;
            // Use sendBeacon if available to avoid blocking the request on success
            if (navigator.sendBeacon) {
                const ok = navigator.sendBeacon(url);
                if (ok) return true;
            }
            // Fallback: best-effort fetch
            fetch(url, { method: 'GET', mode: 'no-cors', keepalive: true })
                .catch(() => {});
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Read live queue counts to show in the dashboard header.
     */
    async readHealth() {
        try {
            const { data, error } = await supabaseClient
                .from('import_queue_health')
                .select('*');
            if (error) {
                console.warn('Could not read import_queue_health:', error.message);
                return null;
            }
            return data;
        } catch (err) {
            console.warn('Could not read import_queue_health:', err);
            return null;
        }
    },

    /**
     * Render a small UI badge showing pending/failed counts.
     */
    async renderHealthBadge() {
        const health = await this.readHealth();
        if (!health) return;

        const pendingByTarget = {};
        const failedByTarget = {};
        for (const row of health) {
            const t = row.target;
            if (row.status === 'pending') pendingByTarget[t] = row.row_count;
            if (row.status === 'failed') failedByTarget[t] = row.row_count;
        }

        const pendingTotal = Object.values(pendingByTarget).reduce((a, b) => a + b, 0);
        const failedTotal = Object.values(failedByTarget).reduce((a, b) => a + b, 0);

        let badge = document.getElementById('import-queue-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'import-queue-badge';
            badge.style.cssText = `
                display:inline-block;
                margin-left:8px;
                padding:2px 8px;
                border-radius:10px;
                font-size:11px;
                background:#f1f5f9;
                color:#334155;
            `;
            const target = document.querySelector('.header-import-status') ?? document.body;
            target.appendChild(badge);
        }

        if (pendingTotal + failedTotal === 0) {
            badge.textContent = '✓ All imports complete';
            badge.style.background = '#d1fae5';
            badge.style.color = '#065f46';
        } else {
            badge.textContent = `Pending: ${pendingTotal} | Failed: ${failedTotal}`;
            badge.style.background = failedTotal > 0 ? '#fee2e2' : '#fef3c7';
            badge.style.color = failedTotal > 0 ? '#991b1b' : '#92400e';
        }
    },
};

// ============================================================================
// REPLACEMENT FOR OLD googleSheetsQueue
// ============================================================================
// Kept the variable name to avoid breaking every call site in dashboard-v2.js.
// The OLD code called Google Apps Script via JSONP. The NEW code:
//   1. Marks the ticket as import_to_tracker = false (already is)
//   2. Pings the Edge Function drainer (fire-and-forget)
//   3. Trusts the DB-side queue + cron job to actually do the work
// ============================================================================
const googleSheetsQueue = {
    queue: [],
    processing: false,
    retryAttempts: new Map(),
    teamMap: new Map(),
    maxRetries: 0, // No retries needed server-side handles this now

    clearQueue() {
        this.queue = [];
        this.retryAttempts.clear();
        this.teamMap.clear();
        this.processing = false;
    },

    /**
     * Compatibility entry point - just kicks the drainer, which is the
     * source of truth now.
     */
    add(ticketId, team = 'NA') {
        const target = team === 'EU' ? 'eu' : team === 'CN' ? 'cn' : 'na';
        ticketsImportBridge.notify(target);
        return true;
    },

    async processNext() {
        // No-op: server is now responsible.
        this.processing = false;
        return;
    },

    async checkIfImported(ticketId) {
        // Same as before - check the ticket's import_to_tracker flag
        try {
            const { data } = await supabaseClient
                .from('tickets')
                .select('import_to_tracker')
                .eq('id', ticketId)
                .single();
            return data?.import_to_tracker === true;
        } catch {
            return false;
        }
    },

    async logFailedImport(ticketId, error) {
        console.warn(`[ticketsImportBridge] Failed to import ticket ${ticketId}:`, error?.message ?? error);
    },
};

// ============================================================================
// REPLACEMENT FOR sendTicketToGoogleSheets / sendTicketToMOSTTracker
// ============================================================================
function sendTicketToGoogleSheets(ticketId, team = 'NA') {
    // DB-side queue handles the actual import. We just nudge the drainer.
    googleSheetsQueue.add(ticketId, team);
    return Promise.resolve({ success: true, queued: true });
}

function sendTicketToMOSTTracker(ticketId) {
    ticketsImportBridge.notify('mos');
    return Promise.resolve({ success: true, queued: true });
}

// Periodic health check (read-only) - decorative UI element
setInterval(() => {
    if (typeof ticketsImportBridge !== 'undefined') {
        ticketsImportBridge.renderHealthBadge();
    }
}, 30 * 1000);

setTimeout(() => ticketsImportBridge.renderHealthBadge(), 3000);

// Keep backward-compatible: periodic retry of pending imports is no longer
// needed because pg_cron + Edge Function handle this from the DB side.
// We keep a 6-hour safety check that surfaces stuck rows to the user.
async function checkAndRetryFailedImports() {
    try {
        const health = await ticketsImportBridge.readHealth();
        if (!health) return;

        const stuck = health.filter(r => r.status === 'failed');
        if (stuck.length > 0) {
            console.warn(`⚠️ ${stuck.length} failed imports detected — check Apps Script logs.`);
        }
    } catch (err) {
        console.warn('checkAndRetryFailedImports failed:', err);
    }
}

setInterval(checkAndRetryFailedImports, 6 * 60 * 60 * 1000);  // every 6 hours, was 10 minutes
setTimeout(checkAndRetryFailedImports, 60000);

console.log('✅ tickets-import-queue integration loaded (DB-side queue active)');
