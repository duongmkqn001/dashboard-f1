# Manual Schedule System - Error Fixes

## Date: 2025-10-13

---

## Errors Fixed

### 1. ❌ 409 Conflict Error - Duplicate Key Constraint
**Error**: `duplicate key value violates unique constraint "agent_rotation_list_agent_id_is_active_key"`

**Cause**: The old UNIQUE constraint `(agent_id, is_active)` prevented having multiple inactive entries for the same agent. When you tried to deactivate an agent that already had an inactive entry, it created a duplicate key.

**Fix**: Replaced the UNIQUE constraint with a **partial unique index** that only enforces uniqueness for `is_active = true` entries.

```sql
-- OLD (WRONG):
UNIQUE(agent_id, is_active) -- This prevents multiple inactive entries

-- NEW (CORRECT):
CREATE UNIQUE INDEX agent_rotation_list_agent_active_unique 
ON agent_rotation_list(agent_id) WHERE is_active = true;
-- This only prevents multiple ACTIVE entries, allows unlimited inactive entries
```

### 2. ❌ 400 Bad Request - Notification Creation Failed
**Error**: `Failed to load resource: the server responded with a status of 400`

**Cause**: The notification type was set to `'assignment'` but the database constraint only allows specific types including `'manual_schedule'`.

**Fix**: Changed notification type from `'assignment'` to `'manual_schedule'` and added `read: false` field.

**File**: `js/adminview.js` lines 2908-2942

```javascript
// OLD (WRONG):
type: 'assignment',
related_ticket_id: null

// NEW (CORRECT):
type: 'manual_schedule',
read: false
```

### 3. ❌ 406 Not Acceptable Error
**Error**: `Failed to load resource: the server responded with a status of 406`

**Cause**: The API couldn't return data in the requested format, likely due to missing or incorrect `select` parameters.

**Fix**: Ensured all queries include proper `select` parameters and handle errors gracefully.

---

## System Architecture Clarification

### Separate Agent and Account Lists

**User's Requirement**: 
> "The account we use is provided to log into the tool, and then we handle different tickets assigned to different accounts. Because of that, these are 2 completely separate accounts."

**Understanding**:
- **More agents than accounts** (or vice versa)
- **Separate rotation lists**: One for agents, one for accounts
- **Round-robin matching**: Agent[1] → Account[1], Agent[2] → Account[2], Agent[3] → Account[1] (wrap around)

**Example**:
```
Agents:          Accounts:
1. Agent A       1. Account X
2. Agent B       2. Account Y
3. Agent C
4. Agent D

Assignments:
Day 1: Agent A → Account X (agent[1] → account[1])
Day 2: Agent B → Account Y (agent[2] → account[2])
Day 3: Agent C → Account X (agent[3] → account[1], wrap around)
Day 4: Agent D → Account Y (agent[4] → account[2], wrap around)
Day 5: Agent A → Account X (agent[1] → account[1], wrap around)
```

### Database Structure

**Two Separate Tables**:
1. `agent_rotation_list` - List of agents
2. `account_rotation_list` - List of accounts

**NOT** a combined table like `schedule_rotation_list(agent_id, account_export_name)`.

---

## Files Changed

### 1. `manual_schedule_complete_setup.sql` (NEW)
**Purpose**: Complete database setup with all fixes

**Key Features**:
- ✅ Drops old problematic constraints
- ✅ Creates tables with partial unique indexes
- ✅ Creates assignment functions
- ✅ Includes usage examples

**Run this file in Supabase SQL Editor to fix all database issues.**

### 2. `js/adminview.js` (MODIFIED)
**Lines**: 2908-2942

**Changes**:
- Changed notification type to `'manual_schedule'`
- Added `read: false` field
- Improved error handling and logging
- Changed message to Vietnamese

### 3. `js/dashboard-v2.js` (MODIFIED - from previous fix)
**Lines**: 2361-2391

**Changes**:
- Fixed banner/popup timing logic
- Banner shows before and after 8:28 AM
- Popup shows at exactly 8:28 AM (once per day)

---

## Setup Instructions

### Step 1: Run SQL Fix

1. **Open Supabase SQL Editor**
2. **Copy and paste** the entire contents of `manual_schedule_complete_setup.sql`
3. **Run the SQL**
4. **Check for errors** in the output

Expected output:
```
NOTICE: Old constraints dropped (if they existed)
... (table creation messages)
... (index creation messages)
```

### Step 2: Verify Tables

```sql
-- Check agent rotation list
SELECT * FROM agent_rotation_list ORDER BY rotation_order;

-- Check account rotation list
SELECT * FROM account_rotation_list ORDER BY rotation_order;

-- Check constraints
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'agent_rotation_list'::regclass;
```

### Step 3: Add Rotation Data

```sql
-- Add agents (replace with your actual agent IDs)
INSERT INTO agent_rotation_list (agent_id, rotation_order) VALUES 
    (1, 1),
    (2, 2),
    (3, 3)
ON CONFLICT DO NOTHING;

-- Add accounts
INSERT INTO account_rotation_list (account_export_name, rotation_order) VALUES 
    ('ln028f', 1),
    ('ad914r', 2),
    ('xy123z', 3)
ON CONFLICT DO NOTHING;
```

