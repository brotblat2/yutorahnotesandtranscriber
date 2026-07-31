// Viewer page JavaScript for YUTorah Notes Extension

let currentCacheKey = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    const url = params.get('url');
    const type = params.get('type');

    // Event listeners
    document.getElementById('backBtn').addEventListener('click', () => {
        // If viewing a single note, go back to all notes view
        if (key || (url && type)) {
            window.location.href = 'viewer.html';
        } else {
            // If on all notes view, close the window
            window.close();
        }
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('uploadBtn').addEventListener('click', () => {
        window.location.href = 'upload.html';
    });

    if (key) {
        // Single note view via exact cache key
        await loadSingleNoteByKey(key);
    } else if (url && type) {
        // Fallback for older links
        await loadSingleNote(url, type);
    } else {
        // All notes view
        await loadAllNotes();
    }
});

/**
 * Helper to parse cache keys robustly
 */
function parseCacheKey(cacheKey) {
    const parts = cacheKey.split('_');
    const isUpload = cacheKey.startsWith('upload_');
    const isKolHalashon = cacheKey.startsWith('kolhalashon_');
    const isYuTorah = cacheKey.startsWith('yutorah_');

    let url, type, lectureId;

    const knownTypes = ['notes', 'transcript', 'maamar', 'enhanced', 'translated_eng', 'translated_heb'];
    const processedType = cacheKey.match(/__(enhanced|translated_eng|translated_heb)__[^_]+$/);
    type = processedType?.[1] || parts.find(p => knownTypes.includes(p)) || parts[2] || 'notes';

    if (isUpload) {
        url = `upload://${cacheKey}`;
    } else if (isKolHalashon) {
        lectureId = parts[1];
        url = `https://www.kolhalashon.com/he/regularSite/playShiur/${lectureId}/-1/0/false`;
    } else if (isYuTorah) {
        lectureId = parts[1];
        url = `https://www.yutorah.org/lectures/${lectureId}`;
    } else {
        url = '';
    }

    return { url, type, isUpload, lectureId };
}

/**
 * Load a single note by explicit cache key
 */
