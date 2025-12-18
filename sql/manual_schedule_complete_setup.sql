-- ============================================================================
-- MANUAL SCHEDULE SYSTEM - COMPLETE DATABASE SETUP
-- ============================================================================
-- This SQL file creates all necessary tables and functions for the manual
-- schedule assignment system with SEPARATE agent and account rotation lists.
--
-- Key Features:
-- - Separate rotation lists for agents and accounts
-- - Round-robin assignment: agent[i] → account[i % account_count]
-- - Automatic weekend skipping
-- - Based on most recently assigned agent (not rotation_order)
-- - Vietnamese notifications
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP OLD FUNCTIONS AND FIX CONSTRAINTS
-- ============================================================================

-- Drop old functions if they exist (to avoid return type conflicts)
DROP FUNCTION IF EXISTS get_next_manual_schedule_assignment(DATE);
DROP FUNCTION IF EXISTS create_manual_schedule_assignment(DATE);
DROP FUNCTION IF EXISTS create_manual_schedule_assignments_for_next_days(INTEGER);

DO $$
BEGIN
    -- Drop problematic unique constraints if they exist
    ALTER TABLE IF EXISTS agent_rotation_list
        DROP CONSTRAINT IF EXISTS agent_rotation_list_agent_id_is_active_key CASCADE;

    ALTER TABLE IF EXISTS account_rotation_list
        DROP CONSTRAINT IF EXISTS account_rotation_list_account_export_name_is_active_key CASCADE;

    RAISE NOTICE 'Old constraints and functions dropped (if they existed)';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Tables do not exist yet, skipping constraint drop';
END $$;

-- ============================================================================
-- STEP 2: CREATE TABLES
-- ============================================================================

-- Table 1: Agent Rotation List
-- Stores the list of agents who will be assigned manual schedule tasks
CREATE TABLE IF NOT EXISTS agent_rotation_list (
    id BIGSERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES vcn_agent(stt) ON DELETE CASCADE,
    rotation_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create partial unique index - only enforce uniqueness for active=true entries
-- This allows multiple inactive entries for the same agent without conflict
DROP INDEX IF EXISTS agent_rotation_list_agent_active_unique;
CREATE UNIQUE INDEX agent_rotation_list_agent_active_unique 
ON agent_rotation_list(agent_id) WHERE is_active = true;

COMMENT ON TABLE agent_rotation_list IS 'Stores the rotation list of agents for manual schedule assignments';
COMMENT ON COLUMN agent_rotation_list.rotation_order IS 'Order in which this agent will be assigned (lower numbers first)';

-- Table 2: Account Rotation List
-- Stores the list of accounts that will be assigned for manual schedule tasks
CREATE TABLE IF NOT EXISTS account_rotation_list (
    id BIGSERIAL PRIMARY KEY,
    account_export_name TEXT NOT NULL,
    rotation_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create partial unique index - only enforce uniqueness for active=true entries
-- This allows multiple inactive entries for the same account without conflict
DROP INDEX IF EXISTS account_rotation_list_account_active_unique;
CREATE UNIQUE INDEX account_rotation_list_account_active_unique 
ON account_rotation_list(account_export_name) WHERE is_active = true;

COMMENT ON TABLE account_rotation_list IS 'Stores the rotation list of accounts for manual schedule assignments';
COMMENT ON COLUMN account_rotation_list.rotation_order IS 'Order in which this account will be assigned (lower numbers first)';

-- Table 3: Schedule Assignments
-- Stores the actual assignments for each date
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id BIGSERIAL PRIMARY KEY,
    assignment_date DATE NOT NULL,
    agent_id INTEGER NOT NULL REFERENCES vcn_agent(stt) ON DELETE CASCADE,
    account_export_name TEXT NOT NULL,
    assignment_type TEXT NOT NULL CHECK (assignment_type IN ('manual', 'auto')),
    status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'started', 'completed', 'cancelled')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES vcn_agent(stt),
    UNIQUE(assignment_date, agent_id)
);

