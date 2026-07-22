#!/usr/bin/env node
/**
 * Fetch dynamic content from Refined Wiki Toolkit API
 * Extracts full content from macros using JWT authentication
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ============================================================================
// Config
// ============================================================================
const CONFLUENCE_EMAIL = 'lle31@wayfair.com';
const CONFLUENCE_API_KEY = process.env.CONFLUENCE_API_KEY || 'YOUR_API_KEY_HERE';

const OUTPUT_DIR = path.join(__dirname, 'extracted_data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Target pages with their IDs
const TARGET_PAGES = {
    sop: {
        pageId: 1256152285,
        title: 'Problem with an Order (PWAO) SOP (DSC2S)',
        inputFile: path.join(__dirname, 'confluence_export', 'pwao_sop_view.html')
    },
    templates: {
        pageId: 1256148684,
        title: 'Canned Responses/Templates (DSC2S)',
        inputFile: path.join(__dirname, 'confluence_export', 'dcs2s_view.html')
    }
};

// ============================================================================
// HTTP Helpers
// ============================================================================
function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...headers
            }
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
        });
        
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
}

function httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...headers
            }
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
        });
        
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.write(bodyStr);
        req.end();
    });
}

// ============================================================================
// Confluence API Client
// ============================================================================
class ConfluenceClient {
    constructor(email, apiKey) {
        this.email = email;
        this.apiKey = apiKey;
        this.baseUrl = 'https://wayfaircorp.atlassian.net/wiki/rest/api';
    }
    
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const auth = Buffer.from(`${this.email}:${this.apiKey}`).toString('base64');
        
        const response = await httpGet(url, {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
        });
        
        if (response.status >= 400) {
            throw new Error(`API Error ${response.status}: ${response.data}`);
        }
        
        return JSON.parse(response.data);
    }
    
    async getPage(pageId) {
        return this.request(`/content/${pageId}?expand=version,body.storage,metadata.labels,history`);
    }
    
    async getPageChildren(pageId) {
        return this.request(`/content/${pageId}/child/page`);
    }
    
    async getPageAncestors(pageId) {
        return this.request(`/content/${pageId}/ancestor`);
    }
}

// ============================================================================
// Refined Wiki Content Fetcher
// ============================================================================
async function fetchRefinedContent(macroUrl, contextJwt) {
    try {
        // The macro URL contains the content - let's try fetching it
        console.log(`  Fetching: ${macroUrl.substring(0, 100)}...`);
        
        const response = await httpGet(macroUrl, {
            'Origin': 'https://wayfaircorp.atlassian.net',
            'Referer': 'https://wayfaircorp.atlassian.net/wiki/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        return { success: true, content: response.data, status: response.status };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// HTML Parsing Helpers
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

function urlDecode(str) {
    return decodeURIComponent(str.replace(/%(?![\da-f]{2})/gi, '%25').replace(/\+/g, ' '));
}

function parseTable(tableHtml) {
    const rows = [];
    
    // Extract headers
    const headers = [];
    const headerMatches = tableHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    for (const h of headerMatches) {
        const text = stripTags(h).trim();
        headers.push(text || 'Column');
    }
    
    // Extract rows
    const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    let skipFirst = headers.length > 0;
    
    for (let i = 0; i < rowMatches.length; i++) {
        if (skipFirst && i === 0) continue;
        
        const cells = rowMatches[i].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
        const row = cells.map(c => stripTags(c).trim());
        
        if (row.length > 0 && row.some(cell => cell.length > 0)) {
            rows.push(row);
        }
    }
    
    return { headers, rows };
}

function extractTables(html) {
    const tables = [];
    const regex = /<table[^>]*>[\s\S]*?<\/table>/gi;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
        const table = parseTable(match[0]);
        if (table.rows.length > 0 || table.headers.length > 0) {
            tables.push(table);
        }
    }
    
    return tables;
}

// ============================================================================
// Main Processing
// ============================================================================
async function processPage(key, pageInfo) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${pageInfo.title}`);
    console.log(`${'='.repeat(60)}`);
    
    const client = new ConfluenceClient(CONFLUENCE_EMAIL, CONFLUENCE_API_KEY);
    
    try {
        console.log(`Fetching page ${pageInfo.pageId} from Confluence API...`);
        const page = await client.getPage(pageInfo.pageId);
        
        console.log(`  Title: ${page.title}`);
        console.log(`  Version: ${page.version.number}`);
        console.log(`  Body size: ${page.body.storage.value.length} chars`);
        
        // Extract tables from body
        const bodyHtml = page.body.storage.value;
        const tables = extractTables(bodyHtml);
        console.log(`  Found ${tables.length} table(s) in body`);
        
        // Extract child pages (SOP tabs might be separate pages)
        console.log(`Fetching child pages...`);
        const children = await client.getPageChildren(pageInfo.pageId);
        console.log(`  Found ${children.results?.length || 0} child page(s)`);
        
        // Save results
        const result = {
            pageId: page.id,
            title: page.title,
            version: page.version.number,
            versionWhen: page.version.when,
            versionBy: page.version.by?.displayName,
            labels: page.metadata.labels.results?.map(l => l.name) || [],
            tables,
            childPages: children.results?.map(c => ({
                id: c.id,
                title: c.title,
                version: c.version?.number
            })) || [],
            bodyLength: bodyHtml.length,
            extractedAt: new Date().toISOString()
        };
        
        const outputName = key;
        fs.writeFileSync(
            path.join(OUTPUT_DIR, `${outputName}_api_full.json`),
            JSON.stringify(result, null, 2),
            'utf-8'
        );
        console.log(`Saved: ${outputName}_api_full.json`);
        
        // Export tables to CSV
        if (tables.length > 0) {
            tables.forEach((table, idx) => {
                if (table.headers.length > 0 && table.rows.length > 0) {
                    const csv = [
                        table.headers.join(','),
                        ...table.rows.map(row => row.map(cell => 
                            `"${String(cell).replace(/"/g, '""')}"`
                        ).join(','))
                    ].join('\n');
                    
                    fs.writeFileSync(
                        path.join(OUTPUT_DIR, `${outputName}_table_${idx + 1}.csv`),
                        csv,
                        'utf-8'
                    );
                    console.log(`Saved: ${outputName}_table_${idx + 1}.csv`);
                }
            });
        }
        
        // Save full body HTML
        fs.writeFileSync(
            path.join(OUTPUT_DIR, `${outputName}_body.html`),
            bodyHtml,
            'utf-8'
        );
        console.log(`Saved: ${outputName}_body.html`);
        
        return result;
        
    } catch (error) {
        console.error(`  Error: ${error.message}`);
        return null;
    }
}

// ============================================================================
// Entry Point
// ============================================================================
async function main() {
    console.log('='.repeat(60));
    console.log('  Confluence API Direct Fetch');
    console.log('='.repeat(60));
    
    const results = {};
    
    for (const [key, pageInfo] of Object.entries(TARGET_PAGES)) {
        const result = await processPage(key, pageInfo);
        results[key] = result;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('  Summary');
    console.log('='.repeat(60));
    
    for (const [key, result] of Object.entries(results)) {
        if (result) {
            console.log(`\n${result.title}:`);
            console.log(`  - Tables: ${result.tables.length}`);
            console.log(`  - Child pages: ${result.childPages.length}`);
            console.log(`  - Body length: ${result.bodyLength.toLocaleString()} chars`);
        } else {
            console.log(`\n${key}: FAILED`);
        }
    }
    
    console.log('\nDone!');
}

main().catch(console.error);
