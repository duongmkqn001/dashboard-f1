// =================================================================================
// == CONFIG & GLOBAL STATE ======================================================
// =================================================================================
const SUPABASE_URL = 'https://pfbxtbydrjcmqlrklsdr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYnh0YnlkcmpjbXFscmtsc2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODM2NDksImV4cCI6MjA3MjU1OTY0OX0.bOgnown0UZzstbnYfUSEImwaSGP6lg2FccRg-yDFTPU';

// DOM Elements
const assigneeSelect = document.getElementById('assignee-select');
const ticketTableBody = document.getElementById('ticket-table-body');
const loaderContainer = document.getElementById('loader-container');
const messageArea = document.getElementById('message-area');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeDropdown = document.getElementById('theme-dropdown');
const currentThemeName = document.getElementById('current-theme-name');
const themeChevron = document.getElementById('theme-chevron');
const templateSelectionModal = document.getElementById('template-selection-modal');
const closeTemplateSelectionModal = document.getElementById('close-template-selection-modal');
const popupProjectTabs = document.getElementById('popup-project-tabs-container');
const popupIssuesList = document.getElementById('popup-issues-list');
const popupTemplateList = document.getElementById('popup-template-list');
const popupWorkspace = document.getElementById('popup-workspace');
const popupWelcomeScreen = document.getElementById('popup-welcome-screen');
const popupTemplateViewer = document.getElementById('popup-template-viewer');
const popupSearchInput = document.getElementById('popup-search-input');

// Global State
let supabaseClient;
let ticketsMap = new Map();
let ticketStatuses = [];
let vcnAgents = [];
let allAgentsMap = new Map();
let allTemplates = [];
let allPlaceholders = [];
let allSignatures = [];
let allSettings = {};
let allProjects = [];
let messageTimeout;

// Realtime subscriptions
let notificationsChannel = null;
let mosRequestsChannel = null;
let scheduleAssignmentsChannel = null;

// MOS System Optimization - Caching and Performance
let mosRequestsCache = new Map(); // Cache for MOS requests
let mosNotificationCount = 0; // Cached notification count
let mosLastUpdate = 0; // Last update timestamp
let mosUpdateInProgress = false; // Prevent concurrent updates

// Query Result Caching - Dramatically improves performance
let ticketsQueryCache = null;
let ticketsCacheTimestamp = 0;
const TICKETS_CACHE_TTL = 2000; // Cache for 2 seconds (adjust as needed)

// Popup State
let popupCurrentTicket = null;
let popupCurrentProject = null;
let popupCurrentIssue = null;
let popupCurrentTemplateId = null;

// Filter and View State
let currentTicketTypeFilter = 'all'; // 'all', 'fmop', 'aops'
let currentViewMode = 'normal'; // 'normal', 'leader', 'mos'

// OT Mode State Management
let otModeEnabled = localStorage.getItem('otMode') === 'true';
const otModeTickets = new Set(JSON.parse(localStorage.getItem('otModeTickets') || '[]'));

// Team Mode State Management (EU/NA)
let currentTeamMode = localStorage.getItem('teamMode') || 'NA'; // 'NA' or 'EU'

// =================================================================================
// == INITIALIZATION & DATA FETCHING =============================================
// =================================================================================
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (error) {
    console.error('Lỗi khởi tạo Supabase:', error.message);
}

function setupUserInterface() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

    // Setup user greeting
    const userGreeting = document.getElementById('user-greeting');
    const assigneeSelect = document.getElementById('assignee-select');

    if (userGreeting && currentUser.name) {
        userGreeting.textContent = `Xin chào, ${currentUser.name}`;

        // Add fire effect for OT mode
        const otToggle = document.getElementById('ot-mode-toggle');
        if (otToggle) {
            // Restore OT Mode state from localStorage on page load
            otToggle.checked = otModeEnabled;

            // Apply fire effects if OT Mode was ON when page loaded
            if (otModeEnabled) {
                userGreeting.innerHTML = `<span class="fire-effect">Xin chào, ${currentUser.name} 🔥</span>`;
                const assigneeContainer = assigneeSelect?.closest('div.bg-section');
                const userContainer = userGreeting?.closest('div.bg-section');
                if (assigneeContainer) assigneeContainer.classList.add('fire-box');
                if (userContainer) userContainer.classList.add('fire-box');
            }

            otToggle.addEventListener('change', (e) => {
                const assigneeContainer = assigneeSelect?.closest('div.bg-section');
                const userContainer = userGreeting?.closest('div.bg-section');

                // Update global state and save to localStorage
                otModeEnabled = e.target.checked;
                localStorage.setItem('otMode', otModeEnabled.toString());

                if (e.target.checked) {
                    // Add fire effects to text and boxes
                    userGreeting.innerHTML = `<span class="fire-effect">Xin chào, ${currentUser.name} 🔥</span>`;

                    // Add fire box effects to both containers
                    if (assigneeContainer) {
                        assigneeContainer.classList.add('fire-box');
                    }
                    if (userContainer) {
                        userContainer.classList.add('fire-box');
                    }

                    // Show informative message
                    showMessage('🔥 OT Mode ACTIVE - All completed tickets will go to OT Tracker sheet', 'warning', 4000);
                } else {
                    // Remove fire effects
                    userGreeting.textContent = `Xin chào, ${currentUser.name}`;

                    // Remove fire box effects
                    if (assigneeContainer) {
                        assigneeContainer.classList.remove('fire-box');
                    }
                    if (userContainer) {
                        userContainer.classList.remove('fire-box');
                    }

                    // Show message
                    showMessage('OT Mode deactivated', 'info', 2000);
                }
            });
        }

        // Setup Team Toggle (EU/NA)
        const teamToggle = document.getElementById('team-toggle');
        const csvImportBtn = document.getElementById('csv-import-btn');
        const euImportBtn = document.getElementById('import-eu-btn');

        if (teamToggle) {
            // Restore team mode state from localStorage
            teamToggle.checked = currentTeamMode === 'EU';

            // Show/hide appropriate import button based on current team
            if (currentTeamMode === 'EU') {
                if (csvImportBtn) csvImportBtn.classList.add('hidden');
                if (euImportBtn) euImportBtn.classList.remove('hidden');
            } else {
                if (csvImportBtn) csvImportBtn.classList.remove('hidden');
                if (euImportBtn) euImportBtn.classList.add('hidden');
            }

            teamToggle.addEventListener('change', (e) => {
                // Update global state and save to localStorage
                currentTeamMode = e.target.checked ? 'EU' : 'NA';
                localStorage.setItem('teamMode', currentTeamMode);

                // Show/hide appropriate import button
                if (currentTeamMode === 'EU') {
                    if (csvImportBtn) csvImportBtn.classList.add('hidden');
                    if (euImportBtn) euImportBtn.classList.remove('hidden');
                    showMessage('🇪🇺 EU Team Mode - Viewing EU tickets only', 'info', 3000);
                } else {
                    if (csvImportBtn) csvImportBtn.classList.remove('hidden');
                    if (euImportBtn) euImportBtn.classList.add('hidden');
                    showMessage('🌍 NA Team Mode - Viewing NA tickets only', 'info', 3000);
                }

                // Refresh tickets to show appropriate team's tickets
                invalidateTicketsCache();
                fetchAndRenderTickets(true);
            });
        }

        // Initialize EU import button
        if (euImportBtn && typeof initializeEUImport === 'function') {
            initializeEUImport();
        }
    }

    // Setup navigation buttons
    const refreshBtn = document.getElementById('refresh-tickets-btn');
    const adminPanelBtn = document.getElementById('admin-panel-btn');


    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            invalidateTicketsCache();
            fetchAndRenderTickets(true);
        });
    }

    // CSV Import button handler (already declared in team toggle section)
    const csvImportBtnHandler = document.getElementById('csv-import-btn');
    if (csvImportBtnHandler) {
        csvImportBtnHandler.addEventListener('click', () => {
            window.open('csv-import-enhanced.html', '_blank');
        });
    }

    // Show admin and leader buttons for appropriate user levels
    if (currentUser.level === 'key' || currentUser.level === 'leader') {
        if (adminPanelBtn) {
            adminPanelBtn.classList.remove('hidden');
            adminPanelBtn.addEventListener('click', () => {
                window.open('adminview.html', '_blank');
            });
        }
    }

    // Leader view button is handled in HTML now
}

document.addEventListener('DOMContentLoaded', async () => {
    // Authentication check
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    // Clear any stuck tickets from previous session
    googleSheetsQueue.clearQueue();
    console.log('✅ Queue cleared on page load');

    // Setup user greeting and navigation
    setupUserInterface();

    initTheme();
    initToolbar();
    if (supabaseClient) {
        await Promise.all([
            populateAssignees(),
            populateTicketStatuses(),
            populateVCNAgents(),
            fetchAllAdminData()
        ]);
        // Load saved filter selections from Local Storage after populating dropdowns
        loadFilterSelections();

        // Initialize ticket type filter
        currentTicketTypeFilter = localStorage.getItem('ticketTypeFilter') || 'all';
        const filterText = document.getElementById('ticket-type-filter-text');
        if (filterText) {
            const filterLabels = { 'all': '(All)', 'fmop': '(FMOP)', 'aops': '(AOPS)' };
            filterText.textContent = filterLabels[currentTicketTypeFilter] || '(All)';
        }

        // Initialize notifications
        await updateNotificationCounts();

        // Setup realtime subscriptions for notifications
        setupRealtimeSubscriptions();

        // Check for Manual Reschedule POs assignment
        await checkManualRescheduleAssignment();

        await fetchAndRenderTickets();

        // Initialize AI chat client
        initializeGradioClient();
    }

    // Event listeners
    ticketTableBody.addEventListener('click', handleTableClick);

    // Event delegation for hover effects - prevents memory leaks
    ticketTableBody.addEventListener('mouseenter', (e) => {
        const row = e.target.closest('tr[data-po-group]');
        if (row) {
            const poGroup = row.dataset.poGroup;
            document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(groupRow => {
                groupRow.classList.add('group-hover');
            });
        }
    }, true);

    ticketTableBody.addEventListener('mouseleave', (e) => {
        const row = e.target.closest('tr[data-po-group]');
        if (row) {
            const poGroup = row.dataset.poGroup;
            document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(groupRow => {
                groupRow.classList.remove('group-hover');
            });
        }
    }, true);

    closeTemplateSelectionModal.addEventListener('click', closeTemplateSelectionModalHandler);
    popupProjectTabs.addEventListener('click', handlePopupProjectClick);
    popupIssuesList.addEventListener('click', handlePopupIssueClick);
    popupTemplateList.addEventListener('click', handlePopupTemplateClick);

    // Ticket type filter header click
    const ticketTypeHeader = document.getElementById('ticket-type-header');
    if (ticketTypeHeader) {
        ticketTypeHeader.addEventListener('click', toggleTicketTypeFilter);
    }

    // Update fetch trigger and save selection to Local Storage
    assigneeSelect.addEventListener('change', () => {
        localStorage.setItem('dashboard_assignee', assigneeSelect.value);
        invalidateTicketsCache();
        fetchAndRenderTickets(true);
    });



    popupSearchInput.addEventListener('input', (e) => renderPopupTemplateList(e.target.value.trim()));

    // Theme switcher event listeners
    themeToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleThemeDropdown();
    });

    themeDropdown.addEventListener('click', (e) => {
        if (e.target.matches('.theme-btn')) {
            setTheme(e.target.dataset.theme);
            hideThemeDropdown();
        }
    });

    // Close theme dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!themeToggleBtn.contains(e.target) && !themeDropdown.contains(e.target)) {
            hideThemeDropdown();
        }
    });
    document.getElementById('customer-email-modal').addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.js-copy-btn');
        if (copyBtn) {
            const contentContainer = copyBtn.previousElementSibling;
            const textToCopy = contentContainer.dataset.plainText || contentContainer.textContent;
            copyPlainTextToClipboard(textToCopy, document.getElementById('customer-copy-feedback'));
        }
    });
});

async function fetchAllAdminData() {
    try {
        const [templates, placeholders, signatures, settings, projects] = await Promise.all([
            supabaseClient.from('templates').select('*, projects(name, id)'),
            supabaseClient.from('placeholders').select('*'),
            supabaseClient.from('signatures').select('*'),
            supabaseClient.from('settings').select('*'),
            supabaseClient.from('projects').select('*')
        ]);
        allTemplates = templates.data || [];
        allPlaceholders = placeholders.data || [];
        allSignatures = signatures.data || [];
        allProjects = projects.data || [];
        (settings.data || []).forEach(s => { allSettings[s.key] = s; });



        const brandData = allPlaceholders.find(p => p.key === 'brand');
        if (brandData && brandData.options) {
            document.getElementById('customer-brand').innerHTML = brandData.options.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('');
        }

    } catch (error) {
        console.error("Lỗi khi tải dữ liệu admin:", error);
        showMessage("Không thể tải dữ liệu cho template.", "error");
    }
}

// =================================================================================
// == DASHBOARD UI & LOGIC =========================================================
// =================================================================================

function loadFilterSelections() {
    const savedAssignee = localStorage.getItem('dashboard_assignee');

    // Set the value if it exists in the dropdown
    if (savedAssignee && assigneeSelect.querySelector(`option[value="${savedAssignee}"]`)) {
        assigneeSelect.value = savedAssignee;
    }
}

function initToolbar() {
    const toolbarLinks = [
        { name: 'PH', url: 'https://partners.wayfair.com/v/internal_landing/index' },
        { name: 'SupHub', url: 'https://supporthub.service.csnzoo.com/projects/AOPS/queues' },
        { name: 'SerHub', url: 'https://admin.wayfair.com/d/service-hub/tickets' },
        { name: 'Re-Index', url: 'https://partners.wayfair.com/orders/admin' },
        { name: 'EDI Resend', url: 'https://admin.wayfair.com/d/edsi-dispatch-ui' },
        { name: 'Product Availability', url: 'https://admin.wayfair.com/d/scvt/inventory-management-system-ui/search' },
        { name: 'Manage Supplier', url: 'https://admin.wayfair.com/supplier/addedit.php' },
        { name: 'Infohub', url: 'https://infohub.corp.wayfair.com/display/GPS/Global+Dropship+Click+to+Ship+%28DSC2S%29+-+VCN' },
        { name: 'Outbox', url: 'https://admin.wayfair.com/d/notifications/outbox/email' },
        { name: 'Slack', url: 'https://wayfair.enterprise.slack.com/archives/C07KXBT6XQX' },
        { name: 'OW', url: 'https://admin.wayfair.com/' },
        { name: 'Cancel', url: 'https://admin.wayfair.com/v/oms/bulk_order_cancellation/index' },
        { name: 'OM', url: 'https://partners.wayfair.com/order_management.php' },
        { name: 'PO History', url: 'https://partners.wayfair.com/v/overpack/po_history/index?keyword=&keyword_type=0' },
        { name: 'Fleet Insight', url: 'https://admin.wayfair.com/d/4sight/fleet-insight' },
        { name: 'Pickups', url: 'https://partners.wayfair.com/v/overpack/new_pickup/index' },
        { name: 'Load Search', url: 'https://admin.wayfair.com/v/fulfillment/load_search/index' },
        { name: 'Magic tools', url: 'https://lookerstudio.google.com/u/0/reporting/1fa5e6bc-9b10-4ac5-81f2-d9b5e8328f12/page/KkNWF' },
        { name: 'Manual Schedule Pickup', url: 'https://partners.wayfair.com/d/dispatch-command' },
        { name: 'Tracking 1', url: 'https://www.17track.net/en' },
        { name: 'Tracking 2', url: 'https://parcelsapp.com/en/tracking/' }
    ];
    const toolbarContainer = document.getElementById('toolbar-buttons');
    toolbarContainer.innerHTML = toolbarLinks.map(link =>
        `<a href="${link.url}" target="_blank" class="toolbar-btn text-xs hover:brightness-90 font-medium py-1.5 px-3 rounded-full transition-all duration-200">${link.name}</a>`
    ).join('');
}

// Theme management functions
function toggleThemeDropdown() {
    const isHidden = themeDropdown.classList.contains('hidden');
    if (isHidden) {
        showThemeDropdown();
    } else {
        hideThemeDropdown();
    }
}

function showThemeDropdown() {
    themeDropdown.classList.remove('hidden');
    themeChevron.style.transform = 'rotate(180deg)';
}

function hideThemeDropdown() {
    themeDropdown.classList.add('hidden');
    themeChevron.style.transform = 'rotate(0deg)';
}

function setTheme(theme) {
    document.documentElement.className = theme;
    localStorage.setItem('theme', theme);

    // Update theme buttons
    themeDropdown.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    // Update current theme name display
    const themeNames = {
        'dark': '🌙 Dark',
        'daylight': '☀️ Daylight',
        'sunset': '🌅 Sunset',
        'twilight': '🌆 Twilight',
        'blossom-dawn': '🌸 Blossom Dawn',
        'blue-sky': '🌤️ Blue Sky',
        'fresh-mint': '🌿 Fresh Mint'
    };
    currentThemeName.textContent = themeNames[theme] || theme;

    fetchAndRenderTickets(); // Re-render table to update status colors
}

function initTheme() { setTheme(localStorage.getItem('theme') || 'dark'); }

function toggleTicketTypeFilter() {
    const filterText = document.getElementById('ticket-type-filter-text');
    if (!filterText) return;

    // Cycle through filter options: all -> fmop -> aops -> all
    switch (currentTicketTypeFilter) {
        case 'all':
            currentTicketTypeFilter = 'fmop';
            filterText.textContent = '(FMOP)';
            break;
        case 'fmop':
            currentTicketTypeFilter = 'aops';
            filterText.textContent = '(AOPS)';
            break;
        case 'aops':
            currentTicketTypeFilter = 'all';
            filterText.textContent = '(All)';
            break;
    }

    // Save filter preference
    localStorage.setItem('ticketTypeFilter', currentTicketTypeFilter);

    // Re-render table with new filter
    fetchAndRenderTickets();
}

function getTicketType(ticketName) {
    if (!ticketName) return 'unknown';
    const firstFour = ticketName.substring(0, 4).toUpperCase();
    if (firstFour === 'FMOP') return 'fmop';
    if (firstFour === 'AOPS') return 'aops';
    return 'unknown';
}

function shouldShowTicket(ticket) {
    if (currentTicketTypeFilter === 'all') return true;
    const ticketType = getTicketType(ticket.ticket);
    return ticketType === currentTicketTypeFilter;
}

function showMessage(message, type = 'info', duration = 3000) {
    if (messageTimeout) clearTimeout(messageTimeout);

    // Clear existing messages to prevent accumulation
    messageArea.innerHTML = '';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'notification p-4 rounded-lg shadow-lg mb-2 text-sm font-medium border';
    const theme = localStorage.getItem('theme') || 'dark';

    const colorConfig = {
        success: {
            daylight: 'bg-green-100 text-green-800 border-green-300',
            dark: 'bg-green-900/80 text-green-200 border-green-700',
            sunset: 'bg-green-900/80 text-green-200 border-green-700',
            twilight: 'bg-green-900/80 text-green-200 border-green-700',
            'blossom-dawn': 'bg-green-100 text-green-800 border-green-300',
            'blue-sky': 'bg-green-100 text-green-800 border-green-300',
            'fresh-mint': 'bg-green-200 text-green-900 border-green-400'
        },
        error: {
            daylight: 'bg-red-100 text-red-800 border-red-300',
            dark: 'bg-red-900/80 text-red-200 border-red-700',
            sunset: 'bg-red-900/80 text-red-200 border-red-700',
            twilight: 'bg-red-900/80 text-red-200 border-red-700',
            'blossom-dawn': 'bg-red-100 text-red-800 border-red-300',
            'blue-sky': 'bg-red-100 text-red-800 border-red-300',
            'fresh-mint': 'bg-red-200 text-red-900 border-red-400'
        },
        info: {
            daylight: 'bg-blue-100 text-blue-800 border-blue-300',
            dark: 'bg-blue-900/80 text-blue-200 border-blue-700',
            sunset: 'bg-indigo-900/80 text-indigo-200 border-indigo-700',
            twilight: 'bg-blue-900/80 text-blue-200 border-blue-700',
            'blossom-dawn': 'bg-pink-100 text-pink-800 border-pink-300',
            'blue-sky': 'bg-blue-100 text-blue-800 border-blue-300',
            'fresh-mint': 'bg-blue-200 text-blue-900 border-blue-400'
        },
        warning: {
            daylight: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            dark: 'bg-yellow-900/80 text-yellow-200 border-yellow-700',
            sunset: 'bg-yellow-900/80 text-yellow-200 border-yellow-700',
            twilight: 'bg-yellow-900/80 text-yellow-200 border-yellow-700',
            'blossom-dawn': 'bg-yellow-100 text-yellow-800 border-yellow-300',
            'blue-sky': 'bg-yellow-100 text-yellow-800 border-yellow-300',
            'fresh-mint': 'bg-yellow-200 text-yellow-900 border-yellow-400'
        }
    };

    const themeColors = (colorConfig[type] || colorConfig.info)[theme];
    if (themeColors) messageDiv.classList.add(...themeColors.split(' '));

    messageDiv.textContent = message;
    messageArea.appendChild(messageDiv);

    if (duration > 0) {
        messageTimeout = setTimeout(() => {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateY(-20px)';
            setTimeout(() => messageDiv.remove(), 500);
        }, duration);
    }
}

async function populateAssignees() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('agent').select('agent_account, agent_name');
        if (error) throw error;
        assigneeSelect.innerHTML = '<option value="">-- Toàn Bộ --</option>';
        data.forEach(agent => {
            allAgentsMap.set(agent.agent_account, agent.agent_name);
            const option = document.createElement('option');
            option.value = agent.agent_account;
            option.textContent = `${agent.agent_name} (${agent.agent_account})`;
            assigneeSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách agent:', error);
        showMessage('Không thể tải danh sách Assignee.', 'error');
    }
}
async function populateTicketStatuses() {
    if (!supabaseClient || ticketStatuses.length > 0) return;
    try {
        const { data, error } = await supabaseClient.from('ticket_status').select('id, status_name');
        if (error) throw error;
        ticketStatuses = data;
    } catch (error) {
        showMessage('Không thể tải danh sách trạng thái ticket.', 'error');
    }
}
async function populateVCNAgents() {
    if (!supabaseClient || vcnAgents.length > 0) return;
    try {
        const { data, error } = await supabaseClient.from('vcn_agent').select('stt, name');
        if (error) throw error;
        vcnAgents = data;
    } catch (error) {
        showMessage('Không thể tải danh sách VCN agent.', 'error');
    }
}

// OPTIMIZATION: Cache invalidation helper
function invalidateTicketsCache() {
    ticketsQueryCache = null;
    ticketsCacheTimestamp = 0;
}

