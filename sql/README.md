# SQL Scripts

This folder contains all SQL scripts for the F1 Dashboard project.

---

## 📋 Files

### 1. **manual_schedule_complete_setup.sql** ⭐ MAIN SETUP
**Purpose**: Complete database setup for manual schedule system

**What it does**:
- Creates `agent_rotation_list` table
- Creates `account_rotation_list` table
- Creates `schedule_assignments` table
- Creates helper functions for auto-assignment
- Fixes all constraints and indexes

**When to run**: 
- First time setup
- After database reset
- When updating the schema

**How to run**:
1. Open Supabase → SQL Editor
2. Copy entire file content
3. Paste and click "Run"

**Expected result**: All tables and functions created successfully

---

### 2. **test_manual_schedule.sql**
**Purpose**: Test script to verify manual schedule system

**What it does**:
- Verifies tables exist
- Checks constraints
- Tests functions
- Adds sample data
- Runs test queries

**When to run**:
- After running `manual_schedule_complete_setup.sql`
- To verify system is working
- For debugging

**How to run**:
1. Open Supabase → SQL Editor
2. Copy entire file content
3. Paste and click "Run"

**Expected result**: All tests pass, sample data created

---

### 3. **fix_notifications_table.sql**
**Purpose**: Fix notifications table structure

**What it does**:
- Adds missing notification types
- Updates constraints
- Fixes notification type enum

**When to run**:
- If you get notification type errors
- After adding new notification types

**How to run**:
1. Open Supabase → SQL Editor
2. Copy entire file content
3. Paste and click "Run"

**Expected result**: Notification types updated

---

### 4. **confluence_changelog_setup.sql** ⭐ CONFLUENCE MONITOR
**Purpose**: Confluence GPS space changelog tracking schema

**What it does**:
- Creates `confluence_pages` table (page snapshots)
- Creates `confluence_changelog` table (immutable change log)
- Creates `track_confluence_change()` function (upsert + changelog)
- Creates `mark_confluence_notified()` function
- Creates `confluence_pending_notifications` and `confluence_recent_changes` views
- Seeds the known page (ID 1256185536)

**When to run**: Once, before deploying the Confluence monitor GitHub Actions

**How to run**:
1. Open Supabase → SQL Editor
2. Copy entire file content
3. Paste and click "Run"

**Expected result**: Tables, functions, and views created; 1 page seeded

**Related docs**: `docs/CONFLUENCE_MONITOR_SETUP.md`

---

## 🚀 Quick Start

### First Time Setup:

1. **Run in this order**:
   ```
   1. manual_schedule_complete_setup.sql  (required)
   2. fix_notifications_table.sql         (if needed)
   3. test_manual_schedule.sql            (optional, for testing)
   4. confluence_changelog_setup.sql      (Confluence monitor — run once)
   ```

2. **Verify**:
   - Check tables exist in Supabase
   - Check functions exist
   - Run test queries

---

## 🔍 Common Issues

### Issue: "Function already exists"
**Solution**: The setup script now includes DROP statements, so just run it again.

### Issue: "Ambiguous column reference"
**Solution**: This is fixed in the latest version of `manual_schedule_complete_setup.sql`

### Issue: "Notification type not allowed"
**Solution**: Run `fix_notifications_table.sql`

---

## 📊 Database Schema

### Tables Created:

1. **`agent_rotation_list`**
   - Stores agents in rotation
   - Fields: `id`, `agent_id`, `rotation_order`, `is_active`, `created_at`, `updated_at`

2. **`account_rotation_list`**
   - Stores accounts in rotation
   - Fields: `id`, `account_export_name`, `rotation_order`, `is_active`, `created_at`, `updated_at`

3. **`schedule_assignments`**
   - Stores daily assignments
   - Fields: `id`, `assignment_date`, `agent_id`, `account_export_name`, `assignment_type`, `status`, `created_at`, etc.

### Functions Created:

1. **`get_next_manual_schedule_assignment(target_date)`**
   - Returns next agent and account for a given date
   - Uses round-robin logic

2. **`create_manual_schedule_assignment(target_date)`**
   - Creates assignment for a specific date
   - Calls `get_next_manual_schedule_assignment()`

3. **`create_manual_schedule_assignments_for_next_days(num_days)`**
   - Creates assignments for multiple days
   - Skips weekends automatically

---

## 📝 Notes

- All scripts use **Vietnam timezone (UTC+7)** considerations
- Weekend skipping is built-in (Saturday & Sunday)
- Round-robin assignment logic is automatic
- All dates use `DATE` type (no timezone conversion)

---

## 🆘 Need Help?

See the main documentation in `/docs` folder:
- [MANUAL_SCHEDULE_COMPLETE_GUIDE.md](../docs/MANUAL_SCHEDULE_COMPLETE_GUIDE.md)
- [MANUAL_SCHEDULE_FIXES.md](../docs/MANUAL_SCHEDULE_FIXES.md)
- [TIMEZONE_FIX_COMPLETE.md](../docs/TIMEZONE_FIX_COMPLETE.md)

---

**Last Updated**: 2025-10-13

