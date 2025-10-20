# Send to Leader - Logic Fix

## Issues Fixed

### Problem 1: Button Always Enabled
**Before:** The "Send to leader" button was always enabled for all tickets in the normal view, regardless of ticket state.

**After:** The button is now disabled when:
- ❌ Ticket has already been sent to leader (`need_leader_support = true`)
- ❌ Ticket has already been started (`time_start != null`)
- ❌ Ticket already has a status assigned (`ticket_status_id != null`)

### Problem 2: No Server-Side Validation
**Before:** The `sendToLeader()` function would blindly update the ticket without checking if it should be allowed.

**After:** The function now:
1. ✅ Fetches the ticket first to check its current state
2. ✅ Validates that the ticket can be sent to leader
3. ✅ Shows appropriate warning messages if validation fails
4. ✅ Only updates if all validations pass

## Changes Made

### 1. UI Changes (Button Rendering)

<augment_code_snippet path="js/dashboard-v2.js" mode="EXCERPT">
````javascript
// Check if ticket can be sent to leader
const canSendToLeader = !item.need_leader_support && !item.time_start && !item.ticket_status_id;
const leaderButtonDisabled = !canSendToLeader ? 'disabled opacity-50 cursor-not-allowed' : '';
const leaderButtonTitle = !canSendToLeader ? 
    (item.need_leader_support ? 'Already sent to leader' : 
     item.time_start ? 'Cannot send started ticket to leader' : 
     'Cannot send ticket with status to leader') : 
    'Send to leader for help';
````
</augment_code_snippet>

**Result:** Button is visually disabled with tooltip explaining why.

### 2. Server-Side Validation

<augment_code_snippet path="js/dashboard-v2.js" mode="EXCERPT">
````javascript
// First, check if ticket can be sent to leader
const { data: ticket, error: fetchError } = await supabaseClient
    .from('tickets')
    .select('need_leader_support, time_start, ticket_status_id, ticket')
    .eq('id', ticketId)
    .single();

// Validate ticket state
if (ticket.need_leader_support) {
    showMessage('Ticket đã được gửi đến leader rồi', 'warning');
    return;
}
````
</augment_code_snippet>

**Result:** Server-side validation prevents invalid updates.

## Validation Rules

| Condition | Can Send to Leader? | Reason |
|-----------|-------------------|---------|
| `need_leader_support = true` | ❌ NO | Already sent to leader |
| `time_start != null` | ❌ NO | Ticket already started - agent is working on it |
| `ticket_status_id != null` | ❌ NO | Ticket has a status assigned - already being handled |
| All above are false/null | ✅ YES | Ticket is fresh and can be sent to leader |

## User Experience Improvements

### Before:
1. User clicks "Send to leader" on any ticket
2. Ticket is sent to leader (even if already started/completed)
3. Confusion: "Why did my started ticket disappear?"
4. Data inconsistency: Started tickets in leader view

### After:
1. User sees disabled button with tooltip for invalid tickets
2. If user somehow clicks (e.g., via console), validation prevents update
3. Clear warning message explains why action was blocked
4. Data consistency maintained

## Visual Indicators

### Enabled Button (Can Send):
```
[Send to leader →]  (Yellow, clickable)
Tooltip: "Send to leader for help"
```

### Disabled Button (Already Sent):
```
[Send to leader →]  (Gray, disabled)
Tooltip: "Already sent to leader"
```

### Disabled Button (Already Started):
```
[Send to leader →]  (Gray, disabled)
Tooltip: "Cannot send started ticket to leader"
```

### Disabled Button (Has Status):
```
[Send to leader →]  (Gray, disabled)
Tooltip: "Cannot send ticket with status to leader"
```

## Warning Messages

When validation fails, users see:

- **Already sent:** "Ticket đã được gửi đến leader rồi" (warning)
- **Already started:** "Không thể gửi ticket đã bắt đầu đến leader" (warning)
- **Has status:** "Không thể gửi ticket đã có trạng thái đến leader" (warning)
- **Error:** "Không thể gửi ticket đến leader" (error)

## Testing Checklist

- [x] Fresh ticket → Button enabled, can send to leader
- [x] Already sent ticket → Button disabled, shows "Already sent to leader"
- [x] Started ticket → Button disabled, shows "Cannot send started ticket"
- [x] Ticket with status → Button disabled, shows "Cannot send ticket with status"
- [x] Server-side validation prevents invalid updates
- [x] Appropriate warning messages shown
- [x] Ticket removed from normal view after successful send
- [x] Ticket appears in leader view after send

## Related Files Modified

- `js/dashboard-v2.js` - Added validation logic to `renderNeedHelpColumn()` and `sendToLeader()`

## Database Fields Used

- `need_leader_support` (boolean) - Indicates if ticket needs leader help
- `time_start` (timestamp) - When ticket was started
- `ticket_status_id` (integer) - Status assigned to ticket

## Flow Diagram

```
User clicks "Send to leader"
         ↓
Check: need_leader_support = true?
         ├─ YES → Show "Already sent" warning → STOP
         └─ NO → Continue
         ↓
Check: time_start != null?
         ├─ YES → Show "Cannot send started ticket" warning → STOP
         └─ NO → Continue
         ↓
Check: ticket_status_id != null?
         ├─ YES → Show "Cannot send ticket with status" warning → STOP
         └─ NO → Continue
         ↓
Update: need_leader_support = true
         ↓
Remove from normal view
         ↓
Show success message
         ↓
Ticket now appears in leader view
```

## Benefits

1. ✅ **Data Integrity** - Prevents invalid state transitions
2. ✅ **User Clarity** - Clear visual indicators and messages
3. ✅ **Workflow Protection** - Started tickets stay with the agent
4. ✅ **Consistency** - Server-side validation as backup
5. ✅ **Better UX** - Disabled buttons prevent confusion

## Notes

- The button is only shown in **normal view** (not in leader view or MoS view)
- Leaders can still see tickets that were sent to them in **leader view**
- The validation is both client-side (UI) and server-side (function)
- Tooltips provide helpful context for why buttons are disabled