COMMENT ON TABLE schedule_assignments IS 'Stores actual schedule assignments for each date';
COMMENT ON COLUMN schedule_assignments.assignment_type IS 'Whether this was manually assigned or auto-generated';

-- Table 4: Auto Assignment Settings
-- Stores settings for automatic assignment generation
CREATE TABLE IF NOT EXISTS auto_assignment_settings (
    id BIGSERIAL PRIMARY KEY,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by INTEGER REFERENCES vcn_agent(stt)
);

COMMENT ON TABLE auto_assignment_settings IS 'Configuration settings for automatic assignment generation';

-- ============================================================================
-- STEP 3: INSERT DEFAULT SETTINGS
-- ============================================================================

INSERT INTO auto_assignment_settings (setting_key, setting_value, description) VALUES
    ('auto_assignment_enabled', 'false', 'Enable/disable automatic assignment generation'),
    ('assignment_frequency', 'daily', 'Frequency of auto assignments: daily, weekly, monthly'),
    ('notification_message', 'Bạn được phân công xử lý Manual Schedule hôm nay.', 'Default notification message for assignments'),
    ('skip_weekends', 'true', 'Skip Saturday and Sunday when generating assignments')
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ============================================================================
-- STEP 4: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_rotation_list_active ON agent_rotation_list(is_active, rotation_order);
CREATE INDEX IF NOT EXISTS idx_account_rotation_list_active ON account_rotation_list(is_active, rotation_order);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_date ON schedule_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_agent ON schedule_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_status ON schedule_assignments(status);

-- ============================================================================
-- STEP 5: CREATE FUNCTIONS
-- ============================================================================

-- Function to get the next assignment (agent + account pair)
-- This function finds the next agent based on the most recently assigned agent
-- and pairs them with the appropriate account using round-robin
CREATE OR REPLACE FUNCTION get_next_manual_schedule_assignment(target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    out_agent_id INTEGER,
    out_agent_name TEXT,
    out_account_export_name TEXT
) AS $$
DECLARE
    v_last_assigned_agent_id INTEGER;
    v_last_agent_rotation_order INTEGER;
    v_next_agent_rotation_order INTEGER;
    v_total_agents INTEGER;
    v_total_accounts INTEGER;
    v_account_index INTEGER;
    v_is_weekend BOOLEAN;