async function fetchAndRenderTickets(forceRefresh = false) {
    // ALWAYS save scroll position before refreshing
    const scrollContainer = document.getElementById('ticket-scroll-container');
    const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;

    loaderContainer.classList.remove('hidden');
    const currentData = ticketTableBody.innerHTML;
    ticketTableBody.innerHTML = '';

    try {
        const selectedAssignee = assigneeSelect.value;
        const isLeaderView = localStorage.getItem('leaderViewMode') === 'true';
        const isMosView = localStorage.getItem('mosViewMode') === 'true';

        // Create cache key based on current filters INCLUDING team mode
        const cacheKey = `${selectedAssignee}_${isLeaderView}_${isMosView}_${currentTeamMode}`;
        const now = Date.now();

        // OPTIMIZATION: Use cached data if available and fresh
        let data;
        if (!forceRefresh && ticketsQueryCache && ticketsQueryCache.key === cacheKey && (now - ticketsCacheTimestamp) < TICKETS_CACHE_TTL) {
            data = ticketsQueryCache.data;
            console.log('📦 Using cached tickets data');
        } else {
            // OPTIMIZATION: Select only needed columns instead of '*'
            // Added 'suid' for template SUID search functionality
            // Join with agent table to get team information for filtering
            const columns = 'id,ticket,po,issue_type,time_start,assignee_account,need_leader_support,needMos,ticket_status_id,agent_handle_ticket,ot_mode,suid,agent!inner(team)';

            let query = supabaseClient.from('tickets').select(columns).is('time_end', null);
            if (selectedAssignee) query = query.eq('assignee_account', selectedAssignee);

            // Filter by team mode
            query = query.eq('agent.team', currentTeamMode);

            if (isLeaderView) {
                query = query.eq('need_leader_support', true);
            } else if (isMosView) {
                query = query.eq('needMos', 'request');
            } else {
                // For normal view, exclude tickets that need leader support or have MoS requests
                query = query.or('need_leader_support.is.null,need_leader_support.eq.false')
                    .or('needMos.is.null,needMos.neq.request');
            }

            const result = await query.order('id', { ascending: false });
            if (result.error) throw result.error;

            data = result.data;

            // Update cache
            ticketsQueryCache = { key: cacheKey, data: data };
            ticketsCacheTimestamp = now;
        }

        // Update view mode variable
        currentViewMode = isMosView ? 'mos' : (isLeaderView ? 'leader' : 'normal');
        ticketsMap.clear();
        data.forEach(ticket => ticketsMap.set(ticket.id, ticket));
        if (data.length === 0) {
            showMessage(selectedAssignee ? `Không tìm thấy ticket.` : 'Không có ticket nào.', 'info', 1500);

            // Check if this means everyone has completed their work
            if (!selectedAssignee || selectedAssignee === 'all') {
                // No tickets at all might mean everyone has completed their work - check properly
                await checkAllWorkCompleted();
            } else {
                // Check if user completed all their tickets
                await checkAllTicketsCompleted();
            }
        } else {
            renderTable(data);

            // ALWAYS check for completion after rendering, not just when data.length === 0
            // This ensures celebration triggers when user completes their last ticket
            if (selectedAssignee && selectedAssignee !== 'all') {
                await checkAllTicketsCompleted();
            }
        }
    } catch (error) {
        console.error('Lỗi khi lấy ticket:', error);
        showMessage('Đã xảy ra lỗi khi tải dữ liệu ticket.', 'error');
        ticketTableBody.innerHTML = currentData; // Restore old data on error
    } finally {
        loaderContainer.classList.add('hidden');

        // ALWAYS restore scroll position after rendering
        requestAnimationFrame(() => {
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollPosition;
            }
        });
    }
}

function renderTable(tickets) {
    // Apply ticket type filter
    const filteredTickets = tickets.filter(shouldShowTicket);

    const groupedByPO = filteredTickets.reduce((acc, ticket) => {
        const poKey = ticket.po || `NO_PO_${ticket.id}`;
        if (!acc[poKey]) acc[poKey] = [];
        acc[poKey].push(ticket);
        return acc;
    }, {});

    // OPTIMIZATION: Build HTML in chunks to avoid large string concatenation
    const htmlChunks = [];

    for (const poKey in groupedByPO) {
        const items = groupedByPO[poKey];
        const rowCount = items.length;
        const firstItem = items[0];

        items.forEach((item, index) => {
            htmlChunks.push(`<tr data-ticket-id="${item.id}" data-po-group="${poKey}">`);

            if (index === 0) {
                if (currentViewMode !== 'mos') {
                    htmlChunks.push(
                        `<td class="px-4 py-4 align-middle text-center border-b border-main" rowspan="${rowCount}">`,
                        renderStartButton(firstItem),
                        `</td>`,
                        `<td class="px-4 py-4 align-middle text-center border-b border-main" rowspan="${rowCount}">`,
                        renderEndButton(firstItem),
                        `</td>`
                    );
                }

                htmlChunks.push(
                    `<td class="px-6 py-4 align-middle font-medium text-headings border-b border-main" rowspan="${rowCount}">`,
                    `<a href="https://supporthub.service.csnzoo.com/browse/${firstItem.ticket}" target="_blank" class="text-blue-400 hover:text-blue-300 underline">`,
                    firstItem.ticket || '',
                    `</a></td>`,
                    `<td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">`,
                    `<select data-action="status-change" data-ticket-id="${firstItem.id}" class="border border-secondary text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2">`,
                    `<option value="" selected>-- Chọn trạng thái --</option>`,
                    ticketStatuses.map(s => `<option value="${s.id}">${s.status_name}</option>`).join(''),
                    `</select></td>`,
                    `<td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">${firstItem.issue_type || ''}</td>`,
                    `<td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">`,
                    renderActionButtons(firstItem),
                    `</td>`,
                    `<td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">${firstItem.po || ''}</td>`,
                    `<td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">`,
                    renderLastUpdateColumn(firstItem),
                    `</td>`,
                    `<td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">`,
                    renderNeedHelpColumn(firstItem),
                    `</td>`
                );

                if (currentViewMode === 'mos') {
                    htmlChunks.push(
                        `<td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">`,
                        renderMosActionsColumn(firstItem),
                        `</td>`,
                        `<td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">`,
                        renderMosRequestDetailsColumn(firstItem),
                        `</td>`
                    );
                }
            }
            htmlChunks.push(`</tr>`);
        });
    }

    // OPTIMIZATION: Single innerHTML assignment
    ticketTableBody.innerHTML = htmlChunks.join('');

    // Show/hide Start and End headers based on view mode
    const startHeader = document.getElementById('start-header');
    const endHeader = document.getElementById('end-header');
    if (startHeader) {
        startHeader.style.display = currentViewMode === 'mos' ? 'none' : 'table-cell';
    }
    if (endHeader) {
        endHeader.style.display = currentViewMode === 'mos' ? 'none' : 'table-cell';
    }

    // Show/hide MoS actions header based on view mode
    const mosActionsHeader = document.getElementById('mos-actions-header');
    if (mosActionsHeader) {
        mosActionsHeader.style.display = currentViewMode === 'mos' ? 'table-cell' : 'none';
    }

    // Show/hide MoS details header based on view mode
    const mosDetailsHeader = document.getElementById('mos-details-header');
    if (mosDetailsHeader) {
        mosDetailsHeader.style.display = currentViewMode === 'mos' ? 'table-cell' : 'none';
    }

    // Hover effect is now handled by event delegation on ticketTableBody (see initialization)

    // Load MOS request details if in MOS view
    if (currentViewMode === 'mos') {
        loadMosRequestDetails();
    }

    // Check for completion celebration
    checkForCompletionCelebration();
}

// Optimized MOS request details loading with caching
async function loadMosRequestDetails() {
    // Get all ticket IDs currently displayed
    const ticketIds = Array.from(ticketsMap.keys());

    if (ticketIds.length === 0) return;

    try {
        // Check cache first - only fetch uncached tickets
        const uncachedTicketIds = ticketIds.filter(id => {
            const cached = mosRequestsCache.get(id);
            // Cache is valid for 5 minutes
            return !cached || (Date.now() - cached.cached_at) > 300000;
        });

        if (uncachedTicketIds.length > 0) {
            // Fetch MOS request details for uncached tickets only
            const { data: mosRequests, error } = await supabaseClient
                .from('mos_requests')
                .select('ticket_id, description, status, created_at')
                .in('ticket_id', uncachedTicketIds)
                .eq('status', 'request');

            if (error) throw error;

            // Update cache with new data
            mosRequests.forEach(mosRequest => {
                mosRequestsCache.set(mosRequest.ticket_id, {
                    description: mosRequest.description,
                    status: mosRequest.status,
                    created_at: mosRequest.created_at,
                    cached_at: Date.now()
                });
            });

            // Mark tickets without MOS requests in cache
            uncachedTicketIds.forEach(ticketId => {
                if (!mosRequests.find(req => req.ticket_id === ticketId)) {
                    mosRequestsCache.set(ticketId, {
                        description: null,
                        status: null,
                        cached_at: Date.now()
                    });
                }
            });
        }

        // Update UI using cached data
        ticketIds.forEach(ticketId => {
            const detailsElement = document.getElementById(`mos-details-${ticketId}`);
            if (detailsElement) {
                const cachedData = mosRequestsCache.get(ticketId);
                if (cachedData && cachedData.description) {
                    detailsElement.innerHTML = `<span class="text-sm font-medium text-headings">${cachedData.description}</span>`;
                } else {
                    detailsElement.innerHTML = `<span class="text-secondary italic">No details provided</span>`;
                }
            }
        });

    } catch (error) {
        console.error('Error loading MOS request details:', error);
        // Show error state in UI
        ticketIds.forEach(ticketId => {
            const detailsElement = document.getElementById(`mos-details-${ticketId}`);
            if (detailsElement) {
                detailsElement.innerHTML = `<span class="text-red-500 italic">Error loading details</span>`;
            }
        });
    }
}

function renderStartButton(item) {
    if (item.time_start) {
        // Show start time (hours:minutes:seconds only)
        const startTime = new Date(item.time_start);
        const timeString = startTime.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        return `
                    <div class="flex flex-col items-center">
                        <button class="p-2 rounded-full text-gray-500 cursor-not-allowed" disabled>
                            <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
                                <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                            </svg>
                        </button>
                        <div class="text-xs text-green-600 font-medium mt-1">${timeString}</div>
                    </div>
                `;
    } else {
        return `
                    <div class="flex flex-col items-center">
                        <button data-action="start" data-ticket-id="${item.id}" class="p-3 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors" title="Start working on this ticket">
                            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
                                <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                            </svg>
                        </button>
                        <div class="text-xs text-secondary mt-1">Start</div>
                    </div>
                `;
    }
}

function renderEndButton(item) {
    return `
                <div class="flex flex-col items-center">
                    <button data-action="end" data-ticket-id="${item.id}" class="p-3 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors" title="Complete this ticket">
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
                            <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h3A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-3A1.5 1.5 0 0 1 5 9.5v-3z"/>
                        </svg>
                    </button>
                    <div class="text-xs text-secondary mt-1">End</div>
                </div>
            `;
}

function renderLastUpdateColumn(item) {
    if (item.created_at) {
        const updateTime = new Date(item.created_at);
        const timeString = updateTime.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `
                    <div class="text-center">
                        <div class="text-xs text-secondary font-medium">${timeString}</div>
                    </div>
                `;
    } else {
        return `<div class="text-center text-xs text-secondary">N/A</div>`;
    }
}


function renderActionButtons(item) {
    const orderWizardUrl = `https://admin.wayfair.com/v/order/search/get_admin_bar_search_results?gensearchval=${item.po || ''}`;
    const updateShippingUrl = `https://admin.wayfair.com/wizards/shipping/update_shipping_info.php?OrID=${item.order_number || ''}&PoNum=${item.po_nocs || ''}`;
    const orderHistoryUrl = `https://partners.wayfair.com/v/overpack/po_history/index?keyword=${item.po || ''}&keyword_type=0`;
    const emailUrl = `https://supporthub.service.csnzoo.com/secure/com.metainf.jira.plugin.emailissue.action.EmailThisIssue!view.jspa?id=${item.issue_id || ''}`;

    return `<div class="flex flex-col items-center gap-1.5">
                        <div class="flex items-center gap-1.5">
                            <a href="${orderWizardUrl}" target="_blank" title="Order Wizard" class="btn-wizard text-xs hover:brightness-90 font-medium py-1 px-2 rounded transition-all duration-200">Wizard</a>
                            <a href="${updateShippingUrl}" target="_blank" title="Update Shipping" class="btn-shipping text-xs hover:brightness-90 font-medium py-1 px-2 rounded transition-all duration-200">Shipping</a>
                            <a href="${orderHistoryUrl}" target="_blank" title="Order History" class="btn-history text-xs hover:brightness-90 font-medium py-1 px-2 rounded transition-all duration-200">History</a>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <a href="${emailUrl}" target="_blank" title="Email" class="btn-email text-xs hover:brightness-90 font-medium py-1 px-2 rounded transition-all duration-200">Email</a>
                            <button data-action="template" data-ticket-id="${item.id}" class="js-template-btn text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium py-1 px-2 rounded transition-all duration-200">Template</button>
                        </div>
                        <div class="flex items-center gap-1.5 mt-1">
                            <button data-action="no-action-needed" data-ticket-id="${item.id}" class="js-no-action-btn text-xs bg-gray-500 hover:bg-gray-600 text-white font-medium py-1 px-2 rounded transition-all duration-200" title="No action needed - remove from view">No Action Needed</button>
                        </div>
                    </div>`;
}

function renderNeedHelpColumn(item) {
    const isLeaderView = localStorage.getItem('leaderViewMode') === 'true';
    const isMosView = localStorage.getItem('mosViewMode') === 'true';

    if (isLeaderView) {
        // In leader view, show assignee name from agent table
        const assigneeName = allAgentsMap.get(item.assignee_account) || item.assignee_account;
        return `<span class="text-sm font-medium text-blue-600">Assigned to: ${assigneeName}</span>`;
    } else if (isMosView) {
        // In MoS view, show requester name (agent who handled the ticket)
        const requesterName = allAgentsMap.get(item.agent_handle_ticket) || item.agent_handle_ticket;
        return `<span class="text-sm font-medium text-purple-600">Requested by: ${requesterName}</span>`;
    } else {
        // Regular view - show buttons and MoS status
        let mosStatusIcon = '';
        if (item.needMos === 'approved') {
            mosStatusIcon = '<div class="text-green-600 text-xs mt-1">✅ MoS Approved</div>';
        } else if (item.needMos === 'rejected') {
            mosStatusIcon = '<div class="text-red-600 text-xs mt-1">❌ MoS Rejected</div>';
        }

        // Check if ticket can be sent to leader
        // Don't allow if: already sent to leader, already started, or already has a status
        const canSendToLeader = !item.need_leader_support && !item.time_start && !item.ticket_status_id;
        const leaderButtonDisabled = !canSendToLeader ? 'disabled opacity-50 cursor-not-allowed' : '';
        const leaderButtonTitle = !canSendToLeader ?
            (item.need_leader_support ? 'Already sent to leader' :
                item.time_start ? 'Cannot send started ticket to leader' :
                    'Cannot send ticket with status to leader') :
            'Send to leader for help';

        return `
                    <div class="flex flex-col gap-1">
                        <button onclick="sendToLeader(${item.id})"
                                class="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium rounded transition-colors ${leaderButtonDisabled}"
                                ${!canSendToLeader ? 'disabled' : ''}
                                title="${leaderButtonTitle}">
                            Send to leader →
                        </button>
                        <button onclick="requestMos(${item.id})" class="px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded transition-colors">
                            Request MoS 🚢
                        </button>
                        ${mosStatusIcon}
                    </div>
                `;
    }
}

function renderMosActionsColumn(item) {
    // In MoS view, show approve/reject buttons for leaders/keys
    return `
                <div class="flex flex-col gap-2">
                    <button onclick="approveMos(${item.id})" class="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors">
                        ✅ Approve
                    </button>
                    <button onclick="rejectMos(${item.id})" class="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors">
                        ❌ Reject
                    </button>
                </div>
            `;
}

function renderMosRequestDetailsColumn(item) {
    // In MoS view, show the request details from the member
    // This will be fetched from mos_requests table
    return `
                <div class="max-w-xs">
                    <div id="mos-details-${item.id}" class="text-sm font-medium text-headings bg-section px-3 py-2 rounded-lg border border-main" data-ticket-id="${item.id}">
                        <span class="text-secondary italic">Loading...</span>
                    </div>
                </div>
            `;
}

function renderOrderStatus(status) {
    if (!status) {
        return `<span class="whitespace-nowrap px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">N/A</span>`;
    }
    const theme = document.documentElement.className || 'dark';
    const lowerStatus = status.toLowerCase();

    const palettes = {
        daylight: {
            delivered: 'bg-green-100 text-green-800 border border-green-200',
            pending: 'bg-blue-100 text-blue-800 border border-blue-200',
            backordered: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
            cancelled: 'bg-red-100 text-red-800 border border-red-200',
            default: 'bg-gray-100 text-gray-800 border border-gray-200'
        },
        'blossom-dawn': {
            delivered: 'bg-green-200 text-green-900 border border-green-300',
            pending: 'bg-pink-200 text-pink-900 border border-pink-300',
            backordered: 'bg-yellow-200 text-yellow-900 border border-yellow-300',
            cancelled: 'bg-red-200 text-red-900 border border-red-300',
            default: 'bg-gray-200 text-gray-900 border border-gray-300'
        },
        'blue-sky': {
            delivered: 'bg-green-200 text-green-900 border border-green-300',
            pending: 'bg-blue-200 text-blue-900 border border-blue-300',
            backordered: 'bg-yellow-200 text-yellow-900 border border-yellow-300',
            cancelled: 'bg-red-200 text-red-900 border border-red-300',
            default: 'bg-gray-200 text-gray-900 border border-gray-300'
        },
        dark: {
            delivered: 'bg-green-900/50 text-green-300 border border-green-700',
            pending: 'bg-blue-900/50 text-blue-300 border border-blue-700',
            backordered: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
            cancelled: 'bg-red-900/50 text-red-300 border border-red-700',
            default: 'bg-gray-700 text-gray-300 border border-gray-600'
        },
        sunset: {
            delivered: 'bg-green-900/50 text-green-300 border border-green-700',
            pending: 'bg-orange-900/50 text-orange-300 border border-orange-700',
            backordered: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
            cancelled: 'bg-red-900/50 text-red-300 border border-red-700',
            default: 'bg-stone-800/50 text-stone-300 border border-stone-700'
        },
        twilight: {
            delivered: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
            pending: 'bg-indigo-900/50 text-indigo-300 border border-indigo-700',
            backordered: 'bg-amber-900/50 text-amber-300 border border-amber-700',
            cancelled: 'bg-rose-900/50 text-rose-300 border border-rose-700',
            default: 'bg-slate-700 text-slate-300 border border-slate-600'
        }
    };

    const palette = palettes[theme] || palettes.dark;

    let colorClasses = palette.default;
    if (lowerStatus.includes('delivered') || lowerStatus.includes('shipped')) colorClasses = palette.delivered;
    else if (lowerStatus.includes('pending ship') || lowerStatus.includes('ready for pickup')) colorClasses = palette.pending;
    else if (lowerStatus.includes('backordered')) colorClasses = palette.backordered;
    else if (lowerStatus.includes('cancelled') || lowerStatus.includes('pending cancel')) colorClasses = palette.cancelled;

    return `<span class="whitespace-nowrap px-2 py-1 text-xs font-medium rounded-full ${colorClasses}">${status}</span>`;
}

async function handleTableClick(e) {
    const target = e.target;
    const button = target.closest('button[data-action]');

    if (button) {
        const action = button.dataset.action;
        const ticketId = parseInt(button.dataset.ticketId, 10);
        const ticket = ticketsMap.get(ticketId);
        const poKey = ticket.po || `NO_PO_${ticket.id}`;
        const ticketsInGroup = Array.from(ticketsMap.values()).filter(t => (t.po || `NO_PO_${t.id}`) === poKey);
        const ticketIdsInGroup = ticketsInGroup.map(t => t.id);

        if (action === 'start') await handleGroupAction(button, ticketIdsInGroup, 'start');
        if (action === 'end') await handleGroupAction(button, ticketIdsInGroup, 'end');
        if (action === 'template') startTemplateWorkflow(ticket);
        if (action === 'no-action-needed') await handleNoActionNeeded(button, ticketId);
    }
}

async function handleGroupAction(button, ticketIds, action) {
    if (!supabaseClient) return;
    // Use current logged-in user instead of dropdown selection
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const selectedAgentId = currentUser.stt;
    if (action === 'start' && !selectedAgentId) {
        return showMessage('Vui lòng đăng nhập để thực hiện thao tác này.', 'error');
    }

    const firstTicketId = ticketIds[0];
    const statusSelect = document.querySelector(`select[data-ticket-id="${firstTicketId}"][data-action="status-change"]`);
    if (action === 'end' && !statusSelect.value) {
        return showMessage('Vui lòng chọn trạng thái ticket.', 'error');
    }

    button.disabled = true;
    const payload = {};
    if (action === 'start') {
        payload.agent_handle_ticket = parseInt(selectedAgentId, 10);
        payload.time_start = new Date().toISOString();
    } else if (action === 'end') {
        payload.ticket_status_id = parseInt(statusSelect.value, 10);
        payload.time_end = new Date().toISOString();

        // Check if EU team member and status is "Move to onshore - Unassign"
        const ticket = ticketsMap.get(firstTicketId);
        if (ticket) {
            // Get agent team
            const { data: agentData, error: agentError } = await supabaseClient
                .from('agent')
                .select('team')
                .eq('agent_account', ticket.assignee_account)
                .single();

            if (!agentError && agentData && agentData.team === 'EU') {
                // Get status name
                const selectedStatus = ticketStatuses.find(s => s.id == statusSelect.value);
                if (selectedStatus && selectedStatus.status_name === 'Move to onshore - Unassign') {
                    // Prompt for escalation reason
                    const reasonEscalate = prompt('Please provide the reason for escalation:');
                    if (reasonEscalate === null) {
                        // User cancelled
                        button.disabled = false;
                        return;
                    }
                    if (!reasonEscalate.trim()) {
                        showMessage('Reason for escalation is required for EU team when using "Move to onshore - Unassign" status.', 'error');
                        button.disabled = false;
                        return;
                    }
                    payload.reason_escalate = reasonEscalate.trim();
                }
            }
        }
    }

    try {
        const { error } = await supabaseClient.from('tickets').update(payload).in('id', ticketIds);
        if (error) throw error;

        // OPTIMIZATION: Invalidate cache after update
        invalidateTicketsCache();

        showMessage(`Nhóm ticket đã được ${action === 'start' ? 'bắt đầu' : 'kết thúc'}.`, 'success');

        if (action === 'start') {
            // Update the start button to show the time without refreshing the entire table
            updateStartButtonDisplay(ticketIds);

            // Track tickets started in OT Mode
            if (otModeEnabled) {
                ticketIds.forEach(id => otModeTickets.add(id));
                localStorage.setItem('otModeTickets', JSON.stringify([...otModeTickets]));
                console.log(`🔥 ${ticketIds.length} tickets marked for OT Tracker routing`);
            }
        } else if (action === 'end') {
            // Handle KPI update for end action
            await handleEndTicket(firstTicketId);

            // Refresh data from database (force refresh to bypass cache)
            // Scroll position is automatically preserved by fetchAndRenderTickets()
            await fetchAndRenderTickets(true);
        }
    } catch (error) {
        console.error(`Lỗi khi ${action} nhóm:`, error);
        showMessage(`Không thể ${action} nhóm ticket.`, 'error');
        button.disabled = false;
    }
}

