// Viewer page JavaScript for YUTorah Notes Extension

let currentCacheKey = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    const type = params.get('type');

    // Event listeners
    document.getElementById('backBtn').addEventListener('click', () => window.close());
    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    if (url && type) {
        // Single note view
        await loadSingleNote(url, type);
    } else {
        // All notes view
        await loadAllNotes();
    }
});

/**
 * Load a single note
 */
async function loadSingleNote(url, type) {
    const loadingState = document.getElementById('loadingState');
    const singleNoteView = document.getElementById('singleNoteView');

    loadingState.style.display = 'flex';

    try {
        // Generate cache key
        currentCacheKey = Storage.generateCacheKey(url, type);
        if (!currentCacheKey) {
            throw new Error('Invalid URL format');
        }

        // Get cached note
        const content = await Storage.getCachedNotes(currentCacheKey);
        if (!content) {
            throw new Error('Note not found in cache');
        }

        // Display the note
        const title = await getTitle(currentCacheKey);
        document.getElementById('noteTitle').textContent = title || extractTitleFromUrl(url);
        document.getElementById('noteType').textContent = type === 'transcript' ? 'Transcript' : 'Notes';
        document.getElementById('noteType').className = `badge ${type}`;

        // Get timestamp
        const timestamp = await getTimestamp(currentCacheKey);
        if (timestamp) {
            document.getElementById('noteDate').textContent = formatDate(timestamp);
        }

        // Render markdown content
        document.getElementById('noteContent').innerHTML = renderMarkdown(content);

        // Setup action buttons
        document.getElementById('copyBtn').addEventListener('click', () => copyToClipboard(content));
        document.getElementById('downloadBtn').addEventListener('click', () => downloadNote(content, url, type));
        document.getElementById('deleteBtn').addEventListener('click', () => deleteNote(currentCacheKey));

        loadingState.style.display = 'none';
        singleNoteView.style.display = 'block';
    } catch (error) {
        console.error('Error loading note:', error);
        loadingState.innerHTML = `
            <div class="error-state">
                <p>❌ Error loading note</p>
                <p>${error.message}</p>
            </div>
        `;
    }
}

/**
 * Load all notes
 */
async function loadAllNotes() {
    const loadingState = document.getElementById('loadingState');
    const allNotesView = document.getElementById('allNotesView');
    const notesList = document.getElementById('notesList');
    const emptyState = document.getElementById('emptyState');

    loadingState.style.display = 'flex';

    try {
        const notes = await Storage.getAllNotes();
        const notesArray = Object.entries(notes);

        if (notesArray.length === 0) {
            emptyState.style.display = 'block';
        } else {
            // Render notes list
            notesList.innerHTML = notesArray
                .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
                .map(([key, data]) => createNoteCard(key, data))
                .join('');

            // Setup event delegation for view and delete buttons
            notesList.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-view')) {
                    const url = e.target.dataset.url;
                    const type = e.target.dataset.type;
                    window.location.href = `viewer.html?url=${encodeURIComponent(url)}&type=${type}`;
                } else if (e.target.classList.contains('btn-delete-card')) {
                    const cacheKey = e.target.dataset.key;
                    deleteNoteCard(cacheKey);
                }
            });

            // Setup search
            document.getElementById('searchInput').addEventListener('input', (e) => {
                filterNotes(e.target.value);
            });
        }

        loadingState.style.display = 'none';
        allNotesView.style.display = 'block';
    } catch (error) {
        console.error('Error loading notes:', error);
        loadingState.innerHTML = `
            <div class="error-state">
                <p>❌ Error loading notes</p>
                <p>${error.message}</p>
            </div>
        `;
    }
}

/**
 * Create a note card HTML
 */
function createNoteCard(cacheKey, data) {
    const parts = cacheKey.split('_');
    const lectureId = parts[1];
    const type = parts[2];
    const url = `https://www.yutorah.org/lectures/${lectureId}`;
    const preview = data.content.substring(0, 200).replace(/[#*>\-]/g, '').trim();
    const date = data.timestamp ? formatDate(data.timestamp) : 'Unknown date';
    const title = data.title || `Lecture ${lectureId}`;

    return `
        <div class="note-card" data-key="${cacheKey}">
            <div class="note-card-header">
                <h3>${title}</h3>
                <span class="badge ${type}">${type === 'transcript' ? 'Transcript' : 'Notes'}</span>
            </div>
            <p class="note-preview">${preview}...</p>
            <div class="note-card-footer">
                <span class="date">${date}</span>
                <div class="note-card-actions">
                    <button class="btn-small btn-view" data-url="${url}" data-type="${type}">View</button>
                    <button class="btn-small btn-danger btn-delete-card" data-key="${cacheKey}">Delete</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * View a note (global function for onclick handlers)
 */
window.viewNote = function (url, type) {
    window.location.href = `viewer.html?url=${encodeURIComponent(url)}&type=${type}`;
}

/**
 * Delete a note card
 */
async function deleteNoteCard(cacheKey) {
    if (!confirm('Are you sure you want to delete this note?')) {
        return;
    }

    try {
        await Storage.deleteNote(cacheKey);
        // Reload the page
        window.location.reload();
    } catch (error) {
        alert('Error deleting note: ' + error.message);
    }
}

/**
 * Filter notes based on search query
 */
function filterNotes(query) {
    const cards = document.querySelectorAll('.note-card');
    const lowerQuery = query.toLowerCase();

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(lowerQuery) ? 'block' : 'none';
    });
}

/**
 * Copy content to clipboard
 */
async function copyToClipboard(content) {
    try {
        await navigator.clipboard.writeText(content);
        alert('Copied to clipboard!');
    } catch (error) {
        alert('Error copying to clipboard: ' + error.message);
    }
}

/**
 * Download note as markdown file
 */
async function downloadNote(content, url, type) {
    // Get title from storage if available
    const cacheKey = currentCacheKey;
    let title;

    if (cacheKey) {
        title = await getTitle(cacheKey);
    }

    if (!title) {
        title = extractTitleFromUrl(url);
    }

    const filename = sanitizeFilename(`${title}-${type}`);
    const blob = new Blob([content], { type: 'text/markdown' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${filename}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
        .substring(0, 200); // Limit length
}

/**
 * Delete current note
 */
async function deleteNote(cacheKey) {
    if (!confirm('Are you sure you want to delete this note?')) {
        return;
    }

    try {
        await Storage.deleteNote(cacheKey);
        alert('Note deleted successfully!');
        // Navigate to all notes view
        window.location.href = 'viewer.html';
    } catch (error) {
        alert('Error deleting note: ' + error.message);
    }
}

/**
 * Get timestamp for a cache key
 */
async function getTimestamp(cacheKey) {
    return new Promise((resolve) => {
        chrome.storage.local.get([`${cacheKey}_timestamp`], (result) => {
            resolve(result[`${cacheKey}_timestamp`] || null);
        });
    });
}

/**
 * Get title for a cache key
 */
async function getTitle(cacheKey) {
    return new Promise((resolve) => {
        chrome.storage.local.get([`${cacheKey}_title`], (result) => {
            resolve(result[`${cacheKey}_title`] || null);
        });
    });
}

/**
 * Extract title from URL
 */
function extractTitleFromUrl(url) {
    const match = url.match(/\/lectures\/(\d+)/);
    return match ? `Lecture-${match[1]}` : 'Shiur';
}

/**
 * Format date
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Simple markdown renderer
 */
function renderMarkdown(markdown) {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Lists
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraphs
    html = '<p>' + html + '</p>';

    // Clean up
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-3]>)/g, '$1');
    html = html.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

    return html;
}
