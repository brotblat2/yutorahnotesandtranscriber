// Background service worker for YUTorah Notes Extension
// Handles API calls, caching, and message passing

// Import config, storage and API modules
importScripts('config.js', 'storage.js', 'gemini-api.js');

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
    const { mp3Url, type, pageUrl, pageTitle, metadata } = request;

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

        // Helper function to detect site
        function getSitePrefix(url) {
            try {
                const hostname = new URL(url).hostname;
                if (hostname.includes('yutorah.org')) return 'yutorah';
                if (hostname.includes('kolhalashon.com')) return 'kolhalashon';
                return 'unknown';
            } catch (e) {
                console.error('Error parsing URL for site prefix:', e);
                return 'unknown';
            }
        }

        const sitePrefix = getSitePrefix(pageUrl || mp3Url);

        if (pageUrl) {
            // Try to extract ID from page URL
            let pageId;

            if (sitePrefix === 'yutorah') {
                // YUTorah pattern: /lectures/123456 or /lecture.cfm/123456
                const match = pageUrl.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/);
                if (match) pageId = match[1];
            } else if (sitePrefix === 'kolhalashon') {
                // Kol Halashon pattern: /playShiur/123456
                const match = pageUrl.match(/\/playShiur\/(\d+)/);
                if (match) pageId = match[1];
            }

            if (pageId) {
                cacheKey = `${sitePrefix}_${pageId}_${type}`;
            } else {
                // Fallback to MP3-based key
                cacheKey = `${sitePrefix}_${mp3Url.split('/').pop().replace(/\.(mp3|m4a|MP3|M4A)/g, '')}_${type}`;
            }
        } else {
            // Fallback to MP3-based key
            cacheKey = `${sitePrefix}_${mp3Url.split('/').pop().replace(/\.(mp3|m4a|MP3|M4A)/g, '')}_${type}`;
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

        // Check if user can make a request (rate limiting)
        const requestCheck = await Storage.canMakeRequest();
        if (!requestCheck.allowed) {
            const resetDate = new Date(requestCheck.usage.resetDate);
            resetDate.setDate(resetDate.getDate() + 1);
            const hoursUntilReset = Math.ceil((resetDate - new Date()) / (1000 * 60 * 60));

            sendResponse({
                success: false,
                error: `Daily limit reached (${requestCheck.limit} requests/day). Resets in ~${hoursUntilReset} hours.\n\nFor unlimited access, add your own API key in Settings.`,
                rateLimitExceeded: true
            });
            return;
        }

        // Get API key based on mode
        const mode = await Storage.getKeyMode();
        let apiKey;

        if (mode === 'custom') {
            apiKey = await Storage.getApiKey();
            if (!apiKey) {
                sendResponse({
                    success: false,
                    error: 'No custom API key configured. Please add your API key in Settings or switch to default mode.'
                });
                return;
            }
        } else {
            // Use random default key
            apiKey = getRandomDefaultKey();
            console.log('Using default API key (rate limited mode)');
        }

        // Process the shiur - pass mp3Url directly
        const content = await GeminiAPI.processShiurFromUrl(
            apiKey,
            mp3Url,
            type
        );

        // Cache the result with extended metadata from page
        const storageMetadata = {
            title: pageTitle,
            categories: metadata?.categories,
            references: metadata?.references,
            venue: metadata?.venue,
            speaker: metadata?.speaker,
            seriesInfo: metadata?.seriesInfo
        };
        await Storage.setCachedNotes(cacheKey, content, storageMetadata);

        // Increment usage counter if using default keys
        if (mode === 'default') {
            await Storage.incrementDailyUsage();
        }

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


