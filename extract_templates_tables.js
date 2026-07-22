#!/usr/bin/env node
/**
 * Extract tables from Canned Responses body HTML
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'extracted_data');
const INPUT_FILE = path.join(OUTPUT_DIR, 'canned_responses_body.html');

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
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanCell(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function parseTable(tableHtml) {
    const rows = [];
    const headers = [];
    
    // Extract headers from <th> tags
    const headerRegex = /<th(?:\s+[^>]*)?>([\s\S]*?)<\/th>/gi;
    let match;
    while ((match = headerRegex.exec(tableHtml)) !== null) {
        const text = stripTags(match[1]).trim();
        if (text) headers.push(text);
    }
    
    // If no <th>, try first <tr>
    if (headers.length === 0) {
        const firstRow = tableHtml.match(/<tr(?:\s+[^>]*)?>([\s\S]*?)<\/tr>/i);
        if (firstRow) {
            const cellRegex = /<t[hd](?:\s+[^>]*)?>([\s\S]*?)<\/t[hd]>/gi;
            let cellMatch;
            while ((cellMatch = cellRegex.exec(firstRow[1])) !== null) {
                const text = stripTags(cellMatch[1]).trim();
                headers.push(text || `Col_${headers.length + 1}`);
            }
        }
    }
    
    // Extract rows
    const rowRegex = /<tr(?:\s+[^>]*)?>([\s\S]*?)<\/tr>/gi;
    let rowIndex = 0;
    let match2;
    while ((match2 = rowRegex.exec(tableHtml)) !== null) {
        if (headers.length > 0 && rowIndex === 0) {
            rowIndex++;
            continue;
        }
        
        const cellRegex = /<t[hd](?:\s+[^>]*)?>([\s\S]*?)<\/t[hd]>/gi;
        const row = [];
        let hasContent = false;
        let cellMatch2;
        
        while ((cellMatch2 = cellRegex.exec(match2[1])) !== null) {
            const text = cleanCell(stripTags(cellMatch2[1]));
            row.push(text);
            if (text) hasContent = true;
        }
        
        if (row.length > 0 && hasContent) {
            rows.push(row);
        }
        rowIndex++;
    }
    
    // Pad rows
    if (headers.length > 0) {
        rows.forEach(row => {
            while (row.length < headers.length) row.push('');
        });
    }
    
    return { headers, rows };
}

function escapeCSV(val) {
    const str = String(val).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function toCSV(headers, rows) {
    if (!headers.length) return '';
    return [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
}

function toMarkdown(headers, rows) {
    if (!headers.length) return '';
    return [
        '| ' + headers.join(' | ') + ' |',
        '| ' + headers.map(() => '---').join(' | ') + ' |',
        ...rows.map(r => '| ' + r.join(' | ') + ' |')
    ].join('\n');
}

function main() {
    console.log('='.repeat(60));
    console.log('  Canned Responses Table Extractor');
    console.log('='.repeat(60));
    
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('Input file not found:', INPUT_FILE);
        process.exit(1);
    }
    
    const bodyHtml = fs.readFileSync(INPUT_FILE, 'utf-8');
    console.log(`Loaded ${bodyHtml.length.toLocaleString()} characters`);
    
    // Extract tables
    const tables = [];
    const regex = /<table(?:\s+[^>]*)?>[\s\S]*?<\/table>/gi;
    let match;
    
    while ((match = regex.exec(bodyHtml)) !== null) {
        const table = parseTable(match[0]);
        if (table.rows.length > 0) {
            tables.push(table);
        }
    }
    
    console.log(`Found ${tables.length} table(s)`);
    
    // Show summary
    console.log('\nTable Summary:');
    let totalRows = 0;
    tables.forEach((t, i) => {
        const cols = t.headers.length || (t.rows[0]?.length || 0);
        console.log(`  Table ${i + 1}: ${t.rows.length} rows × ${cols} columns`);
        totalRows += t.rows.length;
    });
    console.log(`\nTotal rows: ${totalRows}`);
    
    // Export tables
    console.log('\nExporting...');
    
    // Combined CSV (largest table)
    if (tables.length > 0) {
        const largest = [...tables].sort((a, b) => b.rows.length - a.rows.length)[0];
        fs.writeFileSync(path.join(OUTPUT_DIR, 'templates_main_table.csv'), toCSV(largest.headers, largest.rows), 'utf-8');
        console.log('Saved: templates_main_table.csv');
        
        // Individual tables
        tables.forEach((t, i) => {
            if (t.headers.length > 0 && t.rows.length > 0) {
                fs.writeFileSync(path.join(OUTPUT_DIR, `templates_table_${i + 1}.csv`), toCSV(t.headers, t.rows), 'utf-8');
            }
        });
        console.log(`Saved: templates_table_1.csv → templates_table_${tables.length}.csv`);
        
        // Combined Markdown
        let md = '# Canned Responses/Templates (DSC2S)\n\n';
        md += '**Page ID:** 1256153038\n\n---\n\n';
        tables.forEach((t, i) => {
            if (t.headers.length > 0) {
                md += `## Table ${i + 1}\n\n`;
                md += toMarkdown(t.headers, t.rows.slice(0, 100)) + '\n\n';
            }
        });
        fs.writeFileSync(path.join(OUTPUT_DIR, 'templates_tables.md'), md, 'utf-8');
        console.log('Saved: templates_tables.md');
        
        // JSON
        fs.writeFileSync(path.join(OUTPUT_DIR, 'templates_tables.json'), JSON.stringify({ tables }, null, 2), 'utf-8');
        console.log('Saved: templates_tables.json');
        
        // HTML Report
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Canned Responses/Templates - Tables</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        h1 { color: #0052CC; border-bottom: 3px solid #0052CC; }
        .meta { background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .stats { display: flex; gap: 20px; margin-top: 15px; }
        .stat { background: #E3FCEF; padding: 15px 25px; border-radius: 8px; text-align: center; }
        .stat-num { font-size: 24px; font-weight: bold; color: #006644; }
        .table-section { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #0052CC; color: white; padding: 12px; text-align: left; position: sticky; top: 0; }
        td { border: 1px solid #DFE1E6; padding: 10px; max-width: 300px; }
        tr:nth-child(even) { background: #FAFBFC; }
    </style>
</head>
<body>
    <h1>Canned Responses/Templates (DSC2S)</h1>
    <div class="meta">
        <strong>Page ID:</strong> 1256153038 | <strong>Version:</strong> 210<br>
        <div class="stats">
            <div class="stat"><div class="stat-num">${tables.length}</div>Tables</div>
            <div class="stat"><div class="stat-num">${totalRows}</div>Total Rows</div>
        </div>
    </div>
    ${tables.map((t, i) => `
    <div class="table-section">
        <h3>Table ${i + 1} (${t.rows.length} rows)</h3>
        <table><thead><tr>${t.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.slice(0, 50).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
        ${t.rows.length > 50 ? '<p>...and ' + (t.rows.length - 50) + ' more rows</p>' : ''}
    </div>`).join('')}
</body>
</html>`;
        fs.writeFileSync(path.join(OUTPUT_DIR, 'templates_tables.html'), html, 'utf-8');
        console.log('Saved: templates_tables.html');
    }
    
    console.log('\nDone!');
}

main();
