# EU Import Troubleshooting Guide

## 🔍 Issue: "Nothing goes to EU sheet, still goes to NA"

Let's debug this step by step!

---

## Step 1: Verify Database Setup

### Check if EU view exists in Supabase:

```sql
-- Run this in Supabase SQL Editor
SELECT * FROM tickets_export_eu_v LIMIT 5;
```

**Expected result:** Should return EU team tickets
**If error:** Run `sql/create_eu_export_view.sql` first

### Check if you have EU team members:

```sql
-- Check EU agents
SELECT agent_account, name, team FROM agent WHERE team = 'EU';
```

**Expected result:** Should show your EU team members
**If empty:** You need to set `team = 'EU'` for EU agents

### Check if EU agents have completed tickets:

```sql
-- Check completed tickets by EU team
SELECT 
    t.ticket,
    t.assignee_account,
    a.team,
    t.import_to_tracker
FROM tickets t
JOIN agent a ON a.agent_account = t.assignee_account
WHERE a.team = 'EU'
    AND t.time_start IS NOT NULL
    AND t.time_end IS NOT NULL
    AND t.ticket_status_id IS NOT NULL
LIMIT 10;
```

**Expected result:** Should show EU tickets
**If empty:** EU team hasn't completed any tickets yet

---

## Step 2: Test EU Google Apps Script

### In Google Apps Script Editor:

1. Open your EU tracker Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Make sure you've copied the updated `scriptgs_eu.txt`
4. Run `testCompleteFlow()` function
5. Check **Execution log** (View → Logs)

**What to look for:**
- ✅ `Fetched X tickets from Supabase` - Script can connect
- ✅ `Import completed: X new tickets added` - Import works
- ❌ Any error messages - Share them with me

---

## Step 3: Test from Dashboard

### Open browser console (F12) and follow these steps:

1. **Refresh dashboard** (Ctrl+F5 to clear cache)
2. **Check console for initialization:**
   - Should see: `🔧 Initializing EU import functionality...`
   - Should see: `✅ EU import button found, adding click listener`

3. **Toggle to EU mode:**
   - Click the EU/NA toggle
   - Should see: `🇪🇺 EU Team Mode - Viewing EU tickets only`
   - EU import button should appear
   - CSV import button should hide

4. **Click EU Import button:**
   - Should see: `🇪🇺 === EU IMPORT STARTED ===`
   - Should see: `📡 Calling EU Google Apps Script...`
   - Should see: `🌐 URL: https://script.google.com/macros/s/...`
   - Should see: `📊 Response status: 200`
   - Should see: `📦 Response data: {success: true, ...}`

5. **Check what happens:**
   - If successful: `✅ Import successful: X tickets imported`
   - If error: Share the error message

---

## Step 4: Common Issues & Solutions

### Issue A: "Tickets go to NA sheet instead of EU sheet"

**Cause:** You might be clicking the wrong import button

**Solution:**
1. Make sure you toggle to **EU mode** first (toggle should be checked/purple)
2. Click the **🇪🇺 Import EU** button (NOT the CSV Import button)
3. The EU script URL is: `https://script.google.com/macros/s/AKfycbxx70shS7RkOO0lWmn3bVSH1Mw5vNprz5RJYHMZakOfZSMbMipciaDBzKaAfU0TbxKl/exec`

### Issue B: "No tickets appear in EU sheet"

**Possible causes:**
1. No EU team members in database
2. EU team hasn't completed any tickets
3. All EU tickets already have `import_to_tracker = true`

**Check:**
```sql
-- How many EU tickets are ready to import?
SELECT COUNT(*) FROM tickets_export_eu_v;
```

### Issue C: "EU import button doesn't appear"

**Solution:**
1. Make sure `js/eu-import.js` is loaded (check browser console)
2. Make sure you toggled to EU mode
3. Hard refresh (Ctrl+F5)

### Issue D: "Import button does nothing"

**Check browser console for:**
- JavaScript errors
- Network errors
- CORS errors

---

## Step 5: Manual Test

### Test the EU script directly:

Open this URL in your browser (replace with your script URL):
```
https://script.google.com/macros/s/AKfycbxx70shS7RkOO0lWmn3bVSH1Mw5vNprz5RJYHMZakOfZSMbMipciaDBzKaAfU0TbxKl/exec
```

**Expected:** Should see an error (because no POST data)
**This confirms:** The script is deployed and accessible

---

## 📋 Debugging Checklist

Run through this checklist and tell me which step fails:

- [ ] Step 1.1: `SELECT * FROM tickets_export_eu_v` returns data
- [ ] Step 1.2: EU agents exist in database
- [ ] Step 1.3: EU agents have completed tickets
- [ ] Step 2: `testCompleteFlow()` in Apps Script works
- [ ] Step 3.1: Dashboard loads without errors
- [ ] Step 3.2: EU import button initializes
- [ ] Step 3.3: Toggle to EU mode works
- [ ] Step 3.4: EU import button appears
- [ ] Step 3.5: Clicking EU import shows console logs
- [ ] Step 3.6: Import completes successfully

---

## 🆘 What to Share

If still not working, share:

1. **SQL query results** from Step 1
2. **Apps Script execution log** from Step 2
3. **Browser console log** from Step 3 (copy all text)
4. **Which step in the checklist fails**

This will help me identify the exact problem!

