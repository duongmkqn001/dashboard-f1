# EU/NA Team Separation Implementation Guide

## Overview
This guide documents the implementation of separate workflows for EU (Europe) and NA (North America) teams in the F1 Dashboard system.

## Key Changes

### 1. Database Schema Changes

#### Agent Table
- **Column Added**: `team` (TEXT)
- **Purpose**: Distinguish between EU and NA team members
- **Values**: 
  - `'EU'` for European team members
  - `'NA'` for North American team members (default)
- **SQL File**: `sql/add_team_column_to_agent.sql`

#### Tickets Table
- **Column Added**: `reason_escalate` (TEXT)
- **Purpose**: Store escalation reason when EU team members end tickets with "Move to onshore - Unassign" status
- **SQL File**: `sql/create_eu_export_view.sql`

### 2. Database Views

#### EU Export View (`tickets_export_eu_v`)
A dedicated view for EU team tickets with the following columns:
- Ticket Number
- Date
- Time Start
- Time End
- Ticket Type
- Reason Escalate (only shown when status is "Move to onshore - Unassign")
- Work Status
- Agent Name
- Account

**Filter**: Only includes tickets where `agent.team = 'EU'`

### 3. Google Sheets Integration

#### NA Tracker (Existing)
- **Script**: `scriptgs.txt`
- **View**: `tickets_export_v`
- **Sheets**: Work tracker (AOPS), Work tracker (FMOP), OT Tracker

#### EU Tracker (New)
- **Script**: `scriptgs_eu.txt`
- **View**: `tickets_export_eu_v`
- **Sheet**: EU Work Tracker
- **Columns**: Ticket Number, Date, Time Start, Time End, Ticket Type, Reason Escalate, Work Status

### 4. Frontend Changes

#### Dashboard (dashboard-v2.js)
**EU-Specific Logic**:
- When an EU team member ends a ticket with "Move to onshore - Unassign" status:
  1. System prompts for escalation reason
  2. Validates that reason is provided
  3. Saves reason to `tickets.reason_escalate` column
- NA team members skip this step automatically

**Implementation Location**: `handleGroupAction()` function (lines 1106-1135)

#### EU Import Module (js/eu-import.js)
- Handles importing EU tickets to Google Sheets
- Marks tickets as imported in Supabase
- Prevents duplicate imports

## Setup Instructions

### Step 1: Database Setup

1. **Add team column to agent table** (if not already exists):
```sql
-- Run sql/add_team_column_to_agent.sql in Supabase SQL Editor
```

2. **Add reason_escalate column and create EU view**:
```sql
-- Run sql/create_eu_export_view.sql in Supabase SQL Editor
```

3. **Verify changes**:
```sql
-- Check agent table
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'agent' AND column_name = 'team';

-- Check tickets table
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'tickets' AND column_name = 'reason_escalate';

-- Check EU view
SELECT * FROM tickets_export_eu_v LIMIT 5;
```

### Step 2: Update Agent Records

Set team values for all agents:
```sql
-- Set EU team members
UPDATE agent SET team = 'EU' WHERE agent_account IN ('eu_agent1', 'eu_agent2', ...);

-- Set NA team members (or leave as default)
UPDATE agent SET team = 'NA' WHERE team IS NULL OR team = '';
```

### Step 3: Google Sheets Setup

1. **Create EU Google Sheet**:
   - Create a new Google Sheet for EU tracker
   - Add header row with columns: Ticket Number, Date, Time Start, Time End, Ticket Type, Reason Escalate, Work Status
   - Note the Sheet ID from the URL

2. **Deploy EU Apps Script**:
   - Open Google Apps Script (script.google.com)
   - Create new project named "EU Tracker Import"
   - Copy content from `scriptgs_eu.txt`
   - Update `SHEET_ID` with your EU sheet ID
   - Deploy as Web App
   - Copy the deployment URL

3. **Update Frontend Configuration**:
   - Open `js/eu-import.js`
   - Replace `YOUR_EU_APPS_SCRIPT_URL_HERE` with your deployment URL

### Step 4: Frontend Integration

Add EU import button to your dashboard HTML (if not already present):
```html
<button id="import-eu-btn" class="btn btn-primary">Import EU Tickets</button>
```

Include the EU import script:
```html
<script src="js/eu-import.js"></script>
```

Initialize on page load:
```javascript
// In your initialization code
initializeEUImport();
```

## Ticket Type Differences

### NA Team (docs/Ticket type NA.md)
- Standard AOPS/FMOP/POS ticket types
- Statuses: Done, Waiting for SU, Pending (Ask IH), Move to onshore - Unassign, Pause

### EU Team (docs/Ticket type EU.md)
- Extended ticket types including PWAO categories
- Additional statuses: Done, Escalated for IH support, In Progress, Waiting for Supplier
- All ticket types support POS/AOPS/FMOP/CGOB/OP projects

## Testing

### Test EU Escalation Flow
1. Login as EU team member
2. Start a ticket
3. Select "Move to onshore - Unassign" status
4. Click End button
5. Verify prompt appears for escalation reason
6. Enter reason and submit
7. Check database: `SELECT reason_escalate FROM tickets WHERE id = <ticket_id>;`

### Test NA Flow
1. Login as NA team member
2. Start a ticket
3. Select any status
4. Click End button
5. Verify no escalation prompt appears
6. Ticket ends normally

### Test EU Import
1. Complete some EU tickets
2. Click "Import EU Tickets" button
3. Verify tickets appear in EU Google Sheet
4. Verify tickets marked as imported in database

## Troubleshooting

### Issue: Escalation prompt not appearing for EU team
- Check agent.team value: `SELECT team FROM agent WHERE agent_account = '<account>';`
- Verify ticket status name matches exactly: "Move to onshore - Unassign"

### Issue: EU tickets not importing
- Check EU Apps Script deployment URL
- Verify SECRET_TOKEN matches in both frontend and Apps Script
- Check Apps Script logs for errors
- Verify EU view returns data: `SELECT COUNT(*) FROM tickets_export_eu_v;`

### Issue: Reason escalate not saving
- Verify reason_escalate column exists in tickets table
- Check browser console for errors
- Verify Supabase permissions allow updating reason_escalate column

## Files Modified/Created

### SQL Files
- `sql/add_team_column_to_agent.sql` - Adds team column to agent table
- `sql/create_eu_export_view.sql` - Adds reason_escalate column and creates EU view

### JavaScript Files
- `js/dashboard-v2.js` - Modified handleGroupAction() for EU escalation logic
- `js/eu-import.js` - New file for EU import functionality

### Google Apps Script
- `scriptgs_eu.txt` - EU-specific Google Sheets import script

### Documentation
- `docs/Ticket type NA.md` - NA team ticket types and statuses
- `docs/Ticket type EU.md` - EU team ticket types and statuses
- `docs/EU_NA_SEPARATION_GUIDE.md` - This file

## Maintenance

### Adding New EU Team Members
```sql
UPDATE agent SET team = 'EU' WHERE agent_account = '<new_eu_agent>';
```

### Adding New NA Team Members
```sql
UPDATE agent SET team = 'NA' WHERE agent_account = '<new_na_agent>';
```

### Changing Team Assignment
```sql
UPDATE agent SET team = '<new_team>' WHERE agent_account = '<agent_account>';
```

## Support

For issues or questions, refer to:
- Database schema: Check Supabase table definitions
- Frontend logic: Review `js/dashboard-v2.js` and `js/eu-import.js`
- Import process: Check Google Apps Script logs

