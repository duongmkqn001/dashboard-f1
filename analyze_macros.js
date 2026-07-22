#!/usr/bin/env node
/**
 * Advanced extraction from Confluence HTML with Refined Wiki macros
 * Extracts URL-encoded macroBody content from JavaScript macros
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

const SOURCE_FILES = {
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
// URL Decode (client-side compatible)
// ============================================================================
function urlDecode(str) {
    return decodeURIComponent(str
        .replace(/%(?![\da-f]{2})/gi, '%25')  // Fix malformed %
        .replace(/\+/g, ' '));
}

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
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTable(tableHtml) {
    const rows = [];
    
    // Extract headers from <th> tags
    const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers = [];
    let headerMatch;
    while ((headerMatch = headerRegex.exec(tableHtml)) !== null) {
        const text = stripTags(headerMatch[1]).trim();
        headers.push(text || 'Column');
    }
    
    // If no headers, try first <tr>
    if (headers.length === 0) {
        const firstRowMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
        if (firstRowMatch) {
            const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
            let cellMatch;
            while ((cellMatch = cellRegex.exec(firstRowMatch[1])) !== null) {
                const text = stripTags(cellMatch[1]).trim();
                headers.push(text || 'Column');
            }
        }
    }
    
    // Extract all rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let rowIndex = 0;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        // Skip header row if we found headers
        if (headers.length > 0 && rowIndex === 0) {
            rowIndex++;
            continue;
        }
        
        const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        const row = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
            row.push(stripTags(cellMatch[1]).trim());
        }
        
        if (row.length > 0 && row.some(cell => cell.length > 0)) {
            rows.push(row);
        }
        rowIndex++;
    }
    
    return { headers, rows };
}

function extractTables(html) {
    const tables = [];
    
    // Match table elements
    const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
    let match;
    while ((match = tableRegex.exec(html)) !== null) {
        const tableData = parseTable(match[0]);
        if (tableData.rows.length > 0 || tableData.headers.length > 0) {
            tables.push(tableData);
        }
    }
    
    return tables;
}

// ============================================================================
// Macro Body Extraction
// ============================================================================
function extractMacroBodies(html) {
    const macros = [];
    
    // Find all script tags with ap-iframe-body-script class
    const scriptRegex = /<script[^>]*class="ap-iframe-body-script"[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
        const scriptContent = scriptMatch[1];
        
        // Extract macroBody from URL-encoded data
        const macroBodyMatches = scriptContent.match(/macroBody=([^&"]+)/gi);
        if (macroBodyMatches) {
            for (const match of macroBodyMatches) {
                const encoded = match.replace('macroBody=', '');
                try {
                    const decoded = urlDecode(encoded);
                    if (decoded && decoded.length > 10) {
                        macros.push({
                            encoded: encoded.substring(0, 100) + '...',
                            decoded: decoded
                        });
                    }
                } catch (e) {
                    // Skip malformed
                }
            }
        }
        
        // Also try to find raw HTML content in macroBody (if not truncated)
        const bodyMatch = scriptContent.match(/"macroBody"\s*:\s*"([^"]+)"/);
        if (bodyMatch) {
            try {
                const encoded = bodyMatch[1];
                const decoded = urlDecode(encoded);
                if (decoded && decoded.includes('<')) {
                    macros.push({
                        type: 'embedded',
                        content: decoded
                    });
                }
            } catch (e) {}
        }
    }
    
    return macros;
}

// ============================================================================
// Extract Tabs Information
// ============================================================================
function extractTabInfo(html) {
    const tabs = [];
    
    // Find ui-tabs macro and extract tab names from URL parameters
    const tabRegex = /refined-tabs\?[^"]*macroBody=([^&"]+)/gi;
    let match;
    
    while ((match = tabRegex.exec(html)) !== null) {
        try {
            const decoded = urlDecode(match[1]);
            // Extract tab names
            const tabNameRegex = /data-macro-name="tab"[^>]*>[^<]*<[^>]*>([^<]+)/gi;
            let tabMatch;
            while ((tabMatch = tabNameRegex.exec(decoded)) !== null) {
                tabs.push(stripTags(tabMatch[1]));
            }
        } catch (e) {}
    }
    
    // Also extract from tab class elements
    const tabClassRegex = /<div[^>]*class="[^"]*tab[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let tabMatch;
    while ((tabMatch = tabClassRegex.exec(html)) !== null) {
        const text = stripTags(tabMatch[1]).trim();
        if (text && text.length < 100) {
            tabs.push(text);
        }
    }
    
    return [...new Set(tabs)]; // Remove duplicates
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

function toMarkdown(tables, title, meta) {
    let md = `# ${title}\n\n`;
    md += `**Page ID:** ${meta.pageId}\n`;
    md += `**Version:** ${meta.version || 'N/A'}\n`;
    md += `**Last Updated:** ${meta.lastUpdated || 'N/A'}\n\n`;
    md += `---\n\n`;
    
    if (tables.length === 0) {
        md += '*No tabular data found. Content is in dynamic macros.*\n';
        return md;
    }
    
    tables.forEach((table, idx) => {
        md += `## Table ${idx + 1}\n\n`;
        if (table.headers.length > 0) {
            md += '| ' + table.headers.join(' | ') + ' |\n';
            md += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';
        }
        table.rows.forEach(row => {
            md += '| ' + row.join(' | ') + ' |\n';
        });
        md += '\n';
    });
    
    return md;
}

function toHTMLPage(title, pageId, tables, macros, tabs, meta) {
    const timestamp = new Date().toISOString();
    
    let macrosHTML = '';
    macros.slice(0, 10).forEach((macro, idx) => {
        if (macro.decoded) {
            // Try to extract meaningful content
            const content = macro.decoded.length > 200 
                ? macro.decoded.substring(0, 200) + '...' 
                : macro.decoded;
            
            macrosHTML += `
            <div class="macro-item">
                <h4>Macro Content (${content.length} chars)</h4>
                <pre>${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>`;
        }
    });
    
    let tabsHTML = '';
    if (tabs.length > 0) {
        tabsHTML = `
        <div class="tabs-section">
            <h3>Tabs Found</h3>
            <ul class="tabs-list">
                ${tabs.map(t => `<li>${t}</li>`).join('\n                ')}
            </ul>
        </div>`;
    }
    
    let tablesHTML = '';
    tables.forEach((table, idx) => {
        if (table.headers.length === 0 && table.rows.length === 0) return;
        
        tablesHTML += `
        <div class="table-container">
            <h3>Table ${idx + 1}</h3>
            <p class="table-info">${table.rows.length} rows, ${table.headers.length} columns</p>
            <table>
                <thead>
                    <tr>${table.headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${table.rows.slice(0, 20).map(row => 
                        `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
                    ).join('\n                    ')}
                </tbody>
            </table>
            ${table.rows.length > 20 ? `<p class="table-info">...and ${table.rows.length - 20} more rows</p>` : ''}
        </div>`;
    });
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Analysis</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 1400px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f5f5f5;
            color: #333;
        }
        h1 { color: #0052CC; border-bottom: 3px solid #0052CC; padding-bottom: 10px; }
        h2 { color: #172B4D; margin-top: 30px; }
        h3 { color: #42526E; }
        h4 { color: #6B778C; margin-top: 20px; }
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
        table { border-collapse: collapse; width: 100%; }
        th { background: #0052CC; color: white; padding: 12px 8px; text-align: left; }
        td { border: 1px solid #DFE1E6; padding: 10px 8px; max-width: 300px; }
        tr:nth-child(even) { background: #FAFBFC; }
        .table-info { color: #6B778C; font-size: 12px; margin-top: 10px; }
        .macro-item {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        pre { 
            background: #f4f4f4; 
            padding: 15px; 
            border-radius: 4px; 
            overflow-x: auto;
            font-size: 12px;
            max-height: 200px;
        }
        .tabs-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .tabs-list {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            list-style: none;
            padding: 0;
        }
        .tabs-list li {
            background: #E3FCEF;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 14px;
        }
        .footer { margin-top: 40px; padding: 20px; background: white; border-radius: 8px; color: #6B778C; font-size: 12px; }
        .stats { display: flex; gap: 20px; margin-top: 20px; }
        .stat-box { background: #E3FCEF; padding: 15px 25px; border-radius: 8px; text-align: center; }
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
                <div class="stat-number">${tables.reduce((sum, t) => sum + t.rows.length, 0)}</div>
                <div class="stat-label">Table Rows</div>
            </div>
            <div class="stat-box">
                <div class="stat-number">${tables.length}</div>
                <div class="stat-label">Tables</div>
            </div>
            <div class="stat-box">
                <div class="stat-number">${macros.length}</div>
                <div class="stat-label">Macros</div>
            </div>
            <div class="stat-box">
                <div class="stat-number">${tabs.length}</div>
                <div class="stat-label">Tabs</div>
            </div>
        </div>
    </div>
    
    ${tabsHTML}
    ${tablesHTML}
    ${macrosHTML}
    
    <div class="footer">
        <p>Exported from Confluence | Space: GPS | Generated: ${timestamp}</p>
        <p>Source: <a href="https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/${pageId}" target="_blank">Link</a></p>
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
    
    // Extract metadata
    const meta = {
        pageId: fileInfo.pageId,
        version: null,
        lastUpdated: null
    };
    
    const dateMatch = html.match(/Last Updated:[\s\S]*?datetime="([^"]*)"[^>]*>/i);
    if (dateMatch) {
        meta.lastUpdated = dateMatch[1];
    }
    
    const versionMatch = html.match(/\(v(\d+)\)/i);
    if (versionMatch) {
        meta.version = parseInt(versionMatch[1]);
    }
    
    // Extract macros and their bodies
    const macros = extractMacroBodies(html);
    console.log(`Found ${macros.length} macro body(ies)`);
    
    // Extract tables from macro bodies
    let allTables = [];
    macros.forEach((macro, idx) => {
        if (macro.decoded) {
            const tables = extractTables(macro.decoded);
            console.log(`  Macro ${idx + 1}: found ${tables.length} table(s) in decoded content`);
            allTables = allTables.concat(tables);
        }
    });
    
    // Also extract tables from main HTML
    const mainTables = extractTables(html);
    console.log(`Found ${mainTables.length} table(s) in main HTML`);
    allTables = allTables.concat(mainTables);
    
    // Extract tabs
    const tabs = extractTabInfo(html);
    console.log(`Found ${tabs.length} tab reference(s): ${tabs.slice(0, 5).join(', ')}${tabs.length > 5 ? '...' : ''}`);
    
    // Generate output
    const outputName = key;
    
    // JSON output
    const jsonData = {
        pageId: fileInfo.pageId,
        title: fileInfo.title,
        meta,
        tables: allTables,
        tabs,
        macrosCount: macros.length,
        extractedAt: new Date().toISOString()
    };
    fs.writeFileSync(
        path.join(OUTPUT_DIR, `${outputName}_analysis.json`),
        JSON.stringify(jsonData, null, 2),
        'utf-8'
    );
    console.log(`Saved: ${outputName}_analysis.json`);
    
    // Markdown output
    const mdContent = toMarkdown(allTables, fileInfo.title, meta);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, `${outputName}_analysis.md`),
        mdContent,
        'utf-8'
    );
    console.log(`Saved: ${outputName}_analysis.md`);
    
    // HTML output
    const htmlContent = toHTMLPage(fileInfo.title, fileInfo.pageId, allTables, macros, tabs, meta);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, `${outputName}_analysis.html`),
        htmlContent,
        'utf-8'
    );
    console.log(`Saved: ${outputName}_analysis.html`);
    
    // Save raw macro content for inspection
    if (macros.length > 0) {
        const rawContent = macros.map((m, i) => 
            `=== MACRO ${i + 1} ===\n${m.decoded || 'N/A'}`
        ).join('\n\n');
        fs.writeFileSync(
            path.join(OUTPUT_DIR, `${outputName}_raw_content.txt`),
            rawContent,
            'utf-8'
        );
        console.log(`Saved: ${outputName}_raw_content.txt`);
    }
    
    return { tables: allTables, macros, tabs, meta };
}

// ============================================================================
// Entry Point
// ============================================================================
console.log('='.repeat(60));
console.log('  Confluence SOP/Template Analyzer');
console.log('='.repeat(60));
console.log(`\nInput:  ${INPUT_DIR}`);
console.log(`Output: ${OUTPUT_DIR}\n`);

for (const [key, fileInfo] of Object.entries(SOURCE_FILES)) {
    processFile(key, fileInfo);
}

console.log('\n' + '='.repeat(60));
console.log('Done!');
console.log('='.repeat(60));
