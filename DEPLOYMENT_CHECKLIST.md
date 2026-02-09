# EU/NA Separation - Deployment Checklist

## Pre-Deployment Verification

- [x] All tasks completed
- [x] SQL scripts created
- [x] JavaScript code updated
- [x] Google Apps Script created
- [x] Documentation written

## Deployment Steps

### Step 1: Database Setup (Supabase)

- [ ] **1.1** Open Supabase SQL Editor
- [ ] **1.2** Run `sql/create_eu_export_view.sql`
  - This adds `reason_escalate` column to tickets table
  - This creates `tickets_export_eu_v` view
- [ ] **1.3** Verify column exists:
  ```sql
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'tickets' AND column_name = 'reason_escalate';
  ```
- [ ] **1.4** Verify view exists:
  ```sql
  SELECT * FROM tickets_export_eu_v LIMIT 5;
  ```

### Step 2: Update Agent Team Assignments

- [ ] **2.1** Identify EU team members
- [ ] **2.2** Update their team values:
  ```sql
  UPDATE agent SET team = 'EU' 
  WHERE agent_account IN ('agent1', 'agent2', 'agent3');
  ```
- [ ] **2.3** Verify team assignments:
  ```sql
  SELECT agent_account, agent_name, team 
  FROM agent 
  ORDER BY team, agent_account;
  ```

### Step 3: Create EU Google Sheet

- [ ] **3.1** Create new Google Sheet
- [ ] **3.2** Name it "EU Work Tracker" (or your preferred name)
- [ ] **3.3** Add header row in row 2:
  - Column A: Ticket Number
  - Column B: Date
  - Column C: Time Start
  - Column D: Time End
  - Column E: Ticket Type
  - Column F: Reason Escalate
  - Column G: Work Status
- [ ] **3.4** Copy Sheet ID from URL (between /d/ and /edit)
- [ ] **3.5** Save Sheet ID for next step

### Step 4: Deploy EU Google Apps Script

- [ ] **4.1** Go to https://script.google.com
- [ ] **4.2** Click "New Project"
- [ ] **4.3** Name project "EU Tracker Import"
- [ ] **4.4** Copy entire content from `scriptgs_eu.txt`
- [ ] **4.5** Paste into Code.gs
- [ ] **4.6** Update line 3: Replace `YOUR_EU_SHEET_ID_HERE` with your Sheet ID
- [ ] **4.7** Update line 6: Set `SHEET_EU_TRACKER` to your sheet name (default: 'EU Work Tracker')
- [ ] **4.8** Click "Deploy" → "New deployment"
- [ ] **4.9** Select type: "Web app"
- [ ] **4.10** Set "Execute as": Me
- [ ] **4.11** Set "Who has access": Anyone
- [ ] **4.12** Click "Deploy"
- [ ] **4.13** Copy the Web App URL
- [ ] **4.14** Save URL for next step

### Step 5: Update Frontend Configuration

- [ ] **5.1** Open `js/eu-import.js`
- [ ] **5.2** Find line 7: `const EU_APPS_SCRIPT_URL = 'YOUR_EU_APPS_SCRIPT_URL_HERE';`
- [ ] **5.3** Replace with your Web App URL from Step 4.13
- [ ] **5.4** Save file

### Step 6: Deploy Frontend Changes

- [ ] **6.1** Ensure `js/eu-import.js` is included in your project
- [ ] **6.2** Ensure `js/dashboard-v2.js` has the updated code (already done)
- [ ] **6.3** Add EU import button to your dashboard HTML (if not present):
  ```html
  <button id="import-eu-btn" class="btn btn-primary">Import EU Tickets</button>
  ```
- [ ] **6.4** Include EU import script in HTML:
  ```html
  <script src="js/eu-import.js"></script>
  ```
- [ ] **6.5** Initialize on page load:
  ```javascript
  initializeEUImport();
  ```
- [ ] **6.6** Deploy updated files to your web server

## Testing

### Test 1: EU Escalation Reason Prompt

