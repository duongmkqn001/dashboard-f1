/**
 * SOP & Templates Search Module
 * ============================
 * Handles search and filter functionality
 */

// SOP Search Handler
const SOPSearch = (function() {
    let searchTimeout = null;

    /**
     * Initialize search
     */
    function init() {
        const searchInput = document.getElementById('search-input');
        
        if (!searchInput) return;

        // Debounced search
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filter();
            }, 300);
        });

        // Enter to search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                filter();
            }
        });
    }

    /**
     * Apply filters and search
     */
    function filter() {
        const searchQuery = document.getElementById('search-input')?.value || '';
        const tableFilter = document.getElementById('table-filter')?.value || '';

        // Search
        let results = SOPData.searchSopTables(searchQuery);

        // Apply table filter
        if (tableFilter && tableFilter.startsWith('sop-')) {
            const tableIndex = parseInt(tableFilter.replace('sop-', ''));
            results = results.filter(t => t.tableIndex === tableIndex);
        }

        // Render
        SOPUI.renderAllTables(results);
        
        // Show/hide empty state
        if (results.length === 0 && searchQuery) {
            SOPUI.showEmpty(`No SOPs found matching "${searchQuery}"`);
        }
    }

    /**
     * Clear search
     */
    function clear() {
        const searchInput = document.getElementById('search-input');
        const tableFilter = document.getElementById('table-filter');
        
        if (searchInput) searchInput.value = '';
        if (tableFilter) tableFilter.value = '';
        
        filter();
    }

    return {
        init,
        filter,
        clear
    };
})();

// Templates Search Handler
const TemplatesSearch = (function() {
    let searchTimeout = null;

    /**
     * Initialize search
     */
    function init() {
        const searchInput = document.getElementById('search-input');
        const locationFilter = document.getElementById('location-filter');
        const showMandarin = document.getElementById('show-mandarin');
        
        if (!searchInput) return;

        // Debounced search
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filter();
            }, 300);
        });

        // Enter to search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                filter();
            }
        });

        // Location filter
        if (locationFilter) {
            locationFilter.addEventListener('change', filter);
        }

        // Mandarin toggle
        if (showMandarin) {
            showMandarin.addEventListener('change', () => {
                // Re-render with new Mandarin setting
                const templates = SOPData.getTemplates();
                const query = searchInput.value;
                const location = locationFilter?.value || '';
                
                let results = SOPData.searchTemplates(query, location);
                SOPUI.renderAllTemplates(results);
            });
        }
    }

    /**
     * Apply filters and search
     */
    function filter() {
        const searchQuery = document.getElementById('search-input')?.value || '';
        const tableFilter = document.getElementById('table-filter')?.value || '';
        const locationFilter = document.getElementById('location-filter')?.value || '';

        // Search with location filter
        let results = SOPData.searchTemplates(searchQuery, locationFilter);

        // Apply table filter
        if (tableFilter && tableFilter.startsWith('template-')) {
            const tableIndex = parseInt(tableFilter.replace('template-', ''));
            results = results.filter(t => t.tableIndex === tableIndex);
        }

        // Render
        SOPUI.renderAllTemplates(results);
        
        // Show/hide empty state
        if (results.length === 0 && (searchQuery || locationFilter)) {
            let msg = 'No templates found';
            if (searchQuery) msg += ` matching "${searchQuery}"`;
            if (locationFilter) msg += ` for ${locationFilter.toUpperCase()} region`;
            SOPUI.showEmpty(msg);
        }
    }

    /**
     * Clear search
     */
    function clear() {
        const searchInput = document.getElementById('search-input');
        const tableFilter = document.getElementById('table-filter');
        const locationFilter = document.getElementById('location-filter');
        
        if (searchInput) searchInput.value = '';
        if (tableFilter) tableFilter.value = '';
        if (locationFilter) locationFilter.value = '';
        
        filter();
    }

    return {
        init,
        filter,
        clear
    };
})();
