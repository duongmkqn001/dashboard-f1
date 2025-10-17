-- ============================================================================
-- MOS SYSTEM OPTIMIZATION SQL SCRIPT
-- ============================================================================
-- This script optimizes the MOS (Management Operating System) for better performance
-- Run this in Supabase SQL Editor to apply all optimizations

-- ============================================================================
-- STEP 1: CREATE OPTIMIZED INDEXES FOR MOS SYSTEM
-- ============================================================================

-- Index for mos_requests table - optimize common queries
CREATE INDEX IF NOT EXISTS idx_mos_requests_status_ticket 
ON mos_requests(status, ticket_id);

CREATE INDEX IF NOT EXISTS idx_mos_requests_requester_status 
ON mos_requests(requester_id, status);

CREATE INDEX IF NOT EXISTS idx_mos_requests_responder_date 
ON mos_requests(responder_id, response_date);

CREATE INDEX IF NOT EXISTS idx_mos_requests_created_at 
ON mos_requests(created_at DESC);

-- Composite index for the most common MOS query (status = 'request')
CREATE INDEX IF NOT EXISTS idx_mos_requests_request_status 
ON mos_requests(ticket_id, description) WHERE status = 'request';

-- Index for tickets table MOS-related queries
CREATE INDEX IF NOT EXISTS idx_tickets_needmos
ON tickets("needMos") WHERE "needMos" IS NOT NULL;

-- Index for notifications MOS-related queries
CREATE INDEX IF NOT EXISTS idx_notifications_mos_type 
ON notifications(recipient_id, type, created_at) 
WHERE type IN ('mos_request', 'mos_approved', 'mos_rejected');

-- ============================================================================
-- STEP 2: CREATE MOS STATISTICS VIEW
-- ============================================================================

-- Create a materialized view for MOS statistics (refreshed periodically)
DROP MATERIALIZED VIEW IF EXISTS mos_stats_view;
CREATE MATERIALIZED VIEW mos_stats_view AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'request') as pending_requests,
    COUNT(*) FILTER (WHERE status = 'approved') as approved_requests,
    COUNT(*) FILTER (WHERE status = 'rejected') as rejected_requests,
    COUNT(DISTINCT requester_id) as unique_requesters,
    COUNT(DISTINCT responder_id) as unique_responders,
    AVG(EXTRACT(EPOCH FROM (response_date - created_at))/3600) FILTER (WHERE response_date IS NOT NULL) as avg_response_time_hours,
    DATE_TRUNC('day', NOW()) as stats_date
FROM mos_requests 
WHERE created_at >= NOW() - INTERVAL '30 days';

-- Create index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mos_stats_view_date 
ON mos_stats_view(stats_date);

-- ============================================================================
-- STEP 3: CREATE OPTIMIZED MOS FUNCTIONS
-- ============================================================================

-- Function to get MOS request count efficiently
CREATE OR REPLACE FUNCTION get_mos_request_count()
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
    SELECT COUNT(*)::INTEGER 
    FROM mos_requests 
    WHERE status = 'request';
$$;

-- Function to get MOS requests with details efficiently
CREATE OR REPLACE FUNCTION get_mos_requests_with_details(ticket_ids INTEGER[])
RETURNS TABLE (
    ticket_id INTEGER,
    description TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    requester_name TEXT,
    ticket_number TEXT
)
LANGUAGE SQL
STABLE
AS $$
    SELECT 
        mr.ticket_id,
        mr.description,
        mr.status,
        mr.created_at,
        va.name as requester_name,
        t.ticket as ticket_number
    FROM mos_requests mr
    LEFT JOIN vcn_agent va ON mr.requester_id = va.stt
    LEFT JOIN tickets t ON mr.ticket_id = t.id
    WHERE mr.ticket_id = ANY(ticket_ids)
    AND mr.status = 'request'
    ORDER BY mr.created_at DESC;
$$;

-- Function to refresh MOS statistics
CREATE OR REPLACE FUNCTION refresh_mos_stats()
RETURNS VOID
LANGUAGE SQL
AS $$
    REFRESH MATERIALIZED VIEW mos_stats_view;
$$;

-- ============================================================================
-- STEP 4: CREATE MOS PERFORMANCE MONITORING
-- ============================================================================

