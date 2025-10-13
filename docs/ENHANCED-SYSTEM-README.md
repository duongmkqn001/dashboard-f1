# F1 Dashboard - Enhanced System with Authentication & AI Processing

## Overview

The F1 Dashboard has been completely enhanced with authentication, AI-powered CSV processing, and advanced duplicate detection. This system now provides a secure, intelligent workflow for managing tickets and administrative tasks.

## 🔐 Authentication System

### Login Page (`index.html`)
- **Secure authentication** using Supabase `vcn_agent` table
- **Role-based access control** with different user levels
- **Session management** with localStorage
- **Automatic redirection** based on user permissions

### User Roles
- **Regular Users**: Access to dashboard only
- **Leaders/Keys**: Access to both dashboard and admin panel
- **Active Status Required**: Only active users can log in

### Authentication Flow
1. User enters credentials on login page
2. System validates against `vcn_agent` table
3. Checks account status (must be 'active')
4. Stores user session in localStorage
5. Redirects based on user level

## 🤖 Enhanced CSV Import with AI

### New Enhanced CSV Import (`csv-import-enhanced.html`)
- **AI-powered processing** using Google Gemini API
- **Intelligent data extraction** and translation
- **Duplicate detection** and management
- **Progress tracking** with visual feedback

### AI Processing Features
- **Automatic translation** to English and Vietnamese
- **Supplier agent detection** from descriptions
- **Name extraction** (e.g., "Nathan Farias" → "Nathan")
- **PO number processing** (CS/CA + 9 digits)
- **Smart field mapping** and data transformation

### Data Processing Pipeline
1. **CSV Parsing**: Intelligent parsing with quote handling
2. **AI Analysis**: Gemini API processes descriptions
3. **Data Transformation**: Maps to required database schema
4. **Duplicate Detection**: Compares with existing tickets
5. **Import Preparation**: Final data validation and formatting

## 📊 Data Mapping

### Input CSV Columns
- `Issue key` → `ticket`
- `Custom field (PO Number(s))` → `po`
- `Custom field (Supplier)` → `suid` (number before "-") & `su_name` (text after "-")
- `Custom field (Order ID(s))` → `order_number`
- `Custom field (Customer Name)` → `customer` (first name only)
- `Custom field (Customer Contact(s))` → `customer_contact`
- `Assignee` → `agent_account` (mapped via agent table)
- `Customer Request Type` → `issue_type` (mapped via kpi_per_agent table)
- `Issue id` → `issue_id`
- `Description` → AI processed to `description_eng` & `description_vie`

### AI-Generated Fields
- `description_eng`: English translation of description
- `description_vie`: Vietnamese translation of description
- `supplier_agent_need`: Boolean indicating if supplier agent involvement needed
- `supplier_agent`: Extracted person name if found
- `po_nocs`: 9-digit PO number without CS/CA prefix

### Special Transformations
- **Update Tracking Number** → "Update tracking number/Order Status"
- **Email Request** → "Carrier Inquiry"
- **Multiple POs**: Only first PO is processed
- **Multiple SUUIDs**: Only first SUID is used

## 🔍 Duplicate Detection

### Detection Logic
- Compares `issue_id` with existing tickets in database
- Only checks tickets where `time_start`, `time_end`, `agent_handle_ticket`, and `ticket_status` are null
- Highlights potential duplicates for user review

### User Options
- **Review duplicates** with detailed information
- **Select duplicates** for removal from import
- **Warning message** about re-opened tickets
- **Confirmation dialogs** for safety

## 🗄️ Database Integration

### Tables Used
- **`vcn_agent`**: User authentication and authorization
- **`agent`**: Agent information and team mapping
- **`kpi_per_agent`**: Issue type mapping
- **`tickets`**: Final destination for processed data

### Import Process
1. **Validation**: Ensures all required fields are present
2. **Duplicate Check**: Identifies existing tickets
3. **User Confirmation**: Requires explicit approval
4. **Batch Insert**: Imports all records to tickets table
5. **Status Update**: Provides success/failure feedback

## 🚀 Getting Started

### Prerequisites
1. **Supabase Account**: Database access configured
2. **Gemini API Key**: For AI processing functionality
3. **Modern Browser**: Chrome, Firefox, Safari, Edge

### Setup Steps
1. **Login**: Use your vcn_agent credentials
2. **Access Enhanced Import**: Navigate to Admin Panel → Enhanced CSV Import (AI)
3. **Configure API**: Enter your Gemini API key
4. **Upload CSV**: Select your ticket data file
5. **Process**: Let AI analyze and transform the data
6. **Review**: Check for duplicates and data accuracy
7. **Import**: Confirm and import to database

## 📁 File Structure

```
dashboard f1/
├── index.html                     # Login page with authentication
├── adminview.html                 # Admin panel (enhanced with auth)
├── dashboard-v2.html              # Ticket dashboard (enhanced with auth)
├── csv-import-enhanced.html       # AI-powered CSV import
├── js/
│   ├── adminview.js              # Enhanced with logout functionality
│   └── dashboard-v2.js           # Existing dashboard logic
├── css/
│   ├── adminview.css             # Admin panel styles
│   └── dashboard-v2.css          # Dashboard styles
├── sample/
│   └── test (SupportHub)...csv   # Sample CSV file
├── README.md                     # Original documentation
└── ENHANCED-SYSTEM-README.md     # This file
```

## 🔧 Technical Features

### Security
- **Authentication required** for all pages
- **Role-based access control**
- **Session validation** on page load
- **Automatic logout** functionality

### Performance
- **Batch processing** for AI requests
- **Rate limiting** to avoid API limits
- **Progress tracking** for user feedback
- **Error handling** with graceful degradation

### User Experience
- **Intuitive interface** with step-by-step guidance
- **Visual feedback** for all operations
- **Comprehensive error messages**
- **Responsive design** for all devices

## 🛠️ API Configuration

### Gemini API Setup
1. Get API key from Google AI Studio
2. Enter key in the Enhanced CSV Import interface
3. Key is used for description processing only
4. Not stored permanently for security

### Supabase Configuration
- Uses existing connection from dashboard
- Requires proper table permissions
- Handles authentication and data operations

## 📋 Usage Guidelines

### Best Practices
1. **Always check duplicates** before importing
2. **Review AI translations** for accuracy
3. **Backup data** before large imports
4. **Test with small batches** first
5. **Monitor API usage** to avoid limits

### Troubleshooting
- **Authentication Issues**: Check user status and credentials
- **AI Processing Errors**: Verify API key and internet connection
- **Import Failures**: Check data format and database permissions
- **Duplicate Detection**: Ensure proper database access

## 🔄 Workflow Summary

1. **Login** → Authentication check
2. **Navigate** → Enhanced CSV Import
3. **Configure** → Enter Gemini API key
4. **Upload** → Select CSV file
5. **Process** → AI analyzes data
6. **Review** → Check duplicates and accuracy
7. **Import** → Confirm and import to database
8. **Verify** → Check results in dashboard

## 📞 Support

For technical issues or questions:
1. Check browser console for error messages
2. Verify API key and database permissions
3. Review sample CSV format
4. Contact system administrator for access issues

---

**Note**: This enhanced system requires proper authentication and API configuration. Ensure all prerequisites are met before attempting to use the advanced features.
