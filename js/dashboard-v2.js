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

        // Popup State
        let popupCurrentTicket = null;
        let popupCurrentProject = null;
        let popupCurrentIssue = null;
        let popupCurrentTemplateId = null;

        // Filter and View State
        let currentTicketTypeFilter = 'all'; // 'all', 'fmop', 'aops'
        let currentViewMode = 'normal'; // 'normal', 'leader', 'mos'

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
                    otToggle.addEventListener('change', (e) => {
                        const assigneeContainer = assigneeSelect?.closest('div.bg-section');
                        const userContainer = userGreeting?.closest('div.bg-section');

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
                        }
                    });
                }
            }

            // Setup navigation buttons
            const refreshBtn = document.getElementById('refresh-tickets-btn');
            const csvImportBtn = document.getElementById('csv-import-btn');
            const adminPanelBtn = document.getElementById('admin-panel-btn');


            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    fetchAndRenderTickets();
                });
            }

            if (csvImportBtn) {
                csvImportBtn.addEventListener('click', () => {
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
            }
            
            // Event listeners
            ticketTableBody.addEventListener('click', handleTableClick);
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
                fetchAndRenderTickets();
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
                (settings.data || []).forEach(s => { allSettings[s.key] = s.value; });

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
                success: { daylight: 'bg-green-100 text-green-800 border-green-300', dark: 'bg-green-900/80 text-green-200 border-green-700', sunset: 'bg-green-900/80 text-green-200 border-green-700', twilight: 'bg-green-900/80 text-green-200 border-green-700', 'blossom-dawn': 'bg-green-100 text-green-800 border-green-300', 'blue-sky': 'bg-green-100 text-green-800 border-green-300'},
                error: { daylight: 'bg-red-100 text-red-800 border-red-300', dark: 'bg-red-900/80 text-red-200 border-red-700', sunset: 'bg-red-900/80 text-red-200 border-red-700', twilight: 'bg-red-900/80 text-red-200 border-red-700', 'blossom-dawn': 'bg-red-100 text-red-800 border-red-300', 'blue-sky': 'bg-red-100 text-red-800 border-red-300' },
                info: { daylight: 'bg-blue-100 text-blue-800 border-blue-300', dark: 'bg-blue-900/80 text-blue-200 border-blue-700', sunset: 'bg-indigo-900/80 text-indigo-200 border-indigo-700', twilight: 'bg-blue-900/80 text-blue-200 border-blue-700', 'blossom-dawn': 'bg-pink-100 text-pink-800 border-pink-300', 'blue-sky': 'bg-blue-100 text-blue-800 border-blue-300' },
                warning: { daylight: 'bg-yellow-100 text-yellow-800 border-yellow-300', dark: 'bg-yellow-900/80 text-yellow-200 border-yellow-700', sunset: 'bg-yellow-900/80 text-yellow-200 border-yellow-700', twilight: 'bg-yellow-900/80 text-yellow-200 border-yellow-700', 'blossom-dawn': 'bg-yellow-100 text-yellow-800 border-yellow-300', 'blue-sky': 'bg-yellow-100 text-yellow-800 border-yellow-300' }
            };

            const themeColors = (colorConfig[type] || colorConfig.info)[theme];
            if(themeColors) messageDiv.classList.add(...themeColors.split(' '));

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
                console.error('Lỗi khi lấy Ticket Statuses:', error);
                showMessage('Không thể tải danh sách trạng thái ticket.', 'error');
            }
        }
        async function populateVCNAgents() {
             if (!supabaseClient || vcnAgents.length > 0) return;
            try {
                const { data, error } = await supabaseClient.from('vcn_agent').select('stt, name');
                if (error) throw error;
                vcnAgents = data;
                // VCN agents are now used for user greeting and other purposes
                console.log('VCN Agents loaded:', vcnAgents.length);
            } catch (error) {
                console.error('Error when getting VCN Agents:', error);
                showMessage('Không thể tải danh sách VCN agent.', 'error');
            }
        }

        async function fetchAndRenderTickets() {
            // ALWAYS save scroll position before refreshing
            const scrollContainer = document.getElementById('ticket-scroll-container');
            const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;

            loaderContainer.classList.remove('hidden');
            const currentData = ticketTableBody.innerHTML;
            ticketTableBody.innerHTML = '';
            try {
                let query = supabaseClient.from('tickets').select('*').is('time_end', null);
                const selectedAssignee = assigneeSelect.value;
                if(selectedAssignee) query = query.eq('assignee_account', selectedAssignee);

                // Check view mode
                const isLeaderView = localStorage.getItem('leaderViewMode') === 'true';
                const isMosView = localStorage.getItem('mosViewMode') === 'true';

                if (isLeaderView) {
                    query = query.eq('need_leader_support', true);
                } else if (isMosView) {
                    query = query.eq('needMos', 'request');
                } else {
                    // For normal view, exclude tickets that need leader support or have MoS requests
                    // Use 'or' filter to handle null values properly
                    query = query.or('need_leader_support.is.null,need_leader_support.eq.false')
                                 .or('needMos.is.null,needMos.neq.request');
                }

                // Update view mode variable
                currentViewMode = isMosView ? 'mos' : (isLeaderView ? 'leader' : 'normal');

                const { data, error } = await query.order('id', { ascending: false });
                if (error) throw error;
                ticketsMap.clear();
                data.forEach(ticket => ticketsMap.set(ticket.id, ticket));
                if (data.length === 0) {
                   showMessage(selectedAssignee ? `Không tìm thấy ticket.` : 'Không có ticket nào.', 'info', 1500);
                   // Check if user completed all their tickets
                   checkAllTicketsCompleted();
                } else {
                    renderTable(data);
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

            let html = '';
            for (const poKey in groupedByPO) {
                const items = groupedByPO[poKey];
                const rowCount = items.length;
                const firstItem = items[0];

                items.forEach((item, index) => {
                    html += `<tr data-ticket-id="${item.id}" data-po-group="${poKey}">`;

                    if (index === 0) {
                        html += `
                            ${currentViewMode !== 'mos' ? `
                            <td class="px-4 py-4 align-middle text-center border-b border-main" rowspan="${rowCount}">
                                ${renderStartButton(firstItem)}
                            </td>
                            <td class="px-4 py-4 align-middle text-center border-b border-main" rowspan="${rowCount}">
                                ${renderEndButton(firstItem)}
                            </td>
                            ` : ''}
                            <td class="px-6 py-4 align-middle font-medium text-headings border-b border-main" rowspan="${rowCount}">
                                <a href="https://supporthub.service.csnzoo.com/browse/${firstItem.ticket}" target="_blank" class="text-blue-400 hover:text-blue-300 underline">
                                    ${firstItem.ticket || ''}
                                </a>
                            </td>
                            <td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">
                                <select data-action="status-change" data-ticket-id="${firstItem.id}" class="border border-secondary text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2">
                                    <option value="" selected>-- Chọn trạng thái --</option>
                                    ${ticketStatuses.map(s => `<option value="${s.id}">${s.status_name}</option>`).join('')}
                                </select>
                            </td>
                            <td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">${firstItem.issue_type || ''}</td>
                            <td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">${renderActionButtons(firstItem)}</td>
                            <td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">${firstItem.po || ''}</td>
                            <td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">
                                ${renderLastUpdateColumn(firstItem)}
                            </td>
                            <td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">
                                ${renderNeedHelpColumn(firstItem)}
                            </td>
                            ${currentViewMode === 'mos' ? `
                            <td class="px-6 py-4 text-center align-middle border-b border-main" rowspan="${rowCount}">
                                ${renderMosActionsColumn(firstItem)}
                            </td>
                            <td class="px-6 py-4 align-middle border-b border-main" rowspan="${rowCount}">
                                ${renderMosRequestDetailsColumn(firstItem)}
                            </td>
                            ` : ''}
                        `;
                    }
                    html += `</tr>`;
                });
            }
            ticketTableBody.innerHTML = html;

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

             // Add hover effect
            document.querySelectorAll('tr[data-po-group]').forEach(row => {
                row.addEventListener('mouseenter', (e) => {
                    const poGroup = e.currentTarget.dataset.poGroup;
                    document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(groupRow => groupRow.classList.add('group-hover'));
                });
                row.addEventListener('mouseleave', (e) => {
                    const poGroup = e.currentTarget.dataset.poGroup;
                    document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(groupRow => groupRow.classList.remove('group-hover'));
                });
            });

            // Load MOS request details if in MOS view
            if (currentViewMode === 'mos') {
                loadMosRequestDetails();
            }
        }

        async function loadMosRequestDetails() {
            // Get all ticket IDs currently displayed
            const ticketIds = Array.from(ticketsMap.keys());

            if (ticketIds.length === 0) return;

            try {
                // Fetch MOS request details for all displayed tickets
                const { data: mosRequests, error } = await supabaseClient
                    .from('mos_requests')
                    .select('ticket_id, description')
                    .in('ticket_id', ticketIds)
                    .eq('status', 'request');

                if (error) throw error;

                // Update the details in the table
                mosRequests.forEach(mosRequest => {
                    const detailsElement = document.getElementById(`mos-details-${mosRequest.ticket_id}`);
                    if (detailsElement) {
                        if (mosRequest.description) {
                            detailsElement.innerHTML = `<span class="text-sm font-medium text-headings">${mosRequest.description}</span>`;
                        } else {
                            detailsElement.innerHTML = `<span class="text-secondary italic">No details provided</span>`;
                        }
                    }
                });
            } catch (error) {
                console.error('Error loading MOS request details:', error);
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
                // In MoS view, show requester name
                const requesterName = allAgentsMap.get(item.assignee_account) || item.assignee_account;
                return `<span class="text-sm font-medium text-purple-600">Requested by: ${requesterName}</span>`;
            } else {
                // Regular view - show buttons and MoS status
                let mosStatusIcon = '';
                if (item.needMos === 'approved') {
                    mosStatusIcon = '<div class="text-green-600 text-xs mt-1">✅ MoS Approved</div>';
                } else if (item.needMos === 'rejected') {
                    mosStatusIcon = '<div class="text-red-600 text-xs mt-1">❌ MoS Rejected</div>';
                }

                return `
                    <div class="flex flex-col gap-1">
                        <button onclick="sendToLeader(${item.id})" class="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium rounded transition-colors">
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
            }

            try {
                const { error } = await supabaseClient.from('tickets').update(payload).in('id', ticketIds);
                if (error) throw error;

                showMessage(`Nhóm ticket đã được ${action === 'start' ? 'bắt đầu' : 'kết thúc'}.`, 'success');

                if (action === 'start') {
                    // Update the start button to show the time without refreshing the entire table
                    updateStartButtonDisplay(ticketIds);
                } else if (action === 'end') {
                    // Handle KPI update for end action
                    await handleEndTicket(firstTicketId);

                    // Refresh data from database
                    // Scroll position is automatically preserved by fetchAndRenderTickets()
                    await fetchAndRenderTickets();
                }
            } catch(error) {
                console.error(`Lỗi khi ${action} nhóm:`, error);
                showMessage(`Không thể ${action} nhóm ticket.`, 'error');
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
            const issues = [...new Set(projectTemplates.map(t => t.issue))].sort((a,b) => a.localeCompare(b));
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
                    .sort((a,b) => a.name.localeCompare(b.name));
            }

            if(filteredTemplates.length === 0) {
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
             if(item) {
                 popupCurrentTemplateId = item.dataset.templateId;
                 const template = allTemplates.find(t => t.id === popupCurrentTemplateId);

                 // If template requires carrier email, show that modal first
                 if (template && template.emailCarrier) {
                     const result = await openCarrierEmailModal(template, true);
                     // Only continue to template if user clicked "Continue"
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
            
            popupWelcomeScreen.classList.add('hidden');
            popupTemplateViewer.innerHTML = `
                <h3 id="viewer-title" class="text-2xl font-bold mb-2 text-headings"></h3>
                <p id="viewer-category" class="text-sm text-secondary mb-4"></p>
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
                                <label for="viewer-manual-supplier-name" class="block text-sm font-medium text-red-500">Không tìm thấy ID, nhập tên NCC</label>
                                <input type="text" id="viewer-manual-supplier-name" class="mt-1 w-full p-2 border-red-500 rounded-md">
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
                        <button id="copy-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                            Sao chép & Tiếp tục
                        </button>
                    </div>
                    <div id="final-output" class="w-full p-4 border border-secondary rounded-lg bg-section min-h-[250px] whitespace-pre-wrap"></div>
                    <div id="copy-feedback" class="mt-2 text-green-400 font-medium opacity-0">Đã sao chép!</div>
                </div>`;
            popupTemplateViewer.classList.remove('hidden');

            document.getElementById('viewer-title').textContent = template.name;
            document.getElementById('viewer-category').textContent = `Dự án: ${template.projects?.name || 'N/A'} / Danh mục: ${template.issue}`;
            
            const placeholderMap = new Map(allPlaceholders.map(p => [p.key, p]));

            // Render logic for all placeholders including optional ones
            renderAllPlaceholders(template, placeholderMap);
            
            // Auto-fill common fields
            document.getElementById('viewer-su-id').value = ticketData.suid || '';
            const supplierName = await findSupplierName(ticketData.suid);
            document.getElementById('viewer-manual-supplier-container').classList.toggle('hidden', !supplierName);
            if(supplierName) document.getElementById('viewer-manual-supplier-name').value = supplierName;
            
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
            const ignoredPlaceholders = new Set(['signature', 'Customer_Name', 'Order_Number', 'Brand']);

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
            const manualSupplierName = document.getElementById('viewer-manual-supplier-name').value.trim();
            
            let content = template.content || '';
            let greeting = '';

            // Check if template has {{greeting}} placeholder
            const hasGreetingPlaceholder = content.includes('{{greeting}}');

            // Generate greeting text
            if (agentName) {
                greeting = (allSettings.greeting_person?.value || 'Hi {{name}},').replace('{{name}}', toTitleCase(agentName));
            } else if (manualSupplierName) {
                greeting = (allSettings.greeting_team?.value || 'Hi {{name}} Team,').replace('{{name}}', cleanSupplierName(manualSupplierName));
            }

            // Handle greeting placeholder replacement
            if (hasGreetingPlaceholder) {
                // Replace {{greeting}} placeholder with the greeting text
                content = content.replace(/\{\{greeting\}\}/g, greeting);
                // Don't add greeting separately since it's already in the content
                greeting = '';
            } else {
                // Check if template needs greeting (default true for backward compatibility)
                const needsGreeting = template.needGreeting !== false;
                if (!needsGreeting) {
                    greeting = '';
                }
            }

            // Process special placeholders {{carrier}} and {{name}} for SUID search logic
            if (content.includes('{{carrier}}') || content.includes('{{name}}')) {
                // If agentName is available, replace {{name}} with it
                if (agentName) {
                    content = content.replace(/\{\{name\}\}/g, toTitleCase(agentName));
                }
                // {{carrier}} placeholder - this would be replaced with actual carrier data
                // For now, we'll leave it as is for manual replacement
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
            const footerText = (template.includeFooter && allSettings.footer_text?.value) ? allSettings.footer_text.value : '';

            const assigneeAccount = popupCurrentTicket.assignee_account;
            const assigneeName = allAgentsMap.get(assigneeAccount);
            const signature = allSignatures.find(s => s.name === assigneeName) || allSignatures.find(s => s.isDefault) || allSignatures[0];
            let signatureText = signature ? `${signature.name}\n${signature.title || ''}\n${signature.department || ''}`.trim() : '';

            let finalPlainText = `${greeting ? greeting + '\n\n' : ''}${content}${footerText ? `\n\n${footerText}` : ''}\n\nBest regards,\n${signatureText}`;

            const finalOutput = document.getElementById('final-output');
            finalOutput.innerHTML = formatTextForDisplay(finalPlainText, footerText);
            finalOutput.dataset.plainText = finalPlainText;
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
                 if(!viewer) return text;

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
        
        function formatTextForDisplay(plainText, footerText) {
            const escapeHTML = (str) => str.replace(/[&<>"']/g, (match) => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'}[match]));
            let processedPlainText = plainText.replace(/(https?:\/\/[^\s]+)([^\s])/g, '$1 $2');
            let html = escapeHTML(processedPlainText).replace(/\n/g, '<br>');
            if (footerText) {
                const escapedFooter = escapeHTML(footerText).replace(/\n/g, '<br>');
                html = html.replace(escapedFooter, `<i>${escapedFooter}</i>`);
            }
            const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
            return html.replace(urlRegex, `<a href="$1" target="_blank" class="text-blue-500 hover:underline">$1</a>`);
        }

        async function handleCopyAndContinue() {
            if (!validatePlaceholders()) return;

            const finalOutput = document.getElementById('final-output');
            copyRichTextToClipboard(finalOutput);

            closeTemplateSelectionModalHandler();
            const template = allTemplates.find(t => t.id === popupCurrentTemplateId);
            if (!template) return;

            setTimeout(async () => {
                if (template.followUpGuide) await openFollowUpGuideModal(template.followUpGuide);
                if (template.sendToCustomer) await openCustomerEmailModal(template);
                if (template.addLabelReminder && template.labelName) await openLabelReminderModal(template.labelName);
            }, 400);
        }
        
        function validatePlaceholders() {
            const missingFields = [];
            const viewer = document.getElementById('popup-template-viewer');
            
            if (!document.getElementById('viewer-agent-name').value.trim() && !document.getElementById('viewer-manual-supplier-name').value.trim()) {
                missingFields.push('Tên riêng Người nhận hoặc Tên NCC');
            }

            viewer.querySelectorAll('[data-placeholder-key]').forEach(input => {
                const isVisible = input.offsetParent !== null;
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
            if (!suid) return null;
            let parentSuid = suid; // Assume the provided suid is the parent by default

            try {
                // Step 1: ALWAYS check the 'children' table first.
                const { data: childData, error: childError } = await supabaseClient
                    .from('children')
                    .select('parentSuid')
                    .eq('suchildid', suid)
                    .single();

                // If a child record is found, use its parentSuid.
                // Ignore errors from children table (table might not exist or no matching record)
                if (!childError && childData) {
                    parentSuid = childData.parentSuid;
                }
                // Silently ignore 406 errors or PGRST116 (no rows found) from children table

                // Step 2: Now, use the determined parentSuid to find the supplier name.
                const { data: supplierData, error: supplierError } = await supabaseClient
                    .from('suppliers')
                    .select('suname')
                    .eq('suid', parentSuid)
                    .single();

                if (supplierError && supplierError.code !== 'PGRST116') { // Ignore "exact one row" error if no parent found
                    console.error('Error fetching supplier name for suid:', parentSuid, supplierError);
                    return null;
                }

                return supplierData ? cleanSupplierName(supplierData.suname) : null;

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
                    emailBody = emailBody
                        .replace(/\{\{ticket\}\}/g, ticket)
                        .replace(/\{\{PO\}\}/g, po)
                        .replace(/\{\{carrier\}\}/g, carrierName);

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

                // Initial preview update
                updateCarrierPreview();

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

        async function requestMos(ticketId) {
            // Show popup to ask for request details
            const requestDetails = prompt('Please provide details for your MoS request:');

            // If user cancels, don't proceed
            if (requestDetails === null) {
                return;
            }

            try {
                const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

                // Update ticket needMos status to 'request'
                const { error: ticketError } = await supabaseClient
                    .from('tickets')
                    .update({ needMos: 'request' })
                    .eq('id', ticketId);

                if (ticketError) throw ticketError;

                // Create MoS request record with description
                const { error: mosError } = await supabaseClient
                    .from('mos_requests')
                    .insert({
                        ticket_id: ticketId,
                        requester_id: currentUser.stt,
                        status: 'request',
                        description: requestDetails || ''
                    });

                if (mosError) throw mosError;

                // Create notification for leaders/keys
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

                showMessage('MoS request đã được gửi', 'success');

                // Remove the row from current view
                const row = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
                if (row) {
                    const poGroup = row.dataset.poGroup;
                    document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(r => r.remove());
                }
            } catch (error) {
                console.error('Error requesting MoS:', error);
                showMessage('Không thể gửi MoS request', 'error');
            }
        }

        async function approveMos(ticketId) {
            try {
                const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

                // Update ticket needMos status to 'approved'
                const { error: ticketError } = await supabaseClient
                    .from('tickets')
                    .update({ needMos: 'approved' })
                    .eq('id', ticketId);

                if (ticketError) throw ticketError;

                // Update MoS request record
                const { error: mosError } = await supabaseClient
                    .from('mos_requests')
                    .update({
                        status: 'approved',
                        responder_id: currentUser.stt,
                        response_date: new Date().toISOString()
                    })
                    .eq('ticket_id', ticketId)
                    .eq('status', 'request');

                if (mosError) throw mosError;

                // Get requester info and create notification
                const { data: mosRequest } = await supabaseClient
                    .from('mos_requests')
                    .select('requester_id')
                    .eq('ticket_id', ticketId)
                    .eq('status', 'approved')
                    .single();

                if (mosRequest) {
                    await supabaseClient.from('notifications').insert({
                        recipient_id: mosRequest.requester_id,
                        message: `Your MoS request for ticket ${ticketsMap.get(ticketId)?.ticket || ticketId} has been approved`,
                        type: 'mos_approved',
                        related_ticket_id: ticketId
                    });
                }

                showMessage('MoS request đã được phê duyệt', 'success');

                // Remove the row from current view
                const row = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
                if (row) {
                    const poGroup = row.dataset.poGroup;
                    document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(r => r.remove());
                }
            } catch (error) {
                console.error('Error approving MoS:', error);
                showMessage('Không thể phê duyệt MoS request', 'error');
            }
        }

        async function rejectMos(ticketId) {
            try {
                const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

                // Update ticket needMos status to 'rejected'
                const { error: ticketError } = await supabaseClient
                    .from('tickets')
                    .update({ needMos: 'rejected' })
                    .eq('id', ticketId);

                if (ticketError) throw ticketError;

                // Update MoS request record
                const { error: mosError } = await supabaseClient
                    .from('mos_requests')
                    .update({
                        status: 'rejected',
                        responder_id: currentUser.stt,
                        response_date: new Date().toISOString()
                    })
                    .eq('ticket_id', ticketId)
                    .eq('status', 'request');

                if (mosError) throw mosError;

                // Get requester info and create notification
                const { data: mosRequest } = await supabaseClient
                    .from('mos_requests')
                    .select('requester_id')
                    .eq('ticket_id', ticketId)
                    .eq('status', 'rejected')
                    .single();

                if (mosRequest) {
                    await supabaseClient.from('notifications').insert({
                        recipient_id: mosRequest.requester_id,
                        message: `Your MoS request for ticket ${ticketsMap.get(ticketId)?.ticket || ticketId} has been rejected`,
                        type: 'mos_rejected',
                        related_ticket_id: ticketId
                    });
                }

                showMessage('MoS request đã bị từ chối', 'success');

                // Remove the row from current view
                const row = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
                if (row) {
                    const poGroup = row.dataset.poGroup;
                    document.querySelectorAll(`tr[data-po-group="${poGroup}"]`).forEach(r => r.remove());
                }
            } catch (error) {
                console.error('Error rejecting MoS:', error);
                showMessage('Không thể từ chối MoS request', 'error');
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

                // Update ticket with issue_type (KPI ID)
                const updateData = {
                    issue_type: kpiData ? kpiData.id : ticket.issue_type
                };

                const { error: updateError } = await supabaseClient
                    .from('tickets')
                    .update(updateData)
                    .eq('id', ticketId);

                if (updateError) throw updateError;

                // Send ticket ID to Google Sheets tracker in background (don't wait)
                // The Apps Script will fetch data from tickets_export_v view
                sendTicketToGoogleSheets(ticketId); // No await - runs in background

            } catch (error) {
                console.error('Error handling end ticket:', error);
                showMessage('Lỗi khi xử lý kết thúc ticket', 'error');
            }
        }

        // Send ticket ID to Google Sheets - Apps Script will fetch data from tickets_export_v
        // Runs in background, doesn't block UI
        function sendTicketToGoogleSheets(ticketId) {
            try {
                // Send to Google Sheets Web App using image beacon (fire-and-forget)
                const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzDXf9HPZi9NiJy-f8Enw9ZINljy2njMSWcZFXnrKCDzRPpAwwipIsTTMjP3lTtPZM07A/exec';
                const SECRET_TOKEN = '14092000';

                // Encode data as URL parameters - just send ticket ID
                const params = new URLSearchParams({
                    secret: SECRET_TOKEN,
                    ticketId: ticketId
                });

                // Use image beacon for fire-and-forget request (no CORS, no waiting)
                const img = new Image();
                img.style.display = 'none';

                img.onload = () => {
                    console.log('✅ Ticket export request sent to Google Sheets:', ticketId);
                    document.body.removeChild(img);
                };

                img.onerror = () => {
                    // This is expected - Google Apps Script returns HTML, not an image
                    // But the request was sent successfully
                    console.log('✅ Ticket export request sent to Google Sheets:', ticketId);
                    document.body.removeChild(img);
                };

                img.src = `${GOOGLE_SHEETS_URL}?${params.toString()}`;
                document.body.appendChild(img);

            } catch (error) {
                console.error('Error sending ticket to Google Sheets:', error);
                // Don't show error to user - this is a background operation
            }
        }

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

                // Count MoS requests for leaders/keys
                if (currentUser.level === 'leader' || currentUser.level === 'key') {
                    const { data: mosRequests, error: mosError } = await supabaseClient
                        .from('mos_requests')
                        .select('*')
                        .eq('status', 'request');

                    if (mosError) throw mosError;

                    const mosBadge = document.getElementById('mos-notification-badge');
                    if (mosBadge) {
                        const mosCount = mosRequests?.length || 0;
                        mosBadge.textContent = mosCount;
                        mosBadge.style.display = mosCount > 0 ? 'inline' : 'none';
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
            event.stopPropagation(); // Prevent the notification from being marked as read
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

                    // Check if it's exactly 8:28 AM (within a 1-minute window)
                    const isTargetTime = hours === 8 && minutes === 28;

                    // Check if we've already shown the popup today
                    const popupShownKey = `manual_schedule_popup_shown_${today}`;
                    const popupAlreadyShown = localStorage.getItem(popupShownKey) === 'true';

                    if (isTargetTime && !popupAlreadyShown) {
                        // Show full-screen popup at 8:28 AM
                        showManualSchedulePopup(assignment);
                        localStorage.setItem(popupShownKey, 'true');
                    } else {
                        // Show banner notification at other times
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
                    <h1 class="text-5xl font-bold text-white mb-4">Manual Schedule Assignment</h1>
                    <p class="text-2xl text-orange-100 mb-6">You have been assigned to work on:</p>
                    <div class="bg-white bg-opacity-20 rounded-xl p-6 mb-8">
                        <p class="text-4xl font-bold text-white">${assignment.account_export_name}</p>
                    </div>
                    <p class="text-xl text-orange-200 mb-8">Please start your work for today!</p>
                    <button onclick="closeManualSchedulePopup()"
                            class="bg-white text-orange-600 px-8 py-4 rounded-full text-xl font-bold hover:bg-orange-50 transition-all transform hover:scale-105 shadow-lg">
                        Got it! Let's start 🚀
                    </button>
                </div>
            `;
            document.body.appendChild(popup);
        }

        window.closeManualSchedulePopup = function() {
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
            banner.className = 'bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 mb-4 rounded-lg shadow-lg border-l-4 border-orange-600';
            banner.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="text-2xl">📋</div>
                        <div>
                            <h3 class="font-bold text-lg">Manual Schedule Assignment</h3>
                            <p class="text-orange-100">You have been assigned to work on manual schedule today.</p>
                            <p class="text-sm text-orange-200">Account: <span class="font-semibold">${assignment.account_export_name}</span></p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="openManualRescheduleTask(event)"
                                class="bg-white text-orange-600 px-4 py-2 rounded-lg font-semibold hover:bg-orange-50 transition-colors">
                            🚀 Start Task
                        </button>
                        <button onclick="dismissManualRescheduleBanner()"
                                class="bg-orange-600 text-white px-3 py-2 rounded-lg hover:bg-orange-700 transition-colors">
                            ✕
                        </button>
                    </div>
                </div>
            `;

            // Insert banner at the top of the main content
            const mainContent = document.querySelector('.container');
            if (mainContent && mainContent.firstChild) {
                mainContent.insertBefore(banner, mainContent.firstChild);
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
                            console.log('New notification received:', payload);
                            // Update notification counts
                            updateNotificationCounts();
                            // Show a toast notification
                            showMessage('🔔 New notification received', 'info');
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
                            console.log('Notification updated:', payload);
                            // Update notification counts
                            updateNotificationCounts();
                        }
                    )
                    .subscribe();

                // Subscribe to MoS requests for leaders/keys
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
                                console.log('New MoS request received:', payload);
                                // Update notification counts
                                updateNotificationCounts();
                                // Show a toast notification
                                showMessage('🔔 New MoS request received', 'info');
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
                                console.log('MoS request updated:', payload);
                                // Update notification counts
                                updateNotificationCounts();
                            }
                        )
                        .subscribe();
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
                            console.log('New schedule assignment received:', payload);
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
                            console.log('Schedule assignment updated:', payload);
                            // Check for updated manual reschedule assignment
                            checkManualRescheduleAssignment();
                        }
                    )
                    .subscribe();

                console.log('✅ Realtime subscriptions setup complete');
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

        // Fireworks effect
        function createFireworks() {
            const container = document.getElementById('fireworks-container');
            if (!container) return;

            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500'];

            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const x = Math.random() * window.innerWidth;
                    const y = Math.random() * (window.innerHeight * 0.5);

                    for (let j = 0; j < 30; j++) {
                        const firework = document.createElement('div');
                        firework.className = 'firework';
                        firework.style.left = x + 'px';
                        firework.style.top = y + 'px';
                        firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

                        const angle = (Math.PI * 2 * j) / 30;
                        const velocity = 50 + Math.random() * 100;
                        firework.style.setProperty('--x', Math.cos(angle) * velocity + 'px');
                        firework.style.setProperty('--y', Math.sin(angle) * velocity + 'px');

                        container.appendChild(firework);

                        setTimeout(() => firework.remove(), 1000);
                    }
                }, i * 300);
            }
        }

        function showCongratulations(message) {
            const overlay = document.getElementById('congrats-overlay');
            const messageEl = document.getElementById('congrats-message');
            const closeBtn = document.getElementById('congrats-close-btn');

            if (!overlay || !messageEl || !closeBtn) return;

            messageEl.textContent = message;
            overlay.classList.remove('hidden');

            createFireworks();

            closeBtn.onclick = () => {
                overlay.classList.add('hidden');
            };

            // Auto close after 5 seconds
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 5000);
        }

        function checkAllTicketsCompleted() {
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            const selectedAssignee = assigneeSelect.value;

            // Only check if user is viewing their own tickets
            if (!selectedAssignee || selectedAssignee !== currentUser.agent_account) {
                return;
            }

            const isLeaderView = localStorage.getItem('leaderViewMode') === 'true';
            const isMosView = localStorage.getItem('mosViewMode') === 'true';

            // Check if there are any tickets in the current view
            const hasTickets = ticketsMap.size > 0;

            if (!hasTickets) {
                let message = "Congratulations on completing all tickets!";

                if (isLeaderView) {
                    message = "Congratulations on completing all AOPS tickets!";
                } else if (isMosView) {
                    message = "Congratulations on completing all FMOP tickets!";
                }

                showCongratulations(message);
            }
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