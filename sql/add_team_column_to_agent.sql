-- ============================================================================
-- ADD TEAM COLUMN TO AGENT TABLE FOR NA/EU SEPARATION
-- ============================================================================
-- This SQL script adds a team column to the agent table to distinguish
-- between NA (North America) and EU (Europe) teams.
-- ============================================================================

-- Step 1: Add team column to agent table
ALTER TABLE agent 
ADD COLUMN IF NOT EXISTS team TEXT DEFAULT 'NA';

-- Add comment explaining the column
COMMENT ON COLUMN agent.team IS 'Team region: NA (North America) or EU (Europe)';

-- Step 2: Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_agent_team ON agent(team);

-- Step 3: Set default value for existing records (optional - they will default to 'NA')
-- UPDATE agent SET team = 'NA' WHERE team IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the changes were applied successfully:

-- 1. Check if column exists
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'agent' AND column_name = 'team';

-- 2. Check current team distribution
-- SELECT team, COUNT(*) as agent_count 
-- FROM agent 
-- GROUP BY team;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Update agent records to set team='EU' for EU team members
-- 3. Update UI to show team selection in admin panel
-- ============================================================================

