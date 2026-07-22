#!/usr/bin/env node
/**
 * Extract GPS pages from pre-exported HTML files
 * Parse Confluence HTML tables and export to various formats
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Config
// ============================================================================
const INPUT_DIR = path.join(__dirname, 'confluence_export');
const OUTPUT_DIR = path.join(__dirname, 'extracted_data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Source files
const SOURCE_FILES = {
    change_log: {
        html: path.join(INPUT_DIR, 'change_log_view.html'),
        title: 'Change Log DSC2S',
        pageId: 1256148486
    },
    sop: {
        html: path.join(INPUT_DIR, 'pwao_sop_view.html'),
        title: 'Problem with an Order (PWAO) SOP (DSC2S)',
        pageId: 1256152285
    },
    templates: {
        html: path.join(INPUT_DIR, 'dcs2s_view.html'),
        title: 'Canned Responses/Templates (DSC2S)',
        pageId: 1256148684
    }
};

// ============================================================================
// HTML Parsing (Vanilla JS - no external dependencies)
// ============================================================================

function parseTable(tableHtml) {
    const rows = [];
    
    // Extract headers
    const headerMatches = tableHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    const headers = headerMatches.map(h => {
        return stripTags(h).replace(/\*\*/g, '').trim() || 'Column';
    });
    
    // If no headers from <th>, try first <tr>
    if (headers.length === 0) {
        const firstRowMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
        if (firstRowMatch) {
            const cellMatches = firstRowMatch[1].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
            headers.push(...cellMatches.map(c => stripTags(c).replace(/\*\*/g, '').trim() || 'Column'));
        }
    }
    
    // Extract all rows
    const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    let skipFirst = headers.length > 0; // Skip header row if we found headers
    
    for (let i = 0; i < rowMatches.length; i++) {
        if (skipFirst && i === 0) continue;
        
        const cellMatches = rowMatches[i].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
        const row = cellMatches.map(c => stripTags(c).replace(/\*\*/g, '').trim());
        
        if (row.length > 0 && row.some(cell => cell.length > 0)) {
            rows.push(row);
        }
    }
    
    return { headers, rows };
}

function stripTags(html) {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTables(html) {
    const tables = [];
    const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
    let match;
    
    while ((match = tableRegex.exec(html)) !== null) {
        const tableData = parseTable(match[0]);
        if (tableData.rows.length > 0) {
            tables.push(tableData);
        }
    }
    
    return tables;
}

function extractHeadings(html) {
    const headings = [];
    const headingRegex = /<h([1-6])[^>]*(?:id="([^"]*)")?[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    let match;
    
    while ((match = headingRegex.exec(html)) !== null) {
        headings.push({
            level: parseInt(match[1]),
            id: match[2] || '',
            text: stripTags(match[3]).trim()
        });
    }
    
    return headings;
}

function extractMetaInfo(html) {
    const meta = {};
    
    // Extract date
    const dateMatch = html.match(/Last Updated:[\s\S]*?<time[^>]*datetime="([^"]*)"[^>]*>/i);
    if (dateMatch) {
        meta.lastUpdated = dateMatch[1];
    }
    
    // Extract version
    const versionMatch = html.match(/\(v(\d+)\)/i);
    if (versionMatch) {
        meta.version = parseInt(versionMatch[1]);
    }
    
    return meta;
}

// ============================================================================
// Export Functions
// ============================================================================

function toCSV(headers, rows) {
    if (headers.length === 0 && rows.length === 0) return '';
    
    const escapeCSV = (val) => {
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    
    const headerLine = headers.map(escapeCSV).join(',');
    const dataLines = rows.map(row => row.map(escapeCSV).join(','));
    
    return [headerLine, ...dataLines].join('\n');
}

function toMarkdown(headers, rows) {
    if (headers.length === 0 && rows.length === 0) return '';
    
    const md = [];
    
    // Header row
    md.push('| ' + headers.join(' | ') + ' |');
    md.push('| ' + headers.map(() => '---').join(' | ') + ' |');
    
    // Data rows
    for (const row of rows) {
        md.push('| ' + row.join(' | ') + ' |');
    }
    
    return md.join('\n');
}

function toJSON(headers, rows) {
    return rows.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] || '';
        });
        return obj;
    });
}