- [ ] **T1.1** Login as EU team member
- [ ] **T1.2** Start a ticket
- [ ] **T1.3** Select "Move to onshore - Unassign" status
- [ ] **T1.4** Click "End" button
- [ ] **T1.5** Verify prompt appears asking for escalation reason
- [ ] **T1.6** Enter a reason and submit
- [ ] **T1.7** Verify ticket ends successfully
- [ ] **T1.8** Check database:
  ```sql
  SELECT id, ticket, reason_escalate 
  FROM tickets 
  WHERE id = <ticket_id>;
  ```
- [ ] **T1.9** Verify reason_escalate is saved

### Test 2: EU Escalation Reason Required

- [ ] **T2.1** Login as EU team member
- [ ] **T2.2** Start a ticket
- [ ] **T2.3** Select "Move to onshore - Unassign" status
- [ ] **T2.4** Click "End" button
- [ ] **T2.5** When prompt appears, leave empty and submit
- [ ] **T2.6** Verify error message appears
- [ ] **T2.7** Verify ticket does NOT end

### Test 3: NA Team No Prompt

- [ ] **T3.1** Login as NA team member
- [ ] **T3.2** Start a ticket
- [ ] **T3.3** Select any status (including "Move to onshore - Unassign" if available)
- [ ] **T3.4** Click "End" button
- [ ] **T3.5** Verify NO prompt appears
- [ ] **T3.6** Verify ticket ends normally

### Test 4: EU Import to Google Sheets

- [ ] **T4.1** Complete 2-3 tickets as EU team member
- [ ] **T4.2** Click "Import EU Tickets" button
- [ ] **T4.3** Verify success message appears
- [ ] **T4.4** Open EU Google Sheet
- [ ] **T4.5** Verify tickets appear in sheet
- [ ] **T4.6** Verify all columns populated correctly
- [ ] **T4.7** Verify "Reason Escalate" shows for "Move to onshore - Unassign" tickets
- [ ] **T4.8** Check database:
  ```sql
  SELECT id, ticket, import_to_tracker 
  FROM tickets 
  WHERE id IN (<ticket_ids>);
  ```
- [ ] **T4.9** Verify import_to_tracker = true

### Test 5: EU View Filtering

- [ ] **T5.1** Run query:
  ```sql
  SELECT COUNT(*) FROM tickets_export_eu_v;
  ```
- [ ] **T5.2** Verify only EU team tickets are included
- [ ] **T5.3** Verify all required columns present
- [ ] **T5.4** Verify "Reason Escalate" only shows for appropriate status

## Post-Deployment

- [ ] **P1** Monitor for errors in browser console
- [ ] **P2** Monitor Google Apps Script execution logs
- [ ] **P3** Verify EU team members can use system normally
- [ ] **P4** Verify NA team members unaffected
- [ ] **P5** Document any issues encountered
- [ ] **P6** Update team on new EU workflow

## Rollback Plan (If Needed)

If issues occur:

1. **Database Rollback**:
   ```sql
   -- Remove reason_escalate column (optional)
   ALTER TABLE tickets DROP COLUMN IF EXISTS reason_escalate;
   
   -- Drop EU view
   DROP VIEW IF EXISTS tickets_export_eu_v;
   ```

2. **Frontend Rollback**:
   - Revert `js/dashboard-v2.js` to previous version
   - Remove `js/eu-import.js` from HTML includes
   - Remove EU import button

3. **Google Apps Script**:
   - No action needed (won't be called if frontend reverted)

## Documentation

- [x] `docs/EU_NA_SEPARATION_GUIDE.md` - Complete implementation guide
- [x] `docs/EU_NA_IMPLEMENTATION_SUMMARY.md` - Summary of changes
- [x] `docs/Ticket type NA.md` - NA ticket types (already exists)
- [x] `docs/Ticket type EU.md` - EU ticket types (already exists)
- [x] `DEPLOYMENT_CHECKLIST.md` - This checklist

## Support Contacts

- Database issues: Check Supabase logs
- Frontend issues: Check browser console
- Google Sheets issues: Check Apps Script execution logs
- Questions: Refer to `docs/EU_NA_SEPARATION_GUIDE.md`

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Sign-off**: _______________