BEGIN
    -- Check if target date is a weekend (Saturday = 6, Sunday = 0)
    v_is_weekend := EXTRACT(DOW FROM target_date) IN (0, 6);

    IF v_is_weekend THEN
        RAISE NOTICE 'Target date % is a weekend, skipping assignment', target_date;
        RETURN;
    END IF;

    -- Check if assignment already exists for this date
    IF EXISTS (SELECT 1 FROM schedule_assignments sa WHERE sa.assignment_date = target_date) THEN
        RAISE NOTICE 'Assignment already exists for %', target_date;
        RETURN;
    END IF;

    -- Get total number of active agents and accounts
    SELECT COUNT(*) INTO v_total_agents FROM agent_rotation_list arl WHERE arl.is_active = true;
    SELECT COUNT(*) INTO v_total_accounts FROM account_rotation_list acl WHERE acl.is_active = true;

    IF v_total_agents = 0 THEN
        RAISE EXCEPTION 'No active agents found in agent_rotation_list';
    END IF;

    IF v_total_accounts = 0 THEN
        RAISE EXCEPTION 'No active accounts found in account_rotation_list';
    END IF;

    -- Find the most recently assigned agent (by actual assignment date, not rotation_order)
    SELECT sa.agent_id INTO v_last_assigned_agent_id
    FROM schedule_assignments sa
    WHERE sa.assignment_date < target_date
    ORDER BY sa.assignment_date DESC
    LIMIT 1;

    IF v_last_assigned_agent_id IS NULL THEN
        -- No previous assignments, start from the first agent and first account
        RAISE NOTICE 'No previous assignments found, starting from first agent and account';
        RETURN QUERY
        SELECT
            arl.agent_id,
            va.name,
            acl.account_export_name
        FROM agent_rotation_list arl
        CROSS JOIN account_rotation_list acl
        JOIN vcn_agent va ON arl.agent_id = va.stt
        WHERE arl.is_active = true AND acl.is_active = true
        ORDER BY arl.rotation_order ASC, acl.rotation_order ASC
        LIMIT 1;
    ELSE
        -- Find the rotation_order of the last assigned agent
        SELECT arl.rotation_order INTO v_last_agent_rotation_order
        FROM agent_rotation_list arl
        WHERE arl.agent_id = v_last_assigned_agent_id AND arl.is_active = true;

        IF v_last_agent_rotation_order IS NULL THEN
            -- Last assigned agent is not in rotation list anymore, start from beginning
            RAISE NOTICE 'Last assigned agent not in rotation list, starting from first agent';
            v_next_agent_rotation_order := 1;
        ELSE
            -- Get the next agent rotation order (wrap around if needed)
            SELECT arl.rotation_order INTO v_next_agent_rotation_order
            FROM agent_rotation_list arl
            WHERE arl.is_active = true AND arl.rotation_order > v_last_agent_rotation_order
            ORDER BY arl.rotation_order ASC
            LIMIT 1;

            IF v_next_agent_rotation_order IS NULL THEN
                -- We're at the end, wrap around to the first agent
                SELECT arl.rotation_order INTO v_next_agent_rotation_order
                FROM agent_rotation_list arl
                WHERE arl.is_active = true
                ORDER BY arl.rotation_order ASC
                LIMIT 1;
            END IF;
        END IF;

        -- Calculate which account to assign based on agent rotation order
        -- This ensures agent[i] gets account[i % total_accounts]
        v_account_index := (v_next_agent_rotation_order - 1) % v_total_accounts;

        -- Get the agent and account
        RETURN QUERY
        SELECT
            arl.agent_id,
            va.name,
            acl.account_export_name
        FROM agent_rotation_list arl
        CROSS JOIN account_rotation_list acl
        JOIN vcn_agent va ON arl.agent_id = va.stt
        WHERE arl.is_active = true
          AND acl.is_active = true
          AND arl.rotation_order = v_next_agent_rotation_order
          AND acl.rotation_order = (v_account_index + 1)
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_manual_schedule_assignment IS 'Determines the next agent-account pair for assignment based on most recent assignment';

