# Template Auto-fill Fix for Greeting and Signature Placeholders

## Issue Description
When using templates in the FMOP project (or any project) that require carrier emails, the `{{greeting}}` and `{{signature}}` placeholders were being displayed as input fields that users had to manually fill. This was incorrect behavior since these placeholders should be automatically filled based on:
- **Greeting**: Generated from agent name or supplier name using settings templates
- **Signature**: Retrieved from the assignee's signature data in the database

## Changes Made

### 1. Updated `renderAllPlaceholders` Function (Line 1232)
**File**: `js/dashboard-v2.js`

**Before**:
```javascript
const ignoredPlaceholders = new Set(['signature', 'Customer_Name', 'Order_Number', 'Brand']);
```

**After**:
```javascript
const ignoredPlaceholders = new Set(['signature', 'greeting', 'Customer_Name', 'Order_Number', 'Brand']);
```

**Impact**: The `greeting` placeholder is now in the ignored list, preventing the system from creating an input field for it.

### 2. Enhanced `updateFinalOutput` Function (Lines 1347-1360)
**File**: `js/dashboard-v2.js`

**Added**:
```javascript
// Check if template has {{signature}} placeholder
const hasSignaturePlaceholder = content.includes('{{signature}}');

// Get signature data
const assigneeAccount = popupCurrentTicket.assignee_account;
const assigneeName = allAgentsMap.get(assigneeAccount);
const signature = allSignatures.find(s => s.name === assigneeName) || allSignatures.find(s => s.isDefault) || allSignatures[0];
let signatureText = signature ? `${signature.name}\n${signature.title || ''}\n${signature.department || ''}`.trim() : '';

// Handle signature placeholder replacement
if (hasSignaturePlaceholder) {
    // Replace {{signature}} placeholder with the signature text
    content = content.replace(/\{\{signature\}\}/g, signatureText);
}
```

**Impact**: The `{{signature}}` placeholder is now automatically replaced with the assignee's signature data when present in the template content.

### 3. Updated Final Output Logic (Lines 1385-1393)
**File**: `js/dashboard-v2.js`

**Before**:
```javascript
let finalPlainText = `${greeting ? greeting + '\n\n' : ''}${content}${footerText ? `\n\n${footerText}` : ''}\n\nBest regards,\n${signatureText}`;
```

**After**:
```javascript
// Only append signature at the end if it wasn't already in the content as a placeholder
let finalPlainText;
if (hasSignaturePlaceholder) {
    // Signature was already replaced in content, don't append it again
    finalPlainText = `${greeting ? greeting + '\n\n' : ''}${content}${footerText ? `\n\n${footerText}` : ''}`;
} else {
    // Append signature at the end as before
    finalPlainText = `${greeting ? greeting + '\n\n' : ''}${content}${footerText ? `\n\n${footerText}` : ''}\n\nBest regards,\n${signatureText}`;
}
```

**Impact**: Prevents duplicate signatures when the template already contains a `{{signature}}` placeholder.

### 4. Enhanced Carrier Email Preview (Lines 1672-1696)
**File**: `js/dashboard-v2.js`

**Added**:
```javascript
// Auto-fill greeting placeholder
const agentName = document.getElementById('viewer-agent-name')?.value.trim() || '';
const manualSupplierName = document.getElementById('viewer-manual-supplier-name')?.value.trim() || '';
let greeting = '';
if (agentName) {
    greeting = (allSettings.greeting_person?.value || 'Hi {{name}},').replace('{{name}}', toTitleCase(agentName));
} else if (manualSupplierName) {
    greeting = (allSettings.greeting_team?.value || 'Hi {{name}} Team,').replace('{{name}}', cleanSupplierName(manualSupplierName));
}

// Auto-fill signature placeholder
const assigneeAccount = popupCurrentTicket?.assignee_account;
const assigneeName = allAgentsMap.get(assigneeAccount);
const signature = allSignatures.find(s => s.name === assigneeName) || allSignatures.find(s => s.isDefault) || allSignatures[0];
let signatureText = signature ? `${signature.name}\n${signature.title || ''}\n${signature.department || ''}`.trim() : '';

emailBody = emailBody
    .replace(/\{\{ticket\}\}/g, ticket)
    .replace(/\{\{PO\}\}/g, po)
    .replace(/\{\{carrier\}\}/g, carrierName)
    .replace(/\{\{greeting\}\}/g, greeting)
    .replace(/\{\{signature\}\}/g, signatureText);
```

**Impact**: Carrier email previews now correctly show auto-filled greeting and signature placeholders.

## How It Works Now

### For `{{greeting}}` Placeholder:
1. **No input field is created** - it's in the ignored list
2. **Auto-filled based on**:
   - If agent name is provided: Uses `greeting_person` template from settings (e.g., "Hi John,")
   - If supplier name is provided: Uses `greeting_team` template from settings (e.g., "Hi ABC Company Team,")
3. **Replaced in content** before final output is generated

### For `{{signature}}` Placeholder:
1. **No input field is created** - it's in the ignored list
2. **Auto-filled based on**:
   - Assignee's signature from the `signatures` table
   - Falls back to default signature if assignee's signature not found
   - Falls back to first signature if no default found
3. **Replaced in content** if placeholder exists
4. **Appended at end** only if placeholder doesn't exist in content (backward compatibility)

## Testing Recommendations

1. **Test with FMOP carrier email templates**:
   - Create/edit a template with `emailCarrier` checkbox enabled
   - Add `{{greeting}}` and `{{signature}}` placeholders in the content
   - Verify no input fields are shown for these placeholders
   - Verify they are auto-filled correctly in the preview

2. **Test greeting variations**:
   - Test with agent name filled
   - Test with supplier name filled
   - Test with both filled
   - Test with neither filled

3. **Test signature variations**:
   - Test with different assignees
   - Test with assignee who has a signature
   - Test with assignee who doesn't have a signature (should use default)

4. **Test backward compatibility**:
   - Test templates without `{{signature}}` placeholder (should append signature at end)
   - Test templates with `{{signature}}` placeholder (should not append at end)

## Related Files
- `js/dashboard-v2.js` - Main dashboard logic (modified)
- `js/adminview.js` - Admin view logic (already had similar handling for greeting)

## Notes
- The validation logic already had both placeholders in the ignored list, so no changes were needed there
- The greeting auto-fill logic was already implemented, we just needed to prevent the input field from being created
- The signature auto-fill logic was partially implemented (appended at end), we enhanced it to support inline replacement

