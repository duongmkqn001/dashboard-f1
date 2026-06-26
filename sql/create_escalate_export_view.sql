-- ============================================================================
-- ESCALATE TICKETS EXPORT VIEW FOR MOS TRACKING
-- ============================================================================
-- This script creates a view to export tickets that were ended with Escalate
-- status (id = 2) for MOS tracking purposes.
-- Only applies to NA and CN team agents (NOT EU).

-- ============================================================================
-- STEP 1: ADD COLUMNS TO TICKETS TABLE
-- ============================================================================

-- Add import_to_mos_tracker column to prevent duplicate export
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS import_to_mos_tracker BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tickets.import_to_mos_tracker IS 'Flag to prevent duplicate export to MOS tracker';

-- Add mos_detail column for MOS detail capture
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS mos_detail TEXT;

COMMENT ON COLUMN tickets.mos_detail IS 'MOS detail captured when ticket is ended with Escalate status (NA/CN only)';

-- ============================================================================
-- STEP 2: CREATE ESCALATE EXPORT VIEW
-- ============================================================================

DROP VIEW IF EXISTS public.tickets_escalate_v;

CREATE VIEW public.tickets_escalate_v AS
WITH base AS (
    SELECT
        t.id,
        t.ticket,
        t.issue_type,
        t.time_end,
        t.assignee_account,
        t.agent_handle_ticket,
        t.ticket_status_id,
        t.import_to_mos_tracker,
        t.mos_detail
    FROM tickets t
    LEFT JOIN agent a ON a.agent_account = t.assignee_account
    WHERE 
        -- Only tickets with Escalate status (id = 2)
        t.ticket_status_id = 2
        -- Only NA and CN team (exclude EU)
        AND (a.team IS NULL OR a.team IN ('NA', 'CN'))
        -- Must have been processed
        AND t.time_end IS NOT NULL
        -- Not yet exported to MOS tracker
        AND COALESCE(t.import_to_mos_tracker, false) = false
)
SELECT
    b.id,
    to_char(
        (b.time_end AT TIME ZONE 'Asia/Ho_Chi_Minh'),
        'MM/dd/yyyy'
    ) AS "Date Complete",
    va.name AS "Agent VCN",
    a."Export_name" AS "Account",
    b.ticket AS "Ticket Number",
    ('https://supporthub.service.csnzoo.com/browse/' || b.ticket) AS "Ticket URL",
    CASE
        -- Ticket Type conversions
        WHEN TRIM(b.issue_type) = 'Cannot Print a BOL / Packing Slip or Shipping Label' THEN 'Cannot Print Shipping Documents'
        WHEN TRIM(b.issue_type) = 'Product Out of Stock' THEN 'Product Is Out of Stock'
        WHEN TRIM(b.issue_type) = 'Shipping/Carrier Questions' THEN 'Carrier Inquiry'
        WHEN TRIM(b.issue_type) = 'WDN First Mile Supplier Outreach' THEN 'WDN'
        WHEN TRIM(b.issue_type) = 'Update Tracking Number/ Order Status' THEN 'Update Tracking Number/Order Status'
        WHEN TRIM(b.issue_type) = 'Change Pick up carrier' THEN 'Change Pickup Carrier'
        ELSE TRIM(b.issue_type)
    END AS "Ticket Type",
    b.mos_detail AS "MOS Detail",
    b.import_to_mos_tracker
FROM base b
LEFT JOIN vcn_agent va ON va.stt = b.agent_handle_ticket
LEFT JOIN agent a ON a.agent_account = b.assignee_account;

COMMENT ON VIEW public.tickets_escalate_v IS 'Export view for escalated tickets (status id=2) for MOS tracking - NA/CN agents only';

-- ============================================================================
-- STEP 3: CREATE INDEXES FOR OPTIMIZATION
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tickets_escalate_status 
ON tickets(ticket_status_id) WHERE ticket_status_id = 2;

CREATE INDEX IF NOT EXISTS idx_tickets_escalate_na_cn 
ON tickets(ticket_status_id, import_to_mos_tracker) 
WHERE ticket_status_id = 2;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check escalate view structure
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'tickets_escalate_v' 
-- ORDER BY ordinal_position;

-- Test view with sample data (if any exists)
-- SELECT * FROM tickets_escalate_v LIMIT 10;

-- Count escalate tickets not yet exported
-- SELECT COUNT(*) as pending_escalate_count FROM tickets_escalate_v;
