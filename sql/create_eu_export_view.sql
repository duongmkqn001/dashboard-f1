-- ============================================================================
-- CREATE EU EXPORT VIEW FOR EU TEAM TICKETS
-- ============================================================================
-- This SQL script creates a separate view for EU team tickets with specific
-- columns: Ticket Number, Time Start, Time End, Ticket Type, Reason Escalate,
-- and Work Status
-- ============================================================================

-- Step 1: Add reason_escalate column to tickets table if it doesn't exist
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS reason_escalate TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN tickets.reason_escalate IS 'Reason for escalation when ticket ends with "Move to onshore - Unassign" status (EU team only)';

-- Step 2: Create EU export view
CREATE OR REPLACE VIEW public.tickets_export_eu_v AS
WITH base AS (
    SELECT
        t.id,
        t.ticket,
        t.issue_type,
        t.time_start,
        t.time_end,
        t.assignee_account,
        t.agent_handle_ticket,
        t.ticket_status_id,
        t.import_to_tracker,
        t.reason_escalate
    FROM tickets t
)
SELECT
    b.ticket AS "Ticket Number",
    to_char(
        (b.time_start AT TIME ZONE 'Asia/Ho_Chi_Minh'::text),
        'YYYY-MM-DD'::text
    ) AS "Date",
    to_char(
        (b.time_start AT TIME ZONE 'Asia/Ho_Chi_Minh'::text),
        'HH24:MI:SS'::text
    ) AS "Time Start",
    to_char(
        (b.time_end AT TIME ZONE 'Asia/Ho_Chi_Minh'::text),
        'HH24:MI:SS'::text
    ) AS "Time End",
    -- Ticket Type conversions: NA format → EU format
    CASE
        -- NA: "Cancellation Inquiry" → EU: "PWAO - Cancellation inquiry"
        WHEN TRIM(b.issue_type) = 'Cancellation Inquiry' THEN 'PWAO - Cancellation inquiry'

        -- NA: "Product Is Out of Stock" → EU: "PWAO - Product is out of stock"
        WHEN TRIM(b.issue_type) IN ('Product Is Out of Stock', 'Product Out of Stock') THEN 'PWAO - Product is out of stock'

        -- NA: "Update Tracking Number/Order Status" → EU: "PWAO - Update tracking number/Order Status"
        WHEN TRIM(b.issue_type) IN ('Update Tracking Number/Order Status', 'Update Tracking Number', 'Update Tracking Number/ Order Status')
            THEN 'PWAO - Update tracking number/Order Status'

        -- NA: "PO Reroutes" → EU: "PWAO - Reroute PO to a different warehouse"
        WHEN TRIM(b.issue_type) = 'PO Reroutes' THEN 'PWAO - Reroute PO to a different warehouse'

        -- NA: "Carrier Inquiry" / "Shipping/Carrier Questions" / "Email Request" → EU: "PWAO - Shipping/Carrier Questions"
        WHEN TRIM(b.issue_type) IN ('Carrier Inquiry', 'Shipping/Carrier Questions', 'Email Request')
            THEN 'PWAO - Shipping/Carrier Questions'

        -- NA: "Cannot Print Shipping Documents" → EU: "Cannot Print a BOL / Packing Slip or Shipping Label"
        WHEN TRIM(b.issue_type) IN ('Cannot Print Shipping Documents', 'Cannot Print a BOL / Packing Slip or Shipping Label')
            THEN 'Cannot Print a BOL / Packing Slip or Shipping Label'

        -- NA: "Change Pickup Carrier" → EU: "Change Pick up carrier"
        WHEN TRIM(b.issue_type) IN ('Change Pickup Carrier', 'Change Pick up carrier')
            THEN 'Change Pick up carrier'

        -- NA: "Change Ship Method - Not Shipped" → EU: "Change Ship Method on PO - Not Shipped"
        WHEN TRIM(b.issue_type) = 'Change Ship Method - Not Shipped'
            THEN 'Change Ship Method on PO - Not Shipped'

        -- NA: "Tier 1 - Adhoc Request" → EU: "Tier 1 - Adhoc Request Inbound"
        WHEN TRIM(b.issue_type) = 'Tier 1 - Adhoc Request'
            THEN 'Tier 1 - Adhoc Request Inbound'

        -- NA: "WDN" → EU: "WDN First Mile Supplier Outreach"
        WHEN TRIM(b.issue_type) = 'WDN'
            THEN 'WDN First Mile Supplier Outreach'

        -- If already has PWAO prefix, keep as is
        WHEN TRIM(b.issue_type) LIKE 'PWAO - %' THEN TRIM(b.issue_type)

        -- Default: keep original (for tickets already in correct EU format)
        ELSE TRIM(b.issue_type)
    END AS "Ticket Type",
    CASE
        WHEN ts.status_name = 'Move to onshore - Unassign' THEN b.reason_escalate
        ELSE NULL
    END AS "Reason Escalate",
    -- Ticket Status conversions: NA format → EU format
    CASE
        WHEN ts.status_name = 'Waiting for SU' THEN 'Waiting for Supplier'
        WHEN ts.status_name = 'Pending (Ask IH)' THEN 'Escalated for IH support'
        WHEN ts.status_name = 'Pause' THEN 'In Progress'
        WHEN ts.status_name = 'Move to onshore - Unassign' THEN 'Escalated for IH support'
        ELSE ts.status_name
    END AS "Work Status",
    va.name AS "Agent Name",
    a."Export_name" AS "Account",
    b.import_to_tracker
FROM base b
LEFT JOIN vcn_agent va ON va.stt = b.agent_handle_ticket
LEFT JOIN agent a ON a.agent_account = b.assignee_account
LEFT JOIN ticket_status ts ON ts.id = b.ticket_status_id
WHERE
    b.time_start IS NOT NULL
    AND b.time_end IS NOT NULL
    AND b.ticket_status_id IS NOT NULL
    AND b.agent_handle_ticket IS NOT NULL
    AND b.import_to_tracker = false
    AND a.team = 'EU'  -- Only EU team tickets
ORDER BY b.time_start DESC;

-- Add comment to the view
COMMENT ON VIEW public.tickets_export_eu_v IS 'Export view for EU team tickets with specific columns for EU tracker';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the changes were applied successfully:

-- 1. Check if reason_escalate column exists
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'tickets' AND column_name = 'reason_escalate';

-- 2. Check EU export view
-- SELECT * FROM tickets_export_eu_v LIMIT 10;

-- 3. Count EU tickets
-- SELECT COUNT(*) as eu_ticket_count 
-- FROM tickets_export_eu_v;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Create separate Google Apps Script for EU tracker
-- 3. Update dashboard UI to handle reason_escalate input for EU team
-- ============================================================================

