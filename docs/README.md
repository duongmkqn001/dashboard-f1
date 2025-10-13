# F1 Dashboard Documentation

This folder contains all documentation for the F1 Dashboard project.

---

## 📁 Documentation Index

### 🚀 Getting Started
- **[ENHANCED-SYSTEM-README.md](ENHANCED-SYSTEM-README.md)** - Complete system overview and features

### 🔧 Manual Schedule System
- **[MANUAL_SCHEDULE_COMPLETE_GUIDE.md](MANUAL_SCHEDULE_COMPLETE_GUIDE.md)** - Complete guide for manual schedule feature
- **[MANUAL_SCHEDULE_FIXES.md](MANUAL_SCHEDULE_FIXES.md)** - Detailed fixes for manual schedule issues
- **[QUICK_FIX_GUIDE.md](QUICK_FIX_GUIDE.md)** - Quick 5-minute fix guide
- **[TIMEZONE_FIX_COMPLETE.md](TIMEZONE_FIX_COMPLETE.md)** - ⭐ **IMPORTANT**: Timezone fix for date assignment
- **[FIX_406_ERROR.md](FIX_406_ERROR.md)** - Fix for 406 Not Acceptable error
- **[DEBUG_MANUAL_ASSIGNMENT.md](DEBUG_MANUAL_ASSIGNMENT.md)** - Debugging guide for manual assignments

### 🎉 Celebration System
- **[CELEBRATION_FIX_COMPLETE.md](CELEBRATION_FIX_COMPLETE.md)** - Complete celebration system fixes
- **[CELEBRATION_VIETNAMESE_FIX.md](CELEBRATION_VIETNAMESE_FIX.md)** - Vietnamese language fixes
- **[CELEBRATION_WORKFLOW_FIX.md](CELEBRATION_WORKFLOW_FIX.md)** - Celebration workflow improvements

### 🔔 Notifications
- **[REALTIME_NOTIFICATIONS_SETUP.md](REALTIME_NOTIFICATIONS_SETUP.md)** - Real-time notification setup
- **[NOTIFICATION_FIX_CRITICAL.md](NOTIFICATION_FIX_CRITICAL.md)** - Critical notification fixes

### 📊 Google Sheets Integration
- **[GOOGLE_SHEETS_INTEGRATION_FIX.md](GOOGLE_SHEETS_INTEGRATION_FIX.md)** - Google Sheets integration guide
- **[GOOGLE_SHEETS_QUEUE_SOLUTION.md](GOOGLE_SHEETS_QUEUE_SOLUTION.md)** - Queue solution for exports
- **[GOOGLE_SHEETS_SIMPLIFIED.md](GOOGLE_SHEETS_SIMPLIFIED.md)** - Simplified integration approach

### 🤖 AI Features
- **[AI_CHATBOT_INTEGRATION_GUIDE.md](AI_CHATBOT_INTEGRATION_GUIDE.md)** - AI chatbot integration guide

### 🧪 Testing & Optimization
- **[FIXES_TESTING_GUIDE.md](FIXES_TESTING_GUIDE.md)** - Testing guide for all fixes
- **[OPTIMIZATION_SUMMARY.md](OPTIMIZATION_SUMMARY.md)** - Performance optimization summary
- **[FINAL_FIXES_SUMMARY.md](FINAL_FIXES_SUMMARY.md)** - Summary of all fixes applied

---

## 🗂️ SQL Files

All SQL files are located in the `/sql` folder:
- **manual_schedule_complete_setup.sql** - Complete database setup for manual schedule
- **test_manual_schedule.sql** - Test script for manual schedule
- **fix_notifications_table.sql** - Notification table fixes

---

## 📋 Quick Reference

### Most Important Documents:

1. **[TIMEZONE_FIX_COMPLETE.md](TIMEZONE_FIX_COMPLETE.md)** ⭐
   - **Critical fix** for date assignment issues
   - Fixes Vietnam timezone (UTC+7) problems
   - Must read if working with dates

2. **[MANUAL_SCHEDULE_COMPLETE_GUIDE.md](MANUAL_SCHEDULE_COMPLETE_GUIDE.md)**
   - Complete guide for manual schedule feature
   - Setup instructions
   - Usage examples

3. **[ENHANCED-SYSTEM-README.md](ENHANCED-SYSTEM-README.md)**
   - System overview
   - All features explained
   - Architecture details

---

## 🔍 Find Documentation By Topic

### Date & Time Issues
- [TIMEZONE_FIX_COMPLETE.md](TIMEZONE_FIX_COMPLETE.md)
- [DEBUG_MANUAL_ASSIGNMENT.md](DEBUG_MANUAL_ASSIGNMENT.md)

### Error Fixes
- [FIX_406_ERROR.md](FIX_406_ERROR.md) - 406 Not Acceptable
- [NOTIFICATION_FIX_CRITICAL.md](NOTIFICATION_FIX_CRITICAL.md) - Notification errors
- [MANUAL_SCHEDULE_FIXES.md](MANUAL_SCHEDULE_FIXES.md) - 409, 400, 406 errors

