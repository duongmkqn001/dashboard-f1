# Debug Manual Assignment Issue

## How to Debug:

### Step 1: Open Browser Console
1. **Open Admin View** page
2. **Press F12** to open Developer Tools
3. **Click "Console" tab**

### Step 2: Try Manual Assignment
1. **Select an agent** from dropdown
2. **Select an account** from dropdown
3. **Select "Single Day"** option
4. **Pick a date** (e.g., 14/10/2025)
5. **Click "Assign Task"**

### Step 3: Check Console Logs

You should see logs like this:

```
📅 Manual assignment - Selected date: 2025-10-14
📋 Manual assignment - Dates to assign: ["2025-10-14"]
🔍 Checking assignment for date: 2025-10-14 agent: 1
➕ Inserting assignments: [{assignment_date: "2025-10-14", agent_id: 1, ...}]
✅ Assignments inserted successfully
✅ Verified assignments in database: [{assignment_date: "2025-10-14", ...}]
```

### Step 4: Check What You See

**Look for these specific values in the console:**

1. **Selected date**: Should match what you picked
2. **Dates to assign**: Should be an array with your selected date
3. **Inserting assignments**: Check the `assignment_date` field
4. **Verified assignments**: Check the `assignment_date` field

---

## Common Issues:

### Issue 1: Date is Off by 1 Day

**Symptoms**:
```
📅 Manual assignment - Selected date: 2025-10-14
✅ Verified assignments in database: [{assignment_date: "2025-10-15", ...}]
```

**Cause**: Date input is being converted somewhere

**Solution**: Check if there's any date conversion happening in the HTML or other code

---

### Issue 2: Error in Console

**Symptoms**:
```
❌ Insert error: {code: "...", message: "..."}
```

**Solution**: Copy the full error message and send it to me

---

### Issue 3: No Logs Appear

**Symptoms**: Console is empty, no logs appear

**Cause**: JavaScript file not loaded or cached

**Solution**: 
1. **Hard refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear cache**: Settings → Clear browsing data → Cached images and files
3. **Try again**

---

## What to Send Me:

Please copy and paste:

1. **All console logs** from Step 3
2. **The date you selected** (e.g., "I selected 14/10/2025")
3. **The date that was assigned** (check in database or calendar)
4. **Any error messages** (red text in console)

---

## Quick Check in Database:

Run this SQL to see what was actually created:

```sql
-- Check today's assignments
SELECT 
    assignment_date,
    va.name AS agent_name,
    account_export_name,
    assignment_type,
    created_at
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
WHERE assignment_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY assignment_date DESC, created_at DESC
LIMIT 10;
```

**Look for**:
- Is the `assignment_date` correct?
- Is it the date you selected?
- Or is it off by 1 day?

---

## Example of Good Debug Info:

```
I selected: 14/10/2025

Console logs:
📅 Manual assignment - Selected date: 2025-10-14
📋 Manual assignment - Dates to assign: ["2025-10-14"]
🔍 Checking assignment for date: 2025-10-14 agent: 1
➕ Inserting assignments: [{assignment_date: "2025-10-14", agent_id: 1, account_export_name: "ln028f"}]
✅ Assignments inserted successfully
✅ Verified assignments in database: [{assignment_date: "2025-10-15", agent_id: 1, account_export_name: "ln028f"}]

Problem: Selected 2025-10-14 but database shows 2025-10-15!
```

---

## Possible Causes:

### 1. Database Trigger
There might be a database trigger that modifies the date on insert.

**Check**:
```sql
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'schedule_assignments';
```

### 2. Supabase RLS Policy
Row Level Security policy might be modifying data.

**Check**:
```sql
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'schedule_assignments';
```

### 3. Default Value in Table
The table might have a default value for `assignment_date`.

**Check**:
```sql
SELECT 
    column_name,
    column_default,
    data_type
FROM information_schema.columns
WHERE table_name = 'schedule_assignments'
  AND column_name = 'assignment_date';
```

### 4. JavaScript Date Conversion
Even though we fixed `formatDateLocal()`, there might be another place converting dates.

**Check**: Look for any other uses of `toISOString()` in the code.

---

## Next Steps:

1. **Try the manual assignment** with console open
2. **Copy all the logs** you see
3. **Send them to me** with the date you selected
4. **I'll identify the exact issue** and fix it

---

## Files Modified:

- `js/adminview.js` - Added debug logging (lines 2707-2827)

The logging will help us see exactly where the date is being changed!

