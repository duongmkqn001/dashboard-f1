-- Manual Schedule Pickup System - Database Tables
-- This SQL creates the necessary tables for the simplified manual schedule pickup system

-- Table 1: Schedule Rotation List
-- Stores the list of agent-account pairs that will be rotated for assignments
CREATE TABLE IF NOT EXISTS schedule_rotation_list (
    id BIGSERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES vcn_agent(stt) ON DELETE CASCADE,
    account_export_name TEXT NOT NULL,
    rotation_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_id, account_export_name)
);

-- Table 2: Schedule Assignments
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

-- Table 3: Auto Assignment Settings
-- Stores settings for automatic assignment generation
CREATE TABLE IF NOT EXISTS auto_assignment_settings (
    id BIGSERIAL PRIMARY KEY,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by INTEGER REFERENCES vcn_agent(stt)
);

-- Table 4: Assignment History
-- Keeps track of the last used rotation index for continuous rotation
CREATE TABLE IF NOT EXISTS assignment_rotation_state (
    id BIGSERIAL PRIMARY KEY,
    last_rotation_index INTEGER DEFAULT 0,
    last_assignment_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO auto_assignment_settings (setting_key, setting_value, description) VALUES
    ('auto_assignment_enabled', 'false', 'Enable/disable automatic assignment generation'),
    ('assignment_frequency', 'daily', 'Frequency of auto assignments: daily, weekly, monthly'),
    ('notification_message', 'You have been assigned to perform the Manual Reschedule POs task.', 'Default notification message for assignments'),
    ('skip_weekends', 'true', 'Skip Saturday and Sunday when generating assignments')
ON CONFLICT (setting_key) DO NOTHING;

-- Initialize rotation state
INSERT INTO assignment_rotation_state (last_rotation_index, last_assignment_date) VALUES (0, NULL)
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_schedule_rotation_list_active ON schedule_rotation_list(is_active, rotation_order);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_date ON schedule_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_agent ON schedule_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_status ON schedule_assignments(status);

-- Add comments to tables
COMMENT ON TABLE schedule_rotation_list IS 'Stores the rotation list of agent-account pairs for manual schedule assignments';
COMMENT ON TABLE schedule_assignments IS 'Stores actual schedule assignments for each date';
COMMENT ON TABLE auto_assignment_settings IS 'Configuration settings for automatic assignment generation';
COMMENT ON TABLE assignment_rotation_state IS 'Tracks the current state of rotation to ensure continuous assignment without reset';

-- Add comments to important columns
COMMENT ON COLUMN schedule_rotation_list.rotation_order IS 'Order in which this pair will be used in rotation (lower numbers first)';
COMMENT ON COLUMN schedule_assignments.assignment_type IS 'Whether this was manually assigned or auto-generated';
COMMENT ON COLUMN assignment_rotation_state.last_rotation_index IS 'Index of the last used rotation list entry (for continuous rotation)';

