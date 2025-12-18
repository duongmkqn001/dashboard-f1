# Realtime Notifications Setup Guide

## Overview
This guide will help you enable realtime notifications in your Supabase database for the dashboard application. The system now supports realtime updates for:
- **Notifications** - New notifications and updates
- **MoS Requests** - New MoS requests and status changes (for leaders/keys)
- **Schedule Assignments** - New manual schedule assignments

## What Was Fixed

### 1. CSV Import Duplicate Detection Issue ✅
**Problem**: After using "Replace" or "Remove" actions on duplicates, the system would re-check for duplicates and show the same items again, creating a confusing loop.

**Solution**: Modified the duplicate handling logic to:
- After "Replace" action: Updates database records and removes them from the import list without re-checking
- After "Remove" action: Removes items from import list without re-checking
- Users can manually click "Check for Duplicates" button if they want to verify again
- Import button is enabled after these actions, allowing users to proceed

**Files Modified**:
- `csv-import-enhanced.html` (lines 1236-1253, 1280-1294)

### 2. Realtime Notification System ✅
**Problem**: Notifications only updated when:
- Page loads
- User marks a notification as read
- Users had to manually refresh to see new notifications

**Solution**: Implemented Supabase Realtime subscriptions that automatically update when:
- New notifications are inserted
- Notifications are updated
- New MoS requests are created (for leaders/keys)
- MoS requests are updated (for leaders/keys)
- New schedule assignments are created
- Schedule assignments are updated

**Files Modified**:
- `js/dashboard-v2.js` (added realtime subscription code)

## Supabase Setup Instructions

### Step 1: Enable Realtime in Supabase Dashboard

1. **Go to your Supabase Dashboard**
   - Navigate to: https://app.supabase.com/project/pfbxtbydrjcmqlrklsdr

2. **Enable Realtime for Tables**
   - Click on "Database" in the left sidebar
   - Click on "Replication" (or "Publications" in older versions)
   - You should see a section called "Realtime"
   
3. **Enable Realtime for the following tables**:
   - ✅ `notifications`
   - ✅ `mos_requests`
   - ✅ `schedule_assignments`

   For each table:
   - Find the table in the list
   - Toggle the "Realtime" switch to ON (enabled)
   - Make sure "INSERT" and "UPDATE" events are enabled

### Step 2: Verify Realtime is Working

#### Method 1: Using Supabase Dashboard
1. Go to "Database" → "Replication"
2. Check that the tables show "Realtime: Enabled"
3. You should see green checkmarks next to the enabled tables

#### Method 2: Using SQL Editor
Run this query in the SQL Editor to check which tables have realtime enabled:

```sql
SELECT 
    schemaname,
    tablename,
    CASE 
        WHEN tablename = ANY(
            SELECT tablename 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime'
        ) THEN 'Enabled'
        ELSE 'Disabled'
    END as realtime_status
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN ('notifications', 'mos_requests', 'schedule_assignments')
ORDER BY tablename;
```

Expected output:
```
schemaname | tablename              | realtime_status
-----------+------------------------+----------------
public     | mos_requests           | Enabled
public     | notifications          | Enabled
public     | schedule_assignments   | Enabled
```

### Step 3: Enable Realtime via SQL (Alternative Method)

If the UI method doesn't work, you can enable realtime using SQL:

```sql
-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for mos_requests table
ALTER PUBLICATION supabase_realtime ADD TABLE mos_requests;

-- Enable realtime for schedule_assignments table
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_assignments;
```

