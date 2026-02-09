/**
 * EU TEAM IMPORT TO GOOGLE SHEETS
 * Handles importing completed EU team tickets to Google Sheets
 */

// EU Google Apps Script Web App URL
// TODO: Replace with your actual EU Google Apps Script deployment URL after deploying scriptgs_eu.txt
const EU_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxx70shS7RkOO0lWmn3bVSH1Mw5vNprz5RJYHMZakOfZSMbMipciaDBzKaAfU0TbxKl/exec';
const EU_SECRET_TOKEN = '14092000';

// Track if EU import is in progress
let euImportInProgress = false;

/**
 * Import EU tickets to Google Sheets
 */
async function importEUTicketsToSheets() {
    console.log('🇪🇺 === EU IMPORT STARTED ===');

    if (euImportInProgress) {
        console.log('⚠️ EU import already in progress');
        showMessage('EU import is already in progress', 'warning');
        return;
    }

    try {
        euImportInProgress = true;

        // Show loading state
        const importButton = document.getElementById('import-eu-btn');
        if (importButton) {
            importButton.disabled = true;
            importButton.innerHTML = '⏳ <span class="hidden sm:inline">Importing...</span>';
        }

        console.log('📡 Calling EU Google Apps Script...');
        console.log('🌐 URL:', EU_APPS_SCRIPT_URL);

        // Call EU Google Apps Script
        const response = await fetch(EU_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                secret: EU_SECRET_TOKEN
            })
        });

        console.log('📊 Response status:', response.status);
        const result = await response.json();
        console.log('📦 Response data:', result);

        if (result.success) {
            console.log(`✅ Import successful: ${result.updated} tickets imported (${result.count} total processed)`);
            showMessage(`Successfully imported ${result.updated} EU tickets to Google Sheets`, 'success');

            // Mark tickets as imported in Supabase
            if (result.updated > 0) {
                console.log('📝 Marking tickets as imported in Supabase...');
                await markEUTicketsAsImported();
                console.log('✅ Tickets marked as imported');

                // Refresh the dashboard to show updated tickets (similar to NA import)
                console.log('🔄 Refreshing dashboard in 1.5 seconds...');
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                console.log('⚠️ No new tickets were imported');
            }
        } else {
            console.log('❌ Import failed:', result.message);
            throw new Error(result.message || 'Import failed');
        }

    } catch (error) {
        console.error('❌ Error importing EU tickets:', error);
        showMessage('Failed to import EU tickets: ' + error.message, 'error');
    } finally {
        euImportInProgress = false;

        // Restore button state
        const importButton = document.getElementById('import-eu-btn');
        if (importButton) {
            importButton.disabled = false;
            importButton.innerHTML = '🇪🇺 <span class="hidden sm:inline">Import EU</span>';
        }
    }
}

/**
 * Mark EU tickets as imported in Supabase
 */
async function markEUTicketsAsImported() {
    try {
        console.log('🔍 === MARKING EU TICKETS AS IMPORTED ===');

        // Get all EU tickets that need to be marked as imported
        console.log('📡 Fetching completed EU tickets from database...');
        const { data: euTickets, error: fetchError } = await supabaseClient
            .from('tickets')
            .select('id, ticket, assignee_account')
            .not('time_start', 'is', null)
            .not('time_end', 'is', null)
            .not('ticket_status_id', 'is', null)
            .eq('import_to_tracker', false);

        if (fetchError) {
            console.error('❌ Error fetching tickets:', fetchError);
            throw fetchError;
        }

        console.log(`📊 Found ${euTickets.length} completed tickets (not yet marked as imported)`);

        // Filter for EU team tickets
        const euTicketIds = [];
        console.log('🔍 Filtering for EU team tickets...');

        for (const ticket of euTickets) {
            const { data: agentData, error: agentError } = await supabaseClient
                .from('agent')
                .select('team')
                .eq('agent_account', ticket.assignee_account)
                .single();

            if (!agentError && agentData && agentData.team === 'EU') {
                console.log(`✅ Ticket ${ticket.ticket} - EU team (${ticket.assignee_account})`);
                euTicketIds.push(ticket.id);
            } else {
                console.log(`⏭️ Ticket ${ticket.ticket} - Not EU team (${ticket.assignee_account})`);
            }
        }

        console.log(`📋 Total EU tickets to mark: ${euTicketIds.length}`);

        if (euTicketIds.length > 0) {
            // Mark as imported
            console.log('📝 Updating import_to_tracker flag...');
            const { error: updateError } = await supabaseClient
                .from('tickets')
                .update({ import_to_tracker: true })
                .in('id', euTicketIds);

            if (updateError) {
                console.error('❌ Error updating tickets:', updateError);
                throw updateError;
            }

            console.log(`✅ Successfully marked ${euTicketIds.length} EU tickets as imported`);
        } else {
            console.log('⚠️ No EU tickets to mark as imported');
        }

    } catch (error) {
        console.error('❌ Error marking EU tickets as imported:', error);
        throw error;
    }
}

/**
 * Check if current user is in EU team
 */
async function isEUTeamMember(agentAccount) {
    try {
        const { data, error } = await supabaseClient
            .from('agent')
            .select('team')
            .eq('agent_account', agentAccount)
            .single();

        if (error) {
            console.error('Error checking team:', error);
            return false;
        }

        return data && data.team === 'EU';
    } catch (error) {
        console.error('Error in isEUTeamMember:', error);
        return false;
    }
}

/**
 * Initialize EU import functionality
 */
function initializeEUImport() {
    console.log('🔧 Initializing EU import functionality...');
    const importButton = document.getElementById('import-eu-btn');
    if (importButton) {
        console.log('✅ EU import button found, adding click listener');
        importButton.addEventListener('click', importEUTicketsToSheets);
    } else {
        console.log('⚠️ EU import button not found in DOM');
    }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        importEUTicketsToSheets,
        isEUTeamMember,
        initializeEUImport
    };
}

