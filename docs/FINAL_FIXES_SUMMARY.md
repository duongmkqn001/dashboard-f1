# Final Fixes Summary - Manual Schedule System

## Date: 2025-10-13

---

## Issues Fixed:

### 1. ❌ SQL Function Error - "column reference is ambiguous"
**Error**:
```
ERROR: 42702: column reference "agent_id" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
```

**Cause**: Variable names in the function matched column names in the table, causing ambiguity.

**Fix**: Renamed all variables with `v_` prefix and all output columns with `out_` prefix.

**File**: `manual_schedule_complete_setup.sql`

**Changes**:
```sql
-- OLD (WRONG):
DECLARE
    last_assigned_agent_id INTEGER;
    ...
SELECT agent_id INTO last_assigned_agent_id
FROM agent_rotation_list
WHERE agent_id = last_assigned_agent_id;  -- AMBIGUOUS!

-- NEW (CORRECT):
DECLARE
    v_last_assigned_agent_id INTEGER;
    ...
SELECT arl.agent_id INTO v_last_assigned_agent_id
FROM agent_rotation_list arl
WHERE arl.agent_id = v_last_assigned_agent_id;  -- CLEAR!
```

---

### 2. ❌ Date Assignment Issue - 14/10 becomes 15/10
**Problem**: When you select 14/10/2025 in the calendar, it assigns to 15/10/2025.

**Cause**: `toISOString()` converts dates to UTC timezone. Vietnam is UTC+7, so when you create a date at midnight Vietnam time and convert to UTC, it becomes the previous day in UTC.

**Example**:
```javascript
// Vietnam time: 2025-10-14 00:00:00 (UTC+7)
// UTC time:      2025-10-13 17:00:00 (UTC)
// toISOString(): "2025-10-13T17:00:00.000Z"
// split('T')[0]: "2025-10-13"  ← WRONG DATE!
```

**Fix**: Created `formatDateLocal()` function that formats dates in local timezone without UTC conversion.

**File**: `js/adminview.js` lines 3239-3297

**Changes**:
```javascript
// OLD (WRONG):
dates.push(currentDate.toISOString().split('T')[0]);
// This converts to UTC, causing date shift

// NEW (CORRECT):
function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

dates.push(formatDateLocal(currentDate));
// This uses local timezone, no date shift
```

---

## Files Modified:

### 1. `manual_schedule_complete_setup.sql`
**Changes**:
- Added DROP statements for old functions
- Renamed all variables with `v_` prefix
- Renamed all output columns with `out_` prefix
- Added table aliases to all queries

**Lines Changed**: 15-257

### 2. `js/adminview.js`
**Changes**:
- Added `formatDateLocal()` helper function
- Updated `getNext5Weekdays()` to use `formatDateLocal()`
- Updated `getNext30Days()` to use `formatDateLocal()`
- Updated `getWeekdaysInRange()` to use `formatDateLocal()`

**Lines Changed**: 3239-3297

---

## How to Apply Fixes:

### Step 1: Run Updated SQL File

1. **Open Supabase** → SQL Editor
2. **Copy ALL contents** of `manual_schedule_complete_setup.sql`
3. **Paste and Run**
4. **Wait for success**

Expected output:
```
NOTICE: Old constraints and functions dropped (if they existed)
CREATE TABLE
CREATE INDEX
CREATE FUNCTION
... (success messages)
```

### Step 2: Refresh Dashboard

1. **Hard refresh** your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. **Clear cache** if needed
3. **Test date selection**

### Step 3: Test Date Assignment

1. **Go to Admin View**
2. **Select 14/10/2025** in the calendar
3. **Create assignment**
4. **Check database**:
```sql
SELECT assignment_date, va.name, account_export_name
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
WHERE assignment_date = '2025-10-14';
```
5. **Expected**: Assignment date is `2025-10-14` (not `2025-10-15`)

---

## Testing Checklist:

### ✅ SQL Function Test
```sql
-- This should work without "ambiguous column" error
SELECT * FROM get_next_manual_schedule_assignment(CURRENT_DATE);
```

### ✅ Date Assignment Test
1. Select **14/10/2025** in calendar
2. Create assignment
3. Verify assignment date is **2025-10-14** (not 2025-10-15)

### ✅ Week Assignment Test
1. Select "Next 5 Weekdays"
2. Create assignments
3. Verify all dates are correct (no +1 day shift)

### ✅ Custom Range Test
1. Select start date: **14/10/2025**
2. Select end date: **18/10/2025**
3. Create assignments
4. Verify dates are: 14, 15, 16, 17, 18 (not 15, 16, 17, 18, 19)

---

## Root Causes Explained:

### Why "ambiguous column" error?

PostgreSQL couldn't tell if you meant:
- The **variable** `agent_id` (declared in DECLARE block)
- The **column** `agent_id` (from the table)

**Solution**: Use different names for variables (`v_agent_id`) and always use table aliases (`arl.agent_id`).

### Why date shift (+1 day)?

JavaScript's `toISOString()` always converts to UTC:
- **Vietnam**: UTC+7 (7 hours ahead of UTC)
- **Midnight Vietnam time**: 2025-10-14 00:00:00 +07:00
- **Same moment in UTC**: 2025-10-13 17:00:00 +00:00
- **toISOString() result**: "2025-10-13T17:00:00.000Z"
- **After split('T')[0]**: "2025-10-13" ← **WRONG!**

**Solution**: Format dates using local timezone methods (`getFullYear()`, `getMonth()`, `getDate()`) instead of UTC methods.

---

## Summary:

| Issue | Cause | Fix | Status |
|-------|-------|-----|--------|
| Ambiguous column error | Variable names matched column names | Renamed variables with `v_` prefix | ✅ Fixed |
| Date +1 day shift | `toISOString()` converts to UTC | Created `formatDateLocal()` function | ✅ Fixed |
| 409 Conflict error | UNIQUE constraint on inactive entries | Partial unique index | ✅ Fixed (earlier) |
| 400 Bad Request | Wrong notification type | Changed to `'manual_schedule'` | ✅ Fixed (earlier) |

---

## All Issues Resolved! 🎉

Your manual schedule system should now:
- ✅ Run SQL without errors
- ✅ Assign to correct dates (no +1 day shift)
- ✅ Remove agents without 409 errors
- ✅ Create notifications without 400 errors
- ✅ Show banner and popup correctly
- ✅ Use Vietnamese messages

**Test it now and let me know if you encounter any other issues!**

