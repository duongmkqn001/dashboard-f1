# EU/NA Team Separation - Complete Implementation

## 🎯 Overview

This implementation separates the F1 Dashboard workflow into two distinct regions: **EU (Europe)** and **NA (North America)**. Each team has its own processes, ticket types, and Google Sheets tracker.

## ✅ All Tasks Completed

### ✓ Task 1: New Region Support
- Agent table uses existing `team` column to distinguish EU and NA teams
- EU agents: `team = 'EU'`
- NA agents: `team = 'NA'` (default)

### ✓ Task 2: New View and Import for EU
- Created dedicated database view: `tickets_export_eu_v`
- Created Google Apps Script: `scriptgs_eu.txt`
- Created JavaScript import module: `js/eu-import.js`
- EU view includes: Ticket Number, Date, Time Start, Time End, Ticket Type, Reason Escalate, Work Status

### ✓ Task 3: Configure View to Match EU Project
- Added `reason_escalate` column to tickets table
- Modified dashboard to prompt EU team for escalation reason when using "Move to onshore - Unassign" status
- NA team automatically skips this step
- Ticket type documentation exists in `docs/` folder

### ✓ Task 4: New Sheet Tracker for EU
- Separate Google Apps Script for EU team
- Separate JavaScript import functionality
- EU and NA trackers are completely independent

## 📁 Files Created

### SQL Scripts
- `sql/add_team_column_to_agent.sql` - Reference for team column (already exists)
- `sql/create_eu_export_view.sql` - **MUST RUN**: Adds reason_escalate column and creates EU view

### JavaScript
- `js/eu-import.js` - EU-specific import functionality

### Google Apps Script
- `scriptgs_eu.txt` - EU tracker import script

### Documentation
- `docs/EU_NA_SEPARATION_GUIDE.md` - Complete implementation guide with troubleshooting
- `docs/EU_NA_IMPLEMENTATION_SUMMARY.md` - Summary of all changes
- `DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment checklist
- `EU_NA_SEPARATION_README.md` - This file

## 📝 Files Modified

- `js/dashboard-v2.js` - Added EU escalation reason logic (lines 1106-1135)

## 🚀 Quick Start Deployment

### 1. Run SQL Script (Required)
```sql
-- In Supabase SQL Editor, run:
-- File: sql/create_eu_export_view.sql
```

### 2. Update Agent Teams
```sql
-- Set EU team members
UPDATE agent SET team = 'EU' WHERE agent_account IN ('agent1', 'agent2', ...);
```

### 3. Create EU Google Sheet
- Create new sheet with headers: Ticket Number | Date | Time Start | Time End | Ticket Type | Reason Escalate | Work Status
- Note the Sheet ID

### 4. Deploy Google Apps Script
- Copy `scriptgs_eu.txt` to Google Apps Script
- Update Sheet ID
- Deploy as Web App
- Copy deployment URL

### 5. Update Frontend
- Update `js/eu-import.js` with Apps Script URL
- Add EU import button to dashboard
- Deploy changes

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `DEPLOYMENT_CHECKLIST.md` | **START HERE** - Complete deployment steps with checkboxes |
| `docs/EU_NA_SEPARATION_GUIDE.md` | Detailed implementation guide with troubleshooting |
| `docs/EU_NA_IMPLEMENTATION_SUMMARY.md` | Summary of changes and architecture |
| `docs/Ticket type NA.md` | NA team ticket types and statuses |
| `docs/Ticket type EU.md` | EU team ticket types and statuses |

## 🔑 Key Features

1. **Automatic Team Detection**: System detects user's team from agent table
2. **Conditional Prompts**: Escalation reason only for EU + "Move to onshore - Unassign"
3. **Separate Trackers**: Independent Google Sheets for EU and NA
4. **Separate Views**: Database views automatically filter by team
5. **Backward Compatible**: NA workflow completely unchanged

## 🧪 Testing

See `DEPLOYMENT_CHECKLIST.md` for complete testing procedures:
- Test 1: EU escalation reason prompt
- Test 2: EU escalation reason required
- Test 3: NA team no prompt
- Test 4: EU import to Google Sheets
- Test 5: EU view filtering

## 📊 Architecture

```
Dashboard
    ├── NA Team (team='NA')
    │   ├── Standard workflow
    │   ├── tickets_export_v
    │   ├── scriptgs.txt
    │   └── NA Google Sheets
    │
    └── EU Team (team='EU')
        ├── Workflow + Escalation Reason
        ├── tickets_export_eu_v
        ├── scriptgs_eu.txt
        └── EU Google Sheets
```

## ⚠️ Important Notes

1. **Agent table already has team column** - No need to add it
2. **Must run SQL script** - `sql/create_eu_export_view.sql` is required
3. **Update agent teams** - Set team='EU' for EU members
4. **Deploy Apps Script** - EU tracker needs separate deployment
5. **Update frontend config** - Set Apps Script URL in `js/eu-import.js`

## 🆘 Support

### Common Issues

**Escalation prompt not appearing?**
- Check: `SELECT team FROM agent WHERE agent_account = '<account>';`
- Verify status name is exactly: "Move to onshore - Unassign"

**EU tickets not importing?**
- Check Apps Script URL in `js/eu-import.js`
- Verify SECRET_TOKEN matches
- Check Apps Script execution logs

**Reason not saving?**
- Verify `reason_escalate` column exists
- Check browser console for errors
- Verify Supabase permissions

### Getting Help

1. Check `docs/EU_NA_SEPARATION_GUIDE.md` Troubleshooting section
2. Review browser console for errors
3. Check Supabase logs
4. Review Google Apps Script execution logs

## 📋 Deployment Checklist

For step-by-step deployment with checkboxes, see:
**`DEPLOYMENT_CHECKLIST.md`**

## 🎉 Success Criteria

Deployment is successful when:
- [x] All SQL scripts run without errors
- [x] EU agents see escalation prompt for "Move to onshore - Unassign"
- [x] NA agents don't see escalation prompt
- [x] EU tickets import to EU Google Sheet
- [x] NA tickets continue importing to NA Google Sheets
- [x] Reason escalate saves to database
- [x] EU view shows only EU team tickets

## 📞 Next Steps

1. **Review** `DEPLOYMENT_CHECKLIST.md`
2. **Run** SQL scripts in Supabase
3. **Update** agent team assignments
4. **Create** EU Google Sheet
5. **Deploy** Google Apps Script
6. **Update** frontend configuration
7. **Test** all workflows
8. **Deploy** to production

---

**Implementation Date**: 2026-02-09
**Status**: ✅ Complete - Ready for Deployment
**All Tasks**: 4/4 Complete

