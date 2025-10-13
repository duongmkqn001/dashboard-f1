# Quick Fix Guide - Manual Schedule Errors

## Your Errors:
- ❌ 409 Conflict: `duplicate key value violates unique constraint`
- ❌ 400 Bad Request: Notification creation failed
- ❌ 406 Not Acceptable: Failed to load resource

## Quick Fix (5 Minutes):

### Step 1: Run SQL Fix (2 minutes)

1. **Open Supabase** → SQL Editor
2. **Copy ALL contents** of `manual_schedule_complete_setup.sql`
3. **Paste and Run**
4. **Wait for success message**

Expected output:
```
NOTICE: Old constraints and functions dropped (if they existed)
... (table creation messages)
... (function creation messages)
```

### Step 2: Test the Fix (1 minute)

1. **Copy ALL contents** of `test_manual_schedule.sql`
2. **Paste and Run** in SQL Editor
3. **Check for** `✅ All tests completed!`

### Step 3: Add Your Data (2 minutes)

Replace the example IDs with your actual data:

```sql
-- Add your agents (replace 1, 2, 3 with your actual agent IDs)
INSERT INTO agent_rotation_list (agent_id, rotation_order) VALUES 
    (1, 1),
    (2, 2),
    (3, 3)
ON CONFLICT DO NOTHING;

-- Add your accounts (replace with your actual account names)
INSERT INTO account_rotation_list (account_export_name, rotation_order) VALUES 
    ('ln028f', 1),
    ('ad914r', 2)
ON CONFLICT DO NOTHING;

-- Create assignment for today
SELECT create_manual_schedule_assignment(CURRENT_DATE);
```

### Step 4: Verify (30 seconds)

```sql
-- Check assignment was created
SELECT sa.assignment_date, va.name, sa.account_export_name
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
WHERE sa.assignment_date = CURRENT_DATE;

-- Check notification was created
SELECT * FROM notifications 
WHERE type = 'manual_schedule' 
ORDER BY created_at DESC 
LIMIT 1;
```

### Step 5: Test in UI (30 seconds)

1. **Refresh dashboard** (F5)
2. **Check for banner** at top of page
3. **Try removing an agent** in Admin View (should work without 409 error)

---

## What Was Fixed:

### 1. 409 Error Fix
**Before**: UNIQUE constraint on `(agent_id, is_active)` prevented multiple inactive entries

**After**: Partial unique index only on `is_active = true` entries

**Result**: ✅ Can deactivate agents multiple times without error

### 2. 400 Error Fix
**Before**: Notification type was `'assignment'` (not allowed)

**After**: Notification type is `'manual_schedule'` (allowed)

**Result**: ✅ Notifications created successfully

### 3. 406 Error Fix
**Before**: Missing or incorrect query parameters

**After**: Proper select parameters in all queries

**Result**: ✅ Queries work correctly

---

## Troubleshooting:

### Still getting errors when running SQL?

**Error**: `cannot change return type of existing function`

**Solution**: The SQL file now includes DROP statements at the beginning. Just run it again.

---

### Still getting 409 error when removing agents?

**Check constraint**:
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

---

### Still getting 400 error for notifications?

**Check notification type**:
```sql
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'notifications'::regclass 
  AND conname LIKE '%type%';
```

**If `manual_schedule` is missing**, run:
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

---

## Files to Use:

1. **`manual_schedule_complete_setup.sql`** ← Run this first
2. **`test_manual_schedule.sql`** ← Run this to test
3. **`MANUAL_SCHEDULE_FIXES.md`** ← Read for detailed explanation

---

## Expected Results:

✅ No 409 error when removing agents  
✅ No 400 error when creating notifications  
✅ No 406 error when querying assignments  
✅ Banner appears on dashboard  
✅ Popup appears at 8:28 AM  
✅ Notifications in Vietnamese  

---

## Done! 🎉

Your manual schedule system should now work perfectly!

