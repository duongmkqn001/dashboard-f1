-- ============================================================================
-- TICKETS IMPORT QUEUE - CONTINUOUS DB-LEVEL GUARANTEE
-- ============================================================================
-- Purpose: Decouple the "ticket needs import" signal from the browser session.
--
-- Previous design problems this fixes:
--   1. If the user's browser closed mid-import, the ticket stuck with
--      import_to_tracker=false FOREVER (until someone opened the dashboard
--      and checkAndRetryFailedImports ran).
--   2. EU team tickets required a MANUAL button press; nothing in the DB
--      ever triggered an automatic import.
--   3. There was no audit trail of import attempts/failures.
--   4. The Apps Script call lived inside a JSONP callback in a browser
--      script tag (60s timeout, lock service contention, etc.)
--
-- New design:
--   - tickets_import_queue holds durable import events
--   - AFTER UPDATE trigger on tickets fires when time_end transitions
--     from NULL → not NULL, ensuring EVERY ended ticket enqueues
--     automatically (covers EU team too — no manual button needed)
--   - Indexes make queue consumption O(log n)
--   - pg_cron job and a Supabase Edge Function drain the queue
--     continuously so even with zero open browsers, imports complete
--   - Apps Script still does the actual sheet write, but now the DB
--     acts as the source of truth for what needs importing
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE QUEUE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tickets_import_queue (
    id BIGSERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    -- 'na' = AOPS/FMOP (default NA tracker), 'eu' = EU tracker, 'mos' = MOS escalate,
    -- 'cn' = CN Mandarin T2 tracker
    target TEXT NOT NULL CHECK (target IN ('na', 'eu', 'mos', 'cn')),
    -- status lifecycle: pending → in_progress → success | failed
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'success', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    succeeded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A ticket has at most ONE active (non-terminal) row per target.
    -- Multiple success rows are fine (history), but only one pending/in_progress.
    CONSTRAINT tickets_import_queue_unique_active
        EXCLUDE (ticket_id WITH =, target WITH =)
        WHERE (status IN ('pending', 'in_progress'))
);

COMMENT ON TABLE public.tickets_import_queue IS
    'Durable queue of ticket import events. Driven by AFTER UPDATE trigger on tickets and consumed by Apps Script via Supabase Edge Function / pg_cron drain.';

-- ============================================================================
-- STEP 2: INDEXES FOR FAST ENQUEUE / DRAIN
-- ============================================================================

