# Testing Guide for Recent Fixes

## Date: 2025-10-13

This document provides step-by-step instructions to test the three major fixes implemented.

---

## Fix #1: CSV Smart Update - Correct Duplicate Detection

### Problem Fixed
The CSV import was using `issue_id` to detect duplicates, but multiple tickets can have the same `issue_id`. This caused:
- Incorrect duplicate detection
- Tickets being wrongly updated or skipped
- Data duplication in the database

### Solution
Changed the unique identifier from `issue_id` to `ticket` (ticket number), which is the true unique identifier.

### How to Test

#### Test 1: Import New Tickets
1. Open `csv-import-enhanced.html`
2. Upload a CSV file with new tickets
3. Select "Smart Update" mode
4. Click "Process CSV"
5. **Expected Result**: All new tickets should be inserted successfully

#### Test 2: Re-import Same Tickets (Not Started)
1. Re-upload the same CSV file
2. Select "Smart Update" mode
3. Click "Process CSV"
4. **Expected Result**: 
   - Status message should show "X updated, 0 inserted"
   - Tickets that haven't been started should be updated
   - No duplicates should be created

#### Test 3: Re-import with In-Progress Tickets
1. In the dashboard, start working on some tickets (click Start button)
2. Re-upload the same CSV file
3. Select "Smart Update" mode
4. Click "Process CSV"
5. **Expected Result**:
   - Status message should show "X skipped (in progress/special status)"
   - Started tickets should NOT be updated
   - Console should log which tickets were skipped
   - No duplicates should be created

#### Test 4: Verify Protection Criteria
The following tickets should be protected from updates:
- ✅ Tickets with `time_start != null` (started)
- ✅ Tickets with `time_end != null` (completed)
- ✅ Tickets with `needMos != null` (MoS requests)
- ✅ Tickets with `ticket_status_id != null` (has status)
- ✅ Tickets with `need_leader_support = true` (needs leader)
- ✅ Tickets with `agent_handle_ticket != null` (being handled)

**Test Steps**:
1. Create tickets with each of these conditions
2. Try to re-import them with Smart Update
3. Verify they are skipped and logged in console

---

## Fix #2: Real-time Notifications

### Problem Fixed
Notifications were only appearing after page refresh (F5), not in real-time.

### Solution
- Added subscription status logging
- Enhanced notification type detection
- Automatic celebration triggering for completion notifications

### How to Test

#### Test 1: Check Subscription Status
1. Open `dashboard-v2.html`
2. Open browser DevTools (F12)
3. Go to Console tab
4. Look for these messages:
   ```
   📡 Notifications channel status: SUBSCRIBED
   ✅ Successfully subscribed to notifications channel
   📡 Schedule assignments channel status: SUBSCRIBED
   ✅ Successfully subscribed to schedule assignments channel
   ✅ Realtime subscriptions setup initiated for user: [your user id]
   ```
5. **Expected Result**: All channels should show "SUBSCRIBED" status

#### Test 2: Test Real-time Celebration Notifications
**Setup**: You need two browser windows/tabs or two different users

**Window 1 (User completing tickets)**:
1. Open dashboard
2. Complete all your tickets (click End button on all tickets)
3. Wait for celebration effect

**Window 2 (Same user, different tab)**:
1. Open dashboard in another tab
2. Keep DevTools console open
3. **Expected Result**:
   - Console should show: `🔔 New notification received:`
   - Console should show: `🎉 Celebration notification received!`
   - Celebration fireworks should appear automatically
   - Toast message should appear: "🎉 Congratulations on completing a ticket!"

#### Test 3: Test Manual Schedule Notifications
**Setup**: Requires admin access to create schedule assignments

1. Have an admin create a manual schedule assignment for your user
2. Keep dashboard open with DevTools console
3. **Expected Result**:
   - Console should show: `📋 New schedule assignment received:`
   - Toast message should appear: "🔔 New schedule assignment received"
   - Banner should appear at top of dashboard automatically
   - No page refresh needed