async function loadSingleNoteByKey(cacheKey) {
    const loadingState = document.getElementById('loadingState');
    const singleNoteView = document.getElementById('singleNoteView');

    loadingState.style.display = 'flex';
    currentCacheKey = cacheKey;

    try {
        const { url, type } = parseCacheKey(cacheKey);

        // Get cached note and full metadata
        const content = await Storage.getCachedNotes(cacheKey);
        if (!content) {
            throw new Error('Note not found in cache');
        }
        
        const allNotes = await Storage.getAllNotes();
        const noteData = allNotes[cacheKey] || {};
        const modelUsed = noteData.modelUsed;

        // Display the note
        const title = await getTitle(cacheKey);
        const noteTitleElement = document.getElementById('noteTitle');
        noteTitleElement.textContent = title || extractTitleFromUrl(url);
        applyDirectionToElement(noteTitleElement, content);
        
        let typeDisplay = 'Notes';
        if (type === 'transcript') typeDisplay = 'Transcript';
        else if (type === 'maamar') typeDisplay = 'מאמר';
        else if (type === 'enhanced') typeDisplay = 'Enhanced';
        else if (type === 'translated_eng') typeDisplay = 'English';
        else if (type === 'translated_heb') typeDisplay = 'Lashon Kodesh';

        document.getElementById('noteType').textContent = typeDisplay;
        document.getElementById('noteType').className = `badge ${type}`;

        // Get timestamp
        const timestamp = await getTimestamp(cacheKey);
        if (timestamp) {
            document.getElementById('noteDate').textContent = formatDate(timestamp);
        }

        // Render markdown content
        const noteContentElement = document.getElementById('noteContent');
        noteContentElement.innerHTML = renderMarkdown(content);
        applyDirectionToElement(noteContentElement, content);

        // Setup action buttons
        document.getElementById('copyBtn').addEventListener('click', () => copyToClipboard(content));
        document.getElementById('downloadDocxBtn').addEventListener('click', () => downloadNoteAsDocx(content, url, type));
        document.getElementById('downloadPdfBtn').addEventListener('click', () => downloadNoteAsPdf(content, url, type));
        document.getElementById('deleteBtn').addEventListener('click', () => deleteNote(currentCacheKey));

        // Add enhance and translate listeners
        const enhanceBtn = document.getElementById('enhanceViewBtn');
        const translateSelect = document.getElementById('translateViewSelect');

        // Prevent multiple bindings by replacing elements
        const newEnhanceBtn = enhanceBtn.cloneNode(true);
        enhanceBtn.parentNode.replaceChild(newEnhanceBtn, enhanceBtn);
        
        const newTranslateSelect = translateSelect.cloneNode(true);
        translateSelect.parentNode.replaceChild(newTranslateSelect, translateSelect);

        newEnhanceBtn.addEventListener('click', () => {
            const overwrite = document.getElementById('overwriteViewCheck')?.checked || false;
            handleTextProcessing(content, 'enhance_transcript', title, currentCacheKey, overwrite);
        });
        newTranslateSelect.addEventListener('change', (e) => {
            const processType = e.target.value;
            const overwrite = document.getElementById('overwriteViewCheck')?.checked || false;
            if (processType) {
                handleTextProcessing(content, processType, title, currentCacheKey, overwrite);
                newTranslateSelect.value = '';
            }
        });

        // Only show AI tools for transcripts
        const aiToolsBar = document.getElementById('aiToolsBar');
        if (aiToolsBar) {
            if (type === 'transcript' || type === 'enhanced') {
                aiToolsBar.style.display = 'flex';
            } else {
                aiToolsBar.style.display = 'none';
            }
        }

        // Show warning if non-ideal model was used
        const modelWarningBanner = document.getElementById('viewModelWarningBanner');
        const modelUsedName = document.getElementById('viewModelUsedName');
        if (modelWarningBanner && modelUsedName) {
            if (noteData.isFallback || (modelUsed && modelUsed.includes('2.5'))) {
                modelUsedName.textContent = modelUsed || 'Unknown';
                modelWarningBanner.style.display = 'block';
            } else {
                modelWarningBanner.style.display = 'none';
            }
        }

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

        // Get cached note and metadata
        const content = await Storage.getCachedNotes(currentCacheKey);
        if (!content) {
            throw new Error('Note not found in cache');
        }
        
        const allNotes = await Storage.getAllNotes();
        const noteData = allNotes[currentCacheKey] || {};
        const modelUsed = noteData.modelUsed;

        // Display the note
        const title = await getTitle(currentCacheKey);
        const noteTitleElement = document.getElementById('noteTitle');
        noteTitleElement.textContent = title || extractTitleFromUrl(url);
        applyDirectionToElement(noteTitleElement, content);
        document.getElementById('noteType').textContent = type === 'transcript' ? 'Transcript' : 'Notes';
        document.getElementById('noteType').className = `badge ${type}`;

        // Get timestamp
        const timestamp = await getTimestamp(currentCacheKey);
        if (timestamp) {
            document.getElementById('noteDate').textContent = formatDate(timestamp);
        }

        // Tag UI has been removed
        // await loadAndDisplayTags(currentCacheKey);

        // Tag editor UI has been removed
        // setupTagEditor(currentCacheKey);

        // Render markdown content
        const noteContentElement = document.getElementById('noteContent');
        noteContentElement.innerHTML = renderMarkdown(content);
        applyDirectionToElement(noteContentElement, content);

        // Setup action buttons
        document.getElementById('copyBtn').addEventListener('click', () => copyToClipboard(content));
        document.getElementById('downloadDocxBtn').addEventListener('click', () => downloadNoteAsDocx(content, url, type));
        document.getElementById('downloadPdfBtn').addEventListener('click', () => downloadNoteAsPdf(content, url, type));
        document.getElementById('deleteBtn').addEventListener('click', () => deleteNote(currentCacheKey));

        // Add enhance and translate listeners
        const enhanceBtn = document.getElementById('enhanceViewBtn');
        const translateSelect = document.getElementById('translateViewSelect');

        // Prevent multiple bindings by replacing elements
        const newEnhanceBtn = enhanceBtn.cloneNode(true);
        enhanceBtn.parentNode.replaceChild(newEnhanceBtn, enhanceBtn);
        
        const newTranslateSelect = translateSelect.cloneNode(true);
        translateSelect.parentNode.replaceChild(newTranslateSelect, translateSelect);

        newEnhanceBtn.addEventListener('click', () => {
            const overwrite = document.getElementById('overwriteViewCheck')?.checked || false;
            handleTextProcessing(content, 'enhance_transcript', title, currentCacheKey, overwrite);
        });
        
        newTranslateSelect.addEventListener('change', (e) => {
            const processType = e.target.value;
            const overwrite = document.getElementById('overwriteViewCheck')?.checked || false;
            if (processType) {
                handleTextProcessing(content, processType, title, currentCacheKey, overwrite);
                newTranslateSelect.value = '';
            }
        });

        // Only show AI tools for transcripts
        const aiToolsBar = document.getElementById('aiToolsBar');
        if (aiToolsBar) {
            if (type === 'transcript' || type === 'enhanced') {
                aiToolsBar.style.display = 'flex';
            } else {
                aiToolsBar.style.display = 'none';
            }
        }

        // Show warning if non-ideal model was used
        const modelWarningBanner = document.getElementById('viewModelWarningBanner');
        const modelUsedName = document.getElementById('viewModelUsedName');
        if (modelWarningBanner && modelUsedName) {
            if (noteData.isFallback || (modelUsed && modelUsed.includes('2.5'))) {
                modelUsedName.textContent = modelUsed || 'Unknown';
                modelWarningBanner.style.display = 'block';
            } else {
                modelWarningBanner.style.display = 'none';
            }
        }

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
 * Handle Enhance and Translate in Viewer
 */
async function handleTextProcessing(text, type, title, originalKey, overwrite = false) {
    const loadingState = document.getElementById('loadingState');
    const singleNoteView = document.getElementById('singleNoteView');
    
    // Show loading text
    const loadingText = loadingState.querySelector('p');
    const originalLoadingText = loadingText.textContent;
    loadingText.textContent = type === 'enhance_transcript' ? 'Enhancing text...' : 'Translating text...';
    
    singleNoteView.style.display = 'none';
    loadingState.style.display = 'flex';

    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    action: 'processTextShiur',
                    text: text,
                    type: type,
                    originalKey: originalKey,
                    overwrite: overwrite,
                    metadata: { title: title }
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

        if (response && response.success && response.newKey) {
            // Show the exact saved result, whether it replaced the current
            // note or was saved as a clearly named copy.
            window.location.href = `viewer.html?key=${encodeURIComponent(response.newKey)}`;
        } else {
            throw new Error(response?.error || 'Unknown error occurred');
        }
    } catch (error) {
        console.error('Error processing text:', error);
        alert('Error processing text: ' + error.message);
        // Restore view
        loadingState.style.display = 'none';
        singleNoteView.style.display = 'block';
    } finally {
        loadingText.textContent = originalLoadingText;
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
                    const cacheKey = e.target.dataset.key;
                    window.location.href = `viewer.html?key=${encodeURIComponent(cacheKey)}`;
                } else if (e.target.classList.contains('btn-delete-card')) {
                    const cacheKey = e.target.dataset.key;
                    deleteNoteCard(cacheKey);
                }
            });

            // Setup search
            document.getElementById('searchInput').addEventListener('input', (e) => {
                filterNotes(e.target.value);
            });

            // Tag filter UI has been removed
            // await setupTagFilter(notes);

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
    const parsed = parseCacheKey(cacheKey);
    const url = parsed.url;
    const type = parsed.type;
    const parts = cacheKey.split('_');
    const isUpload = parsed.isUpload;
    
    let title;
    if (isUpload) {
        const filename = parts.slice(1, -1).join('_');
        title = data.title || filename;
    } else if (parsed.lectureId && cacheKey.startsWith('kolhalashon_')) {
        title = data.title || `קול הלשון ${parsed.lectureId}`;
    } else if (parsed.lectureId) {
        title = data.title || `Lecture ${parsed.lectureId}`;
    } else {
        title = data.title || cacheKey;
    }

    const preview = data.content.substring(0, 200).replace(/[#*>\\-]/g, '').trim();
    const date = data.timestamp ? formatDate(data.timestamp) : 'Unknown date';

    // Append speaker name to title if available
    const displayTitle = data.speaker ? `${title} - ${data.speaker}` : title;

    // Add source badge for uploaded files
    const sourceBadge = isUpload ? '<span class="badge upload">📤 Uploaded</span>' : '';
    
    let typeDisplay = 'Notes';
    if (type === 'transcript') typeDisplay = 'Transcript';
    else if (type === 'maamar') typeDisplay = 'מאמר';
    else if (type === 'enhanced') typeDisplay = 'Enhanced';
    else if (type === 'translated_eng') typeDisplay = 'English trans.';
    else if (type === 'translated_heb') typeDisplay = 'Lashon Kodesh';

    return `
        <div class="note-card" data-key="${cacheKey}" data-title="${title}" data-type="${type}">
            <div class="note-card-select">
                <input type="checkbox" class="note-select-checkbox" data-key="${cacheKey}">
            </div>
            <div class="note-card-content">
                <div class="note-card-header">
                    <h3 ${getTextDirectionAttrs(displayTitle, data.content)}>${displayTitle}</h3>
                    ${sourceBadge}
                    <span class="badge ${type}">${typeDisplay}</span>
                </div>
                <p class="note-preview" ${getTextDirectionAttrs(preview, data.content)}>${preview}...</p>
                <div class="note-card-footer">
                    <span class="date">${date}</span>
                    <div class="note-card-actions">
                        <button class="btn-small btn-view" data-key="${cacheKey}">View</button>
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
window.viewNoteByKey = function (cacheKey) {
    window.location.href = `viewer.html?key=${encodeURIComponent(cacheKey)}`;
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
 * Helper to generate styled HTML for export
 */
function generateStyledHtml(content, title, type) {
    return renderMarkdownToHtml(content);
}

/**
 * Download note as a real DOCX file.
 */
async function downloadNoteAsDocx(content, url, type) {
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
    const htmlContent = generateStyledHtml(content, title, type);

    exportAsDocx(htmlContent, title, filename, content);
}

function downloadNoteAsPdf(content, url, type) {
    const title = document.getElementById('noteTitle').textContent || extractTitleFromUrl(url);
    exportAsPdf(generateStyledHtml(content, title, type), content, title);
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
    return renderMarkdownToHtml(markdown);
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
    const exportMergedDocxBtn = document.getElementById('exportMergedDocxBtn');
    const exportMergedPdfBtn = document.getElementById('exportMergedPdfBtn');
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
    const handleMergedExport = async (format) => {
        const pdfWindow = format === 'pdf' ? window.open('', '_blank') : null;
        const orderedItems = [...selectedShiurimList.querySelectorAll('.merge-item')];
        const orderedKeys = orderedItems.map(item => item.dataset.key);

        await exportMergedDocument(orderedKeys, format, pdfWindow);

        // Close modal and clear selection
        mergePanelModal.style.display = 'none';
        clearSelection();
    };
    exportMergedDocxBtn.addEventListener('click', () => handleMergedExport('docx'));
    exportMergedPdfBtn.addEventListener('click', () => handleMergedExport('pdf'));

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
async function exportMergedDocument(orderedKeys, format = 'docx', pdfWindow = null) {
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
        const mergedText = notesData.map(note => note.content || '').join('\n\n');
        mergedHtml += `<ul ${getTextDirectionAttrs(notesData.map(note => note.title || '').join(' '), mergedText)}>\n`;
        notesData.forEach((note, index) => {
            const tocText = `${index + 1}. ${note.title} (${note.type === 'transcript' ? 'Transcript' : 'Notes'})`;
            mergedHtml += `<li ${getTextDirectionAttrs(tocText, mergedText)}>${tocText}</li>\n`;
        });
        mergedHtml += '</ul>\n';
        mergedHtml += '<hr style="page-break-after: always; border: none; margin: 24pt 0;">\n\n';

        // Add each shiur
        notesData.forEach((note, index) => {
            // Shiur header
            const noteTitle = `${index + 1}. ${note.title}`;
            mergedHtml += `<h1 ${getTextDirectionAttrs(noteTitle, mergedText)}>${noteTitle}</h1>\n`;
            mergedHtml += `<p style="color: #666; font-style: italic;">${note.type === 'transcript' ? 'Transcript' : 'Notes'}</p>\n\n`;

            // Reserve h1 for the merged-document's shiur title.
            mergedHtml += renderMarkdownToHtml(note.content, 1);

            // Page break between shiurim (except last one)
            if (index < notesData.length - 1) {
                mergedHtml += '\n<hr style="page-break-after: always; border: none; margin: 24pt 0;">\n\n';
            }
        });

        // Create complete HTML document
        // Detect if merged content is majority Hebrew for proper text direction
        const docDirection = isMajorityHebrew(mergedText) ? 'rtl' : 'ltr';
        const htmlDoc = `<!DOCTYPE html>
<html dir="${docDirection}">
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
            direction: ${docDirection};
            text-align: ${docDirection === 'rtl' ? 'right' : 'left'};
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
        ul[dir="rtl"] {
            padding-left: 0;
            padding-right: 24pt;
        }
        blockquote[dir="rtl"] {
            margin: 12pt 24pt 12pt 0;
            padding-left: 0;
            padding-right: 12pt;
            border-left: none;
            border-right: 4pt solid #cccccc;
        }
    </style>
</head>
<body>
${mergedHtml}
</body>
</html>`;

        // Get custom filename from input or use default
        const filenameInput = document.getElementById('mergedFilename');
        let filename = filenameInput ? filenameInput.value.trim() : '';

        if (!filename) {
            filename = `yutorah-merged-${Date.now()}`;
        }

        // Sanitize filename
        filename = sanitizeFilename(filename);

        if (format === 'pdf') {
            exportAsPdf(mergedHtml, mergedText, filename, pdfWindow);
        } else {
            exportAsDocx(mergedHtml, filename, filename, mergedText);
        }

        alert(`Successfully prepared ${notesData.length} shiurim for ${format === 'pdf' ? 'PDF' : 'DOCX'} export!`);
    } catch (error) {
        console.error('Error exporting merged document:', error);
        alert('Error exporting merged document: ' + error.message);
    }
}


