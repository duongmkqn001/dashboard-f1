/**
 * SOP & Templates UI Components
 * =============================
 * Handles rendering and user interactions
 */

const SOPUI = (function() {
    // DOM References
    let tablesListEl = null;
    let templatesListEl = null;
    let currentExpandedState = {};

    /**
     * Initialize UI
     */
    function init() {
        tablesListEl = document.getElementById('tables-list');
        templatesListEl = document.getElementById('templates-list');
        
        // Initialize table filter dropdown
        initTableFilter();
    }

    /**
     * Initialize table filter dropdown
     */
    function initTableFilter() {
        const tableFilter = document.getElementById('table-filter');
        if (!tableFilter) return;

        // Get unique tables from data
        const tables = SOPData.getTables();
        const templates = SOPData.getTemplates();

        // Clear existing options except "All"
        tableFilter.innerHTML = '<option value="">All Tables</option>';

        // Add SOP table options
        tables.forEach(table => {
            const option = document.createElement('option');
            option.value = `sop-${table.tableIndex}`;
            option.textContent = `SOP - ${table.tableTitle}`;
            tableFilter.appendChild(option);
        });

        // Add template table options
        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = `template-${template.tableIndex}`;
            option.textContent = `Template - ${template.tableTitle}`;
            tableFilter.appendChild(option);
        });

        // Add change event listener
        tableFilter.addEventListener('change', (e) => {
            if (SOPData.getTables().length > 0) {
                SOPSearch.filter();
            } else if (SOPData.getTemplates().length > 0) {
                TemplatesSearch.filter();
            }
        });
    }

    /**
     * Initialize theme
     */
    function initTheme() {
        const savedTheme = localStorage.getItem('sop-dashboard-theme') || 'dark';
        setTheme(savedTheme);
        document.getElementById('theme-select').value = savedTheme;
    }

    /**
     * Set theme
     */
    function setTheme(theme) {
        document.documentElement.className = theme;
        localStorage.setItem('sop-dashboard-theme', theme);
    }

    /**
     * Render all SOP tables
     */
    function renderAllTables(tables) {
        if (!tablesListEl) return;

        if (!tables || tables.length === 0) {
            document.getElementById('empty-state').style.display = 'flex';
            tablesListEl.innerHTML = '';
            return;
        }

        document.getElementById('empty-state').style.display = 'none';
        
        const html = tables.map((table, index) => renderTable(table, index)).join('');
        tablesListEl.innerHTML = html;

        // Add event listeners
        tablesListEl.querySelectorAll('.table-header').forEach(header => {
            header.addEventListener('click', toggleTable);
        });

        // Add copy button listeners
        tablesListEl.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', handleCopy);
        });
    }

    /**
     * Render all template tables
     */
    function renderAllTemplates(templates) {
        if (!templatesListEl) return;

        if (!templates || templates.length === 0) {
            document.getElementById('empty-state').style.display = 'flex';
            templatesListEl.innerHTML = '';
            return;
        }

        document.getElementById('empty-state').style.display = 'none';
        
        const html = templates.map((template, index) => renderTemplateTable(template, index)).join('');
        templatesListEl.innerHTML = html;

        // Add event listeners
        templatesListEl.querySelectorAll('.table-header').forEach(header => {
            header.addEventListener('click', toggleTable);
        });

        // Add copy button listeners
        templatesListEl.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', handleCopy);
        });
    }

    /**
     * Render a single SOP table
     */
    function renderTable(table, index) {
        const isCollapsed = currentExpandedState[`sop-${table.tableIndex}`] === false;
        const headers = table.headers || [];
        const rows = table.rows || [];

        const headersHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
        const rowsHtml = rows.map(row => {
            const cells = row.map(cell => `<td><div class="cell-content">${formatCell(cell)}</div></td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `
            <div class="table-container" data-table-index="${table.tableIndex}">
                <div class="table-header ${isCollapsed ? 'collapsed' : ''}" data-table="sop-${table.tableIndex}">
                    <div>
                        <span class="table-title">${escapeHtml(table.tableTitle || `Table ${table.tableIndex}`)}</span>
                        <span class="table-meta">${rows.length} rows</span>
                    </div>
                    <span class="table-toggle">
                        <span class="toggle-icon">${isCollapsed ? '▶' : '▼'}</span>
                        ${isCollapsed ? 'Show' : 'Hide'}
                    </span>
                </div>
                <div class="table-content ${isCollapsed ? 'collapsed' : ''}">
                    <table class="data-table">
                        <thead>
                            <tr>${headersHtml}</tr>
                        </thead>
                        <tbody>
                            ${rowsHtml || '<tr><td colspan="100">No data</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Render a single template table
     */
    function renderTemplateTable(template, index) {
        const isCollapsed = currentExpandedState[`template-${template.tableIndex}`] === false;
        const showMandarin = document.getElementById('show-mandarin')?.checked !== false;
        const headers = template.headers || [];
        const rows = template.rows || [];

        const headersHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
        
        const rowsHtml = rows.map((row, rowIndex) => {
            // Template rows typically have: Use Case, Applicable SOPs, English Text, Mandarin Text
            const locationBadge = getLocationBadge(row[0] || '');
            
            let cells = [];
            
            // Cell 0: Use Case with location badge
            if (row[0]) {
                cells.push(`<td><div class="cell-content">${locationBadge}<div style="margin-top: 0.5rem;">${escapeHtml(row[0])}</div></div></td>`);
            } else {
                cells.push('<td></td>');
            }
            
            // Cell 1: Applicable SOPs
            cells.push(`<td><div class="cell-content">${formatCell(row[1])}</div></td>`);
            
            // Cell 2: English Text with copy button
            cells.push(`<td>
                <div class="cell-content">
                    <div class="bilingual-content">
                        <div class="lang-section">
                            <div class="lang-label en">English</div>
                            <div class="lang-text">${formatCell(row[2])}</div>
                            ${row[2] ? `<button class="copy-btn" data-copy="${escapeAttr(row[2] || '')}" data-lang="en">Copy EN</button>` : ''}
                        </div>
                        ${showMandarin && row[3] ? `
                        <div class="lang-section">
                            <div class="lang-label zh">Mandarin</div>
                            <div class="lang-text">${formatCell(row[3])}</div>
                            <button class="copy-btn" data-copy="${escapeAttr(row[3] || '')}" data-lang="zh">Copy CN</button>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </td>`);
            
            // Cell 3: Mandarin (only show if not bilingual mode)
            if (!showMandarin) {
                cells.push(`<td><div class="cell-content">${formatCell(row[3])}</div></td>`);
            }
            
            return `<tr>${cells.join('')}</tr>`;
        }).join('');

        return `
            <div class="table-container" data-table-index="${template.tableIndex}">
                <div class="table-header ${isCollapsed ? 'collapsed' : ''}" data-table="template-${template.tableIndex}">
                    <div>
                        <span class="table-title">${escapeHtml(template.tableTitle || `Template Table ${template.tableIndex}`)}</span>
                        <span class="table-meta">${rows.length} templates</span>
                    </div>
                    <span class="table-toggle">
                        <span class="toggle-icon">${isCollapsed ? '▶' : '▼'}</span>
                        ${isCollapsed ? 'Show' : 'Hide'}
                    </span>
                </div>
                <div class="table-content ${isCollapsed ? 'collapsed' : ''}">
                    <table class="data-table">
                        <thead>
                            <tr>${headersHtml}</tr>
                        </thead>
                        <tbody>
                            ${rowsHtml || '<tr><td colspan="100">No templates</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Get location badge HTML
     */
    function getLocationBadge(text) {
        const lower = (text || '').toLowerCase();
        
        if (lower.includes('green') || lower.includes('na specific')) {
            return '<span class="location-badge green">NA</span>';
        } else if (lower.includes('magenta') || lower.includes('eu specific')) {
            return '<span class="location-badge magenta">EU</span>';
        } else if (lower.includes('turquoise') || lower.includes('global')) {
            return '<span class="location-badge global">Global</span>';
        }
        
        return '';
    }

    /**
     * Format cell content
     */
    function formatCell(content) {
        if (!content) return '';
        
        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        let formatted = escapeHtml(content).replace(/\n/g, '<br>');
        formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        
        return formatted;
    }

    /**
     * Toggle table expand/collapse
     */
    function toggleTable(e) {
        const header = e.currentTarget;
        const tableId = header.dataset.table;
        const content = header.nextElementSibling;
        
        const isCollapsed = content.classList.toggle('collapsed');
        header.classList.toggle('collapsed');
        
        // Update toggle text
        const toggleText = header.querySelector('.table-toggle');
        if (toggleText) {
            toggleText.innerHTML = `<span class="toggle-icon">${isCollapsed ? '▶' : '▼'}</span> ${isCollapsed ? 'Show' : 'Hide'}`;
        }
        
        // Save state
        currentExpandedState[tableId] = !isCollapsed;
    }

    /**
     * Toggle all tables
     */
    function toggleAllTables() {
        const allHeaders = document.querySelectorAll('.table-header');
        const expandBtn = document.getElementById('expand-all-btn');
        
        // Check if any are collapsed
        const anyCollapsed = [...allHeaders].some(h => h.classList.contains('collapsed'));
        
        allHeaders.forEach(header => {
            const tableId = header.dataset.table;
            const content = header.nextElementSibling;
            
            if (anyCollapsed) {
                // Expand all
                header.classList.remove('collapsed');
                content.classList.remove('collapsed');
                currentExpandedState[tableId] = true;
            } else {
                // Collapse all
                header.classList.add('collapsed');
                content.classList.add('collapsed');
                currentExpandedState[tableId] = false;
            }
        });

        // Update button text
        if (expandBtn) {
            expandBtn.innerHTML = `<span class="toggle-icon">▼</span> ${anyCollapsed ? 'Collapse All' : 'Expand All'}`;
        }
    }

    /**
     * Handle copy button click
     */
    function handleCopy(e) {
        e.stopPropagation();
        
        const btn = e.currentTarget;
        const textToCopy = btn.dataset.copy;
        
        if (!textToCopy) return;

        navigator.clipboard.writeText(textToCopy).then(() => {
            btn.classList.add('copied');
            btn.textContent = 'Copied!';
            
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.textContent = btn.dataset.lang === 'en' ? 'Copy EN' : 'Copy CN';
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            btn.textContent = 'Failed';
        });
    }

    /**
     * Update stats display
     */
    function updateStats() {
        const tables = SOPData.getTables();
        const totalRows = SOPData.getTotalSopRows();
        const lastUpdate = SOPData.getLastUpdate();

        document.getElementById('stat-tables').textContent = tables.length;
        document.getElementById('stat-rows').textContent = totalRows;
        
        if (lastUpdate) {
            document.getElementById('stat-updated').textContent = lastUpdate.toLocaleDateString('vi-VN');
        }
    }

    /**
     * Update template stats display
     */
    function updateTemplateStats() {
        const templates = SOPData.getTemplates();
        const totalRows = SOPData.getTotalTemplateRows();

        document.getElementById('stat-templates').textContent = totalRows;
        document.getElementById('stat-tables').textContent = templates.length;
    }

    /**
     * Show loading state
     */
    function showLoading() {
        document.getElementById('loading-state').style.display = 'flex';
        document.getElementById('empty-state').style.display = 'none';
    }

    /**
     * Hide loading state
     */
    function hideLoading() {
        document.getElementById('loading-state').style.display = 'none';
    }

    /**
     * Show empty state
     */
    function showEmpty(message) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('empty-state').style.display = 'flex';
        if (message) {
            document.querySelector('.empty-description').textContent = message;
        }
    }

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Escape attribute
     */
    function escapeAttr(text) {
        if (!text) return '';
        return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Public API
    return {
        init,
        initTheme,
        setTheme,
        renderAllTables,
        renderAllTemplates,
        renderTable,
        renderTemplateTable,
        toggleTable,
        toggleAllTables,
        handleCopy,
        updateStats,
        updateTemplateStats,
        showLoading,
        hideLoading,
        showEmpty,
        escapeHtml,
        escapeAttr
    };
})();
