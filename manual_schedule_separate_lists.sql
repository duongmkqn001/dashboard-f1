-- Drop old tables if they exist
DROP TABLE IF EXISTS schedule_rotation_list CASCADE;
DROP TABLE IF EXISTS assignment_rotation_state CASCADE;

-- Create separate agent rotation list
CREATE TABLE IF NOT EXISTS agent_rotation_list (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES vcn_agent(stt) ON DELETE CASCADE,
    rotation_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_id, is_active) -- Prevent duplicate active entries for same agent
);

-- Create separate account rotation list
CREATE TABLE IF NOT EXISTS account_rotation_list (
    id SERIAL PRIMARY KEY,
    account_export_name TEXT NOT NULL,
    rotation_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_export_name, is_active) -- Prevent duplicate active entries for same account
);

-- Create rotation state tracker (now tracks both agent and account indices separately)
CREATE TABLE IF NOT EXISTS rotation_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    agent_current_index INTEGER DEFAULT 0,
    account_current_index INTEGER DEFAULT 0,
    last_assignment_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial rotation state
INSERT INTO rotation_state (id, agent_current_index, account_current_index)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agent_rotation_active ON agent_rotation_list(is_active, rotation_order);
CREATE INDEX IF NOT EXISTS idx_account_rotation_active ON account_rotation_list(is_active, rotation_order);

-- Note: schedule_assignments and auto_assignment_settings tables remain unchanged
-- They are still used for storing actual assignments and settings