async function handleNoActionNeeded(button, ticketId) {
    if (!supabaseClient) return;

    // Confirm action with user
    if (!confirm('Are you sure you want to mark this ticket as "No action needed"? This will remove it from the view.')) {
        return;
    }

    button.disabled = true;

    try {
        // Update the ticket to mark it as no action needed
        // We'll set time_end to current time to remove it from the active view
        const payload = {
            time_end: new Date().toISOString(),
            ticket_status_id: null, // No specific status since no action was needed
            notes: 'No action needed - removed from view'
        };

        const { error } = await supabaseClient
            .from('tickets')
            .update(payload)
            .eq('id', ticketId);

        if (error) throw error;

        showMessage('Ticket marked as "No action needed" and removed from view.', 'success');

        // Remove the ticket row from the view immediately
        const ticketRow = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
        if (ticketRow) {
            ticketRow.style.transition = 'opacity 0.3s ease-out';
            ticketRow.style.opacity = '0';
            setTimeout(() => {
                // Refresh the table to ensure consistency
                invalidateTicketsCache();
                fetchAndRenderTickets(true);
            }, 300);
        }

    } catch (error) {
        console.error('Error marking ticket as no action needed:', error);
        showMessage('Failed to mark ticket as no action needed.', 'error');
        button.disabled = false;
    }
}

function updateStartButtonDisplay(ticketIds) {
    // Update the start button to show the current time without refreshing the entire table
    const firstTicketId = ticketIds[0];
    const ticket = ticketsMap.get(firstTicketId);
    if (!ticket) return;

    // Update the ticket data in memory
    ticket.time_start = new Date().toISOString();

    // Find and update the start button display
    const poGroup = ticket.po || `NO_PO_${firstTicketId}`;
    const firstRowInGroup = document.querySelector(`tr[data-po-group="${poGroup}"]`);
    if (firstRowInGroup) {
        const startButtonCell = firstRowInGroup.querySelector('td:first-child');
        if (startButtonCell) {
            startButtonCell.innerHTML = renderStartButton(ticket);
        }
    }
}

const toTitleCase = (str) => str ? str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()) : '';
const hexToRgb = (hex) => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? `${parseInt(r[1], 16)} ${parseInt(r[2], 16)} ${parseInt(r[3], 16)}` : null; };

// =================================================================================
// == NEW TEMPLATE POPUP LOGIC =====================================================
// =================================================================================

function startTemplateWorkflow(ticketData) {
    popupCurrentTicket = ticketData;
    const matchingTemplate = allTemplates.find(t => t.issue?.toLowerCase() === ticketData.issue_type?.toLowerCase());
    popupCurrentProject = matchingTemplate ? matchingTemplate.projects?.id : allProjects[0]?.id;
    popupCurrentIssue = ticketData.issue_type;

    // Pass ticket data to adminview if it's available
    if (window.setAdminViewTicketData) {
        window.setAdminViewTicketData(ticketData);
    }

    popupWelcomeScreen.classList.remove('hidden');
    popupTemplateViewer.classList.add('hidden');
    popupSearchInput.value = '';

    openTemplateSelectionModal();
    renderPopupUI();
}

function renderPopupUI() {
    renderPopupProjectTabs();
    renderPopupIssuesList();
    renderPopupTemplateList();
}

function renderPopupProjectTabs() {
    popupProjectTabs.innerHTML = allProjects.map(project => {
        const isActive = project.id === popupCurrentProject;
        const color = project.color || '#6B7280';
        const style = isActive ? `background-color: ${color}; color: white;` : `background-color: rgba(${hexToRgb(color)}, 0.1); color: ${color};`;
        return `<button data-project-id="${project.id}" class="project-tab font-bold py-2 px-4 rounded-lg transition-colors ${isActive ? 'active' : ''}" style="${style}">${project.name}</button>`;
    }).join('');
}

function renderPopupIssuesList() {
    if (!popupCurrentProject) {
        popupIssuesList.innerHTML = '';
        return;
    };
    const projectTemplates = allTemplates.filter(t => t.projects?.id === popupCurrentProject);
    const issues = [...new Set(projectTemplates.map(t => t.issue))].sort((a, b) => a.localeCompare(b));
    popupIssuesList.innerHTML = issues.map(issue => `<button data-issue-name="${issue}" class="w-full text-left p-2 rounded-md transition-colors text-main ${issue === popupCurrentIssue ? 'bg-blue-600 text-white font-semibold' : 'hover:bg-button'}">${issue}</button>`).join('');
}

function renderPopupTemplateList(searchTerm = '') {
    let filteredTemplates = [];

    if (searchTerm) {
        const lowerCaseTerm = searchTerm.toLowerCase();
        popupCurrentIssue = null;
        renderPopupIssuesList();
        filteredTemplates = allTemplates
            .filter(t => t.name.toLowerCase().includes(lowerCaseTerm))
            .sort((a, b) => a.name.localeCompare(b.name));
    } else {
        if (!popupCurrentIssue) {
            popupTemplateList.innerHTML = `<p class="text-secondary text-center mt-4">Chọn một danh mục.</p>`;
            return;
        }
        filteredTemplates = allTemplates
            .filter(t => t.projects?.id === popupCurrentProject && t.issue === popupCurrentIssue)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filteredTemplates.length === 0) {
        popupTemplateList.innerHTML = `<p class="text-secondary text-center mt-4">Không có mẫu nào.</p>`;
        return;
    }
    popupTemplateList.innerHTML = filteredTemplates.map(template => {
        return `<div class="template-item p-2 rounded-md hover:bg-button cursor-pointer" data-template-id="${template.id}">
                            <span class="font-medium text-main">${template.name}</span>
                        </div>`;
    }).join('');
}

function handlePopupProjectClick(e) {
    const button = e.target.closest('.project-tab');
    if (button) {
        popupCurrentProject = parseInt(button.dataset.projectId, 10);
        popupCurrentIssue = null;
        popupWelcomeScreen.classList.remove('hidden');
        popupTemplateViewer.classList.add('hidden');
        popupSearchInput.value = '';
        renderPopupUI();
    }
}
function handlePopupIssueClick(e) {
    const button = e.target.closest('button');
    if (button) {
        popupCurrentIssue = button.dataset.issueName;
        popupWelcomeScreen.classList.remove('hidden');
        popupTemplateViewer.classList.add('hidden');
        popupSearchInput.value = '';
        renderPopupIssuesList();
        renderPopupTemplateList();
    }
}
async function handlePopupTemplateClick(e) {
    const item = e.target.closest('.template-item');
    if (item) {
        popupCurrentTemplateId = item.dataset.templateId;
        const template = allTemplates.find(t => t.id === popupCurrentTemplateId);

        // Check if this is a WDN project - open WDN modal directly
        const wdnProject = allProjects.find(p => p.name === 'WDN' || p.name?.toUpperCase() === 'WDN');
        const projectName = template?.projects?.name || '';
        const issueName = template?.issue || '';
        const isWDNProject = projectName.toUpperCase() === 'WDN' ||
            issueName.toUpperCase() === 'WDN' ||
            (wdnProject && template?.project_id === wdnProject.id);

        if (isWDNProject && template) {
            // For WDN templates, skip template viewer and open WDN modal directly
            await openWdnSupplierEmailModal(template);
            return;
        }

        // If template requires carrier email, show that modal first
        if (template && template.emailCarrier) {
            const result = await openCarrierEmailModal(template, true);
            if (result !== 'continue') {
                return; // User cancelled
            }
        }

        // Then show the template viewer
        showTemplateViewer(popupCurrentTemplateId, popupCurrentTicket);
    }
}

async function showTemplateViewer(templateId, ticketData) {
    const template = allTemplates.find(t => t.id === templateId);
    if (!template) return;

    // Detect if this is a WDN project - using multiple detection methods
    const wdnProject = allProjects.find(p => p.name === 'WDN' || p.name?.toUpperCase() === 'WDN');
    const projectName = template.projects?.name || '';
    const issueName = template.issue || '';
    const isWDNProject = projectName.toUpperCase() === 'WDN' ||
        issueName.toUpperCase() === 'WDN' ||
        (wdnProject && template.project_id === wdnProject.id);

    popupWelcomeScreen.classList.add('hidden');

    // Render different UI based on project type
    if (isWDNProject) {
        // WDN Project Format - Supplier Email Composition Workspace
        popupTemplateViewer.innerHTML = `
                    <h3 id="viewer-title" class="text-2xl font-bold mb-2 text-headings"></h3>
                    <p id="viewer-category" class="text-sm text-secondary mb-4"></p>

                    <!-- Optional Description Section -->
                    <div id="template-description-section" class="mb-4 hidden">
                        <button id="toggle-description-btn" class="flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
                            <span id="description-icon">▶</span>
                            <span>📋 Xem Mô tả Template</span>
                        </button>
                        <div id="template-description-content" class="hidden mt-2 p-3 bg-section border border-secondary rounded-lg text-sm text-secondary whitespace-pre-wrap"></div>
                    </div>

                    <!-- WDN Supplier Email Composition Form -->
                    <div class="mb-4 p-4 bg-button border border-cyan-600/30 rounded-lg space-y-4">
                        <h4 class="font-semibold text-lg text-cyan-400 border-b border-secondary pb-2">📧 Supplier Email Composition</h4>

                        <!-- Email From (Warning/Reminder) -->
                        <div class="p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg">
                            <label for="wdn-email-from" class="block text-sm font-medium text-amber-400 mb-1">⚠️ Email From (reminder)</label>
                            <input type="text" id="wdn-email-from" class="w-full p-2 border border-amber-500 rounded-md bg-section" readonly>
                            <p class="text-xs text-amber-400 mt-1">Make sure you're sending from this email account!</p>
                        </div>

                        <!-- Email To Row -->
                        <div>
                            <label for="wdn-email-to" class="block text-sm font-medium text-secondary mb-1">Email To (Supplier)</label>
                            <input type="email" id="wdn-email-to" class="w-full p-2 border border-secondary rounded-md bg-section" placeholder="supplier@example.com">
                        </div>

                        <!-- Subject Row -->
                        <div>
                            <label for="wdn-email-subject" class="block text-sm font-medium text-secondary mb-1">Subject</label>
                            <input type="text" id="wdn-email-subject" class="w-full p-2 border border-secondary rounded-md bg-section" placeholder="Email subject line">
                        </div>

                        <!-- CC Row -->
                        <div>
                            <label for="wdn-email-cc" class="block text-sm font-medium text-secondary mb-1">CC <span class="text-gray-500">(comma-separated)</span></label>
                            <input type="text" id="wdn-email-cc" class="w-full p-2 border border-secondary rounded-md bg-section" placeholder="cc1@example.com, cc2@example.com">
                        </div>

                        <!-- Supplier Name for placeholders -->
                        <div>
                            <label for="viewer-agent-name" class="block text-sm font-medium text-secondary mb-1">Supplier Contact Name <span class="text-gray-500">(for greeting)</span></label>
                            <input type="text" id="viewer-agent-name" class="w-full p-2 border border-secondary rounded-md bg-section" placeholder="Enter supplier contact name">
                        </div>

                        <!-- Dynamic Placeholders -->
                        <div id="placeholders-container" class="space-y-3"></div>
                        <div id="optionals-container" class="space-y-2"></div>
                        <div id="dynamic-optional-field-container" class="space-y-3"></div>
                    </div>

                    <!-- Email Body Preview -->
                    <div class="mb-4">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="font-semibold text-lg text-headings">📝 Email Body</h4>
                            <button id="copy-body-btn" class="text-sm bg-green-600 hover:bg-green-700 text-white font-medium py-1 px-3 rounded-lg">Copy Body</button>
                        </div>
                        <div id="final-output" class="w-full p-4 border border-secondary rounded-lg bg-section min-h-[200px] whitespace-pre-wrap"></div>
                    </div>

                    <!-- Internal Note Section -->
                    <div class="mb-4 p-4 bg-amber-900/20 border border-amber-600/30 rounded-lg">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="font-semibold text-lg text-amber-400">📋 Internal Note (for ticket)</h4>
                            <button id="copy-internal-note-btn" class="text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium py-1 px-3 rounded-lg">Copy Note</button>
                        </div>
                        <div id="wdn-internal-note-output" class="w-full p-3 border border-amber-600/30 rounded-lg bg-section min-h-[60px] whitespace-pre-wrap text-sm"></div>
                    </div>

                    <!-- Copy All Button -->
                    <div class="flex justify-end items-center gap-3">
                        <div id="copy-feedback" class="text-green-400 font-medium opacity-0 transition-opacity">Đã sao chép!</div>
                        <button id="open-wdn-modal-btn" class="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                            📧 Open WDN Modal
                        </button>
                        <button id="copy-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2">
                            ✅ Hoàn tất & Tiếp tục
                        </button>
                    </div>`;
    } else {
        // Default Format - for supplier emails
        popupTemplateViewer.innerHTML = `
                    <h3 id="viewer-title" class="text-2xl font-bold mb-2 text-headings"></h3>
                    <p id="viewer-category" class="text-sm text-secondary mb-4"></p>

                    <!-- Optional Description Section -->
                    <div id="template-description-section" class="mb-4 hidden">
                        <button id="toggle-description-btn" class="flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
                            <span id="description-icon">▶</span>
                            <span>📋 Xem Mô tả Template</span>
                        </button>
                        <div id="template-description-content" class="hidden mt-2 p-3 bg-section border border-secondary rounded-lg text-sm text-secondary whitespace-pre-wrap"></div>
                    </div>

                    <div class="mb-4 p-4 bg-button border border-secondary rounded-lg space-y-4">
                        <div>
                            <h4 class="font-semibold text-lg mb-2 text-blue-400">1. Thông tin Người nhận & Người gửi</h4>
                            <div class="space-y-3 pl-2">
                                 <div>
                                    <label for="viewer-agent-name" class="block text-sm font-medium text-secondary">Tên riêng Người nhận</label>
                                    <input type="text" id="viewer-agent-name" class="mt-1 w-full p-2 border rounded-md">
                                </div>
                                <div>
                                    <label for="viewer-su-id" class="block text-sm font-medium text-secondary">Mã Nhà Cung Cấp (SuID)</label>
                                    <input type="text" id="viewer-su-id" class="mt-1 w-full p-2 border rounded-md">
                                </div>
                                <div id="viewer-manual-supplier-container" class="hidden">
                                    <label for="viewer-manual-supplier-name" class="block text-sm font-medium text-secondary">Tên Nhà Cung Cấp</label>
                                    <input type="text" id="viewer-manual-supplier-name" class="mt-1 w-full p-2 border rounded-md" placeholder="Nhập tên NCC nếu không tìm thấy">
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-semibold text-lg mb-2 text-blue-400">2. Tùy chỉnh Nội dung chính</h4>
                            <div id="placeholders-container" class="space-y-4 pl-2"></div>
                            <div id="optionals-container" class="mt-4 space-y-2 pl-2"></div>
                            <div id="dynamic-optional-field-container" class="mt-4 space-y-3 pl-2"></div>
                        </div>
                    </div>
                    <div class="mt-6">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="font-semibold text-lg text-headings">Nội dung cuối cùng</h4>
                            <div class="flex items-center gap-2">
                                <button id="open-wdn-modal-btn" class="hidden bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                                    📧 WDN Email
                                </button>
                                <button id="copy-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                                    Sao chép & Tiếp tục
                                </button>
                            </div>
                        </div>
                        <div id="final-output" class="w-full p-4 border border-secondary rounded-lg bg-section min-h-[250px] whitespace-pre-wrap"></div>
                        <div id="copy-feedback" class="mt-2 text-green-400 font-medium opacity-0">Đã sao chép!</div>
                    </div>`;
    }
    popupTemplateViewer.classList.remove('hidden');

    document.getElementById('viewer-title').textContent = template.name;
    document.getElementById('viewer-category').textContent = `Dự án: ${template.projects?.name || 'N/A'} / Danh mục: ${template.issue}`;

    // Show WDN Email button for WDN project templates
    // This button exists in both layouts now, so we always set up the handler
    const wdnModalBtn = document.getElementById('open-wdn-modal-btn');
    if (wdnModalBtn) {
        // Always show and set up the WDN button since WDN templates should use WDN modal
        wdnModalBtn.onclick = () => {
            openWdnSupplierEmailModal(template);
        };
        // For non-WDN projects, hide the button
        if (!isWDNProject) {
            wdnModalBtn.classList.add('hidden');
        }
    }

    // Handle optional description display
    const descriptionSection = document.getElementById('template-description-section');
    const descriptionContent = document.getElementById('template-description-content');
    const toggleDescriptionBtn = document.getElementById('toggle-description-btn');
    const descriptionIcon = document.getElementById('description-icon');

    if (template.description && template.description.trim()) {
        // Show description section if template has a description
        descriptionSection.classList.remove('hidden');
        descriptionContent.textContent = template.description;

        // Set up toggle functionality
        toggleDescriptionBtn.addEventListener('click', () => {
            const isHidden = descriptionContent.classList.contains('hidden');
            if (isHidden) {
                descriptionContent.classList.remove('hidden');
                descriptionIcon.textContent = '▼';
            } else {
                descriptionContent.classList.add('hidden');
                descriptionIcon.textContent = '▶';
            }
        });
    } else {
        // Hide description section if no description exists
        descriptionSection.classList.add('hidden');
    }

    const placeholderMap = new Map(allPlaceholders.map(p => [p.key, p]));

    // Render logic for all placeholders including optional ones
    renderAllPlaceholders(template, placeholderMap);

    // Auto-fill common fields based on project type
    if (isWDNProject) {
        // WDN Project: Populate supplier email composition fields
        const wdnEmailFrom = document.getElementById('wdn-email-from');
        const wdnEmailTo = document.getElementById('wdn-email-to');
        const wdnEmailSubject = document.getElementById('wdn-email-subject');
        const wdnEmailCc = document.getElementById('wdn-email-cc');
        const viewerAgentName = document.getElementById('viewer-agent-name');
        const wdnInternalNoteOutput = document.getElementById('wdn-internal-note-output');

        // Pre-fill from ticket and template data
        // Note: For WDN, email goes to supplier, not customer
        if (wdnEmailFrom) wdnEmailFrom.value = template.emailFrom || '';
        if (wdnEmailTo) wdnEmailTo.value = ticketData.supplier_email || ticketData.suid || '';  // Supplier email or SUID
        if (viewerAgentName) viewerAgentName.value = '';  // Supplier contact name - user fills this in
        if (wdnEmailSubject) wdnEmailSubject.value = template.customerSubject || '';
        if (wdnEmailCc) wdnEmailCc.value = template.cc || '';
        if (wdnInternalNoteOutput) wdnInternalNoteOutput.textContent = template.internalComment || '';

        // Setup copy buttons for WDN fields
        const copyBodyBtn = document.getElementById('copy-body-btn');
        const copyInternalNoteBtn = document.getElementById('copy-internal-note-btn');

        if (copyBodyBtn) {
            copyBodyBtn.addEventListener('click', () => {
                const finalOutput = document.getElementById('final-output');
                const text = finalOutput?.innerText || finalOutput?.textContent || '';
                copyPlainTextToClipboard(text, document.getElementById('copy-feedback'));
            });
        }

        if (copyInternalNoteBtn) {
            copyInternalNoteBtn.addEventListener('click', () => {
                const noteOutput = document.getElementById('wdn-internal-note-output');
                const text = noteOutput?.textContent || '';
                copyPlainTextToClipboard(text, document.getElementById('copy-feedback'));
            });
        }
    } else {
        // Non-WDN: Populate supplier fields
        document.getElementById('viewer-su-id').value = ticketData.suid || '';
        const supplierName = await findSupplierName(ticketData.suid);
        // Bug Fix #2: Always show supplier name field, regardless of whether supplier is found
        document.getElementById('viewer-manual-supplier-container').classList.remove('hidden');
        document.getElementById('viewer-manual-supplier-name').value = supplierName || '';
    }

    // Auto-fill placeholders from ticket data
    const prefillMapping = {
        po: ticketData.po,
        customer_name: (ticketData.customer || '').split(' ')[0],
        order_number: ticketData.order_number,
        item_number: ticketData.item_number
    };

    for (const key in prefillMapping) {
        const inputs = popupTemplateViewer.querySelectorAll(`[data-placeholder-key="${key}"]`);
        inputs.forEach(input => {
            if (input && prefillMapping[key]) input.value = prefillMapping[key];
        });
    }

    popupTemplateViewer.querySelectorAll('input, select, textarea').forEach(el => el.addEventListener('input', updateFinalOutput));
    document.getElementById('copy-btn').addEventListener('click', handleCopyAndContinue);
    updateFinalOutput();
}

