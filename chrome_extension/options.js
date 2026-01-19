// Options page JavaScript for YUTorah Notes Extension

document.addEventListener('DOMContentLoaded', async () => {
    // Load existing API key
    await loadApiKey();

    // Load storage stats
    await updateStorageStats();

    // Load custom prompts
    await loadCustomPrompts();

    // Load key mode and usage stats
    await loadKeyMode();
    await updateUsageDisplay();

    // Event listeners
    document.getElementById('saveApiKey').addEventListener('click', saveApiKey);
    document.getElementById('testApiKey').addEventListener('click', testApiKey);
    document.getElementById('clearApiKey').addEventListener('click', clearApiKey);
    document.getElementById('toggleApiKey').addEventListener('click', toggleApiKeyVisibility);
    document.getElementById('viewNotes').addEventListener('click', viewNotes);
    document.getElementById('exportNotes').addEventListener('click', exportNotes);
    document.getElementById('importNotes').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importNotes);
    document.getElementById('clearCache').addEventListener('click', clearCache);
    document.getElementById('savePrompts').addEventListener('click', saveCustomPrompts);
    document.getElementById('resetPrompts').addEventListener('click', resetCustomPrompts);
    document.getElementById('togglePrompts').addEventListener('click', togglePromptsSection);

    // Mode selection event listeners
    document.getElementById('saveMode').addEventListener('click', saveKeyMode);
    document.querySelectorAll('input[name="keyMode"]').forEach(radio => {
        radio.addEventListener('change', handleModeChange);
    });
});

/**
 * Load existing API key from storage
 */
async function loadApiKey() {
    try {
        const apiKey = await Storage.getApiKey();
        if (apiKey) {
            document.getElementById('apiKey').value = apiKey;
            showStatus('apiKeyStatus', 'API key loaded', 'success');
        }
    } catch (error) {
        console.error('Error loading API key:', error);
    }
}

/**
 * Save API key to storage
 */
async function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiKey) {
        showStatus('apiKeyStatus', 'Please enter an API key', 'error');
        return;
    }

    try {
        await Storage.setApiKey(apiKey);
        // Automatically switch to custom mode when saving a custom key
        await Storage.setKeyMode('custom');
        document.getElementById('modeCustom').checked = true;
        showStatus('apiKeyStatus', 'API key saved successfully! Switched to Custom Key mode.', 'success');
    } catch (error) {
        showStatus('apiKeyStatus', 'Error saving API key: ' + error.message, 'error');
    }
}

/**
 * Test API key by making a simple request
 */
async function testApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiKey) {
        showStatus('apiKeyStatus', 'Please enter an API key first', 'error');
        return;
    }

    showStatus('apiKeyStatus', 'Testing API key...', 'info');

    try {
        // Make a simple request to test the API key
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (response.ok) {
            showStatus('apiKeyStatus', '✅ API key is valid and working!', 'success');
        } else {
            const error = await response.text();
            showStatus('apiKeyStatus', '❌ API key is invalid: ' + error, 'error');
        }
    } catch (error) {
        showStatus('apiKeyStatus', '❌ Error testing API key: ' + error.message, 'error');
    }
}

/**
 * Clear API key from storage
 */
