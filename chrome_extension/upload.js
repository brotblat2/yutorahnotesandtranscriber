// Upload page JavaScript for YUTorah Notes Extension

let selectedFiles = [];
let currentCacheKey = null;

/**
 * Reserve one demo-mode request through the background worker. Keeping this
 * there makes the three-request limit consistent with site processing.
 */
async function claimDefaultRequest() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'claimDefaultRequest' }, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (!response?.success || !response.allowed) {
                reject(new Error(response?.error || 'Daily limit reached. Please try again tomorrow.'));
                return;
            }

            resolve(response);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkApiKey();
});

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Navigation
    document.getElementById('viewNotesBtn').addEventListener('click', () => {
        window.location.href = 'viewer.html';
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // File selection
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');

    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);

    // Remove file
    document.getElementById('removeFileBtn').addEventListener('click', clearFile);

    // Process button
    document.getElementById('processBtn').addEventListener('click', processFile);

    // Result actions
    document.getElementById('viewResultBtn').addEventListener('click', () => {
        if (currentCacheKey) {
            // Navigate to the specific file in viewer
            // Extract the parts from cache key: upload_[filename]_[type]
            const parts = currentCacheKey.split('_');
            const type = parts[parts.length - 1]; // 'notes' or 'transcript'

            // Create a pseudo-URL for uploaded files
            const pseudoUrl = `upload://${currentCacheKey}`;
            window.location.href = `viewer.html?url=${encodeURIComponent(pseudoUrl)}&type=${type}`;
        } else {
            window.location.href = 'viewer.html';
        }
    });

    document.getElementById('uploadAnotherBtn').addEventListener('click', resetUpload);
    document.getElementById('tryAgainBtn').addEventListener('click', resetUpload);

    // File type change
    document.querySelectorAll('input[name="summaryType"]').forEach(radio => {
        radio.addEventListener('change', updateTypeSelector);
    });
}

/**
 * Check if API key is configured
 */
async function checkApiKey() {
    try {
        const mode = await Storage.getKeyMode();
        const hasCustomKey = mode === 'custom' && await Storage.getApiKey();

        const hasDemoKey = mode === 'default' &&
            typeof hasDefaultKey === 'function' && hasDefaultKey();

        if (hasDemoKey || hasCustomKey) {
            // API key available
            return true;
        } else {
            showError('No API key configured. Please set up your API key in Settings.');
            return false;
        }
    } catch (error) {
        console.error('Error checking API key:', error);
        return false;
    }
}

/**
 * Handle drag over
 */
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

/**
 * Handle drag leave
 */
function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

/**
 * Handle file drop
 */
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        validateAndSetFiles(files);
    }
}

/**
 * Handle file selection from input
 */
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        validateAndSetFiles(files);
    }
}

/**
 * Helper to check if a file is a document
 */
function isFileDocument(file) {
    return file.type === 'application/pdf' || 
           file.type === 'text/plain' || 
           file.type === 'application/msword' || 
           file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
           /\.(pdf|txt|doc|docx)$/i.test(file.name);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Remove a single file from the batch list
 */
function removeFileFromBatch(index) {
    selectedFiles.splice(index, 1);
    displayFilesInfo();
}

/**
 * Validate and set selected files
 */
function validateAndSetFiles(filesList) {
    const validTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'application/pdf', 'audio/ogg', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExtensions = ['.mp3', '.m4a', '.pdf', '.ogg', '.txt', '.doc', '.docx'];

    const newValidFiles = [];
    const invalidFileNames = [];

    for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        const isValidType = validTypes.includes(file.type) || validExtensions.includes(fileExtension);

        if (isValidType) {
            newValidFiles.push(file);
        } else {
            invalidFileNames.push(file.name);
        }
    }

    if (invalidFileNames.length > 0) {
        showError(`Invalid file type for: ${invalidFileNames.join(', ')}. Please upload MP3, M4A, PDF, TXT, DOC, or DOCX files only.`);
        if (newValidFiles.length === 0) {
            return;
        }
    }

    // Add unique new files to selection
    for (const file of newValidFiles) {
        const alreadyExists = selectedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!alreadyExists) {
            selectedFiles.push(file);
        }
    }

    displayFilesInfo();
}