function renderAllPlaceholders(template, placeholderMap) {
    const placeholdersContainer = document.getElementById('placeholders-container');
    const optionalsContainer = document.getElementById('optionals-container');
    const dynamicOptionalsContainer = document.getElementById('dynamic-optional-field-container');

    placeholdersContainer.innerHTML = '';
    optionalsContainer.innerHTML = '';
    dynamicOptionalsContainer.innerHTML = '';

    const content = template.content || '';
    const ignoredPlaceholders = new Set(['signature', 'greeting', 'Customer_Name', 'Order_Number', 'Brand']);

    const createPlaceholderInput = (pKey) => {
        const placeholderData = placeholderMap.get(pKey.toLowerCase());
        const div = document.createElement('div');
        div.className = "flex flex-col";
        let fieldHtml;
        const type = placeholderData ? placeholderData.type : 'entry';
        const inputClass = "w-full mt-1 p-2 border rounded-md";
        switch (type) {
            case 'droplist':
                fieldHtml = `<select data-placeholder-key="${pKey}" class="${inputClass}">${(placeholderData.options || []).map(opt => `<option value="${opt.value}">${opt.text || opt.value}</option>`).join('')}</select>`;
                break;
            case 'date':
                fieldHtml = `<input type="date" data-placeholder-key="${pKey}" class="${inputClass}">`;
                break;
            default:
                fieldHtml = `<input type="text" data-placeholder-key="${pKey}" class="${inputClass}">`;
        }
        div.innerHTML = `<label class="block text-sm font-medium text-secondary">${pKey.replace(/_/g, ' ')}</label>${fieldHtml}`;
        return div;
    };

    const baseContent = content.replace(/\[\[(.*?)\]\]([\s\S]*?)\[\[\/\1\]\]/g, '');
    const basePlaceholders = [...new Set(Array.from(baseContent.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g), m => m[1]))]
        .filter(p => !ignoredPlaceholders.has(p) && !p.startsWith('hom_nay'));
    basePlaceholders.forEach(pKey => placeholdersContainer.appendChild(createPlaceholderInput(pKey)));

    const optionalBlockRegex = /\[\[(.*?)\]\]([\s\S]*?)\[\[\/\1\]\]/g;
    let match;
    while ((match = optionalBlockRegex.exec(content)) !== null) {
        const [, optionalName, optionalContent] = match;
        const optionalContainer = document.createElement('div');
        optionalContainer.className = 'mb-2';
        const checkboxId = `opt-${optionalName.replace(/\s/g, '-')}-${Math.random()}`;

        const nestedPlaceholdersDiv = document.createElement('div');
        nestedPlaceholdersDiv.className = 'nested-placeholders pl-6 mt-2 border-l-2 border-dashed border-secondary';
        const nestedPlaceholders = [...new Set(Array.from(optionalContent.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g), m => m[1]))]
            .filter(p => !ignoredPlaceholders.has(p) && !p.startsWith('hom_nay'));
        nestedPlaceholders.forEach(pKey => nestedPlaceholdersDiv.appendChild(createPlaceholderInput(pKey)));

        optionalContainer.innerHTML = `<div class="flex items-center"><input type="checkbox" id="${checkboxId}" data-optional-name="${optionalName}" checked class="h-4 w-4 text-blue-600 border-secondary rounded"><label for="${checkboxId}" class="ml-2 block text-sm">${optionalName}</label></div>`;
        if (nestedPlaceholdersDiv.children.length === 0) nestedPlaceholdersDiv.classList.add('hidden');
        optionalContainer.appendChild(nestedPlaceholdersDiv);
        optionalsContainer.appendChild(optionalContainer);

        optionalContainer.querySelector('input').addEventListener('change', (e) => {
            nestedPlaceholdersDiv.classList.toggle('hidden', !e.target.checked);
            updateFinalOutput();
        });
    }

    if (template.hasOptionalField && template.optionalFieldNames) {
        const optionalFields = template.optionalFieldNames.split(',').map(s => s.trim()).filter(Boolean);
        if (optionalFields.length > 0) {
            const title = document.createElement('h5');
            title.className = 'font-semibold text-secondary';
            title.textContent = 'Trường tùy chọn:';
            dynamicOptionalsContainer.appendChild(title);
        }
        optionalFields.forEach(fieldName => {
            const div = document.createElement('div');
            const checkboxId = `dyn-opt-check-${fieldName}`;
            div.innerHTML = `
                        <div class="flex items-center">
                            <input type="checkbox" id="${checkboxId}" data-optional-name="${fieldName}" class="h-4 w-4 text-blue-600 border-secondary rounded">
                            <label for="${checkboxId}" class="ml-2 block text-sm font-medium">${fieldName.replace(/_/g, ' ')}</label>
                        </div>
                        <textarea data-placeholder-key="${fieldName}" class="hidden mt-2 w-full p-2 border rounded-md" rows="3"></textarea>`;
            dynamicOptionalsContainer.appendChild(div);
            const checkbox = div.querySelector(`#${checkboxId}`);
            const textarea = div.querySelector('textarea');
            checkbox.addEventListener('change', () => {
                textarea.classList.toggle('hidden', !checkbox.checked);
                updateFinalOutput();
            });
        });
    }
}

function updateFinalOutput() {
    const template = allTemplates.find(t => t.id === popupCurrentTemplateId);
    if (!template) return;

    const agentName = document.getElementById('viewer-agent-name').value.trim();
    // Safely get supplier name (may not exist in WDN projects)
    const manualSupplierNameEl = document.getElementById('viewer-manual-supplier-name');
    const manualSupplierName = manualSupplierNameEl ? manualSupplierNameEl.value.trim() : '';

    let content = template.content || '';
    let greeting = '';

    // Get signature data
    const assigneeAccount = popupCurrentTicket.assignee_account;
    const assigneeName = allAgentsMap.get(assigneeAccount);
    const signature = allSignatures.find(s => s.name === assigneeName) || allSignatures.find(s => s.isDefault) || allSignatures[0];
    let signatureText = signature ? `${signature.name}\n${signature.title || ''}\n${signature.department || ''}`.trim() : '';

    // Replace {{signature}} placeholder in content (like adminview.js does)
    content = content.replace(/\{\{signature\}\}/g, signatureText);

    // Get greeting templates
    // Note: allSettings.X stores the full row { key, value: { value: 'text' } }
    // So we need to access .value.value to get the actual string
    const greetingPersonTpl = (typeof allSettings.greeting_person?.value?.value === 'string')
        ? allSettings.greeting_person.value.value
        : 'Hi {{name}},';
    const greetingTeamTpl = (typeof allSettings.greeting_team?.value?.value === 'string')
        ? allSettings.greeting_team.value.value
        : 'Hi {{name}} Team,';

    // Handle {{greeting}} placeholder - works similar to greeting logic
    let greetingReplacement = '';
    if (agentName) {
        greetingReplacement = greetingPersonTpl.replace('{{name}}', toTitleCase(agentName));
    } else if (manualSupplierName) {
        greetingReplacement = greetingTeamTpl.replace('{{name}}', cleanSupplierName(manualSupplierName));
    }
    content = content.replace(/\{\{greeting\}\}/gi, greetingReplacement);

    // Only add greeting if needGreeting is true
    if (template.needGreeting !== false) {
        if (agentName) {
            greeting = greetingPersonTpl.replace('{{name}}', toTitleCase(agentName));
        } else if (manualSupplierName) {
            greeting = greetingTeamTpl.replace('{{name}}', cleanSupplierName(manualSupplierName));
        }
    }



    // Handle Hi {{name}} placeholders in template content - should work exactly like greeting logic
    if (agentName) {
        const greetingTemplate = (typeof allSettings.greeting_person?.value?.value === 'string')
            ? allSettings.greeting_person.value.value
            : 'Hi {{name}},';
        const hiNameReplacement = greetingTemplate.replace('{{name}}', toTitleCase(agentName));
        content = content.replace(/Hi\s*\{\{name\}\}/gi, hiNameReplacement);
    } else if (manualSupplierName) {
        const greetingTemplate = (typeof allSettings.greeting_team?.value?.value === 'string')
            ? allSettings.greeting_team.value.value
            : 'Hi {{name}} Team,';
        const hiNameReplacement = greetingTemplate.replace('{{name}}', cleanSupplierName(manualSupplierName));
        content = content.replace(/Hi\s*\{\{name\}\}/gi, hiNameReplacement);
    } else {
        // If no name available, remove Hi {{name}} placeholders
        content = content.replace(/Hi\s*\{\{name\}\}/gi, '');
    }

    // Process optional sections
    document.querySelectorAll('[data-optional-name]').forEach(checkbox => {
        if (!checkbox.checked) {
            const name = checkbox.dataset.optionalName;
            const regex = new RegExp(`\\[\\[${name}\\]\\][\\s\\S]*?\\[\\[\\/${name}\\]\\]`, 'g');
            content = content.replace(regex, '');
        }
    });
    content = content.replace(/\[\[\/?.*?\]\]/g, ''); // Clean up any remaining tags

    content = replacePlaceholdersInText(content);

    // Get footer text
    // Note: allSettings.X stores the full row { key, value: { value: 'text' } }
    // So we need to access .value.value to get the actual string
    const footerText = (template.includeFooter && typeof allSettings.footer_text?.value?.value === 'string')
        ? allSettings.footer_text.value.value
        : '';
    const footerPart = (template.includeFooter && footerText) ? `\n\n${footerText}` : '';

    // Check if this is a special issue (MOS or Movement) - these don't need greeting/signature
    const isSpecialIssue = ['mos', 'movement'].includes(template.issue?.toLowerCase() || '');

    // Assemble final output (ALWAYS append closing + signature like adminview.js does)
    let finalPlainText;
    if (isSpecialIssue) {
        // Special issues: just the content
        finalPlainText = content.trim();
    } else {
        // Normal templates: greeting + content + footer + closing + signature
        // Use random closing (Best regards, Warm regards, etc.)
        const closings = ['Best regards', 'Warm regards', 'Kind regards', 'Regards'];
        const randomClosing = closings[Math.floor(Math.random() * closings.length)];
        finalPlainText = `${greeting ? greeting + '\n\n' : ''}${content.trim()}${footerPart}\n\n${randomClosing},\n${signatureText}`;
    }

    // Format for display
    finalPlainText = finalPlainText.replace(/(https?:\/\/[^\s]+)([^\s])/g, '$1 $2');
    const plainTextForCopy = finalPlainText.trim();

    let htmlText = escapeHTML(plainTextForCopy)
        .replace(/(https?:\/\/[^\s&<>"']+)/g, '<a href="$1" target="_blank" class="text-blue-500 hover:underline">$1</a>')
        .replace(/\n/g, '<br>');

    // Format footer with HTML support (like adminview.js does)
    if (!isSpecialIssue && footerText) {
        let formattedFooter = footerText
            .replace(/\n/g, '<br>')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/&lt;b&gt;/g, '<b>')
            .replace(/&lt;\/b&gt;/g, '</b>')
            .replace(/&lt;i&gt;/g, '<i>')
            .replace(/&lt;\/i&gt;/g, '</i>')
            .replace(/&lt;u&gt;/g, '<u>')
            .replace(/&lt;\/u&gt;/g, '</u>')
            .replace(/&lt;br&gt;/g, '<br>');

        const plainFooter = escapeHTML(footerText).replace(/\n/g, '<br>');
        htmlText = htmlText.replace(plainFooter, formattedFooter);
    }

    const finalOutput = document.getElementById('final-output');
    finalOutput.innerHTML = htmlText;
    finalOutput.dataset.plainText = plainTextForCopy;

    // Update WDN-specific fields with placeholder replacements
    const isWDNProject = template.projects?.name === 'WDN';
    if (isWDNProject) {
        // Update subject with placeholder replacements
        const wdnEmailSubject = document.getElementById('wdn-email-subject');
        if (wdnEmailSubject && template.customerSubject) {
            const processedSubject = replacePlaceholdersInText(template.customerSubject, true);
            // Only update if not manually modified (check against original template value)
            if (wdnEmailSubject.dataset.originalValue === undefined) {
                wdnEmailSubject.dataset.originalValue = template.customerSubject;
            }
            if (wdnEmailSubject.value === wdnEmailSubject.dataset.originalValue || wdnEmailSubject.value === '') {
                wdnEmailSubject.value = processedSubject;
            }
        }

        // Update internal note with placeholder replacements
        const wdnInternalNoteOutput = document.getElementById('wdn-internal-note-output');
        if (wdnInternalNoteOutput && template.internalComment) {
            const processedNote = replacePlaceholdersInText(template.internalComment, true);
            wdnInternalNoteOutput.textContent = processedNote;
            wdnInternalNoteOutput.dataset.plainText = processedNote;
        }
    }
}

// Helper function to escape HTML
function escapeHTML(str) {
    return str.replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[match]));
}

function replacePlaceholdersInText(text, isForCustomer = false) {
    if (!text) return '';
    let processedText = text;

    if (isForCustomer) {
        const replacements = {
            Customer_Name: document.getElementById('customer-name').value,
            Order_Number: document.getElementById('customer-order').value,
            Brand: document.getElementById('customer-brand').value,
        };
        processedText = processedText.replace(/\{\{(.*?)\}\}/g, (_, key) => replacements[key] || `{{${key}}}`);
    } else {
        const viewer = document.getElementById('popup-template-viewer');
        if (!viewer) return text;

        viewer.querySelectorAll('[data-placeholder-key]').forEach(input => {
            const key = input.dataset.placeholderKey;
            let value = input.value;
            if (input.type === 'date' && value) {
                const [year, month, day] = value.split('-');
                value = `${month}/${day}/${year}`;
            }
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            processedText = processedText.replace(regex, value);
        });
    }
    return processedText;
}

async function handleCopyAndContinue() {
    if (!validatePlaceholders()) return;

    const finalOutput = document.getElementById('final-output');
    copyRichTextToClipboard(finalOutput);

    closeTemplateSelectionModalHandler();
    const template = allTemplates.find(t => t.id === popupCurrentTemplateId);
    if (!template) return;

    // Check if this is a WDN project - using multiple detection methods
    const wdnProject = allProjects.find(p => p.name === 'WDN' || p.name?.toUpperCase() === 'WDN');
    const projectName = template.projects?.name || '';
    const issueName = template.issue || '';
    const isWDNProject = projectName.toUpperCase() === 'WDN' ||
        issueName.toUpperCase() === 'WDN' ||
        (wdnProject && template.project_id === wdnProject.id);

    setTimeout(async () => {
        if (template.followUpGuide) await openFollowUpGuideModal(template.followUpGuide);

        // For WDN projects, show WDN supplier email modal (skip customer modal entirely)
        if (isWDNProject) {
            await openWdnSupplierEmailModal(template);
        } else if (template.sendToCustomer) {
            // For non-WDN projects with sendToCustomer, show customer email modal
            await openCustomerEmailModal(template);
        }

        if (template.addLabelReminder && template.labelName) await openLabelReminderModal(template.labelName);
    }, 400);
}

function validatePlaceholders() {
    const missingFields = [];
    const viewer = document.getElementById('popup-template-viewer');

    // Get current template to check if it's a WDN project
    const template = allTemplates.find(t => t.id === popupCurrentTemplateId);
    const wdnProject = allProjects.find(p => p.name === 'WDN' || p.name?.toUpperCase() === 'WDN');
    const projectName = template?.projects?.name || '';
    const issueName = template?.issue || '';
    const isWDNProject = projectName.toUpperCase() === 'WDN' ||
        issueName.toUpperCase() === 'WDN' ||
        (wdnProject && template?.project_id === wdnProject.id);

    // Check if either agent name or supplier name is provided
    // For WDN projects, only check agent name (no supplier fields)
    const agentName = document.getElementById('viewer-agent-name').value.trim();
    const supplierNameEl = document.getElementById('viewer-manual-supplier-name');
    const supplierName = supplierNameEl ? supplierNameEl.value.trim() : '';

    if (isWDNProject) {
        // WDN projects: only require agent name (supplier contact name)
        if (!agentName) {
            missingFields.push('Tên riêng Người nhận');
        }
    } else {
        // Non-WDN projects: require either agent name or supplier name
        if (!agentName && !supplierName) {
            missingFields.push('Tên riêng Người nhận hoặc Tên NCC');
        }
    }

    // Use the template variable already defined above to check for special placeholders
    const templateContent = template ? template.content || '' : '';

    // Define placeholders that should be ignored in validation (auto-filled or optional)
    const ignoredPlaceholders = new Set(['signature', 'greeting', 'Customer_Name', 'Order_Number', 'Brand']);

    viewer.querySelectorAll('[data-placeholder-key]').forEach(input => {
        const placeholderKey = input.dataset.placeholderKey;
        const isVisible = input.offsetParent !== null;

        // Skip validation for ignored placeholders
        if (ignoredPlaceholders.has(placeholderKey)) {
            return;
        }

        // Skip validation for greeting placeholder if template has {{greeting}} in content
        if (placeholderKey === 'greeting' && templateContent.includes('{{greeting}}')) {
            return;
        }

        // Skip validation for signature placeholder if template has {{signature}} in content
        if (placeholderKey === 'signature' && templateContent.includes('{{signature}}')) {
            return;
        }

        if (isVisible && !input.value.trim()) {
            const label = viewer.querySelector(`label[for="${input.id}"]`);
            missingFields.push(label ? label.textContent : input.dataset.placeholderKey);
        }
    });

    if (missingFields.length > 0) {
        const modal = document.getElementById('validation-modal');
        document.getElementById('missing-fields-list').innerHTML = [...new Set(missingFields)].map(f => `<li>${f}</li>`).join('');
        _openModal(modal);
        document.getElementById('close-validation-modal-btn').onclick = () => _closeModal(modal);
        return false;
    }
    return true;
}

function copyRichTextToClipboard(element) {
    const plainText = element.dataset.plainText || element.innerText;
    const listener = (e) => {
        e.preventDefault();
        e.clipboardData.setData('text/html', element.innerHTML);
        e.clipboardData.setData('text/plain', plainText);
    };
    document.addEventListener('copy', listener);
    try {
        document.execCommand('copy');
        const feedback = document.getElementById('copy-feedback');
        if (feedback) {
            feedback.classList.remove('opacity-0');
            setTimeout(() => feedback.classList.add('opacity-0'), 2000);
        }
    } catch (e) {
        console.error('Lỗi khi sao chép:', e);
        showMessage('Sao chép thất bại.', 'error');
    } finally {
        document.removeEventListener('copy', listener);
    }
}

function cleanSupplierName(name) {
    if (!name) return '';
    return name.replace(/^(US_|CAN_|\(US\)|\(CAN\))/i, '').trim();
}

async function findSupplierName(suid) {
    if (!suid) {
        console.log('⚠️ findSupplierName: No SUID provided');
        return null;
    }

    console.log('🔍 findSupplierName: Searching for SUID:', suid);
    let parentSuid = suid; // Assume the provided suid is the parent by default

    try {
        // Step 1: ALWAYS check the 'children' table first.
        const { data: childData, error: childError } = await supabaseClient
            .from('children')
            .select('parentSuid')
            .eq('suchildid', suid)
            .maybeSingle();

        // If a child record is found, use its parentSuid.
        // Ignore errors from children table (table might not exist or no matching record)
        if (!childError && childData) {
            parentSuid = childData.parentSuid;
            console.log('✓ Found parent SUID:', parentSuid);
        } else if (childError) {
            console.log('ℹ️ No child record found (this is normal):', childError.message);
        }
        // Silently ignore 406 errors or PGRST116 (no rows found) from children table

        // Step 2: Now, use the determined parentSuid to find the supplier name.
        console.log('🔍 Looking up supplier name for SUID:', parentSuid);
        const { data: supplierData, error: supplierError } = await supabaseClient
            .from('suppliers')
            .select('suname')
            .eq('suid', parentSuid)
            .maybeSingle();

        if (supplierError && supplierError.code !== 'PGRST116') { // Ignore "exact one row" error if no parent found
            console.error('❌ Error fetching supplier name for suid:', parentSuid, supplierError);
            return null;
        }

        if (supplierData) {
            const cleanedName = cleanSupplierName(supplierData.suname);
            console.log('✅ Found supplier name:', cleanedName);
            return cleanedName;
        } else {
            console.log('⚠️ No supplier found for SUID:', parentSuid);
            return null;
        }

    } catch (error) {
        // Silently handle errors - this is not critical functionality
        return null;
    }
}

// --- Workflow Modals ---
function _openModal(modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.modal-content').classList.remove('scale-95');
    }, 10);

    // Add click-outside-to-close functionality
    const handleOutsideClick = (e) => {
        if (e.target === modal) {
            _closeModal(modal);
            modal.removeEventListener('click', handleOutsideClick);
        }
    };
    modal.addEventListener('click', handleOutsideClick);
};

