/**
 * SOP & Templates Data Layer
 * ==========================
 * Handles data fetching from Supabase
 */

const SOPData = (function() {
    // Configuration
    const SUPABASE_URL = 'https://pfbxtbydrjcmqlrklsdr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYnh0YnlkcmpjbXFscmtsc2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODM2NDksImV4cCI6MjA3MjU1OTY0OX0.bOgnown0UZzstbnYfUSEImwaSGP6lg2FccRg-yDFTPU';

    // Page IDs
    const SOP_PAGE_ID = 1256152285;
    const TEMPLATES_PAGE_ID = 1256153038;

    // State
    let supabase = null;
    let sopTables = [];
    let templateTables = [];
    let isLoaded = false;

    /**
     * Initialize Supabase client
     */
    function initSupabase() {
        if (!supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return supabase;
    }

    /**
     * Load all SOP tables from Supabase
     */
    async function loadAllTables() {
        try {
            initSupabase();
            
            const { data, error } = await supabase
                .from('confluence_sop_data')
                .select('*')
                .eq('page_id', SOP_PAGE_ID)
                .order('table_index', { ascending: true });

            if (error) {
                console.error('Error loading SOP data:', error);
                // Fallback to local JSON
                loadFromLocalJSON();
                return;
            }

            if (data && data.length > 0) {
                sopTables = data.map(row => ({
                    id: row.id,
                    pageId: row.page_id,
                    pageTitle: row.page_title,
                    tableIndex: row.table_index,
                    tableTitle: row.table_title || `Table ${row.table_index}`,
                    headers: row.headers || [],
                    rows: row.rows || [],
                    updatedAt: row.updated_at
                }));
            } else {
                // Try local JSON as fallback
                loadFromLocalJSON();
            }

            isLoaded = true;
            console.log(`Loaded ${sopTables.length} SOP tables`);
        } catch (err) {
            console.error('Failed to load SOP data:', err);
            loadFromLocalJSON();
        }
    }

    /**
     * Load SOP tables from local JSON file
     */
    async function loadFromLocalJSON() {
        try {
            const response = await fetch('extracted_data/sop_tables.json');
            if (!response.ok) {
                console.warn('Local JSON not found, loading embedded data');
                loadEmbeddedData();
                return;
            }
            
            const data = await response.json();
            if (data && data.tables) {
                sopTables = data.tables.map((table, index) => ({
                    id: index + 1,
                    pageId: SOP_PAGE_ID,
                    pageTitle: 'Problem with an Order (PWAO) SOP (DSC2S) - VCN',
                    tableIndex: index + 1,
                    tableTitle: `Table ${index + 1}`,
                    headers: table.headers || [],
                    rows: table.rows || [],
                    updatedAt: null
                }));
            }
            isLoaded = true;
            console.log(`Loaded ${sopTables.length} SOP tables from local JSON`);
        } catch (err) {
            console.warn('Failed to load local JSON, using embedded data');
            loadEmbeddedData();
        }
    }

    /**
     * Load embedded data as last resort
     */
    function loadEmbeddedData() {
        // This will be populated if neither Supabase nor local JSON works
        sopTables = [];
        isLoaded = true;
    }

    /**
     * Load all template tables from Supabase
     */
    async function loadTemplates() {
        try {
            initSupabase();
            
            const { data, error } = await supabase
                .from('confluence_templates')
                .select('*')
                .eq('page_id', TEMPLATES_PAGE_ID)
                .order('table_index', { ascending: true });

            if (error) {
                console.error('Error loading template data:', error);
                loadTemplatesFromLocalJSON();
                return;
            }

            if (data && data.length > 0) {
                templateTables = data.map(row => ({
                    id: row.id,
                    pageId: row.page_id,
                    pageTitle: row.page_title,
                    tableIndex: row.table_index,
                    tableTitle: row.table_title || `Template Table ${row.table_index}`,
                    templateUseCase: row.template_use_case || '',
                    applicableSops: row.applicable_sops || [],
                    englishText: row.english_text || '',
                    mandarinText: row.mandarin_text || '',
                    locationColor: row.location_color || '',
                    isNaSpecific: row.is_na_specific || false,
                    isEuSpecific: row.is_eu_specific || false,
                    isGlobal: row.is_global || false,
                    headers: row.headers || [],
                    rows: row.rows || [],
                    updatedAt: row.updated_at
                }));
            } else {
                loadTemplatesFromLocalJSON();
            }

            isLoaded = true;
            console.log(`Loaded ${templateTables.length} template tables`);
        } catch (err) {
            console.error('Failed to load template data:', err);
            loadTemplatesFromLocalJSON();
        }
    }

    /**
     * Load template tables from local JSON file
     */
    async function loadTemplatesFromLocalJSON() {
        try {
            const response = await fetch('extracted_data/templates_tables.json');
            if (!response.ok) {
                console.warn('Local template JSON not found');
                loadTemplatesEmbeddedData();
                return;
            }
            
            const data = await response.json();
            if (data && data.tables) {
                templateTables = data.tables.map((table, index) => ({
                    id: index + 1,
                    pageId: TEMPLATES_PAGE_ID,
                    pageTitle: 'Canned Responses/Templates (DSC2S) - VCN',
                    tableIndex: index + 1,
                    tableTitle: `Template Table ${index + 1}`,
                    headers: table.headers || [],
                    rows: table.rows || [],
                    updatedAt: null
                }));
            }
            isLoaded = true;
            console.log(`Loaded ${templateTables.length} template tables from local JSON`);
        } catch (err) {
            console.warn('Failed to load local template JSON');
            loadTemplatesEmbeddedData();
        }
    }

    /**
     * Load embedded template data as last resort
     */
    function loadTemplatesEmbeddedData() {
        templateTables = [];
        isLoaded = true;
    }

    /**
     * Get all SOP tables
     */
    function getTables() {
        return sopTables;
    }

    /**
     * Get all template tables
     */
    function getTemplates() {
        return templateTables;
    }

    /**
     * Get a specific SOP table by index
     */
    function getTable(index) {
        return sopTables.find(t => t.tableIndex === index);
    }

    /**
     * Get a specific template table by index
     */
    function getTemplate(index) {
        return templateTables.find(t => t.tableIndex === index);
    }

    /**
     * Get total row count across all SOP tables
     */
    function getTotalSopRows() {
        return sopTables.reduce((sum, table) => sum + (table.rows?.length || 0), 0);
    }

    /**
     * Get total row count across all template tables
     */
    function getTotalTemplateRows() {
        return templateTables.reduce((sum, table) => sum + (table.rows?.length || 0), 0);
    }

    /**
     * Get last update timestamp
     */
    function getLastUpdate() {
        const dates = sopTables
            .filter(t => t.updatedAt)
            .map(t => new Date(t.updatedAt));
        
        if (dates.length === 0) return null;
        
        return new Date(Math.max(...dates));
    }

    /**
     * Check if data is loaded
     */
    function isDataLoaded() {
        return isLoaded;
    }

    /**
     * Search SOP tables for text
     */
    function searchSopTables(query) {
        if (!query || query.trim() === '') {
            return sopTables;
        }

        const lowerQuery = query.toLowerCase();
        
        return sopTables.filter(table => {
            // Search in headers
            if (table.headers?.some(h => h.toLowerCase().includes(lowerQuery))) {
                return true;
            }
            
            // Search in rows
            if (table.rows?.some(row => 
                row.some(cell => 
                    typeof cell === 'string' && cell.toLowerCase().includes(lowerQuery)
                )
            )) {
                return true;
            }
            
            return false;
        });
    }

    /**
     * Search template tables for text
     */
    function searchTemplates(query, locationFilter = '') {
        if (!query || query.trim() === '') {
            return applyLocationFilter(templateTables, locationFilter);
        }

        const lowerQuery = query.toLowerCase();
        
        const filtered = templateTables.filter(table => {
            // Search in headers
            if (table.headers?.some(h => h.toLowerCase().includes(lowerQuery))) {
                return true;
            }
            
            // Search in rows
            if (table.rows?.some(row => 
                row.some(cell => 
                    typeof cell === 'string' && cell.toLowerCase().includes(lowerQuery)
                )
            )) {
                return true;
            }
            
            // Search in template use case
            if (table.templateUseCase?.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            
            // Search in applicable SOPs
            if (table.applicableSops?.some(sop => 
                sop.toLowerCase().includes(lowerQuery)
            )) {
                return true;
            }
            
            return false;
        });

        return applyLocationFilter(filtered, locationFilter);
    }

    /**
     * Apply location filter to templates
     */
    function applyLocationFilter(tables, locationFilter) {
        if (!locationFilter || locationFilter === '') {
            return tables;
        }

        return tables.filter(table => {
            switch (locationFilter) {
                case 'na':
                    return table.isNaSpecific || table.locationColor === 'green';
                case 'eu':
                    return table.isEuSpecific || table.locationColor === 'magenta';
                case 'global':
                    return table.isGlobal || 
                           (!table.isNaSpecific && !table.isEuSpecific) ||
                           table.locationColor === 'turquoise';
                default:
                    return true;
            }
        });
    }

    // Public API
    return {
        initSupabase,
        loadAllTables,
        loadTemplates,
        getTables,
        getTemplates,
        getTable,
        getTemplate,
        getTotalSopRows,
        getTotalTemplateRows,
        getLastUpdate,
        isDataLoaded,
        searchSopTables,
        searchTemplates,
        applyLocationFilter
    };
})();