#### Test 4: Verify Real-time Updates (No F5 Needed)
1. Open dashboard
2. Keep it open for several minutes
3. Have another user or admin:
   - Create a notification for you
   - Assign you to manual schedule
   - Send you a MoS request (if you're a leader)
4. **Expected Result**: All notifications should appear immediately without refreshing

---

## Fix #3: Manual Schedule Banner Button Link

### Problem Fixed
The "Start Task" button in the manual schedule banner was not working (function not globally accessible).

### Solution
Ensured the `openManualRescheduleTask` function is properly exposed to the global scope.

### How to Test

#### Test 1: Banner Button Click
1. Get assigned to a manual schedule task (or create one in database)
2. Open dashboard
3. You should see an orange banner at the top
4. Click the "🚀 Start Task" button
5. **Expected Result**: 
   - A new tab should open
   - The new tab should load `manual-reschedule-pos.html`
   - No console errors

#### Test 2: Notification Button Click
1. Open the notifications dropdown (bell icon)
2. Find a manual schedule notification
3. Click the "🚀 Start Task" button in the notification
4. **Expected Result**:
   - A new tab should open with `manual-reschedule-pos.html`
   - The notification should NOT be marked as read (event.stopPropagation works)
   - No console errors

#### Test 3: Popup Button Click (8:28 AM)
**Note**: This only appears at exactly 8:28 AM Vietnam time

1. If you have a manual schedule assignment for today
2. Wait until 8:28 AM (or modify the time check in code for testing)
3. A full-screen popup should appear
4. Click "Got it! Let's start 🚀" button
5. **Expected Result**:
   - Popup should close
   - No errors in console

#### Test 4: Dismiss Banner
1. When the manual schedule banner appears
2. Click the "✕" button
3. **Expected Result**:
   - Banner should disappear
   - No console errors

---

## Additional Verification

### Console Logging
With the fixes, you should see enhanced console logging:

**Notifications**:
- `🔔 New notification received:` - When any notification arrives
- `🎉 Celebration notification received!` - For celebration notifications
- `📝 Notification updated:` - When notification is updated

**MoS Requests** (for leaders):
- `🚢 New MoS request received:` - New MoS request
- `🚢 MoS request updated:` - MoS request updated

**Schedule Assignments**:
- `📋 New schedule assignment received:` - New assignment
- `📋 Schedule assignment updated:` - Assignment updated

**Subscriptions**:
- `📡 [Channel name] channel status: SUBSCRIBED` - Successful subscription
- `✅ Successfully subscribed to [channel name]` - Confirmation

### Database Verification

#### For CSV Import Fix:
```sql
-- Check for duplicate tickets (should return 0 rows)
SELECT ticket, COUNT(*) as count
FROM tickets
GROUP BY ticket
HAVING COUNT(*) > 1;

-- Verify protected tickets weren't updated
SELECT ticket, time_start, time_end, needMos, ticket_status_id, need_leader_support
FROM tickets
WHERE time_start IS NOT NULL 
   OR time_end IS NOT NULL
   OR needMos IS NOT NULL
   OR ticket_status_id IS NOT NULL
   OR need_leader_support = true;
```

#### For Notifications:
```sql
-- Check recent notifications
SELECT * FROM notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check celebration notifications
SELECT * FROM notifications
WHERE type = 'celebration'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Troubleshooting

### CSV Import Issues
**Problem**: Still seeing duplicates
- **Check**: Are you using the latest version of `csv-import-enhanced.html`?
- **Verify**: Look at console logs - are tickets being skipped correctly?
- **Database**: Run the duplicate check query above

**Problem**: Too many tickets being skipped
- **Check**: Console logs show which tickets are skipped and why
- **Verify**: Check if tickets actually have the special status fields set

### Real-time Notification Issues
**Problem**: Notifications not appearing in real-time
- **Check**: Console for subscription status messages
- **Verify**: All channels show "SUBSCRIBED" status
- **Network**: Check browser Network tab for WebSocket connections to Supabase
- **Firewall**: Ensure WebSocket connections are not blocked

**Problem**: Celebrations not triggering
- **Check**: Console for "🎉 Celebration notification received!" message
- **Verify**: Notification type is set to 'celebration' in database
- **Test**: Manually create a celebration notification in database

### Button Link Issues
**Problem**: "Start Task" button not working
- **Check**: Console for JavaScript errors
- **Verify**: Function is exposed: Type `window.openManualRescheduleTask` in console
- **Test**: Manually call `window.openManualRescheduleTask()` in console

---

## Success Criteria

### CSV Import ✅
- [ ] No duplicate tickets created
- [ ] In-progress tickets are protected
- [ ] Status messages show correct counts
- [ ] Console logs show skipped tickets

### Real-time Notifications ✅
- [ ] All channels show SUBSCRIBED status
- [ ] Notifications appear without F5
- [ ] Celebrations trigger automatically
- [ ] Manual schedule banner appears in real-time

### Button Links ✅
- [ ] Banner button opens correct page
- [ ] Notification button opens correct page
- [ ] No console errors
- [ ] Dismiss button works

---

## Performance Notes

All fixes maintain or improve performance:
- CSV import now uses ticket numbers (indexed field)
- Real-time subscriptions use efficient filters
- Button handlers use event delegation where possible

---

## Next Steps

After testing, if you encounter any issues:
1. Check the console for error messages
2. Verify database state
3. Check Supabase realtime settings
4. Review the code changes in the affected files

For further optimization opportunities, see `OPTIMIZATION_SUMMARY.md`.