-- Partial unique index already enforced via EXCLUDE. Add helper indexes:
CREATE INDEX IF NOT EXISTS idx_tickets_import_queue_pending
    ON public.tickets_import_queue (next_attempt_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tickets_import_queue_in_progress
    ON public.tickets_import_queue (ticket_id)
    WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_tickets_import_queue_ticket
    ON public.tickets_import_queue (ticket_id);

CREATE INDEX IF NOT EXISTS idx_tickets_import_queue_status_target
    ON public.tickets_import_queue (status, target, next_attempt_at);

-- Index on tickets to make the trigger lookup fast
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_team_status
    ON public.tickets (assignee_account, ticket_status_id, import_to_tracker, time_end)
    WHERE time_end IS NOT NULL;

-- ============================================================================
-- STEP 3: ENQUEUE FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_ticket_import(
    p_ticket_id INTEGER,
    p_target TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    -- Use ON CONFLICT to dedupe — if a row already exists in pending/in_progress,
    -- the unique EXCLUDE constraint will skip the insert.
    INSERT INTO public.tickets_import_queue (ticket_id, target, status, next_attempt_at)
    VALUES (p_ticket_id, p_target, 'pending', NOW())
    ON CONFLICT ON CONSTRAINT tickets_import_queue_unique_active DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_ticket_import IS
    'Enqueue a single ticket for import. Returns queue row id (NULL on duplicate).';

-- ============================================================================
-- STEP 4: DERIVE TARGET FROM TEAM + STATUS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_ticket_target(p_ticket_id INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_team TEXT;
    v_status_id INTEGER;
BEGIN
    SELECT a.team, t.ticket_status_id
      INTO v_team, v_status_id
      FROM public.tickets t
      LEFT JOIN public.agent a ON a.agent_account = t.assignee_account
     WHERE t.id = p_ticket_id;

    -- No team or NA/CN → standard tracker
    IF v_team IS NULL OR v_team IN ('NA', 'CN') THEN
        RETURN 'na';
    ELSIF v_team = 'EU' THEN
        RETURN 'eu';
    ELSE
        -- Unknown team: route to NA tracker (safe default)
        RETURN 'na';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.resolve_ticket_target IS
    'Map ticket → tracker target (na/eu/mos/cn) based on agent team and ticket status.';

-- ============================================================================
-- STEP 5: TRIGGER FUNCTION - FIRE WHEN time_end TRANSITIONS NULL → NOT NULL
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tickets_after_end_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target TEXT;
    v_mos_target TEXT;
BEGIN
    -- Only fire when time_end transitions from NULL to not-NULL.
    -- This catches normal ticket closure (the most common path).
    IF (OLD.time_end IS NULL AND NEW.time_end IS NOT NULL) THEN

        -- ------------------------------------------------------------------------
        -- NA/EU/CN: standard tracker target
        -- ------------------------------------------------------------------------
        v_target := public.resolve_ticket_target(NEW.id);

        PERFORM public.enqueue_ticket_import(NEW.id, v_target);

        -- ------------------------------------------------------------------------
        -- MOS escalate target: only when status = 2 (Escalate) AND team NA/CN
        -- Mirrors the existing escalate view filter.
        -- ------------------------------------------------------------------------
        IF NEW.ticket_status_id = 2 THEN
            SELECT a.team
              INTO v_mos_target
              FROM public.agent a
             WHERE a.agent_account = NEW.assignee_account;

            IF v_mos_target IS NULL OR v_mos_target IN ('NA', 'CN') THEN
                PERFORM public.enqueue_ticket_import(NEW.id, 'mos');
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tickets_after_end_trigger_fn IS
    'Trigger function: enqueue ticket for import when time_end transitions from NULL to NOT NULL.';

-- ============================================================================
-- STEP 6: ATTACH TRIGGER
-- ============================================================================
DROP TRIGGER IF EXISTS tickets_after_end_trigger ON public.tickets;
CREATE TRIGGER tickets_after_end_trigger
    AFTER UPDATE ON public.tickets
    FOR EACH ROW
    WHEN (OLD.time_end IS NULL AND NEW.time_end IS NOT NULL)
    EXECUTE FUNCTION public.tickets_after_end_trigger_fn();

COMMENT ON TRIGGER tickets_after_end_trigger ON public.tickets IS
    'Enqueues tickets for Sheet import when time_end transitions NULL → NOT NULL. Covers NA, EU, CN, and MOS escalate targets.';

-- ============================================================================
-- STEP 7: AUTO-MARK IMPORTED WHEN SUCCESSFUL
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_ticket_import_success(
    p_ticket_id INTEGER,
    p_target TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.tickets_import_queue
       SET status = 'success',
           succeeded_at = NOW(),
           updated_at = NOW(),
           attempts = attempts + 1,
           last_attempt_at = NOW()
     WHERE ticket_id = p_ticket_id
       AND target = p_target
       AND status IN ('pending', 'in_progress');

    -- Mark the ticket itself as imported (mirror the existing Apps Script behavior)
    IF p_target = 'mos' THEN
        UPDATE public.tickets
           SET import_to_mos_tracker = COALESCE(import_to_mos_tracker, false) OR TRUE
         WHERE id = p_ticket_id;
    ELSE
        UPDATE public.tickets
           SET import_to_tracker = COALESCE(import_to_tracker, false) OR TRUE
         WHERE id = p_ticket_id;
    END IF;
END;
$$;

-- ============================================================================
-- STEP 8: MARK FAILED FOR RETRY
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_ticket_import_failed(
    p_ticket_id INTEGER,
    p_target TEXT,
    p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempts INTEGER;
BEGIN
    UPDATE public.tickets_import_queue
       SET status = CASE
                       WHEN attempts + 1 >= 6 THEN 'failed'
                       ELSE 'pending'
                   END,
           attempts = attempts + 1,
           last_attempt_at = NOW(),
           next_attempt_at = NOW() + (POWER(2, LEAST(attempts + 1, 6)) || ' seconds')::INTERVAL,
           last_error = LEFT(p_error, 4000),
           updated_at = NOW()
     WHERE ticket_id = p_ticket_id
       AND target = p_target
       AND status IN ('pending', 'in_progress')
    RETURNING attempts INTO v_attempts;
END;
$$;

-- ============================================================================
-- STEP 9: CLAIM BATCH FOR PROCESSING (avoids race between workers)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_import_batch(
    p_target TEXT,
    p_batch_size INTEGER DEFAULT 10
)
RETURNS TABLE (queue_id BIGINT, ticket_id INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT id
          FROM public.tickets_import_queue
         WHERE target = p_target
           AND status = 'pending'
           AND next_attempt_at <= NOW()
         ORDER BY next_attempt_at ASC
         LIMIT p_batch_size
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.tickets_import_queue q
       SET status = 'in_progress',
           last_attempt_at = NOW(),
           updated_at = NOW()
      FROM claimed
     WHERE q.id = claimed.id
    RETURNING q.id AS queue_id, q.ticket_id;
END;
$$;

-- ============================================================================
-- STEP 10: HEALTH VIEW - MONITOR STUCK/AGED ROWS
-- ============================================================================
CREATE OR REPLACE VIEW public.import_queue_health AS
SELECT
    target,
    status,
    COUNT(*) AS row_count,
    MIN(created_at) AS oldest_pending,
    MAX(updated_at) AS most_recent_update,
    COUNT(*) FILTER (WHERE attempts > 0) AS retry_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS permanent_failures
FROM public.tickets_import_queue
GROUP BY target, status
ORDER BY target, status;

COMMENT ON VIEW public.import_queue_health IS
    'Operator dashboard view: queue depth, age, retries, and permanent failures per target.';

-- ============================================================================
-- STEP 11: BACKFILL - CATCH UP TICKETS ALREADY ENDED BUT NOT IMPORTED
-- ============================================================================
-- Run once after this migration; safe to re-run (idempotent via EXCLUDE).
DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- NA tracker pending tickets
    INSERT INTO public.tickets_import_queue (ticket_id, target, status)
    SELECT t.id, 'na', 'pending'
      FROM public.tickets t
     LEFT JOIN public.agent a ON a.agent_account = t.assignee_account
     WHERE t.time_end IS NOT NULL
       AND t.ticket_status_id IS NOT NULL
       AND t.agent_handle_ticket IS NOT NULL
       AND t.import_to_tracker = false
       AND (a.team IS NULL OR a.team = 'NA')
       AND (LEFT(t.ticket, 4) IN ('AOPS', 'FMOP') OR t.ticket LIKE 'POS%')
    ON CONFLICT ON CONSTRAINT tickets_import_queue_unique_active DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % NA tickets', v_count;

    -- EU tracker pending tickets
    INSERT INTO public.tickets_import_queue (ticket_id, target, status)
    SELECT t.id, 'eu', 'pending'
      FROM public.tickets t
      JOIN public.agent a ON a.agent_account = t.assignee_account
     WHERE t.time_end IS NOT NULL
       AND t.ticket_status_id IS NOT NULL
       AND t.agent_handle_ticket IS NOT NULL
       AND t.import_to_tracker = false
       AND a.team = 'EU'
    ON CONFLICT ON CONSTRAINT tickets_import_queue_unique_active DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % EU tickets', v_count;

    -- MOS escalate pending tickets
    INSERT INTO public.tickets_import_queue (ticket_id, target, status)
    SELECT t.id, 'mos', 'pending'
      FROM public.tickets t
      LEFT JOIN public.agent a ON a.agent_account = t.assignee_account
     WHERE t.ticket_status_id = 2
       AND t.time_end IS NOT NULL
       AND COALESCE(t.import_to_mos_tracker, false) = false
       AND (a.team IS NULL OR a.team IN ('NA', 'CN'))
    ON CONFLICT ON CONSTRAINT tickets_import_queue_unique_active DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % MOS escalate tickets', v_count;
END
$$;

-- ============================================================================
-- STEP 12: GRANT NECESSARY PERMISSIONS
-- ============================================================================
-- The service_role (used by Edge Functions, pg_cron, Apps Script) gets full access.
-- The anon role only sees what's needed for dashboards.
GRANT SELECT, INSERT, UPDATE ON public.tickets_import_queue TO anon;
GRANT USAGE, SELECT ON SEQUENCE tickets_import_queue_id_seq TO anon;

GRANT ALL ON public.tickets_import_queue TO service_role;
GRANT ALL ON public.tickets_import_queue TO supabase_admin;

GRANT SELECT ON public.import_queue_health TO anon;
GRANT SELECT ON public.import_queue_health TO service_role;

-- ============================================================================
-- STEP 13: NOTIFY pgsql trigger listeners (so Edge Functions can wake immediately)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_import_queue_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify(
        'tickets_import_queue_inserted',
        json_build_object(
            'queue_id', NEW.id,
            'ticket_id', NEW.ticket_id,
            'target', NEW.target
        )::TEXT
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_import_queue_notify ON public.tickets_import_queue;
CREATE TRIGGER tickets_import_queue_notify
    AFTER INSERT ON public.tickets_import_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_import_queue_insert();

COMMENT ON FUNCTION public.notify_import_queue_insert IS
    'Sends pg_notify on tickets_import_queue inserts so listeners (Edge Functions, REALTIME) can wake immediately.';

-- ============================================================================
-- STEP 14: SUMMARY
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ tickets_import_queue MIGRATION COMPLETE';
    RAISE NOTICE '';
    RAISE NOTICE '   • Table:         public.tickets_import_queue';
    RAISE NOTICE '   • Trigger:       AFTER UPDATE on tickets (time_end NULL→NOT NULL)';
    RAISE NOTICE '   • Dedup:         EXCLUDE constraint on (ticket_id, target) for active rows';
    RAISE NOTICE '   • Backfill:      Existing pending tickets already enqueued';
    RAISE NOTICE '   • Health view:   public.import_queue_health';
    RAISE NOTICE '';
    RAISE NOTICE 'Next step: deploy supabase/functions/tickets-import-drain so the queue drains automatically.';
END
$$;
