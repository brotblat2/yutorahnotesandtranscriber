// Content script that adds "Summarize" and "Transcribe" buttons to YUTorah pages
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
            handleButtonClick(btn, mode);
        });
        return btn;
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
        }
    }

    // Handle delete note request from sidebar
    async function handleDeleteNote(data) {
        console.log('Handling delete note:', data);
        try {
            // Use Storage API directly to avoid extension context issues
            const pageUrl = data.url || window.location.href;

            // Generate cache key
            const match = pageUrl.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/);
            if (!match) {
                throw new Error('Invalid URL format');
            }
            const cacheKey = `yutorah_${match[1]}_${data.type}`;

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
            const match = pageUrl.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/);
            if (!match) {
                throw new Error('Invalid URL format');
            }
            const cacheKey = `yutorah_${match[1]}_${data.type}`;

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
                    url: window.location.href
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
                    message: 'No API key configured. Please set up your Gemini API key in extension settings.'
                });
                setTimeout(() => chrome.runtime.openOptionsPage(), 2000);
                return;
            }

            // Find MP3 URL on the page (this runs in content script, so we have DOM access)
            sendToSidebar('PROGRESS', {
                message: 'Finding MP3 file...',
                progress: 20
            });

            console.log('Looking for MP3 URL on page...');
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

            if (!mp3Url) {
                sendToSidebar('ERROR', {
                    message: 'Could not find MP3 file on this page. Make sure you are on a shiur page with audio.'
                });
                return;
            }

            console.log('Final MP3 URL:', mp3Url);

            // Extract page title from og:title meta tag
            let pageTitle = null;
            const ogTitleMeta = document.querySelector('meta[property="og:title"]');
            if (ogTitleMeta) {
                pageTitle = ogTitleMeta.getAttribute('content');
                console.log('Page title:', pageTitle);
            }

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
                        pageTitle: pageTitle,
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
                        content: response.content
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

    const summarizeBtn = createButton('Summarize Shiur', 'notes', summarizeIcon, 'yutorah-summarize-btn');
    const transcribeBtn = createButton('Transcribe Shiur', 'transcript', transcribeIcon, 'yutorah-transcribe-btn');

    container.appendChild(summarizeBtn);
    container.appendChild(transcribeBtn);

    // Insert the buttons into the page
    function insertButtons() {
        const possibleParents = [
            document.querySelector('.page-header'),
            document.querySelector('.lecture-header'),
            document.querySelector('header'),
            document.querySelector('.container'),
            document.querySelector('body')
        ];

        const parent = possibleParents.find(el => el !== null);

        if (parent) {
            if (!document.getElementById('yutorah-transcribe-container')) {
                parent.insertBefore(container, parent.firstChild);
            }
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertButtons);
    } else {
        insertButtons();
    }

    console.log('YUTorah Notes extension loaded');
})();
