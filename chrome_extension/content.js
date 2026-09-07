// Content script that adds AI actions to supported shiur pages
// and manages the sidebar for displaying progress and results

// Import storage utilities by injecting the script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('storage.js');
script.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

(function () {
    'use strict';

    let sidebarIframe = null;
    let lastSyncedShiurBankMetadata = '';
    let pageNoticeTimer = null;

    // Create the container for buttons
    const container = document.createElement('div');
    container.id = 'yutorah-transcribe-container';

    // Helper to create buttons
    function createButton(text, mode, iconPath, id) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'yutorah-action-btn';
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-right: 8px; vertical-align: middle;">
                ${iconPath}
            </svg>
            <span class="btn-text">${text}</span>
        `;
        btn.addEventListener('click', function () {
            if (window.location.hostname.includes('shiurbank.org') && !isShiurBankLessonPage()) {
                showPageNotice('Open an individual ShiurBank shiur page with an audio player to use this action.');
                return;
            }
            if (isEnhancedYutorahPlayer() && !isEnhancedYutorahPlayerLecture()) {
                showPageNotice('Notes and transcripts work on individual YUTorah lectures with an audio player. Open a shiur, then try again.');
                return;
            }
            handleButtonClick(btn, mode);
        });
        return btn;
    }

    function isShiurBankLessonPage() {
        return Boolean(document.querySelector('#shiur-player audio, #shiur-player video, audio[data-shiur-id], video[data-shiur-id]'));
    }

    function isEnhancedYutorahPlayer() {
        return window.location.hostname === 'yutorah-player.mrosensweig.workers.dev';
    }

    function isEnhancedYutorahPlayerLecture() {
        return Boolean(document.querySelector('.player-card audio#audioElement, .player-card audio[src]'));
    }

    function showPageNotice(message) {
        let notice = document.getElementById('shiur-ai-page-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'shiur-ai-page-notice';
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            document.body.appendChild(notice);
        }

        notice.textContent = message;
        notice.classList.add('visible');
        clearTimeout(pageNoticeTimer);
        pageNoticeTimer = setTimeout(() => notice.classList.remove('visible'), 4500);
    }

    // Create and inject sidebar
    function createSidebar() {
        const existingSidebar = document.getElementById('yutorah-notes-sidebar');
        if (existingSidebar) {
            sidebarIframe = existingSidebar;
            console.log('Sidebar already exists');
            return;
        }

        // YUTorah can replace page content during navigation. Do not keep a
        // reference to an iframe that is no longer attached to the document.
        if (sidebarIframe && !sidebarIframe.isConnected) sidebarIframe = null;

        console.log('Creating sidebar iframe');

        // Create iframe for sidebar
        sidebarIframe = document.createElement('iframe');
        sidebarIframe.id = 'yutorah-notes-sidebar';
        sidebarIframe.src = chrome.runtime.getURL('sidebar.html');
        sidebarIframe.title = 'Shiur AI Assistant results';
        sidebarIframe.setAttribute('aria-label', 'Shiur AI Assistant results');
        sidebarIframe.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            left: auto !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: min(460px, 100vw) !important;
            max-width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            border-left: 1px solid #d6dfcb !important;
            box-shadow: -8px 0 35px rgba(35, 53, 29, 0.12) !important;
            z-index: 2147483647 !important;
            pointer-events: auto !important;
            transform: translateX(100%) !important;
            transition: transform 0.3s ease !important;
        `;
        document.body.appendChild(sidebarIframe);

        // Listen for sidebar messages
        window.addEventListener('message', handleSidebarMessage);

        console.log('Sidebar iframe created');
    }

    function showSidebar() {
        console.log('Showing sidebar');
        if (sidebarIframe?.isConnected) {
            sidebarIframe.style.setProperty('transform', 'translateX(0)', 'important');
        }
    }

    function hideSidebar() {
        console.log('Hiding sidebar');
        if (sidebarIframe?.isConnected) {
            sidebarIframe.style.setProperty('transform', 'translateX(100%)', 'important');
        }
    }

    function sendToSidebar(action, data) {
        console.log('Sending to sidebar:', action, data);
        if (sidebarIframe && sidebarIframe.contentWindow) {
            sidebarIframe.contentWindow.postMessage({ action, data }, '*');
        } else {
            console.error('Sidebar iframe or contentWindow not available');
        }
    }

    function handleSidebarMessage(event) {
        // Only accept messages from our sidebar
        if (event.source !== sidebarIframe?.contentWindow) return;

        console.log('Received message from sidebar:', event.data);

        const { action, data } = event.data;

        switch (action) {
            case 'SIDEBAR_READY':
                console.log('Sidebar is ready!');
                break;
            case 'CLOSE_SIDEBAR':
                hideSidebar();
                break;
            case 'DELETE_NOTE':
                handleDeleteNote(data);
                break;
            case 'REGENERATE_NOTE':
                handleRegenerateNote(data);
                break;
            case 'PROCESS_TEXT':
                handleProcessText(data);
                break;
        }
    }

    // Helper function to detect site for cache key generation
    function getSitePrefix(url) {
        try {
            const hostname = new URL(url).hostname;
            if (hostname.includes('yutorah.org')) return 'yutorah';
            // The Enhanced Player is an alternate frontend for the same
            // YUTorah lecture catalogue, so it intentionally shares its cache.
            if (hostname === 'yutorah-player.mrosensweig.workers.dev') return 'yutorah';
            if (hostname.includes('kolhalashon.com')) return 'kolhalashon';
            if (hostname.includes('shiurbank.org')) return 'shiurbank';
            return 'unknown';
        } catch (e) {
            console.error('Error parsing URL for site prefix:', e);
            return 'unknown';
        }
    }

    function getShiurBankId() {
        const player = document.querySelector('audio[data-shiur-id], video[data-shiur-id], [data-shiur-id]');
        return player?.getAttribute('data-shiur-id') || null;
    }

    function getPageId(pageUrl = window.location.href) {
        const sitePrefix = getSitePrefix(pageUrl);
        if (sitePrefix === 'yutorah') {
            return pageUrl.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/)?.[1]
                || (isEnhancedYutorahPlayer() ? pageUrl.match(/^https:\/\/yutorah-player\.mrosensweig\.workers\.dev\/(\d+)(?:\/|$|[?#])/)?.[1] : null)
                || null;
        }
        if (sitePrefix === 'kolhalashon') {
            return pageUrl.match(/\/playShiur\/(\d+)/)?.[1] || null;
        }
        if (sitePrefix === 'shiurbank') {
            return getShiurBankId() || pageUrl.match(/\/shiur\/([\w-]+)/i)?.[1] || null;
        }
        return null;
    }

    function getPageTitle() {
        if (isEnhancedYutorahPlayer()) {
            return document.querySelector('#shiurTitle')?.textContent?.trim()
                || document.querySelector('.shiur-title')?.textContent?.trim()
                || document.title.trim();
        }

        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
        const heading = document.querySelector('article h1, main h1, h1')?.textContent?.trim();

        // ShiurBank's og:title is a site/series label, while the lesson's
        // visible article heading is the authoritative title.
        if (window.location.hostname.includes('shiurbank.org')) {
            return (heading || ogTitle || document.title)
                .replace(/\s*[-–—|]\s*Back to series\s*$/i, '')
                .trim();
        }

        return ogTitle || heading || document.title.trim();
    }

    function getShiurBankTeacherName() {
        const teacherLinks = [...document.querySelectorAll('article a[href^="/teacher/"]:not([href*="/series/"])')];
        const namedLink = teacherLinks.find((link) => link.textContent.trim());
        if (namedLink) return namedLink.textContent.replace(/\s+/g, ' ').trim();

        return document.querySelector('article img[src*="/api/rebbeim/"][alt]')?.getAttribute('alt')?.trim() || null;
    }

    function getShiurBankSeriesLink() {
        return [...document.querySelectorAll('article a[href*="/series/"]')]
            .find((link) => link.textContent.trim() && !/^Back to series$/i.test(link.textContent.trim())) || null;
    }

    async function syncShiurBankCachedMetadata() {
        if (!window.location.hostname.includes('shiurbank.org')) return;

        const pageId = getPageId();
        const title = getPageTitle();
        const speaker = getShiurBankTeacherName();
        const syncKey = `${pageId}|${title}|${speaker || ''}`;
        if (!pageId || !title || syncKey === lastSyncedShiurBankMetadata) return;

        lastSyncedShiurBankMetadata = syncKey;
        try {
            const notes = await Storage.getAllNotes();
            const updates = {};
            Object.keys(notes)
                .filter((cacheKey) => cacheKey.startsWith(`shiurbank_${pageId}_`))
                .forEach((cacheKey) => {
                    updates[`${cacheKey}_title`] = title;
                    if (speaker) {
                        updates[`${cacheKey}_speaker`] = speaker;
                        updates[`${cacheKey}_tags`] = [...new Set([
                            ...(notes[cacheKey].tags || []).filter((tag) => !/^Back to series$/i.test(tag)),
                            speaker
                        ])];
                    }
                });

            if (Object.keys(updates).length > 0) {
                await new Promise((resolve, reject) => {
                    chrome.storage.local.set(updates, () => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve();
                        }
                    });
                });
                console.log('Updated cached ShiurBank metadata:', { title, speaker });
            }
        } catch (error) {
            console.warn('Could not update cached ShiurBank title:', error);
        }
    }

    // Handle delete note request from sidebar
    async function handleDeleteNote(data) {
        console.log('Handling delete note:', data);
        try {
            // Use Storage API directly to avoid extension context issues
            const pageUrl = data.url || window.location.href;

            // Detect site and generate cache key
            const sitePrefix = getSitePrefix(pageUrl);
            const lectureId = getPageId(pageUrl);

            if (!lectureId) {
                throw new Error('Could not extract lecture ID from URL');
            }

            const cacheKey = `${sitePrefix}_${lectureId}_${data.type}`;
            console.log('Deleting cache key:', cacheKey);

            // Delete from chrome.storage.local directly
            await new Promise((resolve, reject) => {
                chrome.storage.local.remove([cacheKey, `${cacheKey}_timestamp`], () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(true);
                    }
                });
            });

            console.log('Note deleted successfully');
        } catch (error) {
            console.error('Error deleting note:', error);
            sendToSidebar('ERROR', {
                message: 'Error deleting note: ' + error.message
            });
        }
    }

    // Handle regenerate note request from sidebar
    async function handleRegenerateNote(data) {
        console.log('Handling regenerate note:', data);
        try {
            // Use Storage API directly to avoid extension context issues
            const pageUrl = data.url || window.location.href;

            // Generate cache key
            let cacheKey;

            const pageId = getPageId(pageUrl);
            if (pageId) cacheKey = `${getSitePrefix(pageUrl)}_${pageId}_${data.type}`;
            
            if (pageUrl.startsWith('upload://')) {
                cacheKey = pageUrl.replace('upload://', '');
            }

            if (!cacheKey) {
                throw new Error('Invalid URL format');
            }

            // Delete from chrome.storage.local directly
            await new Promise((resolve, reject) => {
                chrome.storage.local.remove([cacheKey, `${cacheKey}_timestamp`], () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(true);
                    }

                });
            });

            // Find the appropriate button and trigger it
            const button = data.type === 'notes'
                ? document.getElementById('yutorah-summarize-btn')
                : document.getElementById('yutorah-transcribe-btn');

            if (button) {
                // Trigger the button click to regenerate
                handleButtonClick(button, data.type);
            } else {
                throw new Error('Could not find button to regenerate');
            }
        } catch (error) {
            console.error('Error regenerating note:', error);
            sendToSidebar('ERROR', {
                message: 'Error regenerating note: ' + error.message
            });
        }
    }
    
    // Handle text processing request from sidebar
    async function handleProcessText(data) {
        console.log('Handling process text:', data);
        try {
            const pageUrl = data.url || window.location.href;
            const originalType = data.originalType;
            
            // Prefer the exact key supplied by the sidebar. This is required
            // when enhancing an already-created copy rather than the original.
            let originalKey = data.originalKey;
            const sitePrefix = getSitePrefix(pageUrl);
            
            const pageId = getPageId(pageUrl);
            if (!originalKey && pageId) originalKey = `${sitePrefix}_${pageId}_${originalType}`;
            // For uploads
            if (!originalKey && pageUrl.startsWith('upload://')) {
                originalKey = pageUrl.replace('upload://', '');
            }

            sendToSidebar('PROGRESS', {
                message: data.type === 'enhance_transcript' ? 'Enhancing and organizing your transcript...' : 'Translating your note...',
                progress: 30
            });

            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'processTextShiur',
                        text: data.text,
                        type: data.type,
                        originalKey: originalKey,
                        overwrite: data.overwrite,
                        metadata: { title: data.title }
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });

            console.log('Process Text Response received:', response);

            if (response && response.success) {
                sendToSidebar('PROGRESS', {
                    message: 'Complete!',
                    progress: 100
                });

                setTimeout(() => {
                    sendToSidebar('SUCCESS', {
                        content: response.content,
                        model: response.model,
                        isFallback: response.isFallback,
                        newKey: response.newKey,
                        newType: response.newType,
                        title: response.title,
                        overwritten: response.overwritten
                    });
                }, 500);
            } else {
                const errorMsg = response?.error || 'Unknown error occurred';
                console.error('Processing text error:', errorMsg);
                sendToSidebar('ERROR', {
                    message: errorMsg
                });
            }
        } catch (error) {
            console.error('Error processing text:', error);
            sendToSidebar('ERROR', {
                message: error.message || 'An error occurred while processing'
            });
        }
    }

    // Handle button click
    async function handleButtonClick(button, mode) {
        console.log('Button clicked:', mode);

        // Create and show sidebar
        createSidebar();

        // Wait a bit for iframe to load
        setTimeout(() => {
            showSidebar();

            // Initialize sidebar
            setTimeout(() => {
                sendToSidebar('INIT', {
                    type: mode,
                    url: window.location.href,
                    title: getPageTitle()
                });
            }, 500);
        }, 100);

        // Disable button
        button.disabled = true;
        const btnText = button.querySelector('.btn-text');
        const originalText = btnText.textContent;
        btnText.textContent = 'Processing...';
        button.classList.add('loading');

        try {
            // Check if API key is configured
            console.log('Checking API key...');
            sendToSidebar('PROGRESS', {
                message: 'Checking API key...',
                progress: 10
            });

            const apiKeyCheck = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { action: 'checkApiKey' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });

            console.log('API key check result:', apiKeyCheck);

            if (!apiKeyCheck || !apiKeyCheck.success || !apiKeyCheck.hasApiKey) {
                sendToSidebar('ERROR', {
                    message: 'No API key entered. Please go to extension settings to input your API key.'
                });
                setTimeout(() => chrome.runtime.openOptionsPage(), 2000);
                return;
            }

            // Find MP3 URL on the page (this runs in content script, so we have DOM access)
            sendToSidebar('PROGRESS', {
                message: 'Finding audio file...',
                progress: 20
            });

            console.log('Looking for audio URL on page...');
            let mp3Url = null;

            // Strategy 1: Look for links ending in .mp3
            const links = document.querySelectorAll('a[href]');
            for (const link of links) {
                const href = link.getAttribute('href');
                if (href && href.trim().toLowerCase().endsWith('.mp3')) {
                    mp3Url = new URL(href, window.location.href).href;
                    console.log('Found MP3 via link:', mp3Url);
                    break;
                }
            }

            // Strategy 2: Look for audio tag
            if (!mp3Url) {
                const audio = document.querySelector('audio');
                const audioSrc = audio?.getAttribute('src') ||
                    document.querySelector('audio source')?.getAttribute('src');
                if (audioSrc) {
                    mp3Url = new URL(audioSrc, window.location.href).href;
                    console.log('Found MP3 via audio tag:', mp3Url);
                }
            }

            // Strategy 3: Look for video.js player (for Kol Halashon)
            if (!mp3Url) {
                const video = document.querySelector('video.video-js, video[data-setup]');
                if (video) {
                    // Check video src attribute
                    const videoSrc = video.getAttribute('src');
                    if (videoSrc) {
                        mp3Url = new URL(videoSrc, window.location.href).href;
                        console.log('Found media via video tag:', mp3Url);
                    } else {
                        // Check source elements
                        const source = video.querySelector('source');
                        if (source) {
                            const sourceSrc = source.getAttribute('src');
                            if (sourceSrc) {
                                mp3Url = new URL(sourceSrc, window.location.href).href;
                                console.log('Found media via video source:', mp3Url);
                            }
                        }
                    }
                }
            }

            // Strategy 4: Kol Halashon API pattern
            // URL pattern: https://www.kolhalashon.com/he/regularSite/playShiur/41679531/-1/0/false
            // MP3 API: https://www.kolhalashon.com:443/api/files/GetMp3FileToPlay/41679531
            if (!mp3Url && window.location.hostname.includes('kolhalashon.com')) {
                const match = window.location.pathname.match(/\/playShiur\/(\d+)/);
                if (match) {
                    const shiurId = match[1];
                    mp3Url = `https://www.kolhalashon.com/api/files/GetMp3FileToPlay/${shiurId}`;
                    console.log('Constructed Kol Halashon MP3 URL:', mp3Url);
                }
            }

            if (!mp3Url) {
                sendToSidebar('ERROR', {
                    message: 'Could not find an audio file on this page. Make sure you are on a shiur page with audio.'
                });
                return;
            }

            console.log('Final MP3 URL:', mp3Url);

            // Extract rich metadata from page (site-specific)
            function extractPageMetadata() {
                const metadata = {
                    categories: [],
                    references: [],
                    venue: null,
                    speaker: null,
                    seriesInfo: null
                };

                const isKolHalashon = window.location.hostname.includes('kolhalashon.com');
                const isYuTorah = window.location.hostname.includes('yutorah.org');
                const isShiurBank = window.location.hostname.includes('shiurbank.org');
                const isEnhancedPlayer = isEnhancedYutorahPlayer();

                if (isEnhancedPlayer) {
                    metadata.speaker = document.querySelector('#shiurSpeaker, .shiur-speaker')?.textContent?.trim() || null;
                } else if (isYuTorah) {
                    // YUTorah-specific metadata extraction

                    // Extract categories from .postedin links
                    const categoryLinks = document.querySelectorAll('a.postedin');
                    categoryLinks.forEach(link => {
                        const categoryName = link.textContent.trim();
                        if (categoryName) {
                            metadata.categories.push(categoryName);
                        }
                    });

                    // Extract gemara references from links containing /daf/
                    const refLinks = document.querySelectorAll('a[href*="/daf/"]');
                    refLinks.forEach(link => {
                        const refText = link.textContent.trim();
                        if (refText && !metadata.references.includes(refText)) {
                            metadata.references.push(refText);
                        }
                    });

                    // Extract venue - look for common venue patterns
                    const venueSelectors = [
                        '[itemprop="location"] [itemprop="name"]',
                        '.venue-name',
                        '[itemprop="address"]'
                    ];
                    for (const selector of venueSelectors) {
                        const venueElement = document.querySelector(selector);
                        if (venueElement) {
                            metadata.venue = venueElement.textContent.trim();
                            break;
                        }
                    }

                    // Extract speaker from schema.org markup or page structure
                    const speakerSelectors = [
                        '[itemprop="performer"] [itemprop="name"]',
                        '[itemprop="author"] [itemprop="name"]',
                        '.speaker-name'
                    ];
                    for (const selector of speakerSelectors) {
                        const speakerElement = document.querySelector(selector);
                        if (speakerElement) {
                            metadata.speaker = speakerElement.textContent.trim();
                            break;
                        }
                    }

                    // Extract series information from lecturePlayerData if available
                    try {
                        if (typeof window.lecturePlayerData !== 'undefined' &&
                            window.lecturePlayerData?.postedInSeries?.length > 0) {
                            const series = window.lecturePlayerData.postedInSeries[0];
                            metadata.seriesInfo = {
                                seriesID: series.seriesID,
                                seriesName: series.seriesName,
                                seriesURL: series.href
                            };
                        }
                    } catch (e) {
                        console.log('Could not extract series info:', e);
                    }
                } else if (isKolHalashon) {
                    // Kol Halashon-specific metadata extraction
                    // Note: Kol Halashon uses a different page structure
                    // We'll extract what we can from the page title and any visible elements

                    // Try to extract speaker from page title or meta tags
                    const pageTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.title;

                    // Kol Halashon titles often follow pattern: "Speaker - Topic"
                    if (pageTitle && pageTitle.includes(' - ')) {
                        const parts = pageTitle.split(' - ');
                        if (parts.length >= 2) {
                            metadata.speaker = parts[0].trim();
                            // The rest could be topic/category
                            metadata.categories.push(parts.slice(1).join(' - ').trim());
                        }
                    }

                    // Try to find speaker info in page content
                    // Kol Halashon may have speaker info in specific elements
                    const speakerElement = document.querySelector('.speaker-name, .lecturer-name, [class*="speaker"]');
                    if (speakerElement && !metadata.speaker) {
                        metadata.speaker = speakerElement.textContent.trim();
                    }
                } else if (isShiurBank) {
                    const cleanText = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
                    const seriesLink = getShiurBankSeriesLink();
                    const topicLinks = document.querySelectorAll('#shiur-player a[href*="/topic/"], #shiur-player a[href*="/category/"]');

                    metadata.speaker = getShiurBankTeacherName();
                    if (seriesLink) {
                        metadata.seriesInfo = {
                            seriesName: cleanText(seriesLink),
                            seriesURL: new URL(seriesLink.getAttribute('href'), window.location.href).href
                        };
                    }
                    topicLinks.forEach((link) => {
                        const topic = cleanText(link);
                        if (topic && !metadata.categories.includes(topic)) metadata.categories.push(topic);
                    });
                }

                console.log('Extracted metadata:', metadata);
                return metadata;
            }

            const pageMetadata = extractPageMetadata();

            const pageTitle = getPageTitle();
            console.log('Page title:', pageTitle);


            // Update progress
            sendToSidebar('PROGRESS', {
                message: 'Processing shiur...',
                progress: 30
            });

            console.log('Sending processShiur message with MP3 URL...');

            // Start processing - send MP3 URL instead of page URL
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'processShiur',
                        mp3Url: mp3Url,
                        pageUrl: window.location.href,
                        pageId: getPageId(),
                        pageTitle: pageTitle,
                        metadata: pageMetadata,
                        type: mode
                    },
                    (response) => {

                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });

            console.log('Response received:', response);

            if (response && response.success) {
                sendToSidebar('PROGRESS', {
                    message: 'Complete!',
                    progress: 100
                });

                setTimeout(() => {
                    sendToSidebar('SUCCESS', {
                        content: response.content,
                        model: response.model,
                        isFallback: response.isFallback
                    });
                }, 500);
            } else {
                const errorMsg = response?.error || 'Unknown error occurred';
                console.error('Processing error:', errorMsg);
                sendToSidebar('ERROR', {
                    message: errorMsg
                });
            }
        } catch (error) {
            console.error('YUTorah Notes Error:', error);
            sendToSidebar('ERROR', {
                message: error.message || 'An error occurred while processing'
            });
        } finally {
            // Re-enable button
            button.disabled = false;
            btnText.textContent = originalText;
            button.classList.remove('loading');
        }
    }

    // Summary: a short note with a sparkle, rather than an audio microphone.
    const summarizeIcon = `
        <path d="M2.5 2.5h7v11h-7v-11Zm1.5 2v1h4v-1H4Zm0 3v1h4v-1H4Zm0 3v1h2.7v-1H4Z" fill="currentColor"/>
        <path d="m12.5 1 .55 1.95L15 3.5l-1.95.55L12.5 6l-.55-1.95L10 3.5l1.95-.55L12.5 1Z" fill="currentColor"/>
    `;

    // Transcript: spoken words becoming readable text.
    const transcribeIcon = `
        <path d="M2 5h1.5v6H2V5Zm2.5-2h1.5v10H4.5V3ZM7 1h1.5v14H7V1Zm2.5 3H11v8H9.5V4Zm2.5-2h1.5v12H12V2Z" fill="currentColor"/>
        <path d="M14.5 5h1.5v8h-1.5V5Z" fill="currentColor"/>
    `;

    // Hebrew article: an open book, which avoids an out-of-context Latin "A".
    const maamarIcon = `
        <path d="M8 3C5.7 1.5 3.1 1.9 1.5 2.8v10.5c2-1 4.3-.8 6.5.7 2.2-1.5 4.5-1.7 6.5-.7V2.8C12.9 1.9 10.3 1.5 8 3Zm-5 2c1.3-.5 2.6-.4 4 .3v6.8c-1.35-.65-2.7-.8-4-.4V5Zm10 6.7c-1.3-.4-2.65-.25-4 .4V5.3c1.4-.7 2.7-.8 4-.3v6.7Z" fill="currentColor"/>
    `;

    const summarizeBtn = createButton('Summarize Shiur', 'notes', summarizeIcon, 'yutorah-summarize-btn');
    const transcribeBtn = createButton('Transcribe Shiur', 'transcript', transcribeIcon, 'yutorah-transcribe-btn');
    const maamarBtn = createButton('מאמר (Hebrew Article)', 'maamar', maamarIcon, 'yutorah-maamar-btn');

    container.appendChild(summarizeBtn);
    container.appendChild(transcribeBtn);
    container.appendChild(maamarBtn);


    // Insert the buttons into the page
    function insertButtons() {
        const isShiurBank = window.location.hostname.includes('shiurbank.org');
        const isEnhancedPlayer = isEnhancedYutorahPlayer();
        const possibleParents = [
            isShiurBank && isShiurBankLessonPage() ? document.querySelector('#shiur-player') : null,
            isEnhancedPlayer && isEnhancedYutorahPlayerLecture() ? document.querySelector('.player-card') : null,
            document.querySelector('.page-header'),
            document.querySelector('.lecture-header'),
            document.querySelector('header'),
            document.querySelector('.container'),
            document.querySelector('body')
        ];

        const parent = possibleParents.find(el => el !== null);

        if (parent) {
            if (!document.getElementById('yutorah-transcribe-container')) {
                if (isShiurBank) container.classList.add('shiurbank-actions');
                if (isEnhancedPlayer) container.classList.add('enhanced-player-actions');
                parent.insertBefore(container, parent.firstChild);
            }
            if (isEnhancedPlayer) {
                const canProcessLecture = isEnhancedYutorahPlayerLecture();
                container.classList.toggle('enhanced-player-no-lecture', !canProcessLecture);
                container.querySelectorAll('.yutorah-action-btn').forEach((button) => {
                    button.title = canProcessLecture
                        ? ''
                        : 'Open an individual shiur page with audio to use this action.';
                });
            }
            if (isShiurBank && isShiurBankLessonPage()) syncShiurBankCachedMetadata();
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertButtons);
    } else {
        insertButtons();
    }

    // ShiurBank is a React single-page app. Watch for its player to mount or
    // change after navigation so the extension actions remain available.
    if (window.location.hostname.includes('shiurbank.org') || isEnhancedYutorahPlayer()) {
        const observer = new MutationObserver(() => insertButtons());
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    console.log('YUTorah Notes extension loaded');
})();
