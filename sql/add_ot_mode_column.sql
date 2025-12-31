-- ============================================================================
-- ADD OT MODE SUPPORT TO TICKETS
-- ============================================================================
-- This SQL script adds support for OT (Overtime) Mode tracking
-- OT Mode tickets will be routed to the "OT Tracker" sheet in Google Sheets
-- ============================================================================

-- Step 1: Add ot_mode column to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS ot_mode BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN tickets.ot_mode IS 'Indicates if ticket should be tracked in OT Tracker sheet instead of regular Work tracker';

-- Step 2: Create index for faster filtering (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_tickets_ot_mode ON tickets(ot_mode) WHERE ot_mode = true;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the changes were applied successfully:

-- 1. Check if column exists
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'tickets' AND column_name = 'ot_mode';

-- 2. Check current OT mode tickets
-- SELECT COUNT(*) as ot_ticket_count 
-- FROM tickets 
-- WHERE ot_mode = true;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Update scriptgs.txt with new sheet ID
-- 3. Redeploy Google Apps Script
-- 4. Update js/dashboard-v2.js with OT Mode logic
-- ============================================================================