async function clearApiKey() {
    if (!confirm('Are you sure you want to clear your API key?')) {
        return;
    }

    try {
        await Storage.setApiKey('');
        document.getElementById('apiKey').value = '';
        showStatus('apiKeyStatus', 'API key cleared', 'success');
    } catch (error) {
        showStatus('apiKeyStatus', 'Error clearing API key: ' + error.message, 'error');
    }
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
    const input = document.getElementById('apiKey');
    const button = document.getElementById('toggleApiKey');

    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

/**
 * Update storage statistics
 */
async function updateStorageStats() {
    try {
        const stats = await Storage.getStorageStats();

        document.getElementById('noteCount').textContent = stats.noteCount;
        document.getElementById('storageUsed').textContent = formatBytes(stats.bytesInUse);
        document.getElementById('storageAvailable').textContent = formatBytes(stats.quotaBytes - stats.bytesInUse);
    } catch (error) {
        console.error('Error loading storage stats:', error);
    }
}

/**
 * View all notes
 */
function viewNotes() {
    chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
}

/**
 * Export notes to JSON file
 */
async function exportNotes() {
    try {
        const json = await Storage.exportNotes();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `yutorah-notes-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        alert('Notes exported successfully!');
    } catch (error) {
        alert('Error exporting notes: ' + error.message);
    }
}

/**
 * Import notes from JSON file
 */
async function importNotes(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        await Storage.importNotes(text);
        await updateStorageStats();
        alert('Notes imported successfully!');
    } catch (error) {
        alert('Error importing notes: ' + error.message);
    }

    // Reset file input
    event.target.value = '';
}

/**
 * Clear all cached notes
 */
async function clearCache() {
    if (!confirm('Are you sure you want to clear all cached notes? This cannot be undone.')) {
        return;
    }

    try {
        await Storage.clearAllNotes();
        await updateStorageStats();
        alert('All notes cleared successfully!');
    } catch (error) {
        alert('Error clearing notes: ' + error.message);
    }
}

/**
 * Show status message
 */
function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Load custom prompts
 */
async function loadCustomPrompts() {
    try {
        const prompts = await Storage.getCustomPrompts();
        if (prompts.notesPrompt) {
            document.getElementById('customNotesPrompt').value = prompts.notesPrompt;
        }
        if (prompts.transcriptPrompt) {
            document.getElementById('customTranscriptPrompt').value = prompts.transcriptPrompt;
        }
    } catch (error) {
        console.error('Error loading custom prompts:', error);
    }
}

/**
 * Save custom prompts
 */
async function saveCustomPrompts() {
    const notesPrompt = document.getElementById('customNotesPrompt').value.trim();
    const transcriptPrompt = document.getElementById('customTranscriptPrompt').value.trim();

    try {
        await Storage.setCustomPrompts(
            notesPrompt || null,
            transcriptPrompt || null
        );
        showStatus('promptStatus', 'Custom prompts saved successfully!', 'success');
    } catch (error) {
        showStatus('promptStatus', 'Error saving prompts: ' + error.message, 'error');
    }
}

/**
 * Reset custom prompts to default
 */
async function resetCustomPrompts() {
    if (!confirm('Reset to default prompts? Your custom prompts will be deleted.')) {
        return;
    }

    try {
        await Storage.setCustomPrompts(null, null);
        document.getElementById('customNotesPrompt').value = '';
        document.getElementById('customTranscriptPrompt').value = '';
        showStatus('promptStatus', 'Prompts reset to default', 'success');
    } catch (error) {
        showStatus('promptStatus', 'Error resetting prompts: ' + error.message, 'error');
    }
}

/**
 * Toggle the custom prompts section visibility
 */
function togglePromptsSection() {
    const section = document.getElementById('promptsSection');
    const button = document.getElementById('togglePrompts');

    if (section.style.display === 'none') {
        section.style.display = 'block';
        button.textContent = '🔼 Hide Advanced Options';
    } else {
        section.style.display = 'none';
        button.textContent = '🔧 Advanced Options (Optional)';
    }
}

/**
 * Load and display current key mode
 */
async function loadKeyMode() {
    try {
        const mode = await Storage.getKeyMode();

        // Set the radio button
        if (mode === 'custom') {
            document.getElementById('modeCustom').checked = true;
        } else {
            document.getElementById('modeDefault').checked = true;
        }

        // Update UI visibility
        handleModeChange();
    } catch (error) {
        console.error('Error loading key mode:', error);
    }
}

/**
 * Handle mode change (show/hide relevant sections)
 */
function handleModeChange() {
    const mode = document.querySelector('input[name="keyMode"]:checked').value;
    const customKeySection = document.getElementById('customKeySection');
    const usageStats = document.getElementById('usageStats');

    if (mode === 'custom') {
        customKeySection.style.display = 'block';
        usageStats.style.display = 'none';
    } else {
        customKeySection.style.display = 'none';
        usageStats.style.display = 'block';
        updateUsageDisplay();
    }
}

/**
 * Save key mode selection
 */
async function saveKeyMode() {
    const mode = document.querySelector('input[name="keyMode"]:checked').value;

    try {
        await Storage.setKeyMode(mode);
        showStatus('modeStatus', `Switched to ${mode === 'custom' ? 'Custom Key' : 'Default Keys'} mode`, 'success');

        // Update usage display if switching to default mode
        if (mode === 'default') {
            await updateUsageDisplay();
        }
    } catch (error) {
        showStatus('modeStatus', 'Error saving mode: ' + error.message, 'error');
    }
}

/**
 * Update usage statistics display
 */
async function updateUsageDisplay() {
    try {
        const usage = await Storage.getDailyUsage();
        const DAILY_LIMIT = 3;

        // Update text
        document.getElementById('usageText').textContent = `${usage.count} / ${DAILY_LIMIT} requests used today`;

        // Update progress bar
        const percentage = (usage.count / DAILY_LIMIT) * 100;
        const usageBar = document.getElementById('usageBar');
        usageBar.style.width = percentage + '%';

        // Change color based on usage
        usageBar.className = 'usage-bar';
        if (percentage >= 100) {
            usageBar.classList.add('danger');
        } else if (percentage >= 70) {
            usageBar.classList.add('warning');
        }

        // Calculate time until reset
        const resetDate = new Date(usage.resetDate);
        resetDate.setDate(resetDate.getDate() + 1);
        resetDate.setHours(0, 0, 0, 0);

        const now = new Date();
        const hoursUntilReset = Math.ceil((resetDate - now) / (1000 * 60 * 60));

        document.getElementById('resetText').textContent =
            hoursUntilReset > 0 ? `Resets in ${hoursUntilReset} hour${hoursUntilReset !== 1 ? 's' : ''}` : 'Resets at midnight';
    } catch (error) {
        console.error('Error updating usage display:', error);
    }
}