function toHTMLPage(title, pageId, tables, headings, meta, sourceUrl) {
    const timestamp = new Date().toISOString();
    
    let tablesHTML = '';
    tables.forEach((table, idx) => {
        tablesHTML += `
        <div class="table-container">
            <h3>Table ${idx + 1}</h3>
            <table>
                <thead>
                    <tr>${table.headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${table.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('\n                    ')}
                </tbody>
            </table>
            <p class="table-info">Rows: ${table.rows.length}</p>
        </div>`;
    });
    
    let headingsHTML = '';
    if (headings.length > 0) {
        headingsHTML = `
        <div class="headings-section">
            <h2>Headings Found</h2>
            <ul>
                ${headings.map(h => `<li class="level-${h.level}">${'#'.repeat(h.level)} ${h.text}</li>`).join('\n                ')}
            </ul>
        </div>`;
    }
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; 
            max-width: 1400px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f5f5f5;
            color: #333;
        }
        h1 { 
            color: #0052CC; 
            border-bottom: 3px solid #0052CC; 
            padding-bottom: 10px;
        }
        h2 { color: #172B4D; margin-top: 30px; }
        h3 { color: #42526E; }
        .meta-box { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .meta-item { display: inline-block; margin-right: 30px; margin-bottom: 10px; }
        .meta-label { font-weight: bold; color: #5E6C84; }
        .table-container { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin: 20px 0;
            overflow-x: auto;
        }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            min-width: 600px;
        }
        th { 
            background: #0052CC; 
            color: white; 
            padding: 12px 8px; 
            text-align: left; 
            font-weight: 600;
        }
        td { 
            border: 1px solid #DFE1E6; 
            padding: 10px 8px; 
        }
        tr:nth-child(even) { background: #FAFBFC; }
        tr:hover { background: #EBECF0; }
        .table-info { 
            color: #6B778C; 
            font-size: 12px; 
            margin-top: 10px;
        }
        .headings-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin: 20px 0;
        }
        .headings-section li { margin: 5px 0; }
        .headings-section .level-1 { font-size: 18px; font-weight: bold; color: #0052CC; }
        .headings-section .level-2 { font-size: 16px; font-weight: bold; }
        .headings-section .level-3 { font-size: 14px; }
        .footer { 
            margin-top: 40px; 
            padding: 20px; 
            background: white;
            border-radius: 8px;
            color: #6B778C; 
            font-size: 12px;
        }
        .footer a { color: #0052CC; }
        .stats { 
            display: flex; 
            gap: 20px; 
            margin-top: 20px;
        }
        .stat-box {
            background: #E3FCEF;
            padding: 15px 25px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-number { font-size: 24px; font-weight: bold; color: #006644; }
        .stat-label { color: #5E6C84; font-size: 12px; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    
    <div class="meta-box">
        <div class="meta-item"><span class="meta-label">Page ID:</span> ${pageId}</div>
        <div class="meta-item"><span class="meta-label">Version:</span> ${meta.version || 'N/A'}</div>
        <div class="meta-item"><span class="meta-label">Last Updated:</span> ${meta.lastUpdated || 'N/A'}</div>
        <div class="meta-item"><span class="meta-label">Space:</span> GPS</div>
        
        <div class="stats">
            <div class="stat-box">
                <div class="stat-number">${tables.length}</div>
                <div class="stat-label">Tables Found</div>
            </div>
            <div class="stat-box">
                <div class="stat-number">${tables.reduce((sum, t) => sum + t.rows.length, 0)}</div>
                <div class="stat-label">Total Rows</div>
            </div>
            <div class="stat-box">
                <div class="stat-number">${headings.length}</div>
                <div class="stat-label">Sections</div>
            </div>
        </div>
    </div>
    
    ${headingsHTML}
    ${tablesHTML}
    
    <div class="footer">
        <p>Exported from Confluence | Space: GPS | Generated: ${timestamp}</p>
        <p>Source: <a href="${sourceUrl}" target="_blank">${sourceUrl}</a></p>
    </div>
</body>
</html>`;
}

// ============================================================================
// Main Processing
// ============================================================================

function processFile(key, fileInfo) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${fileInfo.title}`);
    console.log(`${'='.repeat(60)}`);
    
    if (!fs.existsSync(fileInfo.html)) {
        console.error(`File not found: ${fileInfo.html}`);
        return null;
    }
    
    const html = fs.readFileSync(fileInfo.html, 'utf-8');
    console.log(`Loaded ${html.length.toLocaleString()} characters`);
    
    // Extract data
    const tables = extractTables(html);
    const headings = extractHeadings(html);
    const meta = extractMetaInfo(html);
    
    console.log(`Found ${tables.length} table(s) and ${headings.length} heading(s)`);
    if (meta.lastUpdated) console.log(`Last Updated: ${meta.lastUpdated}`);
    if (meta.version) console.log(`Version: ${meta.version}`);
    
    // Log table info
    tables.forEach((table, idx) => {
        console.log(`  Table ${idx + 1}: ${table.headers.length} columns, ${table.rows.length} rows`);
        if (table.headers.length > 0) {
            console.log(`    Headers: ${table.headers.slice(0, 5).join(', ')}${table.headers.length > 5 ? '...' : ''}`);
        }
    });
    
    const sourceUrl = `https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/${fileInfo.pageId}`;
    
    // Generate outputs
    const outputName = key.replace('_', '_');
    
    // JSON (combined data)
    const jsonData = {
        pageId: fileInfo.pageId,
        title: fileInfo.title,
        sourceUrl,
        meta,
        headings,
        tables: tables.map((t, idx) => ({
            index: idx,
            headers: t.headers,
            rows: t.rows
        })),
        extractedAt: new Date().toISOString()
    };
    fs.writeFileSync(
        path.join(OUTPUT_DIR, `${outputName}.json`),
        JSON.stringify(jsonData, null, 2),
        'utf-8'
    );
    console.log(`Saved: ${outputName}.json`);
    
    // CSV (largest table)
    if (tables.length > 0) {
        const largestTable = tables.reduce((a, b) => a.rows.length > b.rows.length ? a : b);
        
        if (largestTable.headers.length > 0 && largestTable.rows.length > 0) {
            fs.writeFileSync(
                path.join(OUTPUT_DIR, `${outputName}.csv`),
                toCSV(largestTable.headers, largestTable.rows),
                'utf-8'
            );
            console.log(`Saved: ${outputName}.csv`);
        }
        
        // MD (all tables in markdown)
        let mdContent = `# ${fileInfo.title}\n\n`;
        mdContent += `**Page ID:** ${fileInfo.pageId}\n`;
        mdContent += `**Version:** ${meta.version || 'N/A'}\n`;
        mdContent += `**Last Updated:** ${meta.lastUpdated || 'N/A'}\n`;
        mdContent += `**Source:** [Link](${sourceUrl})\n\n`;
        mdContent += `---\n\n`;
        
        tables.forEach((table, idx) => {
            mdContent += `## Table ${idx + 1}\n\n`;
            mdContent += toMarkdown(table.headers, table.rows);
            mdContent += '\n\n';
        });
        
        fs.writeFileSync(
            path.join(OUTPUT_DIR, `${outputName}.md`),
            mdContent,
            'utf-8'
        );
        console.log(`Saved: ${outputName}.md`);
    }
    
    // HTML (full page)
    const htmlPage = toHTMLPage(fileInfo.title, fileInfo.pageId, tables, headings, meta, sourceUrl);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, `${outputName}.html`),
        htmlPage,
        'utf-8'
    );
    console.log(`Saved: ${outputName}.html`);
    
    return { tables, headings, meta };
}

// ============================================================================
// Entry Point
// ============================================================================

console.log('='.repeat(60));
console.log('  Confluence GPS Pages Extractor');
console.log('='.repeat(60));
console.log(`\nInput:  ${INPUT_DIR}`);
console.log(`Output: ${OUTPUT_DIR}\n`);

const results = {};

for (const [key, fileInfo] of Object.entries(SOURCE_FILES)) {
    const result = processFile(key, fileInfo);
    results[key] = result;
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('  Extraction Complete!');
console.log('='.repeat(60));
console.log(`\nOutput directory: ${OUTPUT_DIR}`);

// List generated files
console.log('\nFiles generated:');
const files = fs.readdirSync(OUTPUT_DIR);
files.forEach(f => {
    const size = fs.statSync(path.join(OUTPUT_DIR, f)).size;
    console.log(`  - ${f} (${(size / 1024).toFixed(1)} KB)`);
});

console.log('\nDone!');