-- Function to create assignment for a specific date
CREATE OR REPLACE FUNCTION create_manual_schedule_assignment(target_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
DECLARE
    next_assignment RECORD;
    is_weekend BOOLEAN;
BEGIN
    -- Check if target date is a weekend
    is_weekend := EXTRACT(DOW FROM target_date) IN (0, 6);
    
    IF is_weekend THEN
        RAISE NOTICE 'Skipping assignment for weekend date: %', target_date;
        RETURN;
    END IF;

    -- Check if assignment already exists
    IF EXISTS (SELECT 1 FROM schedule_assignments WHERE assignment_date = target_date) THEN
        RAISE NOTICE 'Assignment already exists for %', target_date;
        RETURN;
    END IF;

    -- Get next assignment
    SELECT * INTO next_assignment FROM get_next_manual_schedule_assignment(target_date);

    IF next_assignment IS NULL THEN
        RAISE EXCEPTION 'Could not determine next assignment for %', target_date;
    END IF;

    -- Create the assignment
    INSERT INTO schedule_assignments (
        assignment_date,
        agent_id,
        account_export_name,
        assignment_type,
        status
    ) VALUES (
        target_date,
        next_assignment.agent_id,
        next_assignment.account_export_name,
        'auto',
        'assigned'
    );

    -- Create notification for the assigned agent
    INSERT INTO notifications (
        recipient_id,
        message,
        type,
        read
    ) VALUES (
        next_assignment.agent_id,
        'Bạn được phân công xử lý Manual Schedule cho tài khoản ' || next_assignment.account_export_name || ' vào ngày ' || target_date,
        'manual_schedule',
        false
    );

    RAISE NOTICE 'Created assignment for % on % (agent: %, account: %)', 
        next_assignment.agent_name, target_date, next_assignment.agent_id, next_assignment.account_export_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_manual_schedule_assignment IS 'Creates a manual schedule assignment for a specific date';

-- Function to create assignments for the next N weekdays
CREATE OR REPLACE FUNCTION create_manual_schedule_assignments_for_next_days(num_days INTEGER DEFAULT 7)
RETURNS TABLE (
    assignment_date DATE,
    agent_name TEXT,
    account_export_name TEXT,
    status TEXT
) AS $$
DECLARE
    current_date DATE := CURRENT_DATE;
    days_created INTEGER := 0;
    attempt_date DATE;
    is_weekend BOOLEAN;
BEGIN
    attempt_date := current_date;

    WHILE days_created < num_days LOOP
        -- Check if it's a weekend
        is_weekend := EXTRACT(DOW FROM attempt_date) IN (0, 6);

        IF NOT is_weekend THEN
            -- Try to create assignment
            BEGIN
                PERFORM create_manual_schedule_assignment(attempt_date);
                days_created := days_created + 1;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Failed to create assignment for %: %', attempt_date, SQLERRM;
            END;
        END IF;

        -- Move to next day
        attempt_date := attempt_date + INTERVAL '1 day';
    END LOOP;

    -- Return the created assignments
    RETURN QUERY
    SELECT sa.assignment_date, va.name, sa.account_export_name, sa.status
    FROM schedule_assignments sa
    JOIN vcn_agent va ON sa.agent_id = va.stt
    WHERE sa.assignment_date >= current_date
    ORDER BY sa.assignment_date ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_manual_schedule_assignments_for_next_days IS 'Creates manual schedule assignments for the next N weekdays (skips weekends)';

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- 1. Add agents to rotation (replace with your actual agent IDs)
-- INSERT INTO agent_rotation_list (agent_id, rotation_order) VALUES
--     (1, 1), (2, 2), (3, 3)
-- ON CONFLICT DO NOTHING;

-- 2. Add accounts to rotation
-- INSERT INTO account_rotation_list (account_export_name, rotation_order) VALUES
--     ('ln028f', 1), ('ad914r', 2), ('xy123z', 3)
-- ON CONFLICT DO NOTHING;

-- 3. Preview next assignment (without creating it)
-- SELECT * FROM get_next_manual_schedule_assignment(CURRENT_DATE);

-- 4. Create assignment for today
-- SELECT create_manual_schedule_assignment(CURRENT_DATE);

-- 5. Create assignments for the next 7 weekdays
-- SELECT * FROM create_manual_schedule_assignments_for_next_days(7);

-- 6. View current rotation lists
-- SELECT arl.rotation_order, va.name, arl.is_active
-- FROM agent_rotation_list arl
-- JOIN vcn_agent va ON arl.agent_id = va.stt
-- ORDER BY arl.rotation_order;

-- SELECT rotation_order, account_export_name, is_active
-- FROM account_rotation_list
-- ORDER BY rotation_order;

-- 7. View recent assignments
-- SELECT sa.assignment_date, va.name, sa.account_export_name, sa.status
-- FROM schedule_assignments sa
-- JOIN vcn_agent va ON sa.agent_id = va.stt
-- ORDER BY sa.assignment_date DESC
-- LIMIT 10;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Next steps:
-- 1. Run this SQL file in Supabase SQL Editor
-- 2. Add agents to agent_rotation_list
-- 3. Add accounts to account_rotation_list
-- 4. Create assignments using the functions above
-- 5. Refresh dashboard to see banner/popup
-- ============================================================================

