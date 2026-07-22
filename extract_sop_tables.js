#!/usr/bin/env node
/**
 * Extract tables from SOP body HTML and export to various formats
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Config
// ============================================================================
const OUTPUT_DIR = path.join(__dirname, 'extracted_data');
const INPUT_FILE = path.join(OUTPUT_DIR, 'sop_body.html');

// ============================================================================
// HTML Parsing
// ============================================================================
function stripTags(html) {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&ndash;/g, '-')
        .replace(/&mdash;/g, '--')
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&deg;/g, '°')
        .replace(/&mu;/g, 'µ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // Remove iframes
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanCell(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/^\s+|\s+$/g, '')
        .trim();
}

function parseTable(tableHtml) {
    const rows = [];
    
    // Extract headers from <th> tags
    const headers = [];
    const headerRegex = /<th(?:\s+[^>]*)?>([\s\S]*?)<\/th>/gi;
    let match;
    
    while ((match = headerRegex.exec(tableHtml)) !== null) {
        const text = stripTags(match[1]).trim();
        if (text) headers.push(text);
    }
    
    // If no headers from <th>, try first <tr> or look for bold text
    if (headers.length === 0) {
        const firstRowMatch = tableHtml.match(/<tr(?:\s+[^>]*)?>([\s\S]*?)<\/tr>/i);
        if (firstRowMatch) {
            const cellRegex = /<t[hd](?:\s+[^>]*)?>([\s\S]*?)<\/t[hd]>/gi;
            let cellMatch;
            while ((cellMatch = cellRegex.exec(firstRowMatch[1])) !== null) {
                const text = stripTags(cellMatch[1]).trim();
                headers.push(text || `Column_${headers.length + 1}`);
            }
        }
    }
    
    // Extract all data rows
    const rowRegex = /<tr(?:\s+[^>]*)?>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let rowIndex = 0;
    
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        // Skip header row if we have headers from <th>
        if (headers.length > 0 && rowIndex === 0) {
            rowIndex++;
            continue;
        }
        
        const cellRegex = /<t[hd](?:\s+[^>]*)?>([\s\S]*?)<\/t[hd]>/gi;
        const row = [];
        let cellMatch;
        let hasContent = false;
        
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
            const text = cleanCell(stripTags(cellMatch[1]));
            row.push(text);
            if (text) hasContent = true;
        }
        
        if (row.length > 0 && hasContent) {
            rows.push(row);
        }
        rowIndex++;
    }
    
    // Pad rows to match header count
    if (headers.length > 0) {
        rows.forEach(row => {
            while (row.length < headers.length) {
                row.push('');
            }
        });
    }
    
    return { headers, rows };
}

function extractTables(html) {
    const tables = [];
    const regex = /<table(?:\s+[^>]*)?>[\s\S]*?<\/table>/gi;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
        const table = parseTable(match[0]);
        if (table.rows.length > 0) {
            tables.push(table);
        }
    }
    
    return tables;
}

// ============================================================================
// Export Functions
// ============================================================================
function escapeCSV(val) {
    const str = String(val).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function toCSV(headers, rows) {
    if (!headers || headers.length === 0) return '';
    
    const headerLine = headers.map(escapeCSV).join(',');
    const dataLines = rows.map(row => row.map(escapeCSV).join(','));
    
    return [headerLine, ...dataLines].join('\n');
}

function toMarkdown(headers, rows) {
    if (!headers || headers.length === 0) return '';
    
    const md = [];
    md.push('| ' + headers.join(' | ') + ' |');
    md.push('| ' + headers.map(() => '---').join(' | ') + ' |');
    
    rows.forEach(row => {
        md.push('| ' + row.join(' | ') + ' |');
    });
    
    return md.join('\n');
}

function generateHTMLReport(tables, title, meta) {
    const timestamp = new Date().toISOString();
    
    let tablesHTML = '';
    let rowCount = 0;
    
    tables.forEach((table, idx) => {
        if (table.headers.length === 0 || table.rows.length === 0) return;
        
        rowCount += table.rows.length;
        
        // Create header row with preview of first cells
        const headerPreview = table.headers.slice(0, 5).join(' | ');
        const moreHeaders = table.headers.length > 5 ? ` (+${table.headers.length - 5} more)` : '';
        
        tablesHTML += `
        <div class="table-section">
            <h3>Table ${idx + 1}: ${headerPreview}${moreHeaders}</h3>
            <p class="table-meta">${table.rows.length} rows × ${table.headers.length} columns</p>
            <div class="table-scroll">
                <table>
                    <thead>
                        <tr>${table.headers.map(h => `<th>${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${table.rows.slice(0, 50).map(row => 
                            `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
                        ).join('\n                        ')}
                    </tbody>
                </table>
            </div>
            ${table.rows.length > 50 ? `<p class="preview-note">Showing first 50 of ${table.rows.length} rows</p>` : ''}
        </div>`;
    });
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Tables</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 1600px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f5f5f5;
        }
        h1 { color: #0052CC; border-bottom: 3px solid #0052CC; padding-bottom: 10px; }
        h2 { color: #172B4D; margin-top: 30px; }
        h3 { color: #42526E; margin-bottom: 10px; }
        .meta-box { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .meta-item { display: inline-block; margin-right: 30px; margin-bottom: 10px; }
        .meta-label { font-weight: bold; color: #5E6C84; }
        .stats { display: flex; gap: 20px; margin-top: 15px; }
        .stat-box { background: #E3FCEF; padding: 15px 25px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 24px; font-weight: bold; color: #006644; }
        .stat-label { color: #5E6C84; font-size: 12px; }
        .table-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin: 20px 0;
        }
        .table-meta { color: #6B778C; font-size: 14px; margin-bottom: 10px; }
        .table-scroll { overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; min-width: 800px; }
        th {
            background: #0052CC;
            color: white;
            padding: 12px 8px;
            text-align: left;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        td {
            border: 1px solid #DFE1E6;
            padding: 10px 8px;
            max-width: 300px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        td:hover { overflow: visible; white-space: normal; }
        tr:nth-child(even) { background: #FAFBFC; }
        tr:hover { background: #EBECF0; }
        .preview-note { color: #6B778C; font-size: 12px; font-style: italic; margin-top: 10px; }
        .footer { margin-top: 40px; padding: 20px; background: white; border-radius: 8px; color: #6B778C; font-size: 12px; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    
    <div class="meta-box">
        <div class="meta-item"><span class="meta-label">Page ID:</span> ${meta.pageId}</div>
        <div class="meta-item"><span class="meta-label">Version:</span> ${meta.version}</div>
        <div class="meta-item"><span class="meta-label">Last Updated:</span> ${meta.lastUpdated || 'N/A'}</div>
        <div class="meta-item"><span class="meta-label">Updated By:</span> ${meta.updatedBy || 'N/A'}</div>
        
        <div class="stats">
            <div class="stat-box">
                <div class="stat-number">${tables.length}</div>
                <div class="stat-label">Tables Found</div>
            </div>
            <div class="stat-box">
                <div class="stat-number">${rowCount.toLocaleString()}</div>
                <div class="stat-label">Total Rows</div>
            </div>
            <div class="stat-box">
                <div class="stat-number">${meta.bodyLength.toLocaleString()}</div>
                <div class="stat-label">Body Chars</div>
            </div>
        </div>
    </div>
    
    ${tablesHTML}
    
    <div class="footer">
        <p>Generated: ${timestamp}</p>
        <p>Source: <a href="https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/${meta.pageId}" target="_blank">Confluence Link</a></p>
    </div>
</body>
</html>`;
}

// ============================================================================
// Main
// ============================================================================
function main() {
    console.log('='.repeat(60));
    console.log('  SOP Table Extractor');
    console.log('='.repeat(60));
    
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Input file not found: ${INPUT_FILE}`);
        console.log('Run fetch_via_api.js first to get the body content.');
        process.exit(1);
    }
    
    const bodyHtml = fs.readFileSync(INPUT_FILE, 'utf-8');
    console.log(`Loaded ${bodyHtml.length.toLocaleString()} characters from sop_body.html`);
    
    // Read metadata from JSON
    const jsonFile = path.join(OUTPUT_DIR, 'sop_api_full.json');
    let meta = { pageId: 1256152285, version: 'unknown', lastUpdated: null, updatedBy: null };
    
    if (fs.existsSync(jsonFile)) {
        const jsonData = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
        meta = {
            pageId: jsonData.pageId,
            version: jsonData.version,
            lastUpdated: jsonData.versionWhen,
            updatedBy: jsonData.versionBy,
            bodyLength: jsonData.bodyLength
        };
    }
    
    // Extract tables
    console.log('Extracting tables...');
    const tables = extractTables(bodyHtml);
    console.log(`Found ${tables.length} table(s)`);
    
    // Show table summary
    console.log('\nTable Summary:');
    tables.forEach((table, idx) => {
        const cols = table.headers.length || (table.rows[0]?.length || 0);
        console.log(`  Table ${idx + 1}: ${table.rows.length} rows × ${cols} columns`);
    });
    
    // Export largest table to CSV
    if (tables.length > 0) {
        // Sort by row count
        const sortedTables = [...tables].sort((a, b) => b.rows.length - a.rows.length);
        const largestTable = sortedTables[0];
        
        console.log(`\nLargest table: ${largestTable.rows.length} rows × ${largestTable.headers.length} columns`);
        
        // CSV
        const csv = toCSV(largestTable.headers, largestTable.rows);
        fs.writeFileSync(path.join(OUTPUT_DIR, 'sop_main_table.csv'), csv, 'utf-8');
        console.log('Saved: sop_main_table.csv');
        
        // Export ALL tables to separate files
        console.log('\nExporting all tables...');
        tables.forEach((table, idx) => {
            if (table.headers.length > 0 && table.rows.length > 0) {
                const csv = toCSV(table.headers, table.rows);
                fs.writeFileSync(path.join(OUTPUT_DIR, `sop_table_${idx + 1}.csv`), csv, 'utf-8');
                console.log(`  Saved: sop_table_${idx + 1}.csv (${table.rows.length} rows)`);
            }
        });
        
        // Combined Markdown
        let mdContent = `# Problem with an Order (PWAO) SOP (DSC2S)\n\n`;
        mdContent += `**Page ID:** ${meta.pageId}\n`;
        mdContent += `**Version:** ${meta.version}\n`;
        mdContent += `**Last Updated:** ${meta.lastUpdated || 'N/A'}\n\n`;
        mdContent += `---\n\n`;
        
        tables.forEach((table, idx) => {
            if (table.headers.length > 0 && table.rows.length > 0) {
                mdContent += `## Table ${idx + 1}\n\n`;
                mdContent += toMarkdown(table.headers, table.rows.slice(0, 100)); // Limit to 100 rows per table in MD
                mdContent += '\n\n';
            }
        });
        
        fs.writeFileSync(path.join(OUTPUT_DIR, 'sop_tables.md'), mdContent, 'utf-8');
        console.log('Saved: sop_tables.md');
        
        // HTML Report
        const html = generateHTMLReport(tables, 'Problem with an Order (PWAO) SOP (DSC2S)', meta);
        fs.writeFileSync(path.join(OUTPUT_DIR, 'sop_tables.html'), html, 'utf-8');
        console.log('Saved: sop_tables.html');
        
        // JSON with all tables
        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'sop_tables.json'),
            JSON.stringify({ meta, tables }, null, 2),
            'utf-8'
        );
        console.log('Saved: sop_tables.json');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Done!');
    console.log('='.repeat(60));
}

main();