To verify:
```sql
-- Check which tables are in the realtime publication
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

### Step 4: Test the Realtime Functionality

1. **Open the dashboard in two browser windows/tabs**
   - Window 1: Your main dashboard (dashboard-v2.html)
   - Window 2: Admin view or another user's dashboard

2. **Test Notifications**:
   - In Window 2 (or via SQL), create a new notification for the user in Window 1
   - Window 1 should automatically update the notification badge without refreshing
   
   SQL to test:
   ```sql
   -- Replace 'YOUR_USER_STT' with actual user stt
   INSERT INTO notifications (recipient_id, message, type, read)
   VALUES (YOUR_USER_STT, 'Test realtime notification', 'test', false);
   ```

3. **Test MoS Requests** (for leaders/keys):
   - Create a new MoS request
   - Leaders/keys should see the MoS badge update automatically
   
   SQL to test:
   ```sql
   -- Replace with actual ticket_id and requester_id
   INSERT INTO mos_requests (ticket_id, requester_id, status, description)
   VALUES (123, 456, 'request', 'Test MoS request');
   ```

4. **Test Schedule Assignments**:
   - Create a new schedule assignment for a user
   - User should see a notification automatically
   
   SQL to test:
   ```sql
   -- Replace with actual agent_id
   INSERT INTO schedule_assignments (assignment_date, agent_id, account_export_name, assignment_type, status)
   VALUES (CURRENT_DATE, YOUR_AGENT_ID, 'Test Account', 'manual', 'assigned');
   ```

### Step 5: Monitor Realtime Connections

1. **Check Browser Console**:
   - Open browser DevTools (F12)
   - Go to Console tab
   - You should see: `✅ Realtime subscriptions setup complete`
   - When events occur, you'll see logs like:
     - `New notification received: {...}`
     - `New MoS request received: {...}`
     - `New schedule assignment received: {...}`

2. **Check Supabase Logs**:
   - Go to Supabase Dashboard → "Logs"
   - Select "Realtime" logs
   - You should see connection events and message deliveries

## Troubleshooting

### Issue: Realtime not working
**Solutions**:
1. Check that realtime is enabled for the tables (Step 1)
2. Verify your Supabase project has realtime enabled (some older projects may need to enable it in project settings)
3. Check browser console for errors
4. Ensure you're using the correct Supabase client version (should be v2+)

### Issue: "Permission denied" errors
**Solutions**:
1. Check Row Level Security (RLS) policies on the tables
2. Ensure the anon key has permission to subscribe to changes
3. You may need to add RLS policies that allow SELECT for realtime:

```sql
-- Example: Allow users to see their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
USING (auth.uid() = recipient_id OR recipient_id IN (
    SELECT stt FROM vcn_agent WHERE stt = recipient_id
));
```

### Issue: Subscriptions disconnect frequently
**Solutions**:
1. Check your internet connection
2. Supabase free tier has connection limits - consider upgrading if needed
3. The code includes automatic reconnection logic

### Issue: Duplicate notifications
**Solutions**:
1. Make sure you're not setting up subscriptions multiple times
2. The code includes cleanup logic to remove old subscriptions before creating new ones
3. Check that you're not calling `setupRealtimeSubscriptions()` multiple times

## How It Works

### Code Flow

1. **Initialization** (on page load):
   ```javascript
   // In dashboard-v2.js, line ~172
   setupRealtimeSubscriptions();
   ```

2. **Subscription Setup**:
   - Creates channels for each table
   - Listens for INSERT and UPDATE events
   - Filters events by current user (where applicable)

3. **Event Handling**:
   - When a new notification arrives → Updates badge count + shows toast
   - When a MoS request arrives → Updates MoS badge + shows toast
   - When a schedule assignment arrives → Checks for popup/banner + shows toast

4. **Cleanup**:
   - Subscriptions are cleaned up when page unloads
   - Old subscriptions are removed before creating new ones

### Performance Considerations

- Realtime subscriptions use WebSocket connections (efficient)
- Only relevant events are sent to each user (filtered server-side)
- Minimal impact on page performance
- Automatic reconnection on connection loss

## Additional Configuration (Optional)

### Customize Toast Notifications

You can modify the toast messages in `js/dashboard-v2.js`:

```javascript
// Line ~2365 - Notification received
showMessage('🔔 New notification received', 'info');

// Line ~2385 - MoS request received
showMessage('🔔 New MoS request received', 'info');

// Line ~2407 - Schedule assignment received
showMessage('🔔 New schedule assignment received', 'info');
```

### Add Sound Notifications

To add sound when notifications arrive, add this code:

```javascript
// Add after showMessage() calls
const audio = new Audio('notification-sound.mp3');
audio.play().catch(e => console.log('Audio play failed:', e));
```

### Disable Realtime (if needed)

To temporarily disable realtime without removing the code:

```javascript
// Comment out this line in the initialization
// setupRealtimeSubscriptions();
```

## Summary

✅ **CSV Import Issue**: Fixed duplicate detection loop  
✅ **Realtime Notifications**: Implemented for notifications, MoS requests, and schedule assignments  
✅ **Setup Required**: Enable realtime in Supabase Dashboard for 3 tables  
✅ **Testing**: Use the provided SQL queries to test functionality  

The system is now ready for realtime notifications! Just enable realtime in Supabase and test.

