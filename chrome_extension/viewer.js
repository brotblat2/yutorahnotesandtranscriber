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

    document.getElementById('uploadBtn').addEventListener('click', () => {
        window.location.href = 'upload.html';
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

        // Load and display tags
        await loadAndDisplayTags(currentCacheKey);

        // Setup tag editor
        setupTagEditor(currentCacheKey);

        // Render markdown content
        document.getElementById('noteContent').innerHTML = renderMarkdown(content);

        // Setup action buttons
        document.getElementById('copyBtn').addEventListener('click', () => copyToClipboard(content));
        document.getElementById('downloadBtn').addEventListener('click', () => downloadNote(content, url, type));
        document.getElementById('downloadDocBtn').addEventListener('click', () => downloadNoteAsDoc(content, url, type));
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

            // Setup tag filter
            await setupTagFilter(notes);

            // Setup selection checkboxes and merge functionality
            setupMergeExport();
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
    const isUpload = cacheKey.startsWith('upload_');

    let url, title, lectureId, type;

    if (isUpload) {
        // Uploaded file: upload_[filename]_[type]
        type = parts[parts.length - 1];
        const filename = parts.slice(1, -1).join('_');
        url = `upload://${cacheKey}`;
        title = data.title || filename;
    } else {
        // YUTorah file: yutorah_[id]_[type]
        lectureId = parts[1];
        type = parts[2];
        url = `https://www.yutorah.org/lectures/${lectureId}`;
        title = data.title || `Lecture ${lectureId}`;
    }

    const preview = data.content.substring(0, 200).replace(/[#*>\-]/g, '').trim();
    const date = data.timestamp ? formatDate(data.timestamp) : 'Unknown date';
    const tags = data.tags || [];

    const tagsHtml = tags.length > 0
        ? `<div class="card-tags">${tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('')}</div>`
        : '';

    // Add source badge for uploaded files
    const sourceBadge = isUpload ? '<span class="badge upload">📤 Uploaded</span>' : '';

    return `
        <div class="note-card" data-key="${cacheKey}" data-tags="${tags.join(',')}" data-title="${title}" data-type="${type}">
            <div class="note-card-select">
                <input type="checkbox" class="note-select-checkbox" data-key="${cacheKey}">
            </div>
            <div class="note-card-content">
                <div class="note-card-header">
                    <h3>${title}</h3>
                    ${sourceBadge}
                    <span class="badge ${type}">${type === 'transcript' ? 'Transcript' : 'Notes'}</span>
                </div>
                ${tagsHtml}
                <p class="note-preview">${preview}...</p>
                <div class="note-card-footer">
                    <span class="date">${date}</span>
                    <div class="note-card-actions">
                        <button class="btn-small btn-view" data-url="${url}" data-type="${type}">View</button>
                        <button class="btn-small btn-danger btn-delete-card" data-key="${cacheKey}">Delete</button>
                    </div>
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
 * Download note as DOC file with improved formatting
 */
async function downloadNoteAsDoc(content, url, type) {
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

    // Convert markdown to HTML with proper formatting
    let html = content;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Lists - properly handle bullet points
    const lines = html.split('\n');
    let inList = false;
    let processedLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine.match(/^- /)) {
            if (!inList) {
                processedLines.push('<ul>');
                inList = true;
            }
            processedLines.push('<li>' + trimmedLine.substring(2) + '</li>');
        } else if (trimmedLine === '') {
            // Empty line - close list if open, otherwise add paragraph break
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            processedLines.push('');
        } else {
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            processedLines.push(line);
        }
    }
    if (inList) {
        processedLines.push('</ul>');
    }

    html = processedLines.join('\n');

    // Convert double line breaks to paragraph breaks
    html = html.split('\n\n').map(para => {
        const trimmed = para.trim();
        // Don't wrap headers, lists, or blockquotes in paragraphs
        if (trimmed.startsWith('<h') || trimmed.startsWith('<ul>') ||
            trimmed.startsWith('<blockquote>') || trimmed === '') {
            return trimmed;
        }
        return '<p>' + trimmed.replace(/\n/g, ' ') + '</p>';
    }).join('\n');

    // Clean up empty paragraphs and extra whitespace
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<h[1-3]>)/g, '$1');
    html = html.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

    // Create complete HTML document with UTF-8 encoding for Hebrew
    const htmlDoc = `<!DOCTYPE html>
<html dir="auto">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <style>
        @page {
            margin: 1in;
        }
        body {
            font-family: 'Calibri', 'Arial', 'David', sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            direction: ltr;
        }
        h1 {
            font-size: 20pt;
            font-weight: bold;
            margin-top: 24pt;
            margin-bottom: 12pt;
            page-break-after: avoid;
        }
        h2 {
            font-size: 16pt;
            font-weight: bold;
            margin-top: 18pt;
            margin-bottom: 10pt;
            page-break-after: avoid;
        }
        h3 {
            font-size: 14pt;
            font-weight: bold;
            margin-top: 14pt;
            margin-bottom: 8pt;
            page-break-after: avoid;
        }
        p {
            margin-top: 0;
            margin-bottom: 12pt;
            text-align: justify;
        }
        ul {
            margin-top: 6pt;
            margin-bottom: 12pt;
            padding-left: 24pt;
        }
        li {
            margin-bottom: 6pt;
            line-height: 1.5;
        }
        strong {
            font-weight: bold;
        }
        em {
            font-style: italic;
        }
        blockquote {
            margin: 12pt 0 12pt 24pt;
            padding-left: 12pt;
            border-left: 4pt solid #cccccc;
            font-style: italic;
            color: #333333;
        }
        /* Hebrew text support */
        [dir="rtl"] {
            direction: rtl;
            text-align: right;
        }
    </style>
</head>
<body>
${html}
</body>
</html>`;

    // Create blob with UTF-8 BOM for proper encoding
    const blob = new Blob(['\ufeff', htmlDoc], {
        type: 'application/msword;charset=utf-8'
    });
    const downloadUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${filename}.doc`;
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

/**
 * Load and display tags for a note
 */
async function loadAndDisplayTags(cacheKey) {
    const tags = await Storage.getTags(cacheKey);
    const tagsDisplay = document.getElementById('tagsDisplay');

    if (tags.length > 0) {
        tagsDisplay.innerHTML = tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('');
    } else {
        tagsDisplay.innerHTML = '<span class="no-tags">No tags</span>';
    }
}

/**
 * Setup tag editor modal
 */
function setupTagEditor(cacheKey) {
    const editTagsBtn = document.getElementById('editTagsBtn');
    const modal = document.getElementById('tagEditorModal');
    const tagInput = document.getElementById('tagInput');
    const addTagBtn = document.getElementById('addTagBtn');
    const currentTagsDiv = document.getElementById('currentTags');
    const saveTagsBtn = document.getElementById('saveTagsBtn');
    const cancelTagsBtn = document.getElementById('cancelTagsBtn');
    const tagSuggestionsDiv = document.getElementById('tagSuggestions');
    const suggestedTagsDiv = document.getElementById('suggestedTags');

    let currentTags = [];

    // Open modal
    editTagsBtn.addEventListener('click', async () => {
        currentTags = await Storage.getTags(cacheKey);
        await loadTagSuggestions();
        renderCurrentTags();
        modal.style.display = 'flex';
        tagInput.focus();
    });

    // Close modal
    cancelTagsBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        tagInput.value = '';
    });

    // Load and display tag suggestions
    async function loadTagSuggestions() {
        const allNotes = await Storage.getAllNotes();
        const allTags = new Set();

        // Collect all unique tags from all notes
        Object.values(allNotes).forEach(note => {
            if (note.tags && Array.isArray(note.tags)) {
                note.tags.forEach(tag => allTags.add(tag));
            }
        });

        const uniqueTags = Array.from(allTags).sort();

        if (uniqueTags.length > 0) {
            tagSuggestionsDiv.style.display = 'block';
            renderSuggestedTags(uniqueTags);
        } else {
            tagSuggestionsDiv.style.display = 'none';
        }
    }

    // Render suggested tags
    function renderSuggestedTags(suggestions) {
        suggestedTagsDiv.innerHTML = suggestions.map(tag => {
            const isAdded = currentTags.includes(tag);
            return `<span class="tag-suggestion ${isAdded ? 'added' : ''}" data-tag="${tag}">${tag}</span>`;
        }).join('');

        // Add click handlers
        suggestedTagsDiv.querySelectorAll('.tag-suggestion').forEach(span => {
            span.addEventListener('click', () => {
                if (!span.classList.contains('added')) {
                    const tag = span.dataset.tag;
                    currentTags.push(tag);
                    renderCurrentTags();
                    span.classList.add('added');
                }
            });
        });
    }

    // Add tag
    const addTag = () => {
        const tag = tagInput.value.trim();
        if (tag && !currentTags.includes(tag)) {
            currentTags.push(tag);
            renderCurrentTags();
            // Update suggestions to show this tag as added
            const suggestionSpan = suggestedTagsDiv.querySelector(`[data-tag="${tag}"]`);
            if (suggestionSpan) {
                suggestionSpan.classList.add('added');
            }
            tagInput.value = '';
        }
    };

    addTagBtn.addEventListener('click', addTag);
    tagInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTag();
        }
    });

    // Render current tags
    function renderCurrentTags() {
        if (currentTags.length === 0) {
            currentTagsDiv.innerHTML = '<p class="no-tags-message">No tags added yet</p>';
        } else {
            currentTagsDiv.innerHTML = currentTags.map((tag, index) => `
                <span class="tag-badge editable">
                    ${tag}
                    <button class="remove-tag" data-index="${index}">×</button>
                </span>
            `).join('');

            // Setup remove buttons
            currentTagsDiv.querySelectorAll('.remove-tag').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    const removedTag = currentTags[index];
                    currentTags.splice(index, 1);
                    renderCurrentTags();
                    // Update suggestions to show this tag as available again
                    const suggestionSpan = suggestedTagsDiv.querySelector(`[data-tag="${removedTag}"]`);
                    if (suggestionSpan) {
                        suggestionSpan.classList.remove('added');
                    }
                });
            });
        }
    }

    // Save tags
    saveTagsBtn.addEventListener('click', async () => {
        await Storage.setTags(cacheKey, currentTags);
        await loadAndDisplayTags(cacheKey);
        modal.style.display = 'none';
        tagInput.value = '';
    });
}

