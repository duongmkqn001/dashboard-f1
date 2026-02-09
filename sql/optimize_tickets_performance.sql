-- ============================================================================
-- TICKETS TABLE PERFORMANCE OPTIMIZATION
-- ============================================================================
-- Run this in Supabase SQL Editor to dramatically improve pending tickets view

-- ============================================================================
-- STEP 1: CREATE CRITICAL INDEXES
-- ============================================================================

-- Primary index for pending tickets (time_end IS NULL)
CREATE INDEX IF NOT EXISTS idx_tickets_pending 
ON tickets(time_end, id DESC) 
WHERE time_end IS NULL;

-- Index for assignee filtering on pending tickets
CREATE INDEX IF NOT EXISTS idx_tickets_pending_assignee 
ON tickets(assignee_account, time_end, id DESC) 
WHERE time_end IS NULL;

-- Index for leader view (need_leader_support)
CREATE INDEX IF NOT EXISTS idx_tickets_leader_support 
ON tickets(need_leader_support, time_end, id DESC) 
WHERE need_leader_support = true AND time_end IS NULL;

-- Index for MOS view (needMos = 'request')
CREATE INDEX IF NOT EXISTS idx_tickets_mos_request 
ON tickets("needMos", time_end, id DESC) 
WHERE "needMos" = 'request' AND time_end IS NULL;

-- Composite index for normal view (excluding leader and MOS)
CREATE INDEX IF NOT EXISTS idx_tickets_normal_view 
ON tickets(time_end, id DESC) 
WHERE time_end IS NULL 
  AND (need_leader_support IS NULL OR need_leader_support = false)
  AND ("needMos" IS NULL OR "needMos" != 'request');

-- Index for ticket number lookups
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number 
ON tickets(ticket);

-- Index for PO grouping
CREATE INDEX IF NOT EXISTS idx_tickets_po 
ON tickets(po) 
WHERE po IS NOT NULL;

-- Index for time_start (used in rendering)
CREATE INDEX IF NOT EXISTS idx_tickets_time_start 
ON tickets(time_start) 
WHERE time_start IS NOT NULL;

-- ============================================================================
-- STEP 2: ANALYZE TABLES FOR QUERY PLANNER
-- ============================================================================

ANALYZE tickets;

-- ============================================================================
-- STEP 3: VERIFY INDEXES
-- ============================================================================

SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'tickets'
  AND indexname LIKE 'idx_tickets_%'
ORDER BY indexname;

-- ============================================================================
-- NOTES
-- ============================================================================
-- These indexes optimize the DASHBOARD pending tickets view only
-- They do NOT affect the tickets_export_v view used for Google Sheets import
-- The tickets_export_v view is already optimized and should not be changed

