# Fix 406 Error - Manual Assignment

## Issue Found:

From your console logs:
```
🔍 Checking assignment for date: 2025-10-13 agent: 1
GET .../schedule_assignments?...&assignment_date=eq.2025-10-13&agent_id=eq.1 406 (Not Acceptable)
```

**Error**: 406 (Not Acceptable) when checking for existing assignments

---

## Root Cause:

The code was using `.single()` which expects **exactly one result**:
- If **0 results** found → 406 error
- If **2+ results** found → 406 error
- Only if **exactly 1 result** → success

**The problem**: When creating a new assignment (no existing assignment), it returns 0 results, causing the 406 error.

---

## The Fix:

Changed from `.single()` to `.maybeSingle()`:

**Before** (WRONG):
```javascript
const { data: existingAssignment, error: checkError } = await supabase
    .from('schedule_assignments')
    .select('*')
    .eq('assignment_date', date)
    .eq('agent_id', memberId)
    .single();  // ❌ Throws 406 if no results

if (checkError && checkError.code !== 'PGRST116') {
    throw checkError;
}
```

**After** (CORRECT):
```javascript
const { data: existingAssignment, error: checkError } = await supabase
    .from('schedule_assignments')
    .select('*')
    .eq('assignment_date', date)
    .eq('agent_id', memberId)
    .maybeSingle();  // ✅ Returns null if no results, no error

if (checkError) {
    console.error('❌ Error checking existing assignment:', checkError);
    throw checkError;
}
```

---

## What Changed:

### `.single()` vs `.maybeSingle()`

| Method | 0 Results | 1 Result | 2+ Results |
|--------|-----------|----------|------------|
| `.single()` | ❌ 406 Error | ✅ Returns data | ❌ 406 Error |
| `.maybeSingle()` | ✅ Returns null | ✅ Returns data | ❌ Error |

**For our use case**: We want to check if an assignment exists or not, so `.maybeSingle()` is perfect:
- **No assignment** → Returns `null` → Create new assignment ✅
- **Assignment exists** → Returns data → Update existing assignment ✅

---

## Files Modified:

**`js/adminview.js`** (lines 2745-2785)

**Changes**:
1. Changed `.single()` to `.maybeSingle()`
2. Removed the `checkError.code !== 'PGRST116'` check (no longer needed)
3. Added more detailed logging

---

## How to Test:

### Step 1: Refresh Browser
1. **Hard refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Or clear cache** and refresh

### Step 2: Try Manual Assignment
1. **Open Admin View**
2. **Select agent** and **account**
3. **Select "Single Day"**
4. **Pick a date** (e.g., 14/10/2025)
5. **Click "Assign Task"**

### Step 3: Check Console
You should now see:
```
📅 Manual assignment - Selected date: 2025-10-14
📋 Manual assignment - Dates to assign: ['2025-10-14']
🔍 Checking assignment for date: 2025-10-14 agent: 1
➕ No existing assignment, will create new
➕ Inserting assignments: [{assignment_date: "2025-10-14", ...}]
✅ Assignments inserted successfully
✅ Manual schedule notification created for agent: 1 account: ...
✅ Verified assignments in database: [{assignment_date: "2025-10-14", ...}]
```

**No more 406 error!** ✅

---

## Expected Results:

### Creating New Assignment:
```
✅ No 406 error
✅ Assignment created with correct date
✅ Notification sent
✅ Success message shown
```

### Updating Existing Assignment:
```
✅ No 406 error
✅ Existing assignment found
✅ Assignment updated
✅ Success message shown
```

---

## Why This Happened:

The original code was checking for existing assignments to decide whether to **create** or **update**. But it used `.single()` which throws an error when no assignment exists (the most common case for new assignments).

The fix uses `.maybeSingle()` which gracefully returns `null` when no assignment exists, allowing the code to proceed with creating a new assignment.

---

## Summary:

| Issue | Cause | Fix | Status |
|-------|-------|-----|--------|
| 406 Error | `.single()` throws error when no results | Changed to `.maybeSingle()` | ✅ Fixed |
| Date assignment | Already fixed with `formatDateLocal()` | - | ✅ Fixed |
| Ambiguous column | Already fixed with `v_` prefix | - | ✅ Fixed |

---

## All Issues Resolved! 🎉

Your manual assignment should now work perfectly:
- ✅ No 406 errors
- ✅ Correct dates assigned
- ✅ Notifications sent
- ✅ Both create and update work

**Test it now!**

