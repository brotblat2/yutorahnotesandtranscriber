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
    let lastSyncedShiurBankTitle = '';
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
            handleButtonClick(btn, mode);
        });
        return btn;
    }

    function isShiurBankLessonPage() {
        return Boolean(document.querySelector('#shiur-player audio, #shiur-player video, audio[data-shiur-id], video[data-shiur-id]'));
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
        if (sidebarIframe) {
            console.log('Sidebar already exists');
            return;
        }

        console.log('Creating sidebar iframe');

        // Create iframe for sidebar
        sidebarIframe = document.createElement('iframe');
        sidebarIframe.id = 'yutorah-notes-sidebar';
        sidebarIframe.src = chrome.runtime.getURL('sidebar.html');
        sidebarIframe.style.cssText = `
            position: fixed;
            top: 0;
            right: -400px;
            width: 400px;
            height: 100vh;
            border: none;
            border-left: 2px solid rgba(102, 126, 234, 0.3);
            box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
            z-index: 999999;
            transition: right 0.3s ease;
        `;
        document.body.appendChild(sidebarIframe);

        // Listen for sidebar messages
        window.addEventListener('message', handleSidebarMessage);

        console.log('Sidebar iframe created');
    }

    function showSidebar() {
        console.log('Showing sidebar');
        if (sidebarIframe) {
            sidebarIframe.style.right = '0';
        }
    }

    function hideSidebar() {
        console.log('Hiding sidebar');
        if (sidebarIframe) {
            sidebarIframe.style.right = '-400px';
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
            return pageUrl.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/)?.[1] || null;
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

    async function syncShiurBankCachedTitles() {
        if (!window.location.hostname.includes('shiurbank.org')) return;

        const pageId = getPageId();
        const title = getPageTitle();
        const syncKey = `${pageId}|${title}`;
        if (!pageId || !title || syncKey === lastSyncedShiurBankTitle) return;

        lastSyncedShiurBankTitle = syncKey;
        try {
            const notes = await Storage.getAllNotes();
            const updates = {};
            Object.keys(notes)
                .filter((cacheKey) => cacheKey.startsWith(`shiurbank_${pageId}_`))
                .forEach((cacheKey) => {
                    updates[`${cacheKey}_title`] = title;
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
                console.log('Updated cached ShiurBank titles:', title);
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

                if (isYuTorah) {
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
                    const teacherLink = document.querySelector('#shiur-player a[href^="/teacher/"], main a[href^="/teacher/"]');
                    const seriesLink = document.querySelector('#shiur-player a[href*="/series/"], main a[href*="/series/"]');
                    const topicLinks = document.querySelectorAll('#shiur-player a[href*="/topic/"], #shiur-player a[href*="/category/"]');

                    metadata.speaker = cleanText(teacherLink) || null;
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

    // Summarize Button Icon (Notes)
    const summarizeIcon = `
        <path d="M8 1C6.34 1 5 2.34 5 4V8C5 9.66 6.34 11 8 11C9.66 11 11 9.66 11 8V4C11 2.34 9.66 1 8 1Z" fill="currentColor"/>
        <path d="M3 8C3 8.55 3.45 9 4 9C4.55 9 5 8.55 5 8H3ZM11 8C11 8.55 11.45 9 12 9C12.55 9 13 8.55 13 8H11ZM8 13C5.24 13 3 10.76 3 8H5C5 9.66 6.34 11 8 11C9.66 11 11 9.66 11 8H13C13 10.76 10.76 13 8 13Z" fill="currentColor"/>
        <path d="M7 13H9V15H7V13Z" fill="currentColor"/>
    `;

    // Transcribe Button Icon (Text/Document)
    const transcribeIcon = `
        <path d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V3C13 2.45 12.55 2 12 2H4ZM4 3H12V13H4V3Z" fill="currentColor"/>
        <path d="M5 5H11V6H5V5Z" fill="currentColor"/>
        <path d="M5 7H11V8H5V7Z" fill="currentColor"/>
        <path d="M5 9H9V10H5V9Z" fill="currentColor"/>
    `;

    // Hebrew Article Button Icon (Document with Hebrew א)
    const maamarIcon = `
        <path d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V3C13 2.45 12.55 2 12 2H4ZM4 3H12V13H4V3Z" fill="currentColor"/>
        <path d="M8 5.5L6.5 10H7.2L7.5 9H8.5L8.8 10H9.5L8 5.5ZM7.75 8.5L8 7.5L8.25 8.5H7.75Z" fill="currentColor"/>
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
        const possibleParents = [
            isShiurBank && isShiurBankLessonPage() ? document.querySelector('#shiur-player') : null,
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
                parent.insertBefore(container, parent.firstChild);
            }
            if (isShiurBank && isShiurBankLessonPage()) syncShiurBankCachedTitles();
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
    if (window.location.hostname.includes('shiurbank.org')) {
        const observer = new MutationObserver(() => insertButtons());
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    console.log('YUTorah Notes extension loaded');
})();
