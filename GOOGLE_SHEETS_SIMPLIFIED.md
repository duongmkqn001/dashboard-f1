# Google Sheets Integration - Simplified with tickets_export_v View

## Problem Solved
- ❌ Data validation errors in Google Sheets (cell G4251)
- ❌ Complex data formatting in JavaScript
- ❌ Duplicate logic between dashboard and Apps Script

## New Solution
Instead of sending all ticket data from the dashboard, we now:
1. Dashboard sends only the **ticket ID**
2. Apps Script queries the **tickets_export_v view** in Supabase
3. View already has all data properly formatted
4. Apps Script inserts data into Google Sheets
5. Apps Script marks `import_to_tracker = true`

## Benefits
✅ **No data validation errors** - View ensures data is properly formatted
✅ **Single source of truth** - All formatting logic in the SQL view
✅ **Simpler code** - Dashboard just sends ticket ID
✅ **Easier maintenance** - Change formatting in one place (the view)
✅ **Automatic conversions** - View handles all special cases

## How It Works

### 1. SQL View (tickets_export_v)
The view handles all data formatting:
- **Project**: Extracts from ticket prefix (AOPS/FMOP)
- **Ticket Type**: Converts special cases:
  - 'Email Request' → 'Carrier Inquiry' (FMOP only)
  - 'Update Tracking Number' → 'Update tracking number/Order Status' (AOPS only)
  - 'Change Pick up carrier' → 'Change Pickup carrier'
- **Supplier**: Formats as "suid - su_name"
- **Start/End Time**: Converts to Vietnamese timezone (HH24:MI:SS)
- **Name**: Gets from vcn_agent table
- **Account**: Gets Export_name from agent table
- **Ticket Status**: Gets status_name from ticket_status table

### 2. Dashboard (js/dashboard-v2.js)
Simplified to just send ticket ID:
```javascript
await sendTicketToGoogleSheets(ticketId);
```

### 3. Google Apps Script (scriptgs.txt)
1. Receives ticket ID
2. Queries tickets_export_v view
3. Finds nearest blank row in Date column
4. Inserts data
5. Marks import_to_tracker = true

## Files Modified

### 1. js/dashboard-v2.js
**Changes:**
- Removed all data formatting logic
- Removed `convertIssueTypeForTracker()` function
- Simplified `sendTicketToGoogleSheets()` to only send ticket ID
- Increased timeout to 10 seconds for database query

**Lines changed:** 1933-2053

### 2. scriptgs.txt
**Changes:**
- Added `fetchTicketFromView()` function to query tickets_export_v
- Simplified `addSingleTicketToSheet()` to use view data
- Removed `isValidTicketType()` function (view handles this)
- Updated `doGet()` to fetch from view instead of receiving data
- Field mapping updated to match view column names

**Lines changed:** 37-250

## Database View Structure

The `tickets_export_v` view returns these columns:
- `id` - Ticket ID
- `Project` - AOPS or FMOP
- `Ticket` - Ticket number (e.g., AOPS-1337243)
- `PO` - PO numbers
- `Ticket Type` - Converted issue type name
- `Supplier` - Format: "suid - su_name"
- `Start Time` - Vietnamese time (HH:MI:SS)
- `End Time` - Vietnamese time (HH:MI:SS)
- `Name` - Agent name from vcn_agent
- `Account` - Export_name from agent table
- `Ticket Status` - Status name
- `import_to_tracker` - Boolean flag

**View filters:**
- Only tickets with time_start, time_end, ticket_status_id, agent_handle_ticket
- Only tickets where import_to_tracker = false
- Only AOPS and FMOP projects
- Ordered by time_start DESC

## 🚨 REQUIRED: Redeploy Google Apps Script

**You MUST redeploy for changes to work:**

### Step-by-Step:

1. **Open Google Apps Script:**
   - Go to: https://script.google.com/home
   - Open your project

2. **Replace Code:**
   - Copy ALL code from `scriptgs.txt`
   - Paste into script editor (replace everything)

3. **Deploy:**
   - Click **Deploy** → **Manage deployments**
   - Click **Edit** (✏️) on existing deployment
   - Select **New version**
   - Description: "Simplified with tickets_export_v view"
   - Click **Deploy**

## Testing

### After Redeploying:

1. **Complete a ticket:**
   - Open `dashboard-v2.html`
   - Complete a ticket
   - Select status and click "End"

2. **Check Console:**
   - Open browser console (F12)
   - Should see: `✅ Ticket successfully sent to Google Sheets: AOPS-XXXXXX`
   - Should see NO errors

3. **Check Google Sheets:**
   - Open your Google Sheet
   - Check "Work tracker (AOPS)" or "Work tracker (FMOP)"
   - Verify data appears in **nearest blank row**
   - Verify all columns are properly formatted

4. **Check Supabase:**
   - Query: `SELECT * FROM tickets WHERE id = [ticket_id]`
   - Verify `import_to_tracker = true`

5. **Test special cases:**
   - Complete FMOP ticket with "Email Request" status
   - Should appear as "Carrier Inquiry" in Google Sheets
   - Complete AOPS ticket with "Update Tracking Number" status
   - Should appear as "Update tracking number/Order Status"

## Troubleshooting

### If ticket doesn't appear in Google Sheets:

1. **Check if ticket is in the view:**
   ```sql
   SELECT * FROM tickets_export_v WHERE id = [ticket_id];
   ```
   - If no results, ticket doesn't meet view criteria
   - Check: time_start, time_end, ticket_status_id, agent_handle_ticket must all be set
   - Check: import_to_tracker must be false

2. **Check Apps Script execution logs:**
   - Go to Apps Script editor
   - Click **Executions** (clock icon)
   - Look for recent executions and errors

3. **Check browser console:**
   - Look for error messages
   - Verify callback was called

### If data validation error occurs:

- The view should prevent this by formatting data correctly
- Check which column has the error
- Verify the view query returns correct format for that column
- Check Google Sheets data validation rules

### If import_to_tracker not updated:

- Check Apps Script execution logs for errors
- Verify SUPABASE_KEY has write permissions
- Check network tab for PATCH request to Supabase

## Data Flow Diagram

```
User clicks "End" on ticket
         ↓
Dashboard: handleEndTicket(ticketId)
         ↓
Dashboard: sendTicketToGoogleSheets(ticketId)
         ↓
Apps Script: doGet(ticketId)
         ↓
Apps Script: fetchTicketFromView(ticketId)
         ↓
Supabase: SELECT * FROM tickets_export_v WHERE id = ticketId
         ↓
Apps Script: addSingleTicketToSheet(ticketData)
         ↓
Google Sheets: Insert at nearest blank row
         ↓
Apps Script: markTicketAsImported(ticketId)
         ↓
Supabase: UPDATE tickets SET import_to_tracker = true
         ↓
✅ Complete!
```

## Summary

**Before:**
- Dashboard formatted all data
- Sent 10+ fields to Apps Script
- Duplicate formatting logic
- Data validation errors

**After:**
- Dashboard sends only ticket ID
- Apps Script queries tickets_export_v
- All formatting in SQL view
- No data validation errors
- Single source of truth

**Next Step:** Redeploy the Google Apps Script!

