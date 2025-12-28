// Background service worker for YUTorah Notes Extension
// Handles API calls, caching, and message passing

// Import storage and API modules
importScripts('storage.js', 'gemini-api.js');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'processShiur') {
        handleProcessShiur(request, sendResponse);
        return true; // Keep the message channel open for async response
    } else if (request.action === 'checkApiKey') {
        handleCheckApiKey(sendResponse);
        return true;
    } else if (request.action === 'getStorageStats') {
        handleGetStorageStats(sendResponse);
        return true;
    } else if (request.action === 'deleteNote') {
        handleDeleteNote(request, sendResponse);
        return true;
    }
});

/**
 * Handle shiur processing request
 */
async function handleProcessShiur(request, sendResponse) {
    const { mp3Url, type, pageUrl, pageTitle } = request;

    try {
        if (!mp3Url) {
            sendResponse({
                success: false,
                error: 'No MP3 URL provided'
            });
            return;
        }

        // Generate cache key from page URL (if provided) or MP3 URL
        let cacheKey;
        if (pageUrl) {
            // Extract lecture ID from page URL for consistent cache key
            const match = pageUrl.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/);
            if (match) {
                cacheKey = `yutorah_${match[1]}_${type}`;
            } else {
                // Fallback to MP3-based key
                cacheKey = `yutorah_${mp3Url.split('/').pop().replace('.mp3', '').replace('.MP3', '')}_${type}`;
            }
        } else {
            // Fallback to MP3-based key
            cacheKey = `yutorah_${mp3Url.split('/').pop().replace('.mp3', '').replace('.MP3', '')}_${type}`;
        }

        console.log('Using cache key:', cacheKey);

        // Check cache first
        const cachedContent = await Storage.getCachedNotes(cacheKey);
        if (cachedContent) {
            console.log('Returning cached content for:', cacheKey);
            sendResponse({
                success: true,
                content: cachedContent,
                cached: true
            });
            return;
        }

        // Get API key
        const apiKey = await Storage.getApiKey();
        if (!apiKey) {
            sendResponse({
                success: false,
                error: 'No API key configured. Please set up your Gemini API key in the extension settings.'
            });
            return;
        }

        // Process the shiur - pass mp3Url directly
        const content = await GeminiAPI.processShiurFromUrl(
            apiKey,
            mp3Url,
            type
        );

        // Cache the result with title metadata
        const metadata = pageTitle ? { title: pageTitle } : {};
        await Storage.setCachedNotes(cacheKey, content, metadata);

        sendResponse({
            success: true,
            content: content,
            cached: false
        });
    } catch (error) {
        console.error('Error processing shiur:', error);
        sendResponse({
            success: false,
            error: error.message || 'An error occurred while processing the shiur'
        });
    }
}

/**
 * Check if API key is configured
 */
async function handleCheckApiKey(sendResponse) {
    try {
        const apiKey = await Storage.getApiKey();
        sendResponse({
            success: true,
            hasApiKey: !!apiKey
        });
    } catch (error) {
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get storage statistics
 */
async function handleGetStorageStats(sendResponse) {
    try {
        const stats = await Storage.getStorageStats();
        sendResponse({
            success: true,
            stats: stats
        });
    } catch (error) {
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

/**
 * Handle delete note request
 */
async function handleDeleteNote(request, sendResponse) {
    const { url, type } = request;

    try {
        // Generate cache key from URL
        const cacheKey = Storage.generateCacheKey(url, type);

        if (!cacheKey) {
            sendResponse({
                success: false,
                error: 'Invalid URL format'
            });
            return;
        }

        // Delete from storage
        await Storage.deleteNote(cacheKey);

        sendResponse({
            success: true
        });
    } catch (error) {
        console.error('Error deleting note:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Open options page on first install
        chrome.runtime.openOptionsPage();
    }
});