-- Table to track MOS system performance metrics
CREATE TABLE IF NOT EXISTS mos_performance_log (
    id BIGSERIAL PRIMARY KEY,
    operation_type TEXT NOT NULL, -- 'request', 'approve', 'reject', 'query'
    execution_time_ms INTEGER NOT NULL,
    ticket_id INTEGER,
    user_id INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance monitoring
CREATE INDEX IF NOT EXISTS idx_mos_performance_log_operation_time 
ON mos_performance_log(operation_type, created_at DESC);

-- Function to log MOS performance
CREATE OR REPLACE FUNCTION log_mos_performance(
    p_operation_type TEXT,
    p_execution_time_ms INTEGER,
    p_ticket_id INTEGER DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE SQL
AS $$
    INSERT INTO mos_performance_log (
        operation_type, 
        execution_time_ms, 
        ticket_id, 
        user_id, 
        error_message
    )
    VALUES (
        p_operation_type, 
        p_execution_time_ms, 
        p_ticket_id, 
        p_user_id, 
        p_error_message
    );
$$;

-- ============================================================================
-- STEP 5: CREATE MOS CLEANUP PROCEDURES
-- ============================================================================

-- Function to clean up old MOS requests (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_mos_requests()
RETURNS INTEGER
LANGUAGE SQL
AS $$
    WITH deleted AS (
        DELETE FROM mos_requests 
        WHERE created_at < NOW() - INTERVAL '90 days'
        AND status IN ('approved', 'rejected')
        RETURNING id
    )
    SELECT COUNT(*)::INTEGER FROM deleted;
$$;

-- Function to clean up old performance logs (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_mos_performance_logs()
RETURNS INTEGER
LANGUAGE SQL
AS $$
    WITH deleted AS (
        DELETE FROM mos_performance_log 
        WHERE created_at < NOW() - INTERVAL '30 days'
        RETURNING id
    )
    SELECT COUNT(*)::INTEGER FROM deleted;
$$;

-- ============================================================================
-- STEP 6: CREATE AUTOMATED MAINTENANCE
-- ============================================================================

-- Note: These would typically be set up as cron jobs or scheduled tasks
-- For now, they are functions that can be called manually or via application

-- Function to perform daily MOS maintenance
CREATE OR REPLACE FUNCTION daily_mos_maintenance()
RETURNS TEXT
LANGUAGE PLPGSQL
AS $$
DECLARE
    cleaned_requests INTEGER;
    cleaned_logs INTEGER;
    result_text TEXT;
BEGIN
    -- Refresh statistics
    PERFORM refresh_mos_stats();
    
    -- Clean up old data
    SELECT cleanup_old_mos_requests() INTO cleaned_requests;
    SELECT cleanup_old_mos_performance_logs() INTO cleaned_logs;
    
    -- Analyze tables for better query planning
    ANALYZE mos_requests;
    ANALYZE mos_performance_log;
    ANALYZE notifications;
    
    result_text := format(
        'Daily MOS maintenance completed. Cleaned %s old requests, %s old logs. Statistics refreshed.',
        cleaned_requests,
        cleaned_logs
    );
    
    RETURN result_text;
END;
$$;

-- ============================================================================
-- STEP 7: VERIFY OPTIMIZATIONS
-- ============================================================================

-- Query to check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE tablename IN ('mos_requests', 'tickets', 'notifications')
ORDER BY idx_scan DESC;

-- Query to check table statistics
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables 
WHERE tablename IN ('mos_requests', 'tickets', 'notifications')
ORDER BY tablename;

-- ============================================================================
-- STEP 8: USAGE EXAMPLES
-- ============================================================================

-- Example: Get current MOS request count
-- SELECT get_mos_request_count();

-- Example: Get MOS requests for specific tickets
-- SELECT * FROM get_mos_requests_with_details(ARRAY[123, 456, 789]);

-- Example: Run daily maintenance
-- SELECT daily_mos_maintenance();

-- Example: Check MOS statistics
-- SELECT * FROM mos_stats_view;

-- Example: Log a performance metric
-- SELECT log_mos_performance('request', 150, 123, 456);

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ MOS System Optimization Complete!';
    RAISE NOTICE '📊 Created optimized indexes for faster queries';
    RAISE NOTICE '📈 Created performance monitoring system';
    RAISE NOTICE '🧹 Created automated cleanup procedures';
    RAISE NOTICE '📋 Created statistics and monitoring views';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Your MOS system is now optimized for better performance!';
    RAISE NOTICE 'Run "SELECT daily_mos_maintenance();" periodically for maintenance.';
END $$;
