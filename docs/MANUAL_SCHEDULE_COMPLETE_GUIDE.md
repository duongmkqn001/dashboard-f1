# Manual Schedule System - Complete Guide

## Date: 2025-10-13

---

## Overview

The Manual Schedule system assigns agents to work on specific accounts for manual schedule tasks. The system:
- ✅ Rotates assignments among agents based on the most recently assigned person
- ✅ Skips weekends automatically
- ✅ Shows banner from start of day until 8:28 AM
- ✅ Shows popup at exactly 8:28 AM (once per day)
- ✅ Sends notifications to the logged-in user (agent)
- ✅ All times calculated in Vietnam timezone (UTC+7)

---

## How It Works

### 1. Assignment Logic

**Key Principle**: Start from the most recently assigned person and rotate to the next.

**Process**:
1. Find the most recent assignment (by date, not by rotation_order)
2. Find that person in the `schedule_rotation_list`
3. Get the next person in rotation order
4. If at the end of the list, wrap around to the first person
5. Skip weekends (Saturday and Sunday)

**Example**:
```
Rotation List:
1. Agent A - Account X
2. Agent B - Account Y
3. Agent C - Account Z

Last assignment: Agent B (Oct 10)
Next assignment: Agent C (Oct 11)
After that: Agent A (Oct 14, skipping weekend)
```

### 2. Banner Display Logic

**Timeline** (Vietnam time):
- **00:00 - 08:27**: Banner shows at top of dashboard
- **08:28**: Full-screen popup appears (once per day)
- **08:29 onwards**: Banner shows again

**Banner Content**:
```
🎯 Phân Công Manual Schedule - Hôm Nay
Bạn được phân công xử lý manual schedule hôm nay.
Tài khoản: [account_export_name]
[🚀 Bắt Đầu] [✕]
```

**Popup Content** (at 8:28 AM):
```
Phân Công Manual Schedule
Bạn được phân công xử lý:
[account_export_name]
Vui lòng bắt đầu công việc hôm nay!
[Đã hiểu! Bắt đầu ngay 🚀]
```

### 3. Notification System

**When assignment is created**:
- Notification sent to `agent_id` (the logged-in user)
- Type: `'manual_schedule'`
- Message: `"Bạn được phân công xử lý Manual Schedule cho tài khoản [account] vào ngày [date]"`

**Real-time delivery**:
- Notification appears in notifications dropdown
- Banner appears automatically at top of dashboard
- No page refresh needed

---

## Database Setup

### Step 1: Create Tables

Run `manual_schedule_tables.sql` to create:
- `schedule_rotation_list` - List of agent-account pairs to rotate
- `schedule_assignments` - Actual assignments for each date
- `auto_assignment_settings` - Configuration settings
- `assignment_rotation_state` - Tracks rotation state (deprecated, not used in new logic)

### Step 2: Create Auto-Assignment Functions

Run `manual_schedule_auto_assign.sql` to create:
- `get_next_manual_schedule_assignment()` - Determines next assignment
- `create_manual_schedule_assignment()` - Creates assignment for a date
- `create_manual_schedule_assignments_for_next_days()` - Bulk create assignments

### Step 3: Populate Rotation List

Add agent-account pairs to the rotation list:

```sql
-- Example: Add agents to rotation
INSERT INTO schedule_rotation_list (agent_id, account_export_name, rotation_order, is_active)
VALUES
    (1, 'ln028f', 1, true),
    (2, 'ad914r', 2, true),
    (3, 'xy123z', 3, true);

-- Verify rotation list
SELECT srl.rotation_order, va.name, srl.account_export_name, srl.is_active
FROM schedule_rotation_list srl
JOIN vcn_agent va ON srl.agent_id = va.stt
ORDER BY srl.rotation_order;
```

---

## Usage

### Manual Assignment (Admin)

Create assignment for a specific date:

```sql
-- Create assignment for today
SELECT create_manual_schedule_assignment(CURRENT_DATE);

-- Create assignment for specific date
SELECT create_manual_schedule_assignment('2025-10-14');

-- Create assignments for next 7 weekdays
SELECT * FROM create_manual_schedule_assignments_for_next_days(7);
```

### Check Next Assignment (Preview)

See who will be assigned next without creating the assignment:

```sql
SELECT * FROM get_next_manual_schedule_assignment(CURRENT_DATE);
```

### View Assignments

```sql
-- View all assignments
SELECT sa.assignment_date, va.name, sa.account_export_name, sa.status
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
ORDER BY sa.assignment_date DESC;

-- View today's assignment
SELECT sa.assignment_date, va.name, sa.account_export_name, sa.status
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
WHERE sa.assignment_date = CURRENT_DATE;
```

---

## Frontend Behavior

### When Dashboard Loads

1. `checkManualRescheduleAssignment()` is called
2. Checks if logged-in user has assignment for today
3. Gets current Vietnam time
4. Decides whether to show banner or popup

### Banner Display

**Conditions**:
- User has assignment for today
- Status is 'assigned'
- Time is NOT exactly 8:28 AM (or popup already shown)

**Banner appears**:
- At top of dashboard in `#banner-container`
- Orange gradient background
- Shows account name
- "Bắt Đầu" button opens `manual-reschedule-pos.html`
- "✕" button dismisses banner

### Popup Display

**Conditions**:
- User has assignment for today
- Time is exactly 8:28 AM (Vietnam time)
- Popup not already shown today (tracked in localStorage)

**Popup appears**:
- Full-screen overlay
- Large orange gradient card
- Shows account name
- "Đã hiểu! Bắt đầu ngay 🚀" button closes popup
- After closing, banner appears

---

## Testing

### Test 1: Create Assignment