/**
 * Setup tag filter dropdown
 */
async function setupTagFilter(notes) {
    const tagFilter = document.getElementById('tagFilter');
    const allTags = await Storage.getAllTags();

    // Populate filter dropdown
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });

    // Handle filter change
    tagFilter.addEventListener('change', (e) => {
        filterNotesByTag(e.target.value);
    });
}

/**
 * Filter notes by tag
 */
function filterNotesByTag(selectedTag) {
    const cards = document.querySelectorAll('.note-card');

    cards.forEach(card => {
        if (!selectedTag) {
            // Show all if no tag selected
            card.style.display = 'block';
        } else {
            const cardTags = card.dataset.tags ? card.dataset.tags.split(',') : [];
            card.style.display = cardTags.includes(selectedTag) ? 'block' : 'none';
        }
    });
}

/**
 * Filter notes based on search query (updated to work with tag filter)
 */
function filterNotes(query) {
    const cards = document.querySelectorAll('.note-card');
    const lowerQuery = query.toLowerCase();
    const selectedTag = document.getElementById('tagFilter')?.value || '';

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const matchesSearch = text.includes(lowerQuery);

        // Check tag filter
        let matchesTag = true;
        if (selectedTag) {
            const cardTags = card.dataset.tags ? card.dataset.tags.split(',') : [];
            matchesTag = cardTags.includes(selectedTag);
        }

        card.style.display = (matchesSearch && matchesTag) ? 'block' : 'none';
    });
}

