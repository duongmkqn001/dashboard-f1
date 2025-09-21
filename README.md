# F1 Dashboard - CSV Import & Index Portal

## Overview

This project provides a comprehensive dashboard system with CSV import functionality and a main portal for navigation between different dashboard views.

## Features Added

### 1. Main Index Portal (`index.html`)
- **Beautiful landing page** with modern design
- **Navigation cards** for Admin Management and Ticket Dashboard
- **Quick access buttons** for common tasks
- **Responsive design** with gradient backgrounds and hover effects

### 2. CSV Import Functionality
- **Complete CSV parser** with support for quoted values and mixed data
- **Dual data type support**: Suppliers and Children
- **Progress tracking** with visual feedback
- **Error handling** with detailed error messages
- **Data validation** and format checking

### 3. Enhanced UI for CSV Import
- **Visual progress bar** during import process
- **Status indicators** with emojis and color coding
- **Format guidance** with sample CSV templates
- **Real-time feedback** for all operations

## File Structure

```
dashboard f1/
├── index.html                 # Main portal page
├── adminview.html             # Admin management interface
├── dashboard-v2.html          # Ticket dashboard
├── js/
│   ├── adminview.js          # Enhanced with CSV import
│   └── dashboard-v2.js       # Ticket management logic
├── css/
│   ├── adminview.css         # Admin styles
│   └── dashboard-v2.css      # Dashboard styles
├── sample-suppliers.csv      # Sample supplier data
├── sample-children.csv       # Sample children data
├── sample-mixed.csv          # Sample mixed data
├── test-csv-parser.html      # CSV parser testing tool
└── README.md                 # This file
```

## CSV Import Usage

### Supported CSV Formats

#### 1. Suppliers Only
```csv
suid,suname
SUP001,Công ty TNHH ABC
SUP002,Công ty Cổ phần XYZ
```

#### 2. Children Only
```csv
suchildid,parentSuid
CHILD001,SUP001
CHILD002,SUP001
```

#### 3. Mixed Data
```csv
suid,suname,suchildid,parentSuid
SUP001,Công ty ABC,,
,,CHILD001,SUP001
```

### How to Import CSV

1. **Navigate to Admin Panel**
   - Open `index.html` in your browser
   - Click "Open Admin Panel" button
   - Go to "Dữ liệu NCC" (Supplier Data) tab

2. **Select CSV File**
   - Click "📁 Chọn file CSV" button
   - Select your CSV file (must have .csv extension)

3. **Monitor Progress**
   - Watch the progress bar and status messages
   - The system will show detailed feedback for each step

4. **Verify Results**
   - Check the database status display
   - Review any error messages if import fails

### CSV Import Features

- **🔄 Complete Data Replacement**: Existing data is cleared before import
- **📊 Progress Tracking**: Visual progress bar with step-by-step feedback
- **✅ Data Validation**: Checks for required columns and data format
- **🛡️ Error Handling**: Detailed error messages for troubleshooting
- **📈 Status Display**: Real-time database status updates

## Testing

### Automated Tests
Run the CSV parser tests by opening `test-csv-parser.html` in your browser and clicking "Run Tests".

### Manual Testing
1. Use the provided sample CSV files:
   - `sample-suppliers.csv` - Basic supplier data
   - `sample-children.csv` - Children/subsidiary data
   - `sample-mixed.csv` - Combined data format

2. Test error scenarios:
   - Upload non-CSV files
   - Upload empty files
   - Upload files with incorrect headers

## Technical Implementation

### Key Functions Added

#### `handleCsvImport(file)`
- Main CSV import handler
- Validates file type and content
- Manages progress feedback
- Handles database operations

#### `parseCsvData(csvText)`
- Parses CSV content into structured data
- Supports quoted values and mixed formats
- Validates required columns
- Returns separated suppliers and children arrays

#### `parseCsvLine(line)`
- Low-level CSV line parser
- Handles quoted values with embedded commas
- Supports escaped quotes
- Returns array of field values

#### `updateCsvFeedback(message, type)`
- Updates UI feedback with styled messages
- Supports success, error, and info types
- Uses color coding and emojis

#### `showCsvProgress(percentage, text)`
- Displays progress bar with percentage
- Shows current operation status
- Provides visual feedback during long operations

## Browser Compatibility

- **Modern browsers** with ES6+ support
- **File API** support required for CSV upload
- **Fetch API** support for Supabase integration

## Dependencies

- **Tailwind CSS** - For styling and responsive design
- **Supabase** - For database operations
- **Inter Font** - For typography

## Security Considerations

- **Client-side validation** only - server-side validation recommended for production
- **File size limits** should be implemented for large CSV files
- **Data sanitization** is performed during parsing

## Future Enhancements

- **CSV export functionality**
- **Batch processing** for large files
- **Data preview** before import
- **Undo functionality** for imports
- **CSV template download**

## Support

For issues or questions:
1. Check the browser console for detailed error messages
2. Verify CSV format matches the expected structure
3. Test with the provided sample files
4. Use the test-csv-parser.html tool for debugging