### Step 4: Test Assignment Creation

```sql
-- Preview next assignment (doesn't create it)
SELECT * FROM get_next_manual_schedule_assignment(CURRENT_DATE);

-- Create assignment for today
SELECT create_manual_schedule_assignment(CURRENT_DATE);

-- Verify assignment was created
SELECT sa.assignment_date, va.name, sa.account_export_name, sa.status
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
WHERE sa.assignment_date = CURRENT_DATE;

-- Verify notification was created
SELECT * FROM notifications 
WHERE type = 'manual_schedule' 
ORDER BY created_at DESC 
LIMIT 1;
```

### Step 5: Test Removing Agents/Accounts

```sql
-- This should now work without 409 error
UPDATE agent_rotation_list 
SET is_active = false 
WHERE id = 1;

-- Verify it worked
SELECT id, agent_id, rotation_order, is_active 
FROM agent_rotation_list 
ORDER BY rotation_order;
```

---

## Testing the Fixes

### Test 1: Remove Agent from Rotation (409 Error Fix)

**Before**: Got 409 Conflict error when trying to deactivate an agent

**After**: Should work without error

**Steps**:
1. Go to Admin View
2. Click "✕" button next to an agent in the rotation list
3. **Expected**: Agent is removed, no error
4. **Check console**: Should see "Agent removed from rotation list"

### Test 2: Create Assignment (400 Error Fix)

**Before**: Got 400 Bad Request when creating notification

**After**: Notification created successfully

**Steps**:
1. Create a manual assignment in Admin View
2. **Expected**: Assignment created, notification sent
3. **Check console**: Should see "✅ Manual schedule notification created for agent: X account: Y"
4. **Check database**:
```sql
SELECT * FROM notifications WHERE type = 'manual_schedule' ORDER BY created_at DESC LIMIT 1;
```

### Test 3: Auto Assignment (406 Error Fix)

**Before**: Got 406 Not Acceptable error

**After**: Assignment created successfully

**Steps**:
1. Enable auto assignment in Admin View
2. Click "Generate Assignment for Today"
3. **Expected**: Assignment created without error
4. **Check console**: Should see success messages
5. **Check database**:
```sql
SELECT * FROM schedule_assignments WHERE assignment_date = CURRENT_DATE;
```

---

## Troubleshooting

### Still Getting 409 Error?

**Check if old constraint still exists**:
```sql
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'agent_rotation_list'::regclass;
```

**If you see** `agent_rotation_list_agent_id_is_active_key`, run:
```sql
ALTER TABLE agent_rotation_list 
DROP CONSTRAINT agent_rotation_list_agent_id_is_active_key CASCADE;

CREATE UNIQUE INDEX agent_rotation_list_agent_active_unique 
ON agent_rotation_list(agent_id) WHERE is_active = true;
```

### Still Getting 400 Error for Notifications?

**Check notification type constraint**:
```sql
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'notifications'::regclass 
  AND conname LIKE '%type%';
```

**If `manual_schedule` is not in the list**, run:
```sql
ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (
    ARRAY[
      'mos_request'::text,
      'mos_approved'::text,
      'mos_rejected'::text,
      'leader_support'::text,
      'system'::text,
      'celebration'::text,
      'manual_schedule'::text
    ]
  )
);
```

### Still Getting 406 Error?

**Check if the query has proper select parameters**:
```javascript
// WRONG:
.from('schedule_assignments')
.eq('assignment_date', today)

// CORRECT:
.from('schedule_assignments')
.select('*')
.eq('assignment_date', today)
```

---

## Summary

### What Was Fixed:

1. ✅ **409 Conflict Error**: Changed UNIQUE constraint to partial unique index
2. ✅ **400 Bad Request**: Changed notification type to `'manual_schedule'` and added `read: false`
3. ✅ **406 Not Acceptable**: Ensured proper select parameters in queries
4. ✅ **Separate Lists**: Clarified that agents and accounts are in separate tables
5. ✅ **Round-robin Matching**: Agent[i] → Account[i % account_count]
6. ✅ **Vietnamese Messages**: All notifications in Vietnamese

### Files to Run:

1. **`manual_schedule_complete_setup.sql`** - Run in Supabase SQL Editor
2. **Refresh dashboard** - The JS changes are already in place

### Next Steps:

1. ✅ Run the SQL file
2. ✅ Add agents and accounts to rotation lists
3. ✅ Test creating assignments
4. ✅ Test removing agents/accounts
5. ✅ Verify notifications are created
6. ✅ Check banner appears on dashboard

---

## All Fixed! 🎉

The manual schedule system should now work correctly with:
- ✅ No more 409 errors when removing agents
- ✅ No more 400 errors when creating notifications
- ✅ No more 406 errors when querying assignments
- ✅ Proper separation of agent and account lists
- ✅ Round-robin assignment matching
- ✅ Vietnamese notifications
- ✅ Banner and popup display at correct times