### Feature Guides
- [MANUAL_SCHEDULE_COMPLETE_GUIDE.md](MANUAL_SCHEDULE_COMPLETE_GUIDE.md) - Manual schedule
- [CELEBRATION_FIX_COMPLETE.md](CELEBRATION_FIX_COMPLETE.md) - Celebrations
- [GOOGLE_SHEETS_INTEGRATION_FIX.md](GOOGLE_SHEETS_INTEGRATION_FIX.md) - Google Sheets
- [AI_CHATBOT_INTEGRATION_GUIDE.md](AI_CHATBOT_INTEGRATION_GUIDE.md) - AI Chatbot

### Setup & Configuration
- [REALTIME_NOTIFICATIONS_SETUP.md](REALTIME_NOTIFICATIONS_SETUP.md)
- [QUICK_FIX_GUIDE.md](QUICK_FIX_GUIDE.md)

---

## 📝 Document Naming Convention

- **`*_COMPLETE_*.md`** - Comprehensive guides with all details
- **`*_FIX_*.md`** - Specific bug fixes and solutions
- **`*_GUIDE.md`** - Step-by-step guides
- **`*_SETUP.md`** - Setup and configuration instructions
- **`*_SUMMARY.md`** - Quick summaries and overviews

---

## 🏗️ Project Structure

```
dashboard f1/
├── docs/                    # 📚 All documentation (you are here)
│   ├── README.md           # This file
│   ├── TIMEZONE_FIX_COMPLETE.md
│   ├── MANUAL_SCHEDULE_COMPLETE_GUIDE.md
│   └── ... (other docs)
├── sql/                     # 🗄️ SQL scripts
│   ├── manual_schedule_complete_setup.sql
│   ├── test_manual_schedule.sql
│   └── fix_notifications_table.sql
├── js/                      # 💻 JavaScript files
│   ├── adminview.js
│   └── dashboard-v2.js
├── css/                     # 🎨 Stylesheets
│   ├── adminview.css
│   └── dashboard-v2.css
├── sample/                  # 📄 Sample files
├── adminview.html          # Admin interface
├── dashboard-v2.html       # Main dashboard
├── csv-import-enhanced.html # CSV import tool
├── index.html              # Login page
├── README.md               # Main project README
└── scriptgs.txt            # Google Apps Script
```

---

## 🆘 Need Help?

### Common Issues:

**Date assignment is wrong (+1 day)**
→ Read: [TIMEZONE_FIX_COMPLETE.md](TIMEZONE_FIX_COMPLETE.md)

**406 Error when creating assignments**
→ Read: [FIX_406_ERROR.md](FIX_406_ERROR.md)

**Notifications not working**
→ Read: [NOTIFICATION_FIX_CRITICAL.md](NOTIFICATION_FIX_CRITICAL.md)

**Celebrations not triggering**
→ Read: [CELEBRATION_FIX_COMPLETE.md](CELEBRATION_FIX_COMPLETE.md)

**Google Sheets export failing**
→ Read: [GOOGLE_SHEETS_INTEGRATION_FIX.md](GOOGLE_SHEETS_INTEGRATION_FIX.md)

---

## 📊 All Issues Fixed

| Issue | Status | Documentation |
|-------|--------|---------------|
| Timezone date shift (+1 day) | ✅ Fixed | [TIMEZONE_FIX_COMPLETE.md](TIMEZONE_FIX_COMPLETE.md) |
| 406 Not Acceptable error | ✅ Fixed | [FIX_406_ERROR.md](FIX_406_ERROR.md) |
| 409 Conflict (removing agents) | ✅ Fixed | [MANUAL_SCHEDULE_FIXES.md](MANUAL_SCHEDULE_FIXES.md) |
| 400 Bad Request (notifications) | ✅ Fixed | [MANUAL_SCHEDULE_FIXES.md](MANUAL_SCHEDULE_FIXES.md) |
| Ambiguous column SQL error | ✅ Fixed | [MANUAL_SCHEDULE_FIXES.md](MANUAL_SCHEDULE_FIXES.md) |
| Celebration Vietnamese text | ✅ Fixed | [CELEBRATION_VIETNAMESE_FIX.md](CELEBRATION_VIETNAMESE_FIX.md) |
| Real-time notifications | ✅ Fixed | [REALTIME_NOTIFICATIONS_SETUP.md](REALTIME_NOTIFICATIONS_SETUP.md) |

---

## 🎯 Key Features Documented

- ✅ Manual Schedule Assignment System
- ✅ Auto Schedule Assignment System
- ✅ Celebration System (fireworks & banners)
- ✅ Real-time Notifications
- ✅ Google Sheets Integration
- ✅ CSV Import with AI Duplicate Detection
- ✅ MoS Request System
- ✅ Ticket Management
- ✅ Agent Rotation Lists

---

## 📅 Last Updated

2025-10-13 - Added timezone fix documentation and organized all files

---

## 📧 Contact

For questions or issues, refer to the specific documentation file for that feature.

---

**Happy coding! 🚀**

