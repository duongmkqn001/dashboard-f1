-- ============================================================================
-- PG_CRON SCHEDULE - SAFETY NET DRAIN
-- ============================================================================
-- This installs a pg_cron job that calls the tickets-import-drain Edge
-- Function every minute.  Even with all browser tabs closed, the DB
-- will continue draining the import queue through Apps Script.
--
-- pg_cron is already installed on Supabase (confirmed via list_extensions).
--
-- IMPORTANT: Replace the placeholders below before running.
--   <PROJECT_REF>:           your Supabase project reference (e.g. pfbxtbydrjcmqlrklsdr)
--   <DRAIN_SECRET>:          the IMPORT_DRAIN_SECRET you configured in Edge Function secrets
-- ============================================================================

-- Replace these two placeholders before running:
--   <PROJECT_REF>:    pfbxtbydrjcmqlrklsdr
--   <DRAIN_SECRET>:   <DRAIN_SECRET>

DO $$
DECLARE
    v_url TEXT := 'https://<PROJECT_REF>.supabase.co/functions/v1/tickets-import-drain?batch_size=10&secret=<DRAIN_SECRET>';
    v_job_id BIGINT;
BEGIN
    -- Ensure unique job
    PERFORM 1 FROM cron.job WHERE jobname = 'drain_tickets_import_queue';

    IF NOT FOUND THEN
        v_job_id := cron.schedule(
            'drain_tickets_import_queue',
            '* * * * *',
            $cmd$ SELECT net.http_get(
                url := 'https://<PROJECT_REF>.supabase.co/functions/v1/tickets-import-drain?batch_size=10&secret=<DRAIN_SECRET>',
                headers := jsonb_build_object('Content-Type', 'application/json')
            ); $cmd$
        );

        RAISE NOTICE 'pg_cron job installed with id %', v_job_id;
    ELSE
        RAISE NOTICE 'pg_cron job drain_tickets_import_queue already exists; skipping';
    END IF;
END
$$;

-- Verify the job
SELECT jobname, schedule, command
  FROM cron.job
 WHERE jobname = 'drain_tickets_import_queue';