```sql
-- Add yourself to rotation list (replace with your agent_id)
INSERT INTO schedule_rotation_list (agent_id, account_export_name, rotation_order, is_active)
VALUES (1, 'test_account', 1, true)
ON CONFLICT (agent_id, account_export_name) DO NOTHING;

-- Create assignment for today
SELECT create_manual_schedule_assignment(CURRENT_DATE);

-- Verify assignment was created
SELECT * FROM schedule_assignments WHERE assignment_date = CURRENT_DATE;

-- Verify notification was created
SELECT * FROM notifications WHERE type = 'manual_schedule' ORDER BY created_at DESC LIMIT 1;
```

### Test 2: Banner Display

1. **Refresh dashboard** (F5)
2. **Expected** (if time is NOT 8:28 AM):
   ```
   Console: 📋 Showing manual schedule banner
   Screen: Orange banner at top with account name
   ```

### Test 3: Popup Display (at 8:28 AM)

**Option A: Wait until 8:28 AM**
1. Have an assignment for today
2. Wait until 8:28 AM Vietnam time
3. Refresh dashboard
4. **Expected**: Full-screen popup appears

**Option B: Modify time check for testing**
1. Temporarily change line 2381 in `js/dashboard-v2.js`:
   ```javascript
   // Change from:
   if (currentTimeMinutes === targetTimeMinutes && !popupAlreadyShown) {
   
   // To (for testing):
   if (true && !popupAlreadyShown) {
   ```
2. Clear localStorage: `localStorage.removeItem('manual_schedule_popup_shown_' + new Date().toISOString().split('T')[0])`
3. Refresh dashboard
4. **Expected**: Popup appears immediately

### Test 4: Rotation Logic

```sql
-- Create assignments for next 5 weekdays
SELECT * FROM create_manual_schedule_assignments_for_next_days(5);

-- Verify rotation order
SELECT sa.assignment_date, va.name, sa.account_export_name
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
WHERE sa.assignment_date >= CURRENT_DATE
ORDER BY sa.assignment_date ASC;
```

**Expected**: Each day should have a different agent in rotation order.

---

## Troubleshooting

### Banner Not Appearing

**Check 1**: Is there an assignment for today?
```sql
SELECT * FROM schedule_assignments 
WHERE assignment_date = CURRENT_DATE 
  AND agent_id = [your_agent_id];
```

**Check 2**: Check console logs
```
🕐 Vietnam time: 9:30 Current minutes: 570 Target: 508
📋 Showing manual schedule banner
```

**Check 3**: Is `#banner-container` in the HTML?
```javascript
document.getElementById('banner-container')
```

### Popup Not Appearing at 8:28 AM

**Check 1**: Is it exactly 8:28 AM Vietnam time?
```javascript
const now = new Date();
const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
console.log(vietnamTime.getHours() + ':' + vietnamTime.getMinutes());
```

**Check 2**: Has popup already been shown today?
```javascript
const today = new Date().toISOString().split('T')[0];
localStorage.getItem('manual_schedule_popup_shown_' + today);
// Should be null or 'false' for popup to show
```

**Check 3**: Clear localStorage and try again
```javascript
const today = new Date().toISOString().split('T')[0];
localStorage.removeItem('manual_schedule_popup_shown_' + today);
```

### Wrong Person Assigned

**Check 1**: View rotation list
```sql
SELECT * FROM schedule_rotation_list 
WHERE is_active = true 
ORDER BY rotation_order;
```

**Check 2**: View recent assignments
```sql
SELECT sa.assignment_date, va.name, sa.account_export_name
FROM schedule_assignments sa
JOIN vcn_agent va ON sa.agent_id = va.stt
ORDER BY sa.assignment_date DESC
LIMIT 5;
```

**Check 3**: Test next assignment logic
```sql
SELECT * FROM get_next_manual_schedule_assignment(CURRENT_DATE + INTERVAL '1 day');
```

---

## Files Modified

**`js/dashboard-v2.js`**:
- Lines 2361-2391: Updated banner/popup display logic
  - Banner shows at all times except exactly 8:28 AM
  - Popup shows at exactly 8:28 AM (once per day)
  - Added Vietnam time logging
  - Added banner after popup closes

**`manual_schedule_auto_assign.sql`** (NEW):
- Auto-assignment functions based on most recent assignment
- Skips weekends automatically
- Creates notifications in Vietnamese

---

## Summary

### Assignment Creation:
- ✅ Based on most recently assigned person (not rotation_order)
- ✅ Rotates through list, wrapping around at the end
- ✅ Skips weekends automatically
- ✅ Creates notification for assigned agent

### Banner Display:
- ✅ Shows from 00:00 until 08:27 AM
- ✅ Shows again from 08:29 AM onwards
- ✅ Vietnamese text
- ✅ Shows account name
- ✅ "Bắt Đầu" button opens task page

### Popup Display:
- ✅ Shows at exactly 8:28 AM (Vietnam time)
- ✅ Shows once per day
- ✅ Vietnamese text
- ✅ Full-screen overlay
- ✅ After closing, banner appears

### Notifications:
- ✅ Sent to logged-in user (agent_id)
- ✅ Type: 'manual_schedule'
- ✅ Vietnamese message
- ✅ Real-time delivery

---

## Next Steps

1. ✅ Run `manual_schedule_auto_assign.sql` in Supabase
2. ✅ Populate `schedule_rotation_list` with agents
3. ✅ Create assignments: `SELECT * FROM create_manual_schedule_assignments_for_next_days(7);`
4. ✅ Refresh dashboard to see banner
5. ✅ Test at 8:28 AM to see popup

The manual schedule system is now complete and ready to use! 🎯

