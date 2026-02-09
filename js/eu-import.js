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
    if (euImportInProgress) {
        showMessage('EU import is already in progress', 'warning');
        return;
    }

    try {
        euImportInProgress = true;

        // Show loading state
        const importButton = document.getElementById('import-eu-btn');
        if (importButton) {
            importButton.disabled = true;
            importButton.textContent = 'Importing...';
        }

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

        const result = await response.json();

        if (result.success) {
            showMessage(`Successfully imported ${result.updated} EU tickets to Google Sheets`, 'success');

            // Mark tickets as imported in Supabase
            if (result.updated > 0) {
                await markEUTicketsAsImported();

                // Refresh the dashboard to show updated tickets (similar to NA import)
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            }
        } else {
            throw new Error(result.message || 'Import failed');
        }

    } catch (error) {
        console.error('Error importing EU tickets:', error);
        showMessage('Failed to import EU tickets: ' + error.message, 'error');
    } finally {
        euImportInProgress = false;

        // Restore button state
        const importButton = document.getElementById('import-eu-btn');
        if (importButton) {
            importButton.disabled = false;
            importButton.textContent = 'Import EU Tickets';
        }
    }
}

/**
 * Mark EU tickets as imported in Supabase
 */
async function markEUTicketsAsImported() {
    try {
        // Get all EU tickets that need to be marked as imported
        const { data: euTickets, error: fetchError } = await supabaseClient
            .from('tickets')
            .select('id, assignee_account')
            .not('time_start', 'is', null)
            .not('time_end', 'is', null)
            .not('ticket_status_id', 'is', null)
            .eq('import_to_tracker', false);

        if (fetchError) throw fetchError;

        // Filter for EU team tickets
        const euTicketIds = [];
        for (const ticket of euTickets) {
            const { data: agentData, error: agentError } = await supabaseClient
                .from('agent')
                .select('team')
                .eq('agent_account', ticket.assignee_account)
                .single();

            if (!agentError && agentData && agentData.team === 'EU') {
                euTicketIds.push(ticket.id);
            }
        }

        if (euTicketIds.length > 0) {
            // Mark as imported
            const { error: updateError } = await supabaseClient
                .from('tickets')
                .update({ import_to_tracker: true })
                .in('id', euTicketIds);

            if (updateError) throw updateError;

            console.log(`Marked ${euTicketIds.length} EU tickets as imported`);
        }

    } catch (error) {
        console.error('Error marking EU tickets as imported:', error);
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
    const importButton = document.getElementById('import-eu-btn');
    if (importButton) {
        importButton.addEventListener('click', importEUTicketsToSheets);
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

