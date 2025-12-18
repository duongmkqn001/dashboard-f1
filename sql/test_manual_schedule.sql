-- ============================================================================
-- MANUAL SCHEDULE SYSTEM - TEST SCRIPT
-- ============================================================================
-- Run this script AFTER running manual_schedule_complete_setup.sql
-- This will test all functionality and verify everything works correctly
-- ============================================================================

-- ============================================================================
-- TEST 1: Verify Tables Exist
-- ============================================================================

SELECT 'TEST 1: Checking if tables exist...' AS test_step;

SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_rotation_list') 
        THEN '✅ agent_rotation_list exists'
        ELSE '❌ agent_rotation_list MISSING'
    END AS agent_table_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'account_rotation_list') 
        THEN '✅ account_rotation_list exists'
        ELSE '❌ account_rotation_list MISSING'
    END AS account_table_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedule_assignments') 
        THEN '✅ schedule_assignments exists'
        ELSE '❌ schedule_assignments MISSING'
    END AS assignments_table_status;

-- ============================================================================
-- TEST 2: Verify Constraints
-- ============================================================================

SELECT 'TEST 2: Checking constraints...' AS test_step;

-- Check agent_rotation_list constraints
SELECT 
    'agent_rotation_list' AS table_name,
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'agent_rotation_list'::regclass
ORDER BY conname;

-- Check account_rotation_list constraints
SELECT 
    'account_rotation_list' AS table_name,
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'account_rotation_list'::regclass
ORDER BY conname;

-- ============================================================================
-- TEST 3: Verify Indexes
-- ============================================================================

SELECT 'TEST 3: Checking indexes...' AS test_step;

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('agent_rotation_list', 'account_rotation_list')
ORDER BY tablename, indexname;

-- ============================================================================
-- TEST 4: Verify Functions Exist
-- ============================================================================

SELECT 'TEST 4: Checking functions...' AS test_step;

SELECT 
    routine_name,
    routine_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_name LIKE '%manual_schedule%'
ORDER BY routine_name;

-- ============================================================================
-- TEST 5: Add Test Data
-- ============================================================================

SELECT 'TEST 5: Adding test data...' AS test_step;

-- Clear existing test data
DELETE FROM agent_rotation_list WHERE agent_id IN (SELECT stt FROM vcn_agent LIMIT 3);
DELETE FROM account_rotation_list WHERE account_export_name IN ('test_account_1', 'test_account_2');

-- Add test agents (using first 3 agents from vcn_agent table)
INSERT INTO agent_rotation_list (agent_id, rotation_order)
SELECT stt, ROW_NUMBER() OVER (ORDER BY stt)
FROM vcn_agent
WHERE status = 'active'
LIMIT 3
ON CONFLICT DO NOTHING;

-- Add test accounts
INSERT INTO account_rotation_list (account_export_name, rotation_order) VALUES 
    ('test_account_1', 1),
    ('test_account_2', 2)
ON CONFLICT DO NOTHING;

-- Verify test data was added
SELECT 'Agents added:' AS info, COUNT(*) AS count FROM agent_rotation_list WHERE is_active = true;
SELECT 'Accounts added:' AS info, COUNT(*) AS count FROM account_rotation_list WHERE is_active = true;

-- ============================================================================
-- TEST 6: Test get_next_manual_schedule_assignment Function
-- ============================================================================

SELECT 'TEST 6: Testing get_next_manual_schedule_assignment...' AS test_step;

-- Get next assignment for today
SELECT * FROM get_next_manual_schedule_assignment(CURRENT_DATE);

-- ============================================================================
-- TEST 7: Test Deactivating Agent (409 Error Fix)
-- ============================================================================

SELECT 'TEST 7: Testing agent deactivation (409 error fix)...' AS test_step;

-- Get first agent ID
DO $$
DECLARE
    test_agent_id INTEGER;
BEGIN
    SELECT id INTO test_agent_id FROM agent_rotation_list WHERE is_active = true LIMIT 1;
    
    IF test_agent_id IS NOT NULL THEN
        -- Deactivate the agent
        UPDATE agent_rotation_list SET is_active = false WHERE id = test_agent_id;
        RAISE NOTICE '✅ Successfully deactivated agent ID: %', test_agent_id;
        
        -- Try to deactivate again (this should NOT cause 409 error)
        UPDATE agent_rotation_list SET is_active = false WHERE id = test_agent_id;
        RAISE NOTICE '✅ Successfully deactivated agent again (no 409 error!)';
        
        -- Reactivate the agent for further tests
        UPDATE agent_rotation_list SET is_active = true WHERE id = test_agent_id;
        RAISE NOTICE '✅ Reactivated agent for further tests';
    ELSE
        RAISE NOTICE '⚠️ No agents found for testing';
    END IF;
END $$;

-- ============================================================================
-- TEST 8: View Current Rotation Lists
-- ============================================================================

SELECT 'TEST 8: Viewing rotation lists...' AS test_step;

-- View agent rotation list
SELECT 
    'AGENT ROTATION LIST' AS list_type,
    arl.rotation_order,
    va.name AS agent_name,
    arl.is_active
FROM agent_rotation_list arl
JOIN vcn_agent va ON arl.agent_id = va.stt
ORDER BY arl.rotation_order;

-- View account rotation list
SELECT 
    'ACCOUNT ROTATION LIST' AS list_type,
    rotation_order,
    account_export_name,
    is_active
FROM account_rotation_list
ORDER BY rotation_order;

-- ============================================================================
-- TEST 9: Clean Up Test Data (Optional)
-- ============================================================================

SELECT 'TEST 9: Cleaning up test data...' AS test_step;

-- Uncomment the lines below if you want to remove test data
-- DELETE FROM agent_rotation_list WHERE agent_id IN (SELECT stt FROM vcn_agent LIMIT 3);
-- DELETE FROM account_rotation_list WHERE account_export_name IN ('test_account_1', 'test_account_2');

SELECT '⚠️ Test data NOT removed. Uncomment lines in TEST 9 to clean up.' AS cleanup_status;

-- ============================================================================
-- TEST SUMMARY
-- ============================================================================

SELECT 'TEST SUMMARY' AS summary;

SELECT 
    '✅ All tests completed!' AS status,
    'If you see this message, the setup was successful.' AS message,
    'You can now add your real agents and accounts to the rotation lists.' AS next_step;

-- ============================================================================
-- NEXT STEPS
-- ============================================================================

/*
NEXT STEPS:

1. Add your real agents to rotation:
   INSERT INTO agent_rotation_list (agent_id, rotation_order) VALUES 
       (1, 1), (2, 2), (3, 3)
   ON CONFLICT DO NOTHING;

2. Add your real accounts to rotation:
   INSERT INTO account_rotation_list (account_export_name, rotation_order) VALUES 
       ('ln028f', 1), ('ad914r', 2)
   ON CONFLICT DO NOTHING;

3. Create assignment for today:
   SELECT create_manual_schedule_assignment(CURRENT_DATE);

4. Create assignments for next 7 weekdays:
   SELECT * FROM create_manual_schedule_assignments_for_next_days(7);

5. View assignments:
   SELECT sa.assignment_date, va.name, sa.account_export_name, sa.status
   FROM schedule_assignments sa
   JOIN vcn_agent va ON sa.agent_id = va.stt
   ORDER BY sa.assignment_date DESC;

6. Refresh your dashboard to see the banner/popup!
*/

