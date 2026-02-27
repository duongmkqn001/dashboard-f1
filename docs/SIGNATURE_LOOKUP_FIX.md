# Signature Lookup Fix - Using agent.signature_name Field

## Problem Summary

The dashboard was not using the new signatures added for agents. Instead, it was falling back to the default signature for all templates.

## Root Cause

The signature lookup logic in `js/dashboard-v2.js` was **ignoring the `signature_name` field** in the `agent` table and trying to match signatures by comparing `signature.name` with `agent.agent_name`, which failed for newly added agents.

### Database Schema

**`agent` table** has these relevant fields:
- `agent_account` (text) - unique account identifier
- `agent_name` (text) - display name of the agent
- `signature_name` (text) - **links to the signature in the signatures table**

**`signatures` table** has:
- `id` (bigint) - primary key
- `name` (text) - signature name
- `title` (text) - job title
- `department` (text) - department name
- `isDefault` (boolean) - whether this is the default signature

### The Bug

In `populateAssignees()` function (line 572):
```javascript
// OLD CODE - Only fetched agent_account and agent_name
const { data, error } = await supabaseClient.from('agent').select('agent_account, agent_name');
data.forEach(agent => {
    allAgentsMap.set(agent.agent_account, agent.agent_name); // Only stored name as string
});
```

In signature lookup (lines 1813-1814, 2314-2315, 2640-2641):
```javascript
// OLD CODE - Tried to match signature.name with agent_name (wrong!)
const assigneeName = allAgentsMap.get(assigneeAccount);
const signature = allSignatures.find(s => s.name === assigneeName) || ...;
```

This approach failed because:
1. `agent.agent_name` might not match `signature.name` exactly
2. The `agent.signature_name` field (which explicitly links to the correct signature) was completely ignored

## Solution

### 1. Fetch `signature_name` from agent table

**File**: `js/dashboard-v2.js` - Line 572

```javascript
// NEW CODE - Fetch signature_name as well
const { data, error } = await supabaseClient.from('agent').select('agent_account, agent_name, signature_name');
data.forEach(agent => {
    // Store both name and signature_name as an object
    allAgentsMap.set(agent.agent_account, {
        name: agent.agent_name,
        signature_name: agent.signature_name
    });
});
```

### 2. Use `signature_name` for signature lookup

**Files**: `js/dashboard-v2.js` - Lines 1812-1821, 2318-2327, 2649-2658

```javascript
// NEW CODE - Use signature_name to find the correct signature
const agentData = allAgentsMap.get(assigneeAccount);
// Use signature_name from agent table to find the correct signature
const signature = agentData?.signature_name 
    ? allSignatures.find(s => s.name === agentData.signature_name)
    : null;
// Fall back to default signature if no match found
const finalSignature = signature || allSignatures.find(s => s.isDefault) || allSignatures[0];
let signatureText = finalSignature ? `${finalSignature.name}\n${finalSignature.title || ''}\n${finalSignature.department || ''}`.trim() : '';
```

### 3. Update display logic for consistency

**File**: `js/dashboard-v2.js` - Line 989-993

```javascript
// NEW CODE - Access name from the object structure
const agentData = allAgentsMap.get(item.assignee_account);
const assigneeName = agentData?.name || item.assignee_account;
```

## Changes Made

### Modified Files
- `js/dashboard-v2.js`

### Specific Changes
1. **Line 572**: Added `signature_name` to the SELECT query
2. **Lines 575-580**: Changed `allAgentsMap` to store objects with `{name, signature_name}` instead of just the name string
3. **Lines 1812-1821**: Updated signature lookup to use `signature_name` field
4. **Lines 2318-2327**: Updated signature lookup in carrier email modal
5. **Lines 2649-2658**: Updated signature lookup in WDN template processing
6. **Lines 989-993**: Updated display logic to use new object structure

## Testing Instructions

1. **Verify agent table has signature_name populated**:
   ```sql
   SELECT agent_account, agent_name, signature_name FROM agent;
   ```
   Make sure your new agents have the `signature_name` field set to match the name in the `signatures` table.

2. **Verify signatures table has the correct entries**:
   ```sql
   SELECT id, name, title, department, "isDefault" FROM signatures;
   ```

3. **Test in dashboard**:
   - Open a ticket assigned to one of your new agents
   - Use a template with `{{signature}}` placeholder
   - Verify the correct signature appears (not the default one)

## Expected Behavior After Fix

- When a ticket is assigned to an agent with `signature_name` set in the agent table, the dashboard will use that specific signature
- If `signature_name` is NULL or the signature is not found, it falls back to the default signature
- The signature lookup now respects the explicit link defined in the `agent.signature_name` field

## Related Tables

- `agent` - Contains agent information and signature_name link
- `signatures` - Contains signature details
- `vcn_agent` - Contains VCN agent information (different from agent table)

