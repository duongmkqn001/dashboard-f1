-- ============================================================================
-- SIGNATURE SETUP VERIFICATION SCRIPT
-- ============================================================================
-- This script helps verify that your agent signatures are properly configured
-- Run this to check if the signature_name field in agent table matches
-- the name field in signatures table
-- ============================================================================

-- Step 1: Check all signatures in the signatures table
SELECT 
    '=== SIGNATURES TABLE ===' AS info,
    id,
    name,
    title,
    department,
    "isDefault" as is_default
FROM signatures
ORDER BY "isDefault" DESC, name;

-- Step 2: Check all agents and their signature assignments
SELECT 
    '=== AGENT TABLE ===' AS info,
    agent_account,
    agent_name,
    signature_name,
    CASE 
        WHEN signature_name IS NULL THEN '⚠️ No signature assigned'
        ELSE '✓ Signature assigned'
    END as status
FROM agent
ORDER BY agent_name;

-- Step 3: Check for mismatches (agents with signature_name that doesn't exist in signatures table)
SELECT 
    '=== MISMATCHES (ERRORS) ===' AS info,
    a.agent_account,
    a.agent_name,
    a.signature_name as assigned_signature,
    '❌ Signature not found in signatures table' as error
FROM agent a
WHERE a.signature_name IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 
      FROM signatures s 
      WHERE s.name = a.signature_name
  );

-- Step 4: Check for agents without signature assignment
SELECT 
    '=== AGENTS WITHOUT SIGNATURE ===' AS info,
    agent_account,
    agent_name,
    '⚠️ Will use default signature' as note
FROM agent
WHERE signature_name IS NULL;

-- Step 5: Show the mapping (what signature each agent will use)
SELECT 
    '=== AGENT → SIGNATURE MAPPING ===' AS info,
    a.agent_account,
    a.agent_name,
    COALESCE(a.signature_name, '(default)') as will_use_signature,
    CASE 
        WHEN a.signature_name IS NOT NULL AND s.name IS NOT NULL THEN '✓ Valid'
        WHEN a.signature_name IS NULL THEN '⚠️ Using default'
        ELSE '❌ Invalid - signature not found'
    END as status,
    s.title as signature_title,
    s.department as signature_department
FROM agent a
LEFT JOIN signatures s ON s.name = a.signature_name
ORDER BY a.agent_name;

-- Step 6: Verify default signature exists
SELECT 
    '=== DEFAULT SIGNATURE CHECK ===' AS info,
    COUNT(*) as default_signature_count,
    CASE 
        WHEN COUNT(*) = 0 THEN '❌ No default signature set!'
        WHEN COUNT(*) = 1 THEN '✓ Default signature configured'
        ELSE '⚠️ Multiple default signatures (should only be one)'
    END as status
FROM signatures
WHERE "isDefault" = true;

-- ============================================================================
-- EXAMPLE: How to set signature_name for an agent
-- ============================================================================
-- Uncomment and modify the following to assign signatures to your agents:

-- UPDATE agent 
-- SET signature_name = 'John Doe'  -- Must match a name in signatures table
-- WHERE agent_account = 'john.doe@example.com';

-- UPDATE agent 
-- SET signature_name = 'Jane Smith'
-- WHERE agent_account = 'jane.smith@example.com';

-- ============================================================================
-- EXAMPLE: How to add a new signature
-- ============================================================================
-- Uncomment and modify to add new signatures:

-- INSERT INTO signatures (name, title, department, "isDefault")
-- VALUES ('John Doe', 'Senior Support Agent', 'Customer Support', false);

-- INSERT INTO signatures (name, title, department, "isDefault")
-- VALUES ('Jane Smith', 'Support Specialist', 'Technical Support', false);