function _closeModal(modal) {
    modal.classList.add('opacity-0');
    modal.querySelector('.modal-content').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

// Follow-up guide modal function
function openFollowUpGuideModal(guideData) {
    return new Promise(resolve => {
        const modal = document.getElementById('follow-up-guide-modal');
        const output = document.getElementById('follow-up-guide-output');

        output.innerHTML = '';
        guideData.forEach(step => {
            output.innerHTML += `
                        <div class="p-3 rounded-lg border border-border bg-section-secondary">
                            <h3 class="font-bold text-lg text-main">${step.title}</h3>
                            <div class="pl-4 text-sm whitespace-pre-wrap mt-2 text-secondary">
                                ${(step.action || 'N/A').replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-accent hover:underline">$1</a>')}
                            </div>
                        </div>
                    `;
        });

        _openModal(modal);
        document.getElementById('close-follow-up-guide-modal-btn').onclick = () => {
            _closeModal(modal);
            resolve();
        };
    });
}

// Carrier email modal function - Updated to match adminview logic
async function openCarrierEmailModal(template, isBeforeTemplate = false) {
    return new Promise(async (resolve) => {
        const modal = document.getElementById('carrier-email-modal');
        const carrierSelect = document.getElementById('carrier-name');
        const carrierEmailInput = document.getElementById('carrier-email-address');
        const ticketInput = document.getElementById('carrier-ticket');
        const poInput = document.getElementById('carrier-po');
        const subjectOutput = document.getElementById('carrier-email-subject-output');
        const bolNamingOutput = document.getElementById('bol-naming-output');
        const bodyOutput = document.getElementById('carrier-email-body-output');
        const continueBtn = document.getElementById('continue-to-template-btn');
        const closeBtn = document.getElementById('close-carrier-modal-btn');

        // Populate carrier dropdown from database
        await populateCarrierDropdown();

        // Auto-fill ticket data
        if (popupCurrentTicket) {
            if (ticketInput) ticketInput.value = popupCurrentTicket.ticket || '';
            if (poInput) poInput.value = popupCurrentTicket.po || '';
        }

        // Update preview function
        const updateCarrierPreview = () => {
            const ticket = ticketInput?.value.trim() || '';
            const po = poInput?.value.trim() || '';
            const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
            const carrierName = selectedOption?.text || '';

            // Don't update preview if no carrier is selected (Issue #2 Fix)
            if (!carrierName || carrierName === '-- Select Carrier --') {
                return;
            }

            // Generate email subject with proper placeholder replacement
            const subjectTemplate = template.carrierEmailSubject || '{{ticket}} - Pickup Request PO {{PO}}';
            const emailSubject = subjectTemplate
                .replace(/\{\{ticket\}\}/g, ticket)
                .replace(/\{\{PO\}\}/g, po)
                .replace(/\{\{carrier\}\}/g, carrierName);

            // Generate BOL name with MM.DD.YYYY date format
            const bolTemplate = template.bolNamingMethod || 'today_{{PO}}_{{carrier_name}}';
            const today = new Date();
            const formattedDate = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}.${today.getFullYear()}`;
            const bolName = bolTemplate
                .replace(/today/g, formattedDate)
                .replace(/\{\{PO\}\}/g, po)
                .replace(/\{\{carrier_name\}\}/g, carrierName.replace(/\s+/g, '_'));

            // Generate email body using template content
            let emailBody = template.content || '';

            // Auto-fill greeting placeholder (Issue #1 Fix: Check if elements exist first)
            const agentNameEl = document.getElementById('viewer-agent-name');
            const manualSupplierNameEl = document.getElementById('viewer-manual-supplier-name');
            const agentName = agentNameEl?.value.trim() || '';
            const manualSupplierName = manualSupplierNameEl?.value.trim() || '';
            let greeting = '';
            if (agentName) {
                // Note: allSettings.X stores the full row { key, value: { value: 'text' } }
                const greetingTemplate = (typeof allSettings.greeting_person?.value?.value === 'string')
                    ? allSettings.greeting_person.value.value
                    : 'Hi {{name}},';
                greeting = greetingTemplate.replace('{{name}}', toTitleCase(agentName));
            } else if (manualSupplierName) {
                const greetingTemplate = (typeof allSettings.greeting_team?.value?.value === 'string')
                    ? allSettings.greeting_team.value.value
                    : 'Hi {{name}} Team,';
                greeting = greetingTemplate.replace('{{name}}', cleanSupplierName(manualSupplierName));
            }

            // Auto-fill signature placeholder
            const assigneeAccount = popupCurrentTicket?.assignee_account;
            const assigneeName = allAgentsMap.get(assigneeAccount);
            const signature = allSignatures.find(s => s.name === assigneeName) || allSignatures.find(s => s.isDefault) || allSignatures[0];
            let signatureText = signature ? `${signature.name}\n${signature.title || ''}\n${signature.department || ''}`.trim() : '';

            // Replace all placeholders in email body
            emailBody = emailBody
                .replace(/\{\{ticket\}\}/g, ticket)
                .replace(/\{\{PO\}\}/g, po)
                .replace(/\{\{carrier\}\}/g, carrierName)
                .replace(/\{\{greeting\}\}/g, greeting)
                .replace(/\{\{signature\}\}/g, signatureText);

            // Update outputs
            subjectOutput.textContent = emailSubject;
            bolNamingOutput.textContent = bolName;
            if (bodyOutput) {
                bodyOutput.innerHTML = emailBody.replace(/\n/g, '<br>');
                bodyOutput.dataset.plainText = emailBody;
            }
        };

        // Handle carrier selection
        carrierSelect.onchange = () => {
            const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
            const email = selectedOption?.dataset.email || '';
            carrierEmailInput.value = email;
            updateCarrierPreview();
        };

        // Add input event listeners for real-time updates
        if (ticketInput) ticketInput.addEventListener('input', updateCarrierPreview);
        if (poInput) poInput.addEventListener('input', updateCarrierPreview);

        // Copy button handlers
        document.getElementById('copy-carrier-email-btn').onclick = () => copyToClipboard(carrierEmailInput.value, 'carrier-copy-feedback');
        document.getElementById('copy-carrier-subject-btn').onclick = () => copyToClipboard(subjectOutput.textContent, 'carrier-copy-feedback');
        document.getElementById('copy-bol-naming-btn').onclick = () => copyToClipboard(bolNamingOutput.textContent, 'carrier-copy-feedback');
        if (document.getElementById('copy-carrier-body-btn')) {
            document.getElementById('copy-carrier-body-btn').onclick = () => copyToClipboard(bodyOutput?.dataset.plainText || '', 'carrier-copy-feedback');
        }

        // IMPORTANT: Templates with emailCarrier=true are DUAL-PURPOSE templates
        // - template.content contains the SUPPLIER email content
        // - The carrier email modal shows this supplier content for reference
        // - The modal also provides carrier-specific fields (subject, BOL naming)
        //
        // Therefore, we should ALWAYS show the email body preview (template.content)
        // regardless of whether the modal opens before or after the template viewer.
        // The only difference is whether we clear it first if no carrier is selected.

        // Clear outputs initially (will be populated when carrier is selected)
        subjectOutput.textContent = '';
        bolNamingOutput.textContent = '';
        if (bodyOutput) {
            bodyOutput.innerHTML = '';
            bodyOutput.dataset.plainText = '';
        }

        // Note: Preview will update when user selects carrier or modifies fields
        // The updateCarrierPreview() function will populate the email body with template.content

        // Show/hide buttons based on context
        if (isBeforeTemplate) {
            continueBtn.classList.remove('hidden');
            closeBtn.textContent = 'Hủy';
        } else {
            continueBtn.classList.add('hidden');
            closeBtn.textContent = 'Đóng';
        }

        _openModal(modal);

        // Handle close button
        closeBtn.onclick = () => {
            _closeModal(modal);
            resolve();
        };

        // Handle continue button (only shown when isBeforeTemplate = true)
        continueBtn.onclick = () => {
            _closeModal(modal);
            resolve('continue');
        };
    });
}

// Populate carrier dropdown from database (matching adminview logic)
async function populateCarrierDropdown() {
    const carrierSelect = document.getElementById('carrier-name');
    carrierSelect.innerHTML = '<option value="">-- Select Carrier --</option>';

    try {
        const { data: placeholders, error } = await supabaseClient.from('placeholders').select('*');
        if (error) throw error;

        const carrierPlaceholders = placeholders.filter(p => p.key === 'carrier_email');
        if (carrierPlaceholders.length > 0 && carrierPlaceholders[0].options) {
            carrierPlaceholders[0].options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.text || option.value;
                optionElement.dataset.email = option.value; // Store email in data attribute
                carrierSelect.appendChild(optionElement);
            });
        }
    } catch (error) {
        console.error('Error loading carrier options:', error);
        // Fallback to hardcoded options if database fails
        carrierSelect.innerHTML += `
                    <option value="carrier_mail@fedex.com" data-email="carrier_mail@fedex.com">FedEx</option>
                    <option value="carrier_mail@ups.com" data-email="carrier_mail@ups.com">UPS</option>
                    <option value="carrier_mail@dhl.com" data-email="carrier_mail@dhl.com">DHL</option>
                `;
    }
}

// WDN Supplier Email Modal
function openWdnSupplierEmailModal(template) {
    return new Promise(resolve => {
        const modal = document.getElementById('wdn-supplier-email-modal');
        if (!modal) {
            resolve();
            return;
        }

        // Set title
        const titleEl = document.getElementById('wdn-modal-title');
        if (titleEl) titleEl.textContent = `📧 ${template.name}`;

        // Show template description at the top of the modal if available
        const descriptionSection = document.getElementById('wdn-template-description-section');
        const descriptionText = document.getElementById('wdn-template-description-text');
        if (descriptionSection && descriptionText) {
            const templateDescription = template.description?.trim();
            if (templateDescription) {
                descriptionText.innerHTML = templateDescription.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-accent hover:underline">$1</a>');
                descriptionSection.classList.remove('hidden');
            } else {
                descriptionSection.classList.add('hidden');
            }
        }

        // Get output fields
        const subjectOutput = document.getElementById('wdn-modal-subject-output');
        const ccOutput = document.getElementById('wdn-modal-cc-output');
        const ccSection = document.getElementById('wdn-cc-section');
        const bodyOutput = document.getElementById('wdn-modal-body-output');
        const noteOutput = document.getElementById('wdn-modal-note-output');
        const noteSection = document.getElementById('wdn-note-section');
        const placeholderContainer = document.getElementById('wdn-placeholder-inputs');
        const emailFromInput = document.getElementById('wdn-modal-email-from');

        // Clear all output fields to prevent stale data from previous template
        if (subjectOutput) {
            subjectOutput.textContent = '';
            subjectOutput.dataset.plainText = '';
        }
        if (ccOutput) {
            ccOutput.textContent = '';
            ccOutput.dataset.plainText = '';
        }
        if (bodyOutput) {
            bodyOutput.innerHTML = '';
            bodyOutput.dataset.plainText = '';
        }
        if (noteOutput) {
            noteOutput.innerHTML = '';
            noteOutput.dataset.plainText = '';
        }

        // Pre-fill email from
        if (emailFromInput) emailFromInput.value = template.emailFrom || '';

        // Extract all placeholders from template content, subject, and internal note
        const allText = [
            template.content || '',
            template.customerSubject || '',
            template.internalComment || ''
        ].join(' ');

        // Find all {{placeholder}} patterns
        const placeholderRegex = /\{\{([^}]+)\}\}/g;
        const foundPlaceholders = new Set();
        let match;
        while ((match = placeholderRegex.exec(allText)) !== null) {
            foundPlaceholders.add(match[1]);
        }

        // Create placeholder values object to store user inputs
        const placeholderValues = {};

        // Extract team name from greeting text for Supplier_Name placeholder
        // Look for patterns like "Dear Logistics Team," or "Kính gửi Customer Service Team,"
        let extractedTeamName = '';
        const templateContent = template.content || '';
        const greetingPatterns = [
            /Dear\s+([^,\n]+?)(?:,|\n)/i,                    // "Dear Logistics Team,"
            /Kính gửi\s+([^,\n]+?)(?:,|\n)/i,               // "Kính gửi Team Logistics,"
            /Hi\s+([^,\n]+?)(?:,|\n)/i,                      // "Hi Supplier Team,"
            /Hello\s+([^,\n]+?)(?:,|\n)/i                    // "Hello Support Team,"
        ];

        for (const pattern of greetingPatterns) {
            const greetingMatch = templateContent.match(pattern);
            if (greetingMatch && greetingMatch[1]) {
                extractedTeamName = greetingMatch[1].trim();
                // Remove {{Supplier_Name}} or similar placeholder if it's part of the greeting
                extractedTeamName = extractedTeamName.replace(/\{\{[^}]+\}\}/g, '').trim();
                if (extractedTeamName) break;
            }
        }

        // Auto-fill known placeholders from ticket data
        const autoFillMap = {
            'Order_Number': popupCurrentTicket?.order_number || '',
            'Brand': popupCurrentTicket?.brand || '',
            'ticket': popupCurrentTicket?.ticket || '',
            'Customer_Name': popupCurrentTicket?.customer || '',
            'PO': popupCurrentTicket?.po || '',
            'Supplier_Name': extractedTeamName  // Pre-fill from greeting
        };

        // Initialize values
        foundPlaceholders.forEach(ph => {
            placeholderValues[ph] = autoFillMap[ph] || '';
        });

        // Generate dynamic input fields (exclude Supplier_Name as it has its own input)
        placeholderContainer.innerHTML = '';
        foundPlaceholders.forEach(placeholder => {
            // Skip Supplier_Name - it has its own dedicated input field
            if (placeholder === 'Supplier_Name') return;

            const isAutoFilled = autoFillMap[placeholder] !== undefined && autoFillMap[placeholder] !== '';
            const div = document.createElement('div');
            div.innerHTML = `
                        <label class="block text-sm font-medium">${placeholder.replace(/_/g, ' ')}</label>
                        <input type="text"
                               data-placeholder="${placeholder}"
                               class="wdn-ph-input mt-1 w-full p-2 border border-secondary rounded-lg bg-button ${isAutoFilled ? 'text-green-400' : ''}"
                               placeholder="Enter ${placeholder.replace(/_/g, ' ')}"
                               value="${placeholderValues[placeholder] || ''}">
                    `;
            placeholderContainer.appendChild(div);
        });

        // Get manual supplier name input and pre-fill with extracted team name
        // Clone and replace to remove old event listeners
        const oldManualSupplierInput = document.getElementById('wdn-manual-supplier-name');
        let manualSupplierInput = oldManualSupplierInput;
        if (oldManualSupplierInput) {
            const newInput = oldManualSupplierInput.cloneNode(true);
            oldManualSupplierInput.parentNode.replaceChild(newInput, oldManualSupplierInput);
            manualSupplierInput = newInput;
            manualSupplierInput.value = extractedTeamName;
        }

        // Clone and replace SUID search input to remove old event listeners
        const oldSuidInput = document.getElementById('wdn-modal-suid-search');
        if (oldSuidInput) {
            const newSuidInput = oldSuidInput.cloneNode(true);
            oldSuidInput.parentNode.replaceChild(newSuidInput, oldSuidInput);
        }

        // Function to replace placeholders with current values
        const replacePlaceholders = (text) => {
            if (!text) return '';
            let result = text;
            // Get latest values from inputs
            placeholderContainer.querySelectorAll('.wdn-ph-input').forEach(input => {
                const ph = input.dataset.placeholder;
                const val = input.value || `{{${ph}}}`;
                result = result.replace(new RegExp(`\\{\\{${ph}\\}\\}`, 'gi'), val);
            });
            // Also replace Supplier_Name from the manual input
            const supplierName = manualSupplierInput?.value || '';
            result = result.replace(/\{\{Supplier_Name\}\}/gi, supplierName || '{{Supplier_Name}}');
            return result;
        };

        // Update preview function - compose greeting + body + footer + closing + signature
        const updatePreview = () => {
            // Update subject
            const subject = replacePlaceholders(template.customerSubject || '');
            if (subjectOutput) {
                subjectOutput.textContent = subject;
                subjectOutput.dataset.plainText = subject;
            }

            // Update CC (show/hide section based on whether CC exists)
            const cc = template.cc || '';
            if (ccSection) {
                ccSection.classList.toggle('hidden', !cc);
            }
            if (ccOutput) {
                ccOutput.textContent = cc;
                ccOutput.dataset.plainText = cc;
            }

            // Compose full email body: greeting + content + footer + closing + signature
            let content = replacePlaceholders(template.content || '');

            // Get supplier name for greeting
            const supplierName = manualSupplierInput?.value?.trim() || '';

            // Get greeting template from settings
            const greetingTeamTpl = (typeof allSettings.greeting_team?.value?.value === 'string')
                ? allSettings.greeting_team.value.value
                : 'Hi {{name}} Team,';

            // Build greeting
            let greeting = '';
            if (template.needGreeting !== false && supplierName) {
                greeting = greetingTeamTpl.replace('{{name}}', supplierName);
            }

            // Handle {{greeting}} placeholder in content
            if (supplierName) {
                const greetingReplacement = greetingTeamTpl.replace('{{name}}', supplierName);
                content = content.replace(/\{\{greeting\}\}/gi, greetingReplacement);
            } else {
                content = content.replace(/\{\{greeting\}\}/gi, '');
            }

            // Get signature
            const assigneeAccount = popupCurrentTicket?.assignee_account;
            const assigneeName = allAgentsMap.get(assigneeAccount);
            const signature = allSignatures.find(s => s.name === assigneeName) || allSignatures.find(s => s.isDefault) || allSignatures[0];
            let signatureText = signature ? `${signature.name}\n${signature.title || ''}\n${signature.department || ''}`.trim() : '';

            // Replace {{signature}} placeholder in content
            content = content.replace(/\{\{signature\}\}/g, signatureText);

            // Get footer text
            const footerText = (template.includeFooter && typeof allSettings.footer_text?.value?.value === 'string')
                ? allSettings.footer_text.value.value
                : '';
            const footerPart = (template.includeFooter && footerText) ? `\n\n${footerText}` : '';

            // Random closing
            const closings = ['Best regards', 'Warm regards', 'Kind regards', 'Regards'];
            const randomClosing = closings[Math.floor(Math.random() * closings.length)];

            // Assemble final email body
            const finalBody = `${greeting ? greeting + '\n\n' : ''}${content.trim()}${footerPart}\n\n${randomClosing},\n${signatureText}`;

            if (bodyOutput) {
                bodyOutput.innerHTML = finalBody.replace(/\n/g, '<br>');
                bodyOutput.dataset.plainText = finalBody;
            }

            // Update internal note (show/hide section based on whether note exists)
            const note = replacePlaceholders(template.internalComment || '');
            if (noteSection) {
                noteSection.classList.toggle('hidden', !template.internalComment);
            }
            if (noteOutput) {
                noteOutput.innerHTML = note.replace(/\n/g, '<br>');
                noteOutput.dataset.plainText = note;
            }
        };

        // Add input listeners for real-time updates
        placeholderContainer.querySelectorAll('.wdn-ph-input').forEach(input => {
            input.addEventListener('input', updatePreview);
        });

        // Add listener for manual supplier name input
        if (manualSupplierInput) {
            manualSupplierInput.addEventListener('input', updatePreview);
        }

        // SUID Search functionality
        const suidSearchInput = document.getElementById('wdn-modal-suid-search');
        const suidLoading = document.getElementById('wdn-suid-loading');
        const suidSuccess = document.getElementById('wdn-suid-success');
        const suidError = document.getElementById('wdn-suid-error');
        const suidStatus = document.getElementById('wdn-suid-status');

        // Pre-fill SUID from ticket data if available
        if (suidSearchInput && popupCurrentTicket?.suid) {
            console.log('🔍 Pre-filling SUID:', popupCurrentTicket.suid);
            suidSearchInput.value = popupCurrentTicket.suid;
        } else {
            console.log('⚠️ No SUID found in ticket data:', popupCurrentTicket);
        }

        // Reset SUID status indicators
        const resetSuidStatus = () => {
            suidLoading?.classList.add('hidden');
            suidSuccess?.classList.add('hidden');
            suidError?.classList.add('hidden');
        };

        // SUID search with debounce
        let suidSearchTimeout = null;
        if (suidSearchInput) {
            suidSearchInput.addEventListener('input', (e) => {
                const suid = e.target.value.trim();

                // Clear previous timeout
                if (suidSearchTimeout) clearTimeout(suidSearchTimeout);

                if (!suid) {
                    resetSuidStatus();
                    if (suidStatus) suidStatus.textContent = 'Enter SUID to auto-fill supplier name';
                    return;
                }

                // Show loading
                resetSuidStatus();
                suidLoading?.classList.remove('hidden');
                if (suidStatus) suidStatus.textContent = 'Searching...';

                // Debounce the search
                suidSearchTimeout = setTimeout(async () => {
                    try {
                        const supplierName = await findSupplierName(suid);

                        resetSuidStatus();

                        if (supplierName) {
                            // Success - update manual supplier name input
                            suidSuccess?.classList.remove('hidden');
                            if (suidStatus) suidStatus.textContent = `Found: ${supplierName}`;

                            // Update the manual supplier name input field
                            if (manualSupplierInput) {
                                manualSupplierInput.value = supplierName;
                                manualSupplierInput.classList.add('text-green-400');
                                updatePreview();
                            }
                        } else {
                            // Not found
                            suidError?.classList.remove('hidden');
                            if (suidStatus) suidStatus.textContent = 'Supplier not found for this SUID';
                        }
                    } catch (error) {
                        resetSuidStatus();
                        suidError?.classList.remove('hidden');
                        if (suidStatus) suidStatus.textContent = 'Error searching supplier';
                    }
                }, 500); // 500ms debounce
            });

            // Trigger initial search if SUID is pre-filled
            if (suidSearchInput.value.trim()) {
                suidSearchInput.dispatchEvent(new Event('input'));
            }
        }

        // Initial preview update
        updatePreview();

        // Helper for copy feedback
        const showCopyFeedback = () => {
            const feedback = document.getElementById('wdn-modal-copy-feedback');
            if (feedback) {
                feedback.classList.remove('opacity-0');
                setTimeout(() => feedback.classList.add('opacity-0'), 1500);
            }
        };

        // Helper function to show WDN follow-up actions modal
        const showWdnFollowUpActions = () => {
            return new Promise(resolveFollowUp => {
                const followUpGuide = template.followUpGuide;

                // Only show follow-up modal if we have followUpGuide steps
                // (Template description is now shown at the top of WDN modal instead)
                if (!followUpGuide || followUpGuide.length === 0) {
                    resolveFollowUp();
                    return;
                }

                const followUpModal = document.getElementById('wdn-followup-modal');
                const actionsList = document.getElementById('wdn-followup-actions-list');

                if (!followUpModal || !actionsList) {
                    resolveFollowUp();
                    return;
                }

                // Populate follow-up actions
                actionsList.innerHTML = '';

                // Show follow-up guide steps
                followUpGuide.forEach((step, index) => {
                    const actionItem = document.createElement('div');
                    actionItem.className = 'p-3 bg-purple-900/20 border border-purple-500/50 rounded-lg';
                    actionItem.innerHTML = `
                                <div class="flex items-start gap-3">
                                    <span class="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">${index + 1}</span>
                                    <div class="flex-grow">
                                        <h4 class="font-semibold text-purple-300">${step.title || 'Action'}</h4>
                                        <p class="text-sm text-secondary mt-1 whitespace-pre-wrap">${(step.action || step.description || 'No description').replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-accent hover:underline">$1</a>')}</p>
                                    </div>
                                </div>
                            `;
                    actionsList.appendChild(actionItem);
                });

                // Show the follow-up modal
                _openModal(followUpModal);

                // Handle understood button
                document.getElementById('wdn-followup-understood-btn').onclick = () => {
                    _closeModal(followUpModal);
                    resolveFollowUp();
                };
            });
        };

        // Check if we have follow-up content to show (only followUpGuide now)
        const hasFollowUpContent = template.followUpGuide?.length > 0;

        // Track if follow-up was already shown
        let followUpShown = false;

        // Setup copy buttons
        document.getElementById('copy-wdn-subject-btn').onclick = () => {
            navigator.clipboard.writeText(subjectOutput?.dataset?.plainText || '').then(showCopyFeedback);
        };
        document.getElementById('copy-wdn-cc-btn').onclick = () => {
            navigator.clipboard.writeText(ccOutput?.dataset?.plainText || '').then(showCopyFeedback);
        };
        document.getElementById('copy-wdn-body-btn').onclick = () => {
            navigator.clipboard.writeText(bodyOutput?.dataset?.plainText || '').then(showCopyFeedback);
        };
        document.getElementById('copy-wdn-note-btn').onclick = async () => {
            await navigator.clipboard.writeText(noteOutput?.dataset?.plainText || '');
            showCopyFeedback();
            // Show follow-up actions after copying internal note
            if (!followUpShown && hasFollowUpContent) {
                followUpShown = true;
                await showWdnFollowUpActions();
            }
        };

        // Handler function to close modal with follow-up check
        const handleCloseModal = async () => {
            // Show follow-up actions before closing if not already shown
            if (!followUpShown && hasFollowUpContent) {
                followUpShown = true;
                await showWdnFollowUpActions();
            }
            _closeModal(modal);
            resolve();
        };

        _openModal(modal);

        // Close button click
        document.getElementById('close-wdn-modal-btn').onclick = handleCloseModal;

        // Backdrop click (clicking outside the modal content)
        modal.onclick = async (e) => {
            // Only trigger if clicking directly on the backdrop, not on modal content
            if (e.target === modal) {
                await handleCloseModal();
            }
        };
    });
}

function openCustomerEmailModal(template) {
    return new Promise(resolve => {
        const modal = document.getElementById('customer-email-modal');
        const emailInput = document.getElementById('customer-email');
        const nameInput = document.getElementById('customer-name');
        const orderInput = document.getElementById('customer-order');
        const brandSelect = document.getElementById('customer-brand');

        emailInput.value = popupCurrentTicket.customer_contact || '';
        nameInput.value = (popupCurrentTicket.customer || '').split(' ')[0];
        orderInput.value = popupCurrentTicket.order_number || '';

        const updatePreview = () => {
            let subject = replacePlaceholdersInText(template.customerSubject || '', true);
            let body = replacePlaceholdersInText(template.customerBody || '', true);

            const subjectOutput = document.getElementById('customer-email-subject-output');
            const bodyOutput = document.getElementById('customer-email-body-output');
            const emailOutput = document.getElementById('customer-email-address-output');

            subjectOutput.textContent = subject;
            subjectOutput.dataset.plainText = subject;

            bodyOutput.innerHTML = body.replace(/\n/g, '<br>');
            bodyOutput.dataset.plainText = body;

            emailOutput.textContent = emailInput.value;
            emailOutput.dataset.plainText = emailInput.value;
        };

        modal.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updatePreview));
        updatePreview();

        _openModal(modal);
        document.getElementById('close-customer-modal-btn').onclick = () => { _closeModal(modal); resolve(); };
    });
}
function openLabelReminderModal(label) {
    return new Promise(resolve => {
        const modal = document.getElementById('label-reminder-modal');
        document.getElementById('label-reminder-text').textContent = `Đừng quên thêm nhãn "${label}" vào ticket!`;
        _openModal(modal);
        document.getElementById('close-label-reminder-modal-btn').onclick = () => { _closeModal(modal); resolve(); };
    });
}

function copyPlainTextToClipboard(text, feedbackElement) {
    navigator.clipboard.writeText(text).then(() => {
        if (feedbackElement) {
            feedbackElement.classList.remove('opacity-0');
            setTimeout(() => feedbackElement.classList.add('opacity-0'), 2000);
        }
    });
}


// Modal Controls
function openTemplateSelectionModal() {
    templateSelectionModal.classList.remove('hidden');
    setTimeout(() => templateSelectionModal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0'), 10);
}
function closeTemplateSelectionModalHandler() {
    const content = templateSelectionModal.querySelector('.modal-content');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => templateSelectionModal.classList.add('hidden'), 300);
}

// New functions for enhanced functionality
function copyToClipboard(text, feedbackId = 'copy-feedback') {
    navigator.clipboard.writeText(text).then(() => {
        const feedback = document.getElementById(feedbackId);
        if (feedback) {
            feedback.classList.remove('opacity-0');
            setTimeout(() => feedback.classList.add('opacity-0'), 2000);
        }
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        const feedback = document.getElementById(feedbackId);
        if (feedback) {
            feedback.classList.remove('opacity-0');
            setTimeout(() => feedback.classList.add('opacity-0'), 2000);
        }
    });
}

async function sendToLeader(ticketId) {
    try {
        // First, check if ticket can be sent to leader
        const { data: ticket, error: fetchError } = await supabaseClient
            .from('tickets')
            .select('need_leader_support, time_start, ticket_status_id, ticket')
            .eq('id', ticketId)
            .single();

        if (fetchError) throw fetchError;

        // Validate ticket state
        if (ticket.need_leader_support) {
            showMessage('Ticket đã được gửi đến leader rồi', 'warning');
            return;
        }

        if (ticket.time_start) {
            showMessage('Không thể gửi ticket đã bắt đầu đến leader', 'warning');
            return;
        }

        if (ticket.ticket_status_id) {
            showMessage('Không thể gửi ticket đã có trạng thái đến leader', 'warning');
            return;
        }

        // Update ticket to send to leader
        const { error } = await supabaseClient
            .from('tickets')
            .update({ need_leader_support: true })
            .eq('id', ticketId);

        if (error) throw error;

        showMessage('Ticket đã được gửi đến leader', 'success');

        // Remove the row from current view
        const row = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
        if (row) {
            const poGroup = row.dataset.poGroup;
            document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(r => r.remove());
        }
    } catch (error) {
        console.error('Error sending to leader:', error);
        showMessage('Không thể gửi ticket đến leader', 'error');
    }
}

// Optimized MOS request function with better UX and error handling
async function requestMos(ticketId) {
    // Show enhanced popup for request details
    const requestDetails = prompt('Please provide details for your MoS request:\n(This will help leaders understand your request better)');

    // If user cancels, don't proceed
    if (requestDetails === null) {
        return;
    }

    // Validate input
    if (!requestDetails.trim()) {
        showMessage('Please provide details for your MoS request', 'error');
        return;
    }

    // Show loading state
    const button = document.querySelector(`button[onclick="requestMos(${ticketId})"]`);
    const originalText = button?.innerHTML;
    if (button) {
        button.innerHTML = '⏳ Sending...';
        button.disabled = true;
    }

    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

        // Batch operations for better performance
        const operations = [];

        // Update ticket needMos status to 'request'
        operations.push(
            supabaseClient
                .from('tickets')
                .update({ needMos: 'request' })
                .eq('id', ticketId)
        );

        // Create MoS request record with description
        operations.push(
            supabaseClient
                .from('mos_requests')
                .insert({
                    ticket_id: ticketId,
                    requester_id: currentUser.stt,
                    status: 'request',
                    description: requestDetails.trim()
                })
        );

        // Execute operations in parallel
        const [ticketResult, mosResult] = await Promise.all(operations);

        if (ticketResult.error) throw ticketResult.error;
        if (mosResult.error) throw mosResult.error;

        // Update cache
        mosRequestsCache.set(ticketId, {
            description: requestDetails.trim(),
            status: 'request',
            created_at: new Date().toISOString(),
            cached_at: Date.now()
        });

        // Create notification for leaders/keys (async, don't wait)
        createMosNotifications(ticketId, currentUser.stt);

        showMessage('🚢 MoS request sent successfully!', 'success');

        // Remove the row from current view with animation
        const row = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
        if (row) {
            row.style.transition = 'opacity 0.3s ease-out';
            row.style.opacity = '0';
            setTimeout(() => {
                const poGroup = row.dataset.poGroup;
                document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(r => r.remove());
            }, 300);
        }

    } catch (error) {
        console.error('Error requesting MoS:', error);
        showMessage(`Failed to send MoS request: ${error.message}`, 'error');
    } finally {
        // Restore button state
        if (button) {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }
}

// Separate function for creating notifications (async)
async function createMosNotifications(ticketId, requesterId) {
    try {
        const { data: leaders } = await supabaseClient
            .from('vcn_agent')
            .select('stt')
            .in('level', ['leader', 'key']);

        if (leaders && leaders.length > 0) {
            const notifications = leaders.map(leader => ({
                recipient_id: leader.stt,
                message: `New MoS request for ticket ${ticketsMap.get(ticketId)?.ticket || ticketId}`,
                type: 'mos_request',
                related_ticket_id: ticketId
            }));

            await supabaseClient.from('notifications').insert(notifications);
        }
    } catch (error) {
        console.error('Error creating MoS notifications:', error);
        // Don't show error to user as this is background operation
    }
}

// Optimized MOS approval function with better performance and UX
async function approveMos(ticketId) {
    // Show loading state
    const button = document.querySelector(`button[onclick="approveMos(${ticketId})"]`);
    const originalText = button?.innerHTML;
    if (button) {
        button.innerHTML = '⏳ Approving...';
        button.disabled = true;
    }

    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const responseDate = new Date().toISOString();

        // Batch operations for better performance
        const operations = [];

        // Update ticket needMos status to 'approved'
        operations.push(
            supabaseClient
                .from('tickets')
                .update({ needMos: 'approved' })
                .eq('id', ticketId)
        );

        // Update MoS request record
        operations.push(
            supabaseClient
                .from('mos_requests')
                .update({
                    status: 'approved',
                    responder_id: currentUser.stt,
                    response_date: responseDate
                })
                .eq('ticket_id', ticketId)
                .eq('status', 'request')
        );

        // Execute operations in parallel
        const [ticketResult, mosResult] = await Promise.all(operations);

        if (ticketResult.error) throw ticketResult.error;
        if (mosResult.error) throw mosResult.error;

        // Update cache
        const cachedRequest = mosRequestsCache.get(ticketId);
        if (cachedRequest) {
            mosRequestsCache.set(ticketId, {
                ...cachedRequest,
                status: 'approved',
                responder_id: currentUser.stt,
                response_date: responseDate,
                cached_at: Date.now()
            });
        }

        // Create notification for requester (async, don't wait)
        createMosResponseNotification(ticketId, 'approved');

        showMessage('✅ MoS request approved successfully!', 'success');

        // Remove the row from current view with animation
        const row = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
        if (row) {
            row.style.transition = 'opacity 0.3s ease-out';
            row.style.opacity = '0';
            setTimeout(() => {
                const poGroup = row.dataset.poGroup;
                document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(r => r.remove());
            }, 300);
        }

    } catch (error) {
        console.error('Error approving MoS:', error);
        showMessage(`Failed to approve MoS request: ${error.message}`, 'error');
    } finally {
        // Restore button state
        if (button) {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }
}

// Optimized MOS rejection function with better performance and UX
async function rejectMos(ticketId) {
    // Show loading state
    const button = document.querySelector(`button[onclick="rejectMos(${ticketId})"]`);
    const originalText = button?.innerHTML;
    if (button) {
        button.innerHTML = '⏳ Rejecting...';
        button.disabled = true;
    }

    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const responseDate = new Date().toISOString();

        // Batch operations for better performance
        const operations = [];

        // Update ticket needMos status to 'rejected'
        operations.push(
            supabaseClient
                .from('tickets')
                .update({ needMos: 'rejected' })
                .eq('id', ticketId)
        );

        // Update MoS request record
        operations.push(
            supabaseClient
                .from('mos_requests')
                .update({
                    status: 'rejected',
                    responder_id: currentUser.stt,
                    response_date: responseDate
                })
                .eq('ticket_id', ticketId)
                .eq('status', 'request')
        );

        // Execute operations in parallel
        const [ticketResult, mosResult] = await Promise.all(operations);

        if (ticketResult.error) throw ticketResult.error;
        if (mosResult.error) throw mosResult.error;

        // Update cache
        const cachedRequest = mosRequestsCache.get(ticketId);
        if (cachedRequest) {
            mosRequestsCache.set(ticketId, {
                ...cachedRequest,
                status: 'rejected',
                responder_id: currentUser.stt,
                response_date: responseDate,
                cached_at: Date.now()
            });
        }

        // Create notification for requester (async, don't wait)
        createMosResponseNotification(ticketId, 'rejected');

        showMessage('❌ MoS request rejected', 'success');

        // Remove the row from current view with animation
        const row = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
        if (row) {
            row.style.transition = 'opacity 0.3s ease-out';
            row.style.opacity = '0';
            setTimeout(() => {
                const poGroup = row.dataset.poGroup;
                document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(r => r.remove());
            }, 300);
        }

    } catch (error) {
        console.error('Error rejecting MoS:', error);
        showMessage(`Failed to reject MoS request: ${error.message}`, 'error');
    } finally {
        // Restore button state
        if (button) {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }
}

// Separate function for creating response notifications (async)
async function createMosResponseNotification(ticketId, action) {
    try {
        // Get requester info from cache first, then database
        let requesterId = null;
        const cachedRequest = mosRequestsCache.get(ticketId);

        if (cachedRequest && cachedRequest.requester_id) {
            requesterId = cachedRequest.requester_id;
        } else {
            const { data: mosRequest } = await supabaseClient
                .from('mos_requests')
                .select('requester_id')
                .eq('ticket_id', ticketId)
                .eq('status', action)
                .single();

            requesterId = mosRequest?.requester_id;
        }

        if (requesterId) {
            const message = action === 'approved'
                ? `Your MoS request for ticket ${ticketsMap.get(ticketId)?.ticket || ticketId} has been approved ✅`
                : `Your MoS request for ticket ${ticketsMap.get(ticketId)?.ticket || ticketId} has been rejected ❌`;

            await supabaseClient.from('notifications').insert({
                recipient_id: requesterId,
                message: message,
                type: `mos_${action}`,
                related_ticket_id: ticketId
            });
        }
    } catch (error) {
        console.error('Error creating MoS response notification:', error);
        // Don't show error to user as this is background operation
    }
}

async function handleEndTicket(ticketId) {
    const ticket = ticketsMap.get(ticketId);
    const statusSelect = document.querySelector(`select[data-action="status-change"][data-ticket-id="${ticketId}"]`);
    const selectedStatusId = statusSelect.value;

    if (!selectedStatusId) {
        showMessage('Vui lòng chọn trạng thái trước khi kết thúc', 'warning');
        return;
    }

    try {
        // Get agent team
        const { data: agentData, error: agentError } = await supabaseClient
            .from('agent')
            .select('team')
            .eq('agent_account', ticket.assignee_account)
            .single();

        if (agentError) throw agentError;

        // Get status name
        const status = ticketStatuses.find(s => s.id == selectedStatusId);
        if (!status) throw new Error('Status not found');

        // Get KPI ID from kpi_per_task table
        const { data: kpiData, error: kpiError } = await supabaseClient
            .from('kpi_per_task')
            .select('id, task_name')
            .eq('team', agentData.team)
            .eq('task_name', status.status_name)
            .single();

        if (kpiError) {
            console.warn('KPI not found for team/task combination');
        }

        // Check if this ticket was started in OT Mode
        const isOTTicket = otModeTickets.has(ticketId);

        // Update ticket with issue_type (KPI ID) and OT mode flag
        const updateData = {
            issue_type: kpiData ? kpiData.id : ticket.issue_type,
            ot_mode: isOTTicket  // Mark ticket for OT Tracker routing
        };

        const { error: updateError } = await supabaseClient
            .from('tickets')
            .update(updateData)
            .eq('id', ticketId);

        if (updateError) throw updateError;

        // Remove ticket from OT Mode tracking set if it was there
        if (isOTTicket) {
            otModeTickets.delete(ticketId);
            localStorage.setItem('otModeTickets', JSON.stringify([...otModeTickets]));
            console.log(`🔥 OT Mode ticket ${ticket.ticket} will be routed to OT Tracker`);
        }

        // Send ticket ID to Google Sheets tracker in background (don't wait)
        // The Apps Script will fetch data from tickets_export_v view (NA) or tickets_export_eu_v (EU)
        sendTicketToGoogleSheets(ticketId, agentData.team); // No await - runs in background

    } catch (error) {
        console.error('Error handling end ticket:', error);
        showMessage('Lỗi khi xử lý kết thúc ticket', 'error');
    }
}

// Enhanced queue system for Google Sheets requests with better error handling
const googleSheetsQueue = {
    queue: [],
    processing: false,
    retryAttempts: new Map(), // Track retry attempts per ticket
    teamMap: new Map(), // Track team per ticket
    maxRetries: 3,

    // Clear stuck queue (called on page load)
    clearQueue() {
        if (this.queue.length > 0) {
            console.warn(`⚠️ Clearing ${this.queue.length} stuck tickets from queue`);
            this.queue = [];
            this.retryAttempts.clear();
            this.teamMap.clear();
            this.processing = false;
        }
    },

    add(ticketId, team = 'NA') {
        // Don't add duplicates to queue
        if (this.queue.some(item => item.ticketId === ticketId)) {
            console.log(`📋 Ticket ${ticketId} already in queue, skipping duplicate`);
            return;
        }

        this.queue.push({ ticketId, team });
        this.teamMap.set(ticketId, team);
        console.log(`📋 Added ticket ${ticketId} (${team} team) to Google Sheets queue. Queue length: ${this.queue.length}`);
        this.processNext();
    },

    async processNext() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        const item = this.queue.shift();
        const ticketId = item.ticketId;
        const team = item.team;

        try {
            console.log(`🔄 Processing ticket ${ticketId} (${team} team) from queue. Remaining: ${this.queue.length}`);

            // Check if ticket is already imported before processing
            const isAlreadyImported = await this.checkIfImported(ticketId);
            if (isAlreadyImported) {
                console.log(`✅ Ticket ${ticketId} already imported, skipping`);
                return;
            }

            await this.sendSingleTicket(ticketId, team);
            console.log(`✅ Successfully processed ticket ${ticketId} to ${team} tracker`);

            // Reset retry count on success
            this.retryAttempts.delete(ticketId);
            this.teamMap.delete(ticketId);

        } catch (error) {
            console.error(`❌ Failed to process ticket ${ticketId}:`, error);

            // Check if this is a permanent failure (ticket not found in view)
            const errorMessage = error.message || error.toString();
            const isPermanentFailure = errorMessage.includes('không tồn tại trên Supabase View') ||
                                      errorMessage.includes('not found in') ||
                                      errorMessage.includes('Ticket not found');

            if (isPermanentFailure) {
                // Don't retry permanent failures - ticket doesn't exist in view
                console.warn(`⚠️ Permanent failure for ticket ${ticketId}: ${errorMessage}`);
                console.warn(`⚠️ Skipping retries - ticket may not be ready for import yet`);
                this.retryAttempts.delete(ticketId);
                this.teamMap.delete(ticketId);
                this.logFailedImport(ticketId, error);

                // Process next ticket immediately (no delay for permanent failures)
                this.processing = false;
                if (this.queue.length > 0) {
                    this.processNext();
                }
                return;
            }

            // For transient failures (network issues, etc.), retry with backoff
            const attempts = this.retryAttempts.get(ticketId) || 0;
            if (attempts < this.maxRetries) {
                this.retryAttempts.set(ticketId, attempts + 1);
                this.queue.push({ ticketId, team });
                console.log(`🔄 Retrying ticket ${ticketId} (attempt ${attempts + 1}/${this.maxRetries}) - transient error`);
            } else {
                console.error(`❌ Max retries reached for ticket ${ticketId}, giving up`);
                this.retryAttempts.delete(ticketId);
                this.teamMap.delete(ticketId);

                // Log failed import for manual review
                this.logFailedImport(ticketId, error);
            }
        } finally {
            this.processing = false;

            // Add delay between requests to prevent conflicts (only for transient failures)
            if (this.queue.length > 0) {
                setTimeout(() => this.processNext(), 2000); // 2 seconds delay
            }
        }
    },

    // Check if ticket is already imported to avoid duplicate processing
    async checkIfImported(ticketId) {
        try {
            const { data, error } = await supabaseClient
                .from('tickets')
                .select('import_to_tracker')
                .eq('id', ticketId)
                .single();

            if (error) {
                console.error(`Error checking import status for ticket ${ticketId}:`, error);
                return false; // Assume not imported if we can't check
            }

            return data?.import_to_tracker === true;
        } catch (error) {
            console.error(`Error checking import status for ticket ${ticketId}:`, error);
            return false;
        }
    },

    // Log failed imports for manual review
    async logFailedImport(ticketId, error) {
        try {
            console.error(`🚨 FAILED IMPORT - Ticket ${ticketId}:`, error.message);

            // You could also log this to a separate table or external service
            // For now, we'll just log to console with a clear marker
            const errorDetails = {
                ticketId: ticketId,
                error: error.message,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            };

            console.error('🚨 FAILED IMPORT DETAILS:', JSON.stringify(errorDetails, null, 2));

        } catch (logError) {
            console.error('Error logging failed import:', logError);
        }
    },

sendSingleTicket(ticketId, team = 'NA') {
        return new Promise((resolve, reject) => {
            try {
                // Use different script URLs based on team
                const NA_GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzDXf9HPZi9NiJy-f8Enw9ZINljy2njMSWcZFXnrKCDzRPpAwwipIsTTMjP3lTtPZM07A/exec';
                const EU_GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxx70shS7RkOO0lWmn3bVSH1Mw5vNprz5RJYHMZakOfZSMbMipciaDBzKaAfU0TbxKl/exec';

                const GOOGLE_SHEETS_URL = team === 'EU' ? EU_GOOGLE_SHEETS_URL : NA_GOOGLE_SHEETS_URL;
                const SECRET_TOKEN = '14092000';

                console.log(`📤 Sending ticket ${ticketId} to ${team} tracker: ${GOOGLE_SHEETS_URL}`);

                // CHỈ CẦN GỬI TICKET ID - Data sẽ tự lấy từ View (tickets_export_v for NA, tickets_export_eu_v for EU)
                const params = new URLSearchParams({
                    secret: SECRET_TOKEN,
                    ticketId: ticketId
                    // KHÔNG GỬI 'ot' NỮA
                });

                const callbackName = `callback_${ticketId}_${Date.now()}`;

                window[callbackName] = (response) => {
                    delete window[callbackName];
                    const script = document.getElementById(callbackName);
                    if (script) document.head.removeChild(script);

                    if (response.success === true) { // Check success flag
                        console.log('✅ Ticket exported:', ticketId);
                        resolve(response);
                    } else {
                        console.error('❌ Export failed:', response);
                        reject(new Error(response.error || 'Unknown error'));
                    }
                };

                const script = document.createElement('script');
                script.id = callbackName;
                script.src = `${GOOGLE_SHEETS_URL}?${params.toString()}&callback=${callbackName}`;

                // ... (Phần timeout giữ nguyên) ...
                const timeout = setTimeout(() => { /*...*/ }, 60000);
                script.onload = () => clearTimeout(timeout);
                script.onerror = () => { /*...*/ };

                document.head.appendChild(script);

            } catch (error) {
                console.error('Error:', error);
                reject(error);
            }
        });
    }
};

// Send ticket ID to Google Sheets - Apps Script will fetch data from tickets_export_v (NA) or tickets_export_eu_v (EU)
// Uses queue system to prevent concurrent conflicts
function sendTicketToGoogleSheets(ticketId, team = 'NA') {
    googleSheetsQueue.add(ticketId, team);
}

// Periodic check for tickets that failed to import and retry them
async function checkAndRetryFailedImports() {
    try {
        console.log('🔍 Checking for tickets that failed to import...');

        // Query tickets that should be imported but aren't marked as imported
        // These are tickets that have been ended but import_to_tracker is still false
        // Include agent team information
        const { data: failedTickets, error } = await supabaseClient
            .from('tickets')
            .select('id, ticket, time_end, assignee_account, agent!inner(team)')
            .not('time_end', 'is', null)
            .not('ticket_status_id', 'is', null)
            .eq('import_to_tracker', false)
            .gte('time_end', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
            .order('time_end', { ascending: false })
            .limit(50); // Limit to prevent overwhelming the system

        if (error) {
            console.error('Error checking for failed imports:', error);
            return;
        }

        if (failedTickets && failedTickets.length > 0) {
            console.log(`🔄 Found ${failedTickets.length} tickets that may have failed to import`);

            // Add them to the queue for retry (with a small delay between each)
            failedTickets.forEach((ticket, index) => {
                setTimeout(() => {
                    const team = ticket.agent?.team || 'NA';
                    console.log(`🔄 Retrying import for ticket ${ticket.ticket} (ID: ${ticket.id}, Team: ${team})`);
                    googleSheetsQueue.add(ticket.id, team);
                }, index * 1000); // 1 second delay between each retry
            });
        } else {
            console.log('✅ No failed imports found');
        }

    } catch (error) {
        console.error('Error in checkAndRetryFailedImports:', error);
    }
}

// Start periodic check for failed imports (every 10 minutes)
setInterval(checkAndRetryFailedImports, 10 * 60 * 1000);

// Also run an initial check after 30 seconds (to allow system to initialize)
setTimeout(checkAndRetryFailedImports, 30000);

async function updateNotificationCounts() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

        // Count unread notifications for current user
        const { data: notifications, error: notifError } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('recipient_id', currentUser.stt)
            .eq('read', false);

        if (notifError) throw notifError;

        const notificationBadge = document.getElementById('notification-badge');
        if (notificationBadge) {
            const count = notifications?.length || 0;
            notificationBadge.textContent = count;
            notificationBadge.style.display = count > 0 ? 'inline' : 'none';
        }

        // Optimized MoS requests count for leaders/keys with caching
        if (currentUser.level === 'leader' || currentUser.level === 'key') {
            // Check if we need to update (avoid unnecessary queries)
            const now = Date.now();
            if (!mosUpdateInProgress && (now - mosLastUpdate) > 30000) { // Update every 30 seconds max
                mosUpdateInProgress = true;

                try {
                    const { data: mosRequests, error: mosError } = await supabaseClient
                        .from('mos_requests')
                        .select('id')  // Only select ID for count, not all fields
                        .eq('status', 'request');

                    if (mosError) throw mosError;

                    mosNotificationCount = mosRequests?.length || 0;
                    mosLastUpdate = now;

                    const mosBadge = document.getElementById('mos-notification-badge');
                    if (mosBadge) {
                        mosBadge.textContent = mosNotificationCount;
                        mosBadge.style.display = mosNotificationCount > 0 ? 'inline' : 'none';
                    }
                } catch (error) {
                    console.error('Error updating MoS count:', error);
                } finally {
                    mosUpdateInProgress = false;
                }
            } else {
                // Use cached count
                const mosBadge = document.getElementById('mos-notification-badge');
                if (mosBadge) {
                    mosBadge.textContent = mosNotificationCount;
                    mosBadge.style.display = mosNotificationCount > 0 ? 'inline' : 'none';
                }
            }
        }
    } catch (error) {
        console.error('Error updating notification counts:', error);
    }
}

async function loadNotificationsDropdown() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const notificationsList = document.getElementById('notifications-list');

        const { data: notifications, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('recipient_id', currentUser.stt)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (notifications && notifications.length > 0) {
            notificationsList.innerHTML = notifications.map(notif => {
                const isUnread = !notif.read;
                const timeAgo = getTimeAgo(new Date(notif.created_at));
                const isManualReschedule = notif.type === 'manual_reschedule_assignment';
                const hasTaskLink = notif.message.includes('manual-reschedule-pos.html');

                return `
                            <div class="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isUnread ? 'bg-blue-50' : ''} ${isManualReschedule ? 'border-l-4 border-l-orange-400' : ''}"
                                 onclick="markAsRead(${notif.id})">
                                <div class="flex items-start justify-between">
                                    <div class="flex-1">
                                        ${isManualReschedule ? '<div class="text-xs font-semibold text-orange-600 mb-1">📋 MANUAL RESCHEDULE POs</div>' : ''}
                                        <p class="text-sm ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}">${notif.message}</p>
                                        <p class="text-xs text-gray-500 mt-1">${timeAgo}</p>
                                        ${hasTaskLink ? `
                                            <div class="mt-2">
                                                <button onclick="openManualRescheduleTask(event)"
                                                        class="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-full transition-colors">
                                                    🚀 Start Task
                                                </button>
                                            </div>
                                        ` : ''}
                                    </div>
                                    ${isManualReschedule ? '<div class="w-3 h-3 bg-orange-500 rounded-full ml-2 mt-1"></div>' :
                        isUnread ? '<div class="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-1"></div>' : ''}
                                </div>
                            </div>
                        `;
            }).join('');
        } else {
            notificationsList.innerHTML = `
                        <div class="p-6 text-center text-gray-500">
                            <svg class="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
                            </svg>
                            <p>No notifications</p>
                        </div>
                    `;
        }

    } catch (error) {
        console.error('Error loading notifications:', error);
        document.getElementById('notifications-list').innerHTML = `
                    <div class="p-6 text-center text-red-500">
                        <p>Error loading notifications</p>
                    </div>
                `;
    }
}

function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

async function markAllNotificationsAsRead() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

        const { error } = await supabaseClient
            .from('notifications')
            .update({ read: true })
            .eq('recipient_id', currentUser.stt)
            .eq('read', false);

        if (error) throw error;

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    }
}

async function markAsRead(notificationId) {
    try {
        const { error } = await supabaseClient
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);

        if (error) throw error;

        await updateNotificationCounts();
        showMessage('Đã đánh dấu đã đọc', 'success');
    } catch (error) {
        console.error('Error marking notification as read:', error);
        showMessage('Không thể đánh dấu đã đọc', 'error');
    }
}

function openManualRescheduleTask(event) {
    if (event) event.stopPropagation(); // Prevent the notification from being marked as read
    window.open('manual-reschedule-pos.html', '_blank');
}

async function checkManualRescheduleAssignment() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const today = new Date().toISOString().split('T')[0];

        // Check if user has an assignment for today in the new schedule_assignments table
        const { data: assignment, error } = await supabaseClient
            .from('schedule_assignments')
            .select('*')
            .eq('agent_id', currentUser.stt)
            .eq('assignment_date', today)
            .eq('status', 'assigned')
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (assignment) {
            // Check current time in Vietnam timezone (UTC+7)
            const now = new Date();
            const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
            const hours = vietnamTime.getHours();
            const minutes = vietnamTime.getMinutes();
            const currentTimeMinutes = hours * 60 + minutes; // Convert to minutes since midnight
            const targetTimeMinutes = 8 * 60 + 28; // 8:28 AM in minutes

            // Check if we've already shown the popup today
            const popupShownKey = `manual_schedule_popup_shown_${today}`;
            const popupAlreadyShown = localStorage.getItem(popupShownKey) === 'true';

            // BEFORE 8:28 AM: Show banner
            // AT 8:28 AM: Show popup (once)
            // AFTER 8:28 AM: Show banner again
            if (currentTimeMinutes === targetTimeMinutes && !popupAlreadyShown) {
                showManualSchedulePopup(assignment);
                localStorage.setItem(popupShownKey, 'true');
                setTimeout(() => showManualRescheduleBanner(assignment), 500);
            } else {
                showManualRescheduleBanner(assignment);
            }
        }
    } catch (error) {
        console.error('Error checking Manual Reschedule assignment:', error);
    }
}

function showManualSchedulePopup(assignment) {
    // Create full-screen popup overlay
    const popup = document.createElement('div');
    popup.id = 'manual-schedule-popup';
    popup.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[10000]';
    popup.innerHTML = `
                <div class="bg-gradient-to-br from-orange-500 to-red-600 p-12 rounded-3xl shadow-2xl max-w-2xl text-center transform scale-100 animate-pulse">
                    <div class="text-8xl mb-6">📋</div>
                    <h1 class="text-5xl font-bold text-white mb-4">Phân Công Manual Schedule</h1>
                    <p class="text-2xl text-orange-100 mb-6">Bạn được phân công xử lý:</p>
                    <div class="bg-white bg-opacity-20 rounded-xl p-6 mb-8">
                        <p class="text-4xl font-bold text-white">${assignment.account_export_name}</p>
                    </div>
                    <p class="text-xl text-orange-200 mb-8">Vui lòng bắt đầu công việc hôm nay!</p>
                    <button onclick="closeManualSchedulePopup()"
                            class="bg-white text-orange-600 px-8 py-4 rounded-full text-xl font-bold hover:bg-orange-50 transition-all transform hover:scale-105 shadow-lg">
                        Đã hiểu! Bắt đầu ngay 🚀
                    </button>
                </div>
            `;
    document.body.appendChild(popup);
}

window.closeManualSchedulePopup = function () {
    const popup = document.getElementById('manual-schedule-popup');
    if (popup) {
        popup.remove();
    }
};

function showManualRescheduleBanner(assignment) {
    // Check if banner already exists
    if (document.getElementById('manual-reschedule-banner')) {
        return;
    }

    const banner = document.createElement('div');
    banner.id = 'manual-reschedule-banner';
    banner.className = 'bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 rounded-lg shadow-lg border-l-4 border-orange-600 animate-slide-in';
    banner.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="text-2xl animate-bounce">📋</div>
                        <div>
                            <h3 class="font-bold text-lg">🎯 Phân Công Manual Schedule - Hôm Nay</h3>
                            <p class="text-orange-100">Bạn được phân công xử lý manual schedule hôm nay.</p>
                            <p class="text-sm text-orange-200">Tài khoản: <span class="font-semibold">${assignment.account_export_name}</span></p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="openManualRescheduleTask(event)"
                                class="bg-white text-orange-600 px-4 py-2 rounded-lg font-semibold hover:bg-orange-50 transition-colors shadow-md">
                            🚀 Bắt Đầu
                        </button>
                        <button onclick="dismissManualRescheduleBanner()"
                                class="bg-orange-600 text-white px-3 py-2 rounded-lg hover:bg-orange-700 transition-colors">
                            ✕
                        </button>
                    </div>
                </div>
            `;

    // Insert banner into the banner container
    const bannerContainer = document.getElementById('banner-container');
    if (bannerContainer) {
        bannerContainer.appendChild(banner);
    } else {
        // Fallback: insert after header if banner container doesn't exist
        const header = document.querySelector('header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(banner, header.nextSibling);
        }
    }
}

function dismissManualRescheduleBanner() {
    const banner = document.getElementById('manual-reschedule-banner');
    if (banner) {
        banner.remove();
    }
}

// =================================================================================
// == REALTIME SUBSCRIPTIONS =====================================================
// =================================================================================

function setupRealtimeSubscriptions() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

        // Clean up existing subscriptions if any
        if (notificationsChannel) {
            supabaseClient.removeChannel(notificationsChannel);
        }
        if (mosRequestsChannel) {
            supabaseClient.removeChannel(mosRequestsChannel);
        }
        if (scheduleAssignmentsChannel) {
            supabaseClient.removeChannel(scheduleAssignmentsChannel);
        }

        // Subscribe to notifications table for current user
        notificationsChannel = supabaseClient
            .channel('notifications-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_id=eq.${currentUser.stt}`
                },
                (payload) => {
                    console.log('🔔 New notification received:', payload);

                    // Check if it's a celebration notification
                    const notification = payload.new;
                    if (notification && notification.type === 'celebration') {
                        // Trigger celebration effect
                        console.log('🎉 Celebration notification received!');
                        triggerCelebration();
                        // Show celebration message
                        showMessage('🎉 ' + (notification.message || 'Congratulations on completing a ticket!'), 'success');
                    } else if (notification && notification.type === 'manual_schedule') {
                        // Manual schedule assignment notification
                        showMessage('📋 ' + (notification.message || 'New schedule assignment'), 'info');
                    } else {
                        // Generic notification
                        showMessage('🔔 New notification received', 'info');
                    }

                    // Update notification counts
                    updateNotificationCounts();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_id=eq.${currentUser.stt}`
                },
                (payload) => {
                    console.log('📝 Notification updated:', payload);
                    // Update notification counts
                    updateNotificationCounts();
                }
            )
            .subscribe((status) => {
                console.log('📡 Notifications channel status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to notifications channel');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Error subscribing to notifications channel');
                }
            });

        // Optimized MoS requests subscription for leaders/keys
        if (currentUser.level === 'leader' || currentUser.level === 'key') {
            mosRequestsChannel = supabaseClient
                .channel('mos-requests-changes')
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'mos_requests'
                    },
                    (payload) => {
                        console.log('🚢 New MoS request received:', payload);

                        // Update cache immediately
                        if (payload.new) {
                            mosRequestsCache.set(payload.new.ticket_id, {
                                description: payload.new.description,
                                status: payload.new.status,
                                created_at: payload.new.created_at,
                                requester_id: payload.new.requester_id,
                                cached_at: Date.now()
                            });
                        }

                        // Update notification count immediately
                        mosNotificationCount++;
                        mosLastUpdate = Date.now();

                        // Update UI
                        const mosBadge = document.getElementById('mos-notification-badge');
                        if (mosBadge) {
                            mosBadge.textContent = mosNotificationCount;
                            mosBadge.style.display = 'inline';
                        }

                        // Show enhanced toast notification
                        showMessage('🚢 New MoS request received - Check MoS view', 'info');
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'mos_requests'
                    },
                    (payload) => {
                        console.log('🚢 MoS request updated:', payload);

                        // Update cache immediately
                        if (payload.new) {
                            const existing = mosRequestsCache.get(payload.new.ticket_id) || {};
                            mosRequestsCache.set(payload.new.ticket_id, {
                                ...existing,
                                status: payload.new.status,
                                responder_id: payload.new.responder_id,
                                response_date: payload.new.response_date,
                                cached_at: Date.now()
                            });
                        }

                        // If status changed from 'request' to something else, decrease count
                        if (payload.old?.status === 'request' && payload.new?.status !== 'request') {
                            mosNotificationCount = Math.max(0, mosNotificationCount - 1);
                            mosLastUpdate = Date.now();

                            const mosBadge = document.getElementById('mos-notification-badge');
                            if (mosBadge) {
                                mosBadge.textContent = mosNotificationCount;
                                mosBadge.style.display = mosNotificationCount > 0 ? 'inline' : 'none';
                            }
                        }
                    }
                )
                .subscribe((status) => {
                    console.log('📡 MoS requests channel status:', status);
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Successfully subscribed to MoS requests channel');
                    }
                });
        }

        // Subscribe to schedule assignments for current user
        scheduleAssignmentsChannel = supabaseClient
            .channel('schedule-assignments-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'schedule_assignments',
                    filter: `agent_id=eq.${currentUser.stt}`
                },
                (payload) => {
                    console.log('📋 New schedule assignment received:', payload);
                    // Check for new manual reschedule assignment
                    checkManualRescheduleAssignment();
                    // Show a toast notification
                    showMessage('🔔 New schedule assignment received', 'info');
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'schedule_assignments',
                    filter: `agent_id=eq.${currentUser.stt}`
                },
                (payload) => {
                    console.log('📋 Schedule assignment updated:', payload);
                    // Check for updated manual reschedule assignment
                    checkManualRescheduleAssignment();
                }
            )
            .subscribe((status) => {
                console.log('📡 Schedule assignments channel status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to schedule assignments channel');
                }
            });

        console.log('✅ Realtime subscriptions setup initiated for user:', currentUser.stt);
    } catch (error) {
        console.error('Error setting up realtime subscriptions:', error);
    }
}

// Cleanup subscriptions when page unloads
window.addEventListener('beforeunload', () => {
    if (notificationsChannel) {
        supabaseClient.removeChannel(notificationsChannel);
    }
    if (mosRequestsChannel) {
        supabaseClient.removeChannel(mosRequestsChannel);
    }
    if (scheduleAssignmentsChannel) {
        supabaseClient.removeChannel(scheduleAssignmentsChannel);
    }
});

// Optimized Confetti Effect
function createConfetti() {
    const container = document.getElementById('fireworks-container');
    if (!container) return;

    const confettiColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#fd79a8', '#fdcb6e', '#6c5ce7'];
    const confettiShapes = ['square', 'circle', 'triangle'];

    // Create confetti on both sides - optimized for performance
    function createConfettiSide(side) {
        const sideWidth = window.innerWidth * 0.25; // Reduced from 30% to 25%
        const startX = side === 'left' ? 0 : window.innerWidth - sideWidth;

        // Reduced from 15 to 10 particles per side for better performance
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = `confetti confetti-${confettiShapes[Math.floor(Math.random() * confettiShapes.length)]}`;

                const x = startX + Math.random() * sideWidth;
                const rotation = Math.random() * 360;
                const scale = 0.6 + Math.random() * 0.6; // Slightly smaller for performance
                const fallDuration = 2.5 + Math.random() * 1.5; // Faster fall
                const sway = 40 + Math.random() * 80; // Reduced sway

                confetti.style.cssText = `
                            position: absolute;
                            left: ${x}px;
                            top: -20px;
                            width: 6px;
                            height: 6px;
                            background-color: ${confettiColors[Math.floor(Math.random() * confettiColors.length)]};
                            transform: rotate(${rotation}deg) scale(${scale});
                            animation: confettiFall ${fallDuration}s linear forwards;
                            --sway: ${Math.random() > 0.5 ? sway : -sway}px;
                            z-index: 10001;
                            will-change: transform, opacity;
                        `;

                container.appendChild(confetti);
                setTimeout(() => {
                    if (confetti.parentNode) {
                        confetti.parentNode.removeChild(confetti);
                    }
                }, fallDuration * 1000 + 200);
            }, i * 80); // Faster spawn rate
        }
    }

    // Create confetti on both sides
    createConfettiSide('left');
    createConfettiSide('right');

    // Reduced additional waves for performance
    setTimeout(() => {
        createConfettiSide('left');
        createConfettiSide('right');
    }, 1200);
}

// Optimized Enhanced Fireworks effect
function createEnhancedFireworks() {
    const container = document.getElementById('fireworks-container');
    if (!container) return;

    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#fd79a8', '#fdcb6e', '#6c5ce7'];

    // Reduced from 8 to 5 fireworks for better performance
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const x = 150 + Math.random() * (window.innerWidth - 300); // Keep away from edges
            const y = 80 + Math.random() * (window.innerHeight * 0.3); // Upper portion of screen

            // Reduced from 50 to 30 particles per firework for performance
            for (let j = 0; j < 30; j++) {
                const firework = document.createElement('div');
                firework.className = 'enhanced-firework';

                const color = colors[Math.floor(Math.random() * colors.length)];
                const angle = (Math.PI * 2 * j) / 30;
                const velocity = 60 + Math.random() * 80; // Reduced velocity for performance
                const size = 2 + Math.random() * 3; // Smaller particles for performance
                const fallSpeed = 0.3 + Math.random() * 0.7; // Faster fall
                const duration = 1.5 + Math.random() * 1; // Shorter duration for performance

                const endX = Math.cos(angle) * velocity;
                const endY = Math.sin(angle) * velocity;

                firework.style.cssText = `
                            position: absolute;
                            left: ${x}px;
                            top: ${y}px;
                            width: ${size}px;
                            height: ${size}px;
                            background-color: ${color};
                            border-radius: 50%;
                            animation: enhancedFireworkExplosion ${duration}s ease-out forwards;
                            --end-x: ${endX}px;
                            --end-y: ${endY}px;
                            --fall-speed: ${fallSpeed};
                            z-index: 10002;
                            will-change: transform, opacity;
                        `;

                container.appendChild(firework);
                setTimeout(() => {
                    if (firework.parentNode) {
                        firework.parentNode.removeChild(firework);
                    }
                }, duration * 1000 + 200);
            }
        }, i * 300); // Faster sequence
    }
}

// Legacy fireworks function for backward compatibility
function createFireworks() {
    createEnhancedFireworks();
    createConfetti();
}

function showCongratulations(message) {
    const overlay = document.getElementById('congrats-overlay');
    const messageEl = document.getElementById('congrats-message');
    const closeBtn = document.getElementById('congrats-close-btn');

    if (!overlay || !messageEl || !closeBtn) return;

    messageEl.textContent = message;
    overlay.classList.remove('hidden');

    // Use enhanced effects with confetti and bigger fireworks
    createEnhancedFireworks();
    createConfetti();

    closeBtn.onclick = () => {
        overlay.classList.add('hidden');
    };

    // Auto close after 8 seconds to enjoy the enhanced effects
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 8000);
}

// Check if all work is truly completed by querying all tickets and checking completion status
async function checkAllWorkCompleted() {
    const isLeaderView = localStorage.getItem('leaderViewMode') === 'true';
    const isMosView = localStorage.getItem('mosViewMode') === 'true';
    const currentTypeFilter = currentTicketTypeFilter || 'all';

    // Create a unique celebration key that includes the ticket type filter
    const celebrationKey = `all_work_completed_${new Date().toDateString()}_${isLeaderView ? 'leader' : isMosView ? 'mos' : 'normal'}_${currentTypeFilter}`;
    const alreadyShown = localStorage.getItem(celebrationKey);

    if (alreadyShown) return;

    try {
        // OPTIMIZATION: Select only needed columns for completion check
        const columns = 'id,ticket,time_end,need_leader_support,needMos';
        let query = supabaseClient.from('tickets').select(columns);

        // Apply the same view mode filters as the main query
        if (isLeaderView) {
            query = query.eq('need_leader_support', true);
        } else if (isMosView) {
            query = query.eq('needMos', 'request');
        } else {
            // For normal view, exclude tickets that need leader support or have MoS requests
            query = query.or('need_leader_support.is.null,need_leader_support.eq.false')
                .or('needMos.is.null,needMos.neq.request');
        }

        const { data: allTickets, error } = await query;
        if (error) throw error;

        // Filter by ticket type (AOPS/FMOP) based on current filter
        const filteredTickets = allTickets.filter(ticket => {
            if (currentTypeFilter === 'all') return true;
            const ticketType = getTicketType(ticket.ticket);
            return ticketType === currentTypeFilter;
        });

        // Check if there are any tickets in this category
        if (filteredTickets.length === 0) return;

        // Check if ALL tickets in this category are completed (have time_end)
        const completedTickets = filteredTickets.filter(ticket => ticket.time_end);
        const allCompleted = completedTickets.length === filteredTickets.length;

        if (allCompleted) {
            // Create celebration message with cute icons
            let message = "🧨👤 Congratulations! All tickets have been completed! 🎉✨";
            let celebrationIcon = "🧨👤"; // Person blowing firecracker

            if (isLeaderView) {
                message = `${celebrationIcon} Outstanding! All AOPS tickets requiring leader support have been completed! 🌟🎊`;
            } else if (isMosView) {
                message = `${celebrationIcon} Excellent! All FMOP tickets with MOS requests have been completed! 🚢🎉`;
            } else {
                // Normal view with type-specific messages
                if (currentTypeFilter === 'aops') {
                    message = `${celebrationIcon} Amazing! All AOPS tickets have been completed! 🌟🎆`;
                } else if (currentTypeFilter === 'fmop') {
                    message = `${celebrationIcon} Fantastic! All FMOP tickets have been completed! 🚢🎊`;
                }
            }

            // Show the enhanced celebration
            setTimeout(() => {
                showFireworksEffect(message);
                localStorage.setItem(celebrationKey, 'true');
            }, 800);
        }
    } catch (error) {
        console.error('Error checking completion status:', error);
    }
}

async function checkAllTicketsCompleted() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const selectedAssignee = assigneeSelect.value;

    // Check if a specific assignee is selected (not "all")
    if (!selectedAssignee || selectedAssignee === 'all') return;

    const isLeaderView = localStorage.getItem('leaderViewMode') === 'true';
    const isMosView = localStorage.getItem('mosViewMode') === 'true';
    const currentTypeFilter = currentTicketTypeFilter || 'all';

    try {
        // OPTIMIZATION: Select only needed columns for completion check
        const columns = 'id,ticket,time_end,need_leader_support,needMos';
        let query = supabaseClient.from('tickets').select(columns).eq('assignee_account', selectedAssignee);

        // Apply the same view mode filters
        if (isLeaderView) {
            query = query.eq('need_leader_support', true);
        } else if (isMosView) {
            query = query.eq('needMos', 'request');
        } else {
            query = query.or('need_leader_support.is.null,need_leader_support.eq.false')
                .or('needMos.is.null,needMos.neq.request');
        }

        const { data: userTickets, error } = await query;
        if (error) throw error;

        // Filter by ticket type
        const filteredTickets = userTickets.filter(ticket => {
            if (currentTypeFilter === 'all') return true;
            const ticketType = getTicketType(ticket.ticket);
            return ticketType === currentTypeFilter;
        });

        // Check if user has any tickets in this category
        if (filteredTickets.length === 0) return;

        // Check if ALL user's tickets in this category are completed
        const completedTickets = filteredTickets.filter(ticket => ticket.time_end);
        const allCompleted = completedTickets.length === filteredTickets.length;

        if (allCompleted) {
            // Vietnamese celebration messages
            let message = `🧨👤 Chúc mừng! Đã hoàn thành tất cả ticket cho ${selectedAssignee}! 🎉✨`;
            let celebrationIcon = "🧨👤";

            if (isLeaderView) {
                message = `${celebrationIcon} Xuất sắc! Đã hoàn thành tất cả ticket AOPS cần hỗ trợ leader cho ${selectedAssignee}! 🌟🎊`;
            } else if (isMosView) {
                message = `${celebrationIcon} Tuyệt vời! Đã hoàn thành tất cả ticket FMOP có yêu cầu MOS cho ${selectedAssignee}! 🚢🎉`;
            } else {
                if (currentTypeFilter === 'aops') {
                    message = `${celebrationIcon} Hoàn hảo! Đã hoàn thành tất cả ticket AOPS cho ${selectedAssignee}! 🌟🎆`;
                } else if (currentTypeFilter === 'fmop') {
                    message = `${celebrationIcon} Tuyệt vời! Đã hoàn thành tất cả ticket FMOP cho ${selectedAssignee}! 🚢🎊`;
                }
            }

            // Show celebration with fireworks effect (only one banner)
            showFireworksEffect(message);

            // Create a celebration notification for the user
            try {
                const celebrationNotificationKey = `celebration_sent_${new Date().toDateString()}_${selectedAssignee}_${isLeaderView ? 'leader' : isMosView ? 'mos' : 'normal'}_${currentTypeFilter}`;
                const notificationAlreadySent = localStorage.getItem(celebrationNotificationKey);

                if (!notificationAlreadySent) {
                    const { error } = await supabaseClient.from('notifications').insert({
                        recipient_id: currentUser.stt,
                        message: message,
                        type: 'celebration',
                        read: false
                    });

                    if (!error) {
                        localStorage.setItem(celebrationNotificationKey, 'true');
                    }
                }
            } catch (notifError) {
                // Silent fail for notification creation
            }
        }
    } catch (error) {
        console.error('Error checking user completion status:', error);
    }
}

// Trigger celebration - wrapper function for real-time notifications
function triggerCelebration(customMessage = null) {
    showFireworksEffect(customMessage);
}

// Fireworks celebration effect
function showFireworksEffect(customMessage = null) {
    // Create fireworks container
    const fireworksContainer = document.createElement('div');
    fireworksContainer.id = 'fireworks-container';
    fireworksContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 10000;
                pointer-events: none;
                overflow: hidden;
            `;

    // Use custom message or default Vietnamese congratulations messages with cute icons
    let randomMessage = customMessage;

    if (!customMessage) {
        const messages = [
            '🧨👤 Chúc mừng bạn đã hoàn thành tất cả ticket! 🎉✨',
            '🎆👨‍💼 Xuất sắc! Bạn đã xử lý xong toàn bộ công việc! 🌟🎊',
            '🎇👩‍💻 Tuyệt vời! Không còn ticket nào cần xử lý! 🎊🎈',
            '✨👤 Hoàn hảo! Bạn đã làm việc rất tốt hôm nay! ✨🎉',
            '🎉👨‍🎓 Chúc mừng! Tất cả ticket đã được giải quyết! 🎈🎆'
        ];
        randomMessage = messages[Math.floor(Math.random() * messages.length)];
    }

    // Create enhanced message overlay
    const messageOverlay = document.createElement('div');
    messageOverlay.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 40px 60px;
                border-radius: 25px;
                font-size: 28px;
                font-weight: bold;
                text-align: center;
                backdrop-filter: blur(15px);
                border: 3px solid rgba(255,255,255,0.3);
                box-shadow: 0 25px 50px rgba(0,0,0,0.4);
                animation: messageGlow 2s ease-in-out infinite alternate, messageBounce 0.6s ease-out;
                max-width: 80%;
                word-wrap: break-word;
                z-index: 10001;
            `;
    messageOverlay.textContent = randomMessage;

    // Add CSS animation for message glow
    const style = document.createElement('style');
    style.textContent = `
                @keyframes messageGlow {
                    from { box-shadow: 0 0 30px rgba(255, 215, 0, 0.5); }
                    to { box-shadow: 0 0 50px rgba(255, 215, 0, 0.8); }
                }
                @keyframes firework {
                    0% { transform: scale(0) rotate(0deg); opacity: 1; }
                    50% { transform: scale(1) rotate(180deg); opacity: 1; }
                    100% { transform: scale(1.5) rotate(360deg); opacity: 0; }
                }
                .firework {
                    position: absolute;
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    animation: firework 1.5s ease-out forwards;
                }
            `;
    document.head.appendChild(style);

    fireworksContainer.appendChild(messageOverlay);

    document.body.appendChild(fireworksContainer);

    // Launch enhanced fireworks and confetti
    createEnhancedFireworks();
    createConfetti();

    // One additional wave for celebration
    setTimeout(() => {
        createEnhancedFireworks();
        createConfetti();
    }, 1500);

    // Remove fireworks after 5 seconds
    setTimeout(() => {
        if (fireworksContainer.parentNode) {
            fireworksContainer.parentNode.removeChild(fireworksContainer);
        }
        if (style.parentNode) {
            style.parentNode.removeChild(style);
        }
    }, 5000);
}

// Check if all tickets are completed and show fireworks
function checkForCompletionCelebration() {
    const currentFilter = assigneeSelect?.value || 'all';
    const currentTypeFilter = currentTicketTypeFilter || 'all';

    // Only check when viewing specific assignee's tickets
    if (currentFilter === 'all') return;

    // Get filtered tickets count
    const allTicketsArray = Array.from(ticketsMap.values());
    const filteredTickets = allTicketsArray.filter(ticket => {
        const matchesAssignee = currentFilter === 'all' || ticket.assignee_account === currentFilter;
        const matchesType = currentTypeFilter === 'all' ||
            (currentTypeFilter === 'aops' && ticket.ticket.startsWith('AOPS')) ||
            (currentTypeFilter === 'fmop' && ticket.ticket.startsWith('FMOP'));
        return matchesAssignee && matchesType;
    });

    // Check if all tickets are completed (have time_end)
    const completedTickets = filteredTickets.filter(ticket => ticket.time_end);
    const hasTickets = filteredTickets.length > 0;
    const allCompleted = hasTickets && completedTickets.length === filteredTickets.length;

    // Show fireworks if all tickets are completed and we haven't shown it recently
    const lastFireworksKey = `fireworks_shown_${currentFilter}_${currentTypeFilter}_${new Date().toDateString()}`;
    const fireworksShown = localStorage.getItem(lastFireworksKey);

    if (allCompleted && !fireworksShown && hasTickets) {
        setTimeout(() => {
            showFireworksEffect();
            localStorage.setItem(lastFireworksKey, 'true');
        }, 1000); // Delay to let the table render first
    }
}

// MOS Cache Management Functions
function clearMosCache() {
    mosRequestsCache.clear();
    mosNotificationCount = 0;
    mosLastUpdate = 0;
    mosUpdateInProgress = false;
}

function getMosCacheStats() {
    return {
        cacheSize: mosRequestsCache.size,
        notificationCount: mosNotificationCount,
        lastUpdate: new Date(mosLastUpdate).toISOString(),
        updateInProgress: mosUpdateInProgress
    };
}

// Make functions globally available
window.sendToLeader = sendToLeader;
window.requestMos = requestMos;
window.approveMos = approveMos;
window.rejectMos = rejectMos;
window.loadNotificationsDropdown = loadNotificationsDropdown;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.markAsRead = markAsRead;
window.openManualRescheduleTask = openManualRescheduleTask;
window.dismissManualRescheduleBanner = dismissManualRescheduleBanner;
window.showFireworksEffect = showFireworksEffect;

// MOS optimization functions
window.clearMosCache = clearMosCache;
window.getMosCacheStats = getMosCacheStats;

// AI Chat Functionality
let chatOpen = false;

function toggleChat() {
    const chatContainer = document.getElementById('chat-container');
    const chatIcon = document.getElementById('chat-icon');

    chatOpen = !chatOpen;

    if (chatOpen) {
        chatContainer.style.display = 'flex';
        chatIcon.style.transform = 'scale(0.9)';
        document.getElementById('chat-input').focus();
    } else {
        chatContainer.style.display = 'none';
        chatIcon.style.transform = 'scale(1)';
    }
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Add user message to chat
    addMessageToChat(message, 'user');
    input.value = '';

    // Show typing indicator
    showTypingIndicator();

    try {
        // Call AI API (placeholder for now)
        const response = await callAIAPI(message);

        // Hide typing indicator and add bot response
        hideTypingIndicator();

        // Check if response indicates AI couldn't answer
        const isUnanswered = isResponseUnanswered(response);

        if (isUnanswered) {
            // Log unanswered question to Google Sheets
            await logQuestionToSheet(message, response, 'unanswered');

            // Add response with feedback option
            addMessageToChat(response, 'bot', true, message, response);
        } else {
            // Add response with feedback option for user satisfaction
            addMessageToChat(response, 'bot', true, message, response);
        }

    } catch (error) {
        hideTypingIndicator();
        const errorResponse = 'Sorry, I encountered an error. Please try again later.';

        // Log error to Google Sheets
        await logQuestionToSheet(message, errorResponse, 'error');

        addMessageToChat(errorResponse, 'bot', true, message, errorResponse);
        console.error('AI Chat Error:', error);
    }
}

function addMessageToChat(message, sender, showFeedback = false, originalQuestion = '', botResponse = '') {
    const messagesContainer = document.getElementById('chat-messages');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = message;

    messageDiv.appendChild(contentDiv);

    // Add feedback buttons for bot messages
    if (sender === 'bot' && showFeedback) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'message-feedback';
        feedbackDiv.style.cssText = 'margin-top: 8px; display: flex; gap: 8px; align-items: center;';

        const feedbackText = document.createElement('span');
        feedbackText.textContent = 'Was this helpful?';
        feedbackText.style.cssText = 'font-size: 12px; color: #666; margin-right: 4px;';

        const thumbsUpBtn = document.createElement('button');
        thumbsUpBtn.innerHTML = '👍';
        thumbsUpBtn.style.cssText = 'background: none; border: 1px solid #ddd; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 14px;';
        thumbsUpBtn.title = 'Helpful';
        thumbsUpBtn.onclick = () => handleFeedback('positive', originalQuestion, botResponse, feedbackDiv);

        const thumbsDownBtn = document.createElement('button');
        thumbsDownBtn.innerHTML = '👎';
        thumbsDownBtn.style.cssText = 'background: none; border: 1px solid #ddd; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 14px;';
        thumbsDownBtn.title = 'Not helpful';
        thumbsDownBtn.onclick = () => handleFeedback('negative', originalQuestion, botResponse, feedbackDiv);

        feedbackDiv.appendChild(feedbackText);
        feedbackDiv.appendChild(thumbsUpBtn);
        feedbackDiv.appendChild(thumbsDownBtn);
        messageDiv.appendChild(feedbackDiv);
    }

    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    typingIndicator.style.display = 'block';

    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    typingIndicator.style.display = 'none';
}

// Handle user feedback on AI responses
async function handleFeedback(rating, question, response, feedbackDiv) {
    try {
        // Log feedback to Google Sheets
        await logQuestionToSheet(question, response, 'feedback', rating);

        // Update UI to show feedback was recorded
        feedbackDiv.innerHTML = `
                    <span style="font-size: 12px; color: #28a745; font-weight: 500;">
                        ${rating === 'positive' ? '✅ Thank you for your feedback!' : '📝 Thank you! We\'ll improve our responses.'}
                    </span>
                `;

        console.log(`✅ User feedback recorded: ${rating} for question: "${question.substring(0, 50)}..."`);

    } catch (error) {
        console.error('❌ Error recording feedback:', error);
        feedbackDiv.innerHTML = `
                    <span style="font-size: 12px; color: #dc3545;">
                        ❌ Error recording feedback. Please try again.
                    </span>
                `;
    }
}

// AI API Integration using Gradio Client
let gradioClient = null;
let gradioInitialized = false;

async function initializeGradioClient() {
    if (gradioInitialized) return;

    console.log("Attempting to initialize Gradio client...");

    // Wait for Gradio to be loaded if not ready
    if (!window.gradioReady) {
        console.log("Waiting for Gradio to load...");
        await new Promise(resolve => {
            if (window.gradioReady) {
                resolve();
            } else {
                window.addEventListener('gradioLoaded', resolve, { once: true });
            }
        });
    }

    if (!gradioClient && window.GradioClient) {
        try {
            console.log("Connecting to Luong29/ai-assistant...");
            gradioClient = await window.GradioClient.connect("Luong29/ai-assistant");
            gradioInitialized = true;
            console.log("✅ Gradio client connected successfully to Luong29/ai-assistant");
        } catch (error) {
            console.error("❌ Failed to connect to Gradio client:", error);
            gradioInitialized = false;
        }
    } else {
        console.error("❌ GradioClient not available on window object");
    }
}

async function callAIAPI(message) {
    console.log("🤖 AI API called with message:", message);

    try {
        // Try direct fetch API first (more reliable)
        console.log("📡 Trying direct API call to Luong29/ai-assistant...");
        const response = await callAIDirectly(message);
        if (response) {
            console.log("✅ Direct API call successful:", response);
            return response;
        }

        // Fallback to Gradio client
        console.log("🔄 Direct API failed, trying Gradio client...");

        // Initialize client if not already done
        if (!gradioClient || !gradioInitialized) {
            console.log("🔄 Initializing Gradio client...");
            await initializeGradioClient();
        }

        // If client is still not available, fall back to mock responses
        if (!gradioClient) {
            console.log("⚠️ Gradio client not available, using fallback");
            return await fallbackResponse(message);
        }

        console.log("📡 Calling Luong29/ai-assistant API via Gradio client...");

        // Call the actual AI API
        const result = await gradioClient.predict("/chatbot_interface", {
            user_query: message
        });

        console.log("📥 AI API response:", result);

        // Extract the response from the result
        if (result && result.data && result.data.length > 0) {
            const response = result.data[0];
            console.log("✅ AI response extracted:", response);
            return response || "I'm sorry, I couldn't generate a response. Please try again.";
        } else {
            console.log("❌ No valid response data from AI");
            return "I'm sorry, I couldn't generate a response. Please try again.";
        }

    } catch (error) {
        console.error("❌ AI API Error:", error);
        console.log("🔄 Falling back to mock response");
        // Fall back to mock response on error
        return await fallbackResponse(message);
    }
}

// Direct API call using fetch (alternative method)
async function callAIDirectly(message) {
    try {
        console.log("🌐 Making direct HTTP request to Hugging Face...");
        console.log("📤 Sending message:", message);

        // First, initiate the prediction
        const initResponse = await fetch('https://luong29-ai-assistant.hf.space/gradio_api/call/chatbot_interface', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: [message]
            })
        });

        if (!initResponse.ok) {
            throw new Error(`HTTP error! status: ${initResponse.status}`);
        }

        const initData = await initResponse.text();
        console.log("📡 Init response:", initData);

        // Extract event ID from response
        let eventId;
        try {
            const initJson = JSON.parse(initData);
            eventId = initJson.event_id;
        } catch (e) {
            const eventIdMatch = initData.match(/"event_id":"([^"]+)"/);
            if (eventIdMatch) {
                eventId = eventIdMatch[1];
            }
        }

        if (!eventId) {
            throw new Error("Could not extract event ID from response");
        }

        console.log("🆔 Event ID:", eventId);

        // Wait a moment for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Poll for the result
        const resultResponse = await fetch(`https://luong29-ai-assistant.hf.space/gradio_api/call/chatbot_interface/${eventId}`);

        if (!resultResponse.ok) {
            throw new Error(`HTTP error! status: ${resultResponse.status}`);
        }

        const reader = resultResponse.body.getReader();
        const decoder = new TextDecoder();
        let result = '';
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout

        while (attempts < maxAttempts) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            result += chunk;
            console.log("📥 Received chunk:", chunk);

            // Look for the complete event
            if (chunk.includes('event: complete')) {
                console.log("✅ Received complete event");
                break;
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log("📥 Full API result:", result);

        // Parse the result to extract the AI response
        const lines = result.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const dataStr = line.substring(6).trim();
                    console.log("🔍 Parsing data line:", dataStr);
                    const data = JSON.parse(dataStr);
                    if (data && Array.isArray(data) && data.length > 0) {
                        const response = data[0];
                        console.log("✅ Direct API response extracted:", response);
                        return response;
                    }
                } catch (e) {
                    console.log("⚠️ Failed to parse line:", line, e);
                    // Continue parsing other lines
                }
            }
        }

        console.log("❌ No valid response found in result");
        return null;

    } catch (error) {
        console.error("❌ Direct API call failed:", error);
        return null;
    }
}

// Check if AI response indicates it couldn't answer the question
function isResponseUnanswered(response) {
    const lowerResponse = response.toLowerCase();
    const unansweredIndicators = [
        "i'm sorry, i couldn't",
        "i don't know",
        "i can't help",
        "i'm not sure",
        "that's an interesting question",
        "could you be more specific",
        "i couldn't generate a response",
        "please try again",
        "i encountered an error"
    ];

    return unansweredIndicators.some(indicator => lowerResponse.includes(indicator));
}

// Log question and response to Google Sheets for feedback tracking
async function logQuestionToSheet(question, response, type = 'general', rating = '') {
    try {
        const FEEDBACK_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzDXf9HPZi9NiJy-f8Enw9ZINljy2njMSWcZFXnrKCDzRPpAwwipIsTTMjP3lTtPZM07A/exec';
        const SECRET_TOKEN = '14092000';

        const params = new URLSearchParams({
            secret: SECRET_TOKEN,
            action: 'log_question',
            sheetId: '10iS5jfShvztelK5kp7q1Qlnge2_H87vsMVTlK-szkH0',
            date: new Date().toLocaleDateString('vi-VN'),
            question: question,
            response: response,
            type: type,
            rating: rating
        });

        // Use image beacon for fire-and-forget request (no CORS issues)
        const img = new Image();
        img.style.display = 'none';

        const timeout = setTimeout(() => {
            if (img.parentNode) document.body.removeChild(img);
        }, 5000);

        img.onload = img.onerror = () => {
            clearTimeout(timeout);
            if (img.parentNode) document.body.removeChild(img);
            console.log('✅ Question logged to feedback sheet:', question.substring(0, 50) + '...');
        };

        img.src = `${FEEDBACK_SHEET_URL}?${params.toString()}`;
        document.body.appendChild(img);

    } catch (error) {
        console.error('❌ Error logging question to sheet:', error);
    }
}

// Fallback function with mock responses
async function fallbackResponse(message) {
    console.log("🔄 Using fallback response for:", message);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('ticket') || lowerMessage.includes('dashboard')) {
        return "I can help you with ticket management! The dashboard allows you to view, start, and complete tickets. You can filter by assignee, use templates for responses, and track progress in real-time. Would you like to know about any specific feature?";
    } else if (lowerMessage.includes('template') || lowerMessage.includes('email')) {
        return "Templates are pre-written responses that help you communicate efficiently. You can customize them with placeholders for customer names, order numbers, and other dynamic content. Click the template button on any ticket to get started!";
    } else if (lowerMessage.includes('start') || lowerMessage.includes('begin')) {
        return "To start working on tickets: 1) Select your name from the Assignee dropdown, 2) Click the 'Start' button on a ticket, 3) Use templates for responses, 4) Click 'End' when finished. The system tracks your time automatically!";
    } else if (lowerMessage.includes('filter') || lowerMessage.includes('search')) {
        return "You can filter tickets by: 1) Assignee (dropdown at top), 2) Ticket type (click on 'Ticket' header), 3) View modes (Leader View, MoS Requests). The system also supports real-time updates and notifications.";
    } else if (lowerMessage.includes('notification') || lowerMessage.includes('alert')) {
        return "The notification system keeps you updated on: 1) Manual schedule assignments, 2) MoS requests, 3) System updates. Check the bell icon in the header for recent notifications.";
    } else if (lowerMessage.includes('theme') || lowerMessage.includes('color')) {
        return "You can change the dashboard theme using the 🎨 button in the header. Available themes include: Dark, Daylight, Sunset, Twilight, Blossom Dawn, Blue Sky, and Fresh Mint. Each theme is optimized for different lighting conditions!";
    } else if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
        return "I'm here to help! I can assist with:\n• Ticket management and workflow\n• Template usage and customization\n• Dashboard navigation and features\n• Filtering and search options\n• Notification system\n• Theme customization\n\nWhat specific topic would you like to know more about?";
    } else {
        return "That's an interesting question! I can help with dashboard features, ticket management, templates, themes, and system usage. Could you be more specific about what you'd like to know? Try asking about 'tickets', 'templates', 'themes', or 'help' for more information.";
    }
}