/**
 * Setup merge and export functionality
 */
function setupMergeExport() {
    const mergeExportBtn = document.getElementById('mergeExportBtn');
    const selectedCountSpan = document.getElementById('selectedCount');
    const mergePanelModal = document.getElementById('mergePanelModal');
    const selectedShiurimList = document.getElementById('selectedShiurimList');
    const exportMergedBtn = document.getElementById('exportMergedBtn');
    const cancelMergeBtn = document.getElementById('cancelMergeBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const selectionControls = document.querySelector('.selection-controls');

    let selectedNotes = new Map(); // cacheKey -> note data

    // Show selection controls
    if (selectionControls) {
        selectionControls.style.display = 'flex';
    }

    // Select all notes
    selectAllBtn?.addEventListener('click', () => {
        // Get all visible checkboxes with their cards
        const visibleCheckboxes = Array.from(document.querySelectorAll('.note-select-checkbox'))
            .map(checkbox => ({
                checkbox,
                card: checkbox.closest('.note-card')
            }))
            .filter(({ card }) => card && card.style.display !== 'none' && !card.querySelector('.note-select-checkbox').checked);

        // Sort by timestamp (oldest first)
        // Note cards are sorted newest first in the display, so we reverse that
        visibleCheckboxes.reverse();

        // Select them in order (oldest to newest)
        visibleCheckboxes.forEach(({ checkbox }) => {
            checkbox.checked = true;
            const event = new Event('change', { bubbles: true });
            checkbox.dispatchEvent(event);
        });
    });

    // Deselect all notes
    deselectAllBtn?.addEventListener('click', () => {
        clearSelection();
    });

    // Handle checkbox changes
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('note-select-checkbox')) {
            const cacheKey = e.target.dataset.key;
            const card = e.target.closest('.note-card');

            if (e.target.checked) {
                // Add to selection
                selectedNotes.set(cacheKey, {
                    cacheKey: cacheKey,
                    title: card.dataset.title,
                    type: card.dataset.type
                });
                card.classList.add('selected');
            } else {
                // Remove from selection
                selectedNotes.delete(cacheKey);
                card.classList.remove('selected');
            }

            updateSelectionUI();
        }
    });

    // Update selection UI
    function updateSelectionUI() {
        const count = selectedNotes.size;
        selectedCountSpan.textContent = count;
        mergeExportBtn.style.display = count > 0 ? 'block' : 'none';
    }

    // Open merge panel
    mergeExportBtn.addEventListener('click', () => {
        renderSelectedShiurim();
        mergePanelModal.style.display = 'flex';
    });

    // Close merge panel
    cancelMergeBtn.addEventListener('click', () => {
        mergePanelModal.style.display = 'none';
    });

    // Render selected shiurim in merge panel
    function renderSelectedShiurim() {
        const items = Array.from(selectedNotes.values());
        selectedShiurimList.innerHTML = items.map((item, index) => `
            <div class="merge-item" draggable="true" data-index="${index}" data-key="${item.cacheKey}">
                <div class="merge-item-drag">⋮⋮</div>
                <div class="merge-item-content">
                    <div class="merge-item-title">${item.title}</div>
                    <span class="badge ${item.type}">${item.type === 'transcript' ? 'Transcript' : 'Notes'}</span>
                </div>
                <div class="merge-item-order">#${index + 1}</div>
            </div>
        `).join('');

        setupDragAndDrop();
    }

    // Setup drag and drop for reordering
    function setupDragAndDrop() {
        const items = selectedShiurimList.querySelectorAll('.merge-item');
        let draggedItem = null;

        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
                draggedItem = null;
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = getDragAfterElement(selectedShiurimList, e.clientY);
                if (afterElement == null) {
                    selectedShiurimList.appendChild(draggedItem);
                } else {
                    selectedShiurimList.insertBefore(draggedItem, afterElement);
                }
            });
        });
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.merge-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // Export merged document
    exportMergedBtn.addEventListener('click', async () => {
        const orderedItems = [...selectedShiurimList.querySelectorAll('.merge-item')];
        const orderedKeys = orderedItems.map(item => item.dataset.key);

        await exportMergedDocument(orderedKeys);

        // Close modal and clear selection
        mergePanelModal.style.display = 'none';
        clearSelection();
    });

    function clearSelection() {
        selectedNotes.clear();
        document.querySelectorAll('.note-select-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.note-card').forEach(card => card.classList.remove('selected'));
        updateSelectionUI();
    }
}