/**
 * Display file information (supports single file details and batch view)
 */
function displayFilesInfo() {
    if (selectedFiles.length === 0) {
        resetUpload();
        return;
    }

    const dropZone = document.getElementById('dropZone');
    const fileInfo = document.getElementById('fileInfo');
    const singleFileDetails = document.getElementById('singleFileDetails');
    const batchFileList = document.getElementById('batchFileList');
    const titleGroup = document.getElementById('titleGroup');
    const titleHelper = document.getElementById('titleHelper');

    // Hide drop zone, show file info
    dropZone.style.display = 'none';
    fileInfo.style.display = 'block';

    const hasDocs = selectedFiles.some(isFileDocument);
    const hasAudio = selectedFiles.some(f => !isFileDocument(f));

    // Show/hide options based on file types in selection
    const ocrOption = document.getElementById('ocrOption');
    const transcriptOption = document.querySelector('input[value="transcript"]').closest('.radio-option');
    const maamarOption = document.querySelector('input[value="maamar"]').closest('.radio-option');

    ocrOption.style.display = hasDocs ? 'block' : 'none';
    transcriptOption.style.display = hasAudio ? 'block' : 'none';
    maamarOption.style.display = hasAudio ? 'block' : 'none';

    // Reset default summary type if current choice is hidden
    const checkedOption = document.querySelector('input[name="summaryType"]:checked');
    if (checkedOption && checkedOption.closest('.radio-option').style.display === 'none') {
        document.querySelector('input[name="summaryType"][value="notes"]').checked = true;
    }

    if (selectedFiles.length === 1) {
        // Single file view
        singleFileDetails.style.display = 'flex';
        batchFileList.style.display = 'none';
        titleGroup.style.display = 'block';
        titleHelper.textContent = 'Leave blank to use filename';

        const file = selectedFiles[0];
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = formatFileSize(file.size);
        document.getElementById('fileType').textContent = isFileDocument(file) ? 'Document' : 'Audio File';

        // Set default title
        const titleInput = document.getElementById('titleInput');
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        titleInput.placeholder = fileNameWithoutExt;
    } else {
        // Batch view
        singleFileDetails.style.display = 'none';
        batchFileList.style.display = 'block';
        
        // Hide title input group since filenames are used as titles
        titleGroup.style.display = 'none';

        // Render batch file list
        batchFileList.innerHTML = selectedFiles.map((file, index) => {
            const sizeStr = formatFileSize(file.size);
            const typeStr = isFileDocument(file) ? '📄' : '🎵';
            return `
                <div class="batch-file-item" data-index="${index}">
                    <div class="batch-file-info">
                        <span class="batch-file-icon">${typeStr}</span>
                        <span class="batch-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                        <span class="batch-file-size">(${sizeStr})</span>
                    </div>
                    <button class="btn-remove batch-remove-btn" data-index="${index}">✕</button>
                </div>
            `;
        }).join('');

        // Attach remove event listeners
        document.querySelectorAll('.batch-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.currentTarget.dataset.index, 10);
                removeFileFromBatch(index);
            });
        });
    }
}

/**
 * Clear selected file(s)
 */
function clearFile() {
    selectedFiles = [];
    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('fileInput').value = '';
    document.getElementById('titleInput').value = '';
}

/**
 * Update type selector
 */
function updateTypeSelector() {
    // Handled dynamically in displayFilesInfo
}

/**
 * Process the selected file
 */
/**
 * Rate limiter helper enforcing at most 4 uploads per 70 seconds.
 */
class UploadRateLimiter {
    constructor(limit = 4, intervalMs = 70000) {
        this.limit = limit;
        this.intervalMs = intervalMs;
        this.startTimestamps = [];
    }