// Chat zoom functionality
function zoomChatIn() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;

    const currentWidth = parseInt(chatContainer.style.width) || 350;
    const currentHeight = parseInt(chatContainer.style.height) || 500;

    const newWidth = Math.min(currentWidth + 50, 600);
    const newHeight = Math.min(currentHeight + 50, 700);

    chatContainer.style.width = newWidth + 'px';
    chatContainer.style.height = newHeight + 'px';
}

function zoomChatOut() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;

    const currentWidth = parseInt(chatContainer.style.width) || 350;
    const currentHeight = parseInt(chatContainer.style.height) || 500;

    const newWidth = Math.max(currentWidth - 50, 300);
    const newHeight = Math.max(currentHeight - 50, 400);

    chatContainer.style.width = newWidth + 'px';
    chatContainer.style.height = newHeight + 'px';
}

// AI Chat functionality
window.toggleChat = toggleChat;
window.handleChatKeyPress = handleChatKeyPress;
window.sendMessage = sendMessage;
window.zoomChatIn = zoomChatIn;
window.zoomChatOut = zoomChatOut;

// Debug function to test AI connection
window.testAI = async function () {
    console.log("🧪 Testing AI connection...");
    console.log("🧪 Testing direct API call first...");

    try {
        // Test direct API call
        const directResponse = await callAIDirectly("Hello, are you working?");
        if (directResponse) {
            console.log("🧪 Direct API test successful:", directResponse);
            alert("✅ AI Direct API Response: " + directResponse);
            return;
        }

        // Test full API call
        const response = await callAIAPI("Hello, are you working?");
        console.log("🧪 Full API test response:", response);
        alert("🤖 AI Test Response: " + response);
    } catch (error) {
        console.error("🧪 Test failed:", error);
        alert("❌ AI Test Failed: " + error.message);
    }
};

// Simple direct test function
window.testAIDirect = async function () {
    console.log("🧪 Testing DIRECT API only...");
    try {
        const response = await callAIDirectly("Test message");
        console.log("🧪 Direct test result:", response);
        alert("Direct API Result: " + (response || "No response"));
    } catch (error) {
        console.error("🧪 Direct test failed:", error);
        alert("Direct API Failed: " + error.message);
    }
};