/**
 * Export merged document
 */
async function exportMergedDocument(orderedKeys) {
    try {
        // Fetch all note data
        const notesData = [];
        for (const cacheKey of orderedKeys) {
            const content = await Storage.getCachedNotes(cacheKey);
            const title = await getTitle(cacheKey);
            const parts = cacheKey.split('_');
            const type = parts[2];

            notesData.push({
                cacheKey,
                title: title || `Lecture ${parts[1]}`,
                type,
                content
            });
        }

        // Generate merged HTML
        let mergedHtml = '';

        // Table of Contents
        mergedHtml += '<h1>Table of Contents</h1>\n';
        mergedHtml += '<ul>\n';
        notesData.forEach((note, index) => {
            mergedHtml += `<li>${index + 1}. ${note.title} (${note.type === 'transcript' ? 'Transcript' : 'Notes'})</li>\n`;
        });
        mergedHtml += '</ul>\n';
        mergedHtml += '<hr style="page-break-after: always; border: none; margin: 24pt 0;">\n\n';

        // Add each shiur
        notesData.forEach((note, index) => {
            // Shiur header
            mergedHtml += `<h1>${index + 1}. ${note.title}</h1>\n`;
            mergedHtml += `<p style="color: #666; font-style: italic;">${note.type === 'transcript' ? 'Transcript' : 'Notes'}</p>\n\n`;

            // Convert markdown to HTML
            let html = note.content;

            // Headers (use h2, h3, h4 since h1 is used for shiur title)
            html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
            html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
            html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

            // Bold and italic
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

            // Blockquotes
            html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

            // Lists
            const lines = html.split('\n');
            let inList = false;
            let processedLines = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();

                if (trimmedLine.match(/^- /)) {
                    if (!inList) {
                        processedLines.push('<ul>');
                        inList = true;
                    }
                    processedLines.push('<li>' + trimmedLine.substring(2) + '</li>');
                } else if (trimmedLine === '') {
                    if (inList) {
                        processedLines.push('</ul>');
                        inList = false;
                    }
                    processedLines.push('');
                } else {
                    if (inList) {
                        processedLines.push('</ul>');
                        inList = false;
                    }
                    processedLines.push(line);
                }
            }
            if (inList) {
                processedLines.push('</ul>');
            }

            html = processedLines.join('\n');

            // Paragraphs
            html = html.split('\n\n').map(para => {
                const trimmed = para.trim();
                if (trimmed.startsWith('<h') || trimmed.startsWith('<ul>') ||
                    trimmed.startsWith('<blockquote>') || trimmed === '') {
                    return trimmed;
                }
                return '<p>' + trimmed.replace(/\n/g, ' ') + '</p>';
            }).join('\n\n');

            // Clean up
            html = html.replace(/<p>\s*<\/p>/g, '');
            html = html.replace(/<p>(<h[1-4]>)/g, '$1');
            html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
            html = html.replace(/<p>(<ul>)/g, '$1');
            html = html.replace(/(<\/ul>)<\/p>/g, '$1');
            html = html.replace(/<p>(<blockquote>)/g, '$1');
            html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

            mergedHtml += html;

            // Page break between shiurim (except last one)
            if (index < notesData.length - 1) {
                mergedHtml += '\n<hr style="page-break-after: always; border: none; margin: 24pt 0;">\n\n';
            }
        });

        // Create complete HTML document
        const htmlDoc = `<!DOCTYPE html>
<html dir="auto">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <style>
        @page {
            margin: 1in;
        }
        body {
            font-family: 'Calibri', 'Arial', 'David', sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            direction: ltr;
        }
        h1 {
            font-size: 20pt;
            font-weight: bold;
            margin-top: 24pt;
            margin-bottom: 12pt;
            page-break-after: avoid;
            color: #1a1a1a;
        }
        h2 {
            font-size: 16pt;
            font-weight: bold;
            margin-top: 18pt;
            margin-bottom: 10pt;
            page-break-after: avoid;
        }
        h3 {
            font-size: 14pt;
            font-weight: bold;
            margin-top: 14pt;
            margin-bottom: 8pt;
            page-break-after: avoid;
        }
        h4 {
            font-size: 12pt;
            font-weight: bold;
            margin-top: 12pt;
            margin-bottom: 6pt;
            page-break-after: avoid;
        }
        p {
            margin-top: 0;
            margin-bottom: 12pt;
            text-align: justify;
        }
        ul {
            margin-top: 6pt;
            margin-bottom: 12pt;
            padding-left: 24pt;
        }
        li {
            margin-bottom: 6pt;
            line-height: 1.5;
        }
        strong {
            font-weight: bold;
        }
        em {
            font-style: italic;
        }
        blockquote {
            margin: 12pt 0 12pt 24pt;
            padding-left: 12pt;
            border-left: 4pt solid #cccccc;
            font-style: italic;
            color: #333333;
        }
        hr {
            border: none;
            border-top: 2pt solid #cccccc;
            margin: 24pt 0;
        }
        /* Hebrew text support */
        [dir="rtl"] {
            direction: rtl;
            text-align: right;
        }
    </style>
</head>
<body>
${mergedHtml}
</body>
</html>`;

        // Create and download
        const blob = new Blob(['\ufeff', htmlDoc], {
            type: 'application/msword;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);

        // Get custom filename from input or use default
        const filenameInput = document.getElementById('mergedFilename');
        let filename = filenameInput ? filenameInput.value.trim() : '';

        if (!filename) {
            filename = `yutorah-merged-${Date.now()}`;
        }

        // Sanitize filename
        filename = sanitizeFilename(filename);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert(`Successfully exported ${notesData.length} shiurim!`);
    } catch (error) {
        console.error('Error exporting merged document:', error);
        alert('Error exporting merged document: ' + error.message);
    }
}