    async acquire(statusUpdateCallback) {
        while (true) {
            const now = Date.now();
            // Filter timestamps within the rolling window
            this.startTimestamps = this.startTimestamps.filter(t => now - t < this.intervalMs);

            if (this.startTimestamps.length < this.limit) {
                this.startTimestamps.push(now);
                return;
            }

            const oldest = this.startTimestamps[0];
            const waitTime = this.intervalMs - (now - oldest);
            console.log(`Rate limit reached (4 uploads / 70s). Waiting ${Math.ceil(waitTime / 1000)}s...`);

            if (statusUpdateCallback) {
                statusUpdateCallback(waitTime);
            }

            await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
        }
    }
}

const rateLimiter = new UploadRateLimiter(4, 70000);

/**
 * Simple Mutex for serializing asynchronous operations
 */
class Mutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }

    async acquire() {
        return new Promise(resolve => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        } else {
            this.locked = false;
        }
    }
}

const generationMutex = new Mutex();

/**
 * Route to single or batch processing
 */
async function processFile() {
    if (selectedFiles.length === 0) {
        showError('No file selected');
        return;
    }

    if (selectedFiles.length > 1) {
        await processBatch();
    } else {
        await processSingleFile();
    }
}

/**
 * Process single selected file
 */
async function processSingleFile() {
    const file = selectedFiles[0];
    const titleInput = document.getElementById('titleInput').value.trim();
    const title = titleInput || file.name.replace(/\.[^/.]+$/, '');
    const summaryType = document.querySelector('input[name="summaryType"]:checked').value;

    showProcessing();

    try {
        const mode = await Storage.getKeyMode();
        let apiKey;
        if (mode === 'custom') {
            apiKey = await Storage.getApiKey();
            if (!apiKey) throw new Error('No custom API key configured');
        } else {
            apiKey = getRandomDefaultKey();
            if (!apiKey) throw new Error('Default API key is not configured. Please add your own API key in Settings.');
            await claimDefaultRequest();
        }

        updateProcessingStatus('Uploading file to Gemini...', 25);

        let mimeType = file.type;
        if (!mimeType || mimeType === '') {
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'mp3') mimeType = 'audio/mpeg';
            else if (ext === 'm4a') mimeType = 'audio/mp4';
            else if (ext === 'pdf') mimeType = 'application/pdf';
            else if (ext === 'txt') mimeType = 'text/plain';
            else if (ext === 'doc') mimeType = 'application/msword';
            else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }

        const uploadedFile = await GeminiAPI.uploadFile(apiKey, file, mimeType);
        updateProcessingStatus('Processing content...', 50);

        let customPrompts = null;
        try {
            customPrompts = await Storage.getCustomPrompts();
        } catch (error) {
            console.log('Using default prompts');
        }

        const result = await GeminiAPI.generateContent(
            apiKey,
            uploadedFile.uri,
            summaryType,
            customPrompts,
            mimeType
        );
        const content = result.text;
        const modelUsed = result.model;
        const isFallback = result.isFallback;

        updateProcessingStatus('Saving results...', 90);

        const cacheKey = generateUploadCacheKey(file.name, summaryType);
        await Storage.setCachedNotes(cacheKey, content, { title: title, modelUsed: modelUsed, isFallback: isFallback });

        updateProcessingStatus('Complete!', 100);

        setTimeout(() => {
            showResults(title, content, cacheKey);
        }, 500);

    } catch (error) {
        console.error('Error processing file:', error);
        showError(error.message || 'An error occurred while processing the file');
    }
}

/**
 * Process multiple files in a batch concurrently with rate limiting (4 files/70 seconds)
 */
