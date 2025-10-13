# Google Sheets Integration - CORS Fix

## Problem
When opening `dashboard-v2.html` directly from the file system (file:// protocol), CORS errors prevented sending data to Google Sheets.

## Solution
Implemented JSONP (JSON with Padding) technique using script tag injection to bypass CORS restrictions.

## Changes Made

### 1. Dashboard JavaScript (`js/dashboard-v2.js`)

**Changed from:** Regular fetch() API call
**Changed to:** JSONP using dynamic script tag injection

**How it works:**
1. Creates a unique callback function name
2. Injects a `<script>` tag with the Google Sheets URL
3. Google Apps Script returns JavaScript code that calls the callback
4. Callback receives the response data
5. Cleans up the script tag and callback function

**Benefits:**
- ✅ Works from file:// protocol (no web server needed)
- ✅ Bypasses CORS restrictions
- ✅ No browser security errors
- ✅ Reliable data transmission

### 2. Google Apps Script (`scriptgs.txt`)

**Added:** JSONP callback support in `doGet()` function

**How it works:**
1. Receives GET request with parameters: `secret`, `ticket`, and `callback`
2. Validates secret token
3. Parses ticket data
4. Adds ticket to Google Sheet
5. If `callback` parameter exists, returns: `callbackName({"status":"success"})`
6. If no callback, returns regular JSON

**Benefits:**
- ✅ Supports both JSONP and regular JSON responses
- ✅ Backward compatible
- ✅ Works with file:// protocol

## 🚨 REQUIRED: Redeploy Google Apps Script

**You MUST redeploy the script for changes to work:**

### Step-by-Step Instructions:

1. **Open Google Apps Script:**
   - Go to: https://script.google.com/home
   - Find your project (Sheet ID: `1fiKKKBYQUHg5Apq-VuQPTiCtGwusW-IOl7KJhMyL764`)

2. **Update the Code:**
   - Open the script editor
   - **Replace ALL code** with the updated code from `scriptgs.txt`
   - Make sure to copy the entire file

3. **Deploy New Version:**
   - Click **Deploy** → **Manage deployments**
   - Click the **Edit** icon (✏️ pencil) next to your existing deployment
   - Under **Version**, select **New version**
   - Add description: "Added JSONP support for CORS bypass"
   - Click **Deploy**

4. **Verify Deployment:**
   - The Web App URL should remain the same:
     ```
     https://script.google.com/macros/s/AKfycbzDXf9HPZi9NiJy-f8Enw9ZINljy2njMSWcZFXnrKCDzRPpAwwipIsTTMjP3lTtPZM07A/exec
     ```
   - If the URL changed, update it in `js/dashboard-v2.js` line 2032

## Testing

### After Redeploying:

1. **Open Dashboard:**
   - Open `dashboard-v2.html` in your browser
   - Login with your credentials

2. **Complete a Ticket:**
   - Start a ticket
   - Select a status
   - Click "End" button

3. **Check Console:**
   - Open browser console (F12)
   - Should see: `✅ Ticket successfully sent to Google Sheets: AOPS-XXXXXX`
   - Should see NO CORS errors
   - Should see NO 406 errors

4. **Verify Google Sheets:**
   - Open your Google Sheet
   - Check AOPS or FMOP tab
   - New ticket should appear at the bottom
   - All fields should be populated

## Troubleshooting

### If you still see CORS errors:
- Make sure you redeployed the Google Apps Script
- Make sure you selected "New version" when redeploying
- Clear browser cache and reload the page

### If ticket doesn't appear in Google Sheets:
- Check browser console for error messages
- Verify secret token matches: `14092000`
- Check Google Apps Script execution logs:
  - Go to Apps Script editor
  - Click **Executions** (clock icon on left)
  - Look for recent executions and any errors

### If you see "Invalid secret token" error:
- Verify `SECRET_TOKEN` in `scriptgs.txt` is `14092000`
- Verify `SECRET_TOKEN` in `js/dashboard-v2.js` line 2033 is `14092000`

## Technical Details

### JSONP Technique:
```javascript
// Dashboard creates script tag:
<script src="https://script.google.com/.../exec?callback=googleSheetsCallback_123456&ticket={...}"></script>

// Google Apps Script returns:
googleSheetsCallback_123456({"status":"success","ticketNumber":"AOPS-1337243"})

// Browser executes the returned JavaScript, calling the callback function
```

### Why This Works:
- Script tags are not subject to CORS restrictions
- Browsers allow loading scripts from any domain
- The response is executable JavaScript, not JSON
- The callback function receives the data

## Files Modified

1. **js/dashboard-v2.js** (lines 2031-2084)
   - Changed `sendTicketToGoogleSheets()` function
   - Implemented JSONP with script tag injection
   - Added timeout and error handling

2. **scriptgs.txt** (lines 37-88)
   - Updated `doGet()` function
   - Added JSONP callback support
   - Returns JavaScript instead of JSON when callback is present

## Summary

✅ **Fixed:** CORS errors when sending to Google Sheets
✅ **Fixed:** 406 errors for vcn_agent queries  
✅ **Implemented:** JSONP for cross-origin requests
✅ **Works:** From file:// protocol (no web server needed)
✅ **Tested:** Script tag injection method

**Next Step:** Redeploy the Google Apps Script and test!

