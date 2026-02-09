# EU Google Apps Script Debugging Guide

## 🔧 How to Debug the EU Script

### Step 1: Copy Updated Script to Google Sheets
1. Open your EU tracker Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Replace all code with the updated `scriptgs_eu.txt`
4. Click **Save** (💾 icon)

### Step 2: Run Test Functions

The script now has 4 test functions with detailed logging:

#### Test 1: `testFetchData()` - Test Supabase Connection
**What it does:** Checks if you can fetch EU tickets from Supabase
**How to run:**
1. In Apps Script editor, select `testFetchData` from the function dropdown
2. Click **Run** (▶️ icon)
3. Check **Execution log** (View → Logs or Ctrl+Enter)

**What to look for:**
- ✅ `SUCCESS: Fetched X tickets` - Connection works!
- ❌ `ERROR: ...` - Check the error message
- ⚠️ `No tickets found` - Check if EU team has tickets

#### Test 2: `testSheetAccess()` - Test Sheet Access
**What it does:** Checks if the script can access your Google Sheet
**How to run:**
1. Select `testSheetAccess` from dropdown
2. Click **Run**
3. Check logs

**What to look for:**
- ✅ Shows spreadsheet name and active sheet
- ✅ Shows existing headers
- ❌ `No active sheet found` - Make sure a sheet is active

#### Test 3: `testEUImport()` - Test Import Process
**What it does:** Tests the complete import without marking tickets as imported
**How to run:**
1. Select `testEUImport` from dropdown
2. Click **Run**
3. Check logs and your sheet

**What to look for:**
- ✅ `Import result: {"count": X, "updated": Y}`
- Check if new rows appear in your sheet

#### Test 4: `testCompleteFlow()` - Test Everything
**What it does:** Simulates the complete doPost flow
**How to run:**
1. Select `testCompleteFlow` from dropdown
2. Click **Run**
3. Check logs

### Step 3: Check Execution Logs

**To view logs:**
1. In Apps Script editor: **View** → **Logs** (or Ctrl+Enter)
2. Or click **Execution log** at the bottom

**Log Symbols:**
- 🚀 = Process started
- ✅ = Success
- ❌ = Error
- ⚠️ = Warning
- 📊 = Data info
- 🔍 = Searching/checking
- 📝 = Writing data

### Step 4: Common Issues and Solutions

#### Issue: "Supabase returned status 404"
**Solution:** The view `tickets_export_eu_v` doesn't exist
- Run `sql/create_eu_export_view.sql` in Supabase SQL Editor

#### Issue: "No tickets found"
**Possible causes:**
1. No agents have `team = 'EU'` in the agent table
2. No EU agents are assigned to tickets
3. All EU tickets already have `import_to_tracker = true`

**Check in Supabase:**
```sql
-- Check EU agents
SELECT * FROM agent WHERE team = 'EU';

-- Check EU tickets
SELECT * FROM tickets_export_eu_v LIMIT 10;
```

#### Issue: "No active sheet found"
**Solution:** Make sure you have a sheet open when running the script

#### Issue: "Unauthorized"
**Solution:** Check that `SECRET_TOKEN` in script matches the one in `js/eu-import.js`

### Step 5: Deploy as Web App

Once tests pass:
1. Click **Deploy** → **New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy**
6. Copy the **Web app URL**
7. Update `SCRIPT_URL_EU` in `js/eu-import.js` with this URL

### Step 6: Test from Dashboard

1. Refresh your dashboard (Ctrl+F5)
2. Toggle to EU mode
3. Click "🇪🇺 Import EU" button
4. Check browser console (F12) for any errors
5. Check Apps Script execution log for detailed logs

## 📋 Checklist

- [ ] Updated script copied to Google Apps Script
- [ ] Ran `testFetchData()` - passes ✅
- [ ] Ran `testSheetAccess()` - passes ✅
- [ ] Ran `testEUImport()` - passes ✅
- [ ] Ran `testCompleteFlow()` - passes ✅
- [ ] Deployed as Web App
- [ ] Updated `SCRIPT_URL_EU` in `js/eu-import.js`
- [ ] Tested from dashboard

## 🆘 Still Having Issues?

Share the **complete execution log** from Apps Script. The detailed emoji logs will help identify exactly where the problem is!