async function processBatch() {
    const totalFiles = selectedFiles.length;
    const results = new Array(totalFiles);
    
    // Track file progress independently (0 to 100)
    const fileProgresses = new Array(totalFiles).fill(0);
    let completedCount = 0;

    // Show processing UI
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('processingSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'none';

    // Show batch list in processing view
    const batchStatusList = document.getElementById('batchStatusList');
    batchStatusList.style.display = 'block';
    
    // Initialize batch status list HTML
    batchStatusList.innerHTML = selectedFiles.map((file, index) => `
        <div class="batch-status-item" id="statusItem-${index}">
            <div class="batch-status-left">
                <span class="batch-status-icon">${isFileDocument(file) ? '📄' : '🎵'}</span>
                <span class="batch-status-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            </div>
            <span class="batch-status-badge pending" id="statusBadge-${index}">Pending</span>
        </div>
    `).join('');

    const updateStatusUI = () => {
        document.getElementById('processingStatus').textContent = `Processing Batch: ${completedCount} of ${totalFiles} files completed`;
        const activeNames = [];
        selectedFiles.forEach((file, index) => {
            const badge = document.getElementById(`statusBadge-${index}`);
            if (badge && (badge.classList.contains('uploading') || badge.classList.contains('processing'))) {
                activeNames.push(file.name);
            }
        });
        if (activeNames.length > 0) {
            document.getElementById('processingDetails').textContent = `Active: ${activeNames.join(', ')}`;
        } else {
            document.getElementById('processingDetails').textContent = 'Waiting for rate limit slots...';
        }

        // Calculate average progress
        const totalProgress = fileProgresses.reduce((sum, p) => sum + p, 0) / totalFiles;
        document.getElementById('progressFill').style.width = `${Math.min(totalProgress, 100)}%`;
    };

    updateStatusUI();

    let apiKey;
    try {
        const mode = await Storage.getKeyMode();
        if (mode === 'custom') {
            apiKey = await Storage.getApiKey();
            if (!apiKey) throw new Error('No custom API key configured');
        } else {
            apiKey = getRandomDefaultKey();
            if (!apiKey) throw new Error('Default API key is not configured. Please add your own API key in Settings.');
        }
    } catch (err) {
        showError(err.message || 'Error initializing batch');
        return;
    }

    const summaryType = document.querySelector('input[name="summaryType"]:checked').value;
    let customPrompts = null;
    try {
        customPrompts = await Storage.getCustomPrompts();
    } catch (e) {
        console.log('Using default prompts');
    }

    // Process a single file in the concurrent batch
    const processFileInBatch = async (file, index) => {
        const badge = document.getElementById(`statusBadge-${index}`);
        const setFileStatus = (statusText, badgeClass) => {
            badge.textContent = statusText;
            badge.className = `batch-status-badge ${badgeClass}`;
        };

        setFileStatus('Waiting', 'pending');

        try {
            const mode = await Storage.getKeyMode();
            if (mode === 'default') {
                await claimDefaultRequest();
            }

            // Enforce rolling-window rate limits
            await rateLimiter.acquire((waitTimeMs) => {
                const remainingSecs = Math.ceil(waitTimeMs / 1000);
                setFileStatus(`Wait ${remainingSecs}s`, 'pending');
            });

            setFileStatus('Uploading', 'uploading');
            fileProgresses[index] = 10;
            updateStatusUI();

            let mimeType = file.type;
            if (!mimeType || mimeType === '') {
                const ext = file.name.split('.').pop().toLowerCase();
                if (ext === 'mp3') mimeType = 'audio/mpeg';
                else if (ext === 'm4a') mimeType = 'audio/mp4';
                else if (ext === 'pdf') mimeType = 'application/pdf';
                else if (ext === 'txt') mimeType = 'text/plain';
                else if (ext === 'doc') mimeType = 'application/msword';
                else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }

            const uploadedFile = await GeminiAPI.uploadFile(apiKey, file, mimeType);
            
            setFileStatus('Processing', 'processing');
            fileProgresses[index] = 50;
            updateStatusUI();

            let cacheKey;
            
            // Acquire lock to serialize content generation and storage operations
            await generationMutex.acquire();
            try {
                // Adjust summaryType for documents
                let fileSummaryType = summaryType;
                if (isFileDocument(file)) {
                    if (summaryType !== 'ocr' && summaryType !== 'notes') {
                        fileSummaryType = 'notes';
                    }
                } else {
                    if (summaryType === 'ocr') {
                        fileSummaryType = 'notes';
                    }
                }

                const result = await GeminiAPI.generateContent(
                    apiKey,
                    uploadedFile.uri,
                    fileSummaryType,
                    customPrompts,
                    mimeType
                );
                
                setFileStatus('Saving', 'processing');
                fileProgresses[index] = 90;
                updateStatusUI();

                const title = file.name.replace(/\.[^/.]+$/, '');
                cacheKey = generateUploadCacheKey(file.name, fileSummaryType);
                await Storage.setCachedNotes(cacheKey, result.text, {
                    title: title,
                    modelUsed: result.model,
                    isFallback: result.isFallback
                });

            } finally {
                generationMutex.release();
            }

            setFileStatus('Complete', 'complete');
            fileProgresses[index] = 100;
            results[index] = { name: file.name, success: true, cacheKey: cacheKey };

        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            setFileStatus('Error', 'error');
            fileProgresses[index] = 100; // Count as finished for progress calculation
            results[index] = { name: file.name, success: false, error: error.message || 'An error occurred' };
        }

        completedCount++;
        updateStatusUI();
    };

    // Spawn processing of all selected files concurrently
    const promises = selectedFiles.map((file, index) => processFileInBatch(file, index));
    await Promise.all(promises);
    showBatchResults(results);
}

function showBatchResults(results) {
    document.getElementById('processingSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';
    
    document.getElementById('resultsHeading').textContent = '✅ Batch Processing Complete!';
    document.getElementById('singleResultPreview').style.display = 'none';
    
    const batchResultsContainer = document.getElementById('batchResultsContainer');
    const batchResultsList = document.getElementById('batchResultsList');
    batchResultsContainer.style.display = 'block';

    batchResultsList.innerHTML = results.map(res => {
        if (res.success) {
            return `
                <div class="batch-result-item">
                    <div class="batch-result-info">
                        <span class="batch-result-title" title="${escapeHtml(res.name)}">${escapeHtml(res.name)}</span>
                        <div class="batch-result-status">
                            <span class="batch-status-badge complete">Success</span>
                        </div>
                    </div>
                    <div class="batch-result-actions">
                        <button class="btn-small-view btn-view-note" data-key="${res.cacheKey}">View</button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="batch-result-item">
                    <div class="batch-result-info">
                        <span class="batch-result-title" title="${escapeHtml(res.name)}">${escapeHtml(res.name)}</span>
                        <div class="batch-result-status">
                            <span class="batch-status-badge error">Failed</span>
                            <small style="color: var(--danger-color); display: block; margin-top: 4px;">${escapeHtml(res.error)}</small>
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');

    // Attach click events to the "View" buttons
    document.querySelectorAll('.btn-view-note').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const cacheKey = e.currentTarget.dataset.key;
            const parts = cacheKey.split('_');
            const type = parts[parts.length - 1];
            const pseudoUrl = `upload://${cacheKey}`;
            
            window.open(`viewer.html?url=${encodeURIComponent(pseudoUrl)}&type=${type}`, '_blank');
        });
    });

    const viewResultBtn = document.getElementById('viewResultBtn');
    viewResultBtn.textContent = '📁 Go to My Notes';
    // Clear cache key so original event listener defaults to viewing all notes list
    currentCacheKey = null;
}

/**
 * Generate cache key for uploaded file
 */
function generateUploadCacheKey(filename, type) {
    const sanitized = filename
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .substring(0, 50);

    return `upload_${sanitized}_${type}`;
}

/**
 * Show processing UI
 */
function showProcessing() {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('processingSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'none';
}

/**
 * Update processing status
 */
function updateProcessingStatus(message, progress) {
    document.getElementById('processingStatus').textContent = message;
    document.getElementById('progressFill').style.width = progress + '%';
}

/**
 * Show results
 */
function showResults(title, content, cacheKey) {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('processingSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('errorSection').style.display = 'none';

    currentCacheKey = cacheKey;
    document.getElementById('resultTitle').textContent = title;

    const preview = content.substring(0, 500) + (content.length > 500 ? '...' : '');
    document.getElementById('resultContent').textContent = preview;
}

/**
 * Show error
 */
function showError(message) {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('processingSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'block';

    document.getElementById('errorMessage').textContent = message;
}

/**
 * Reset upload form
 */
function resetUpload() {
    clearFile();
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('processingSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'none';
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
