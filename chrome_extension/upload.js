// Upload page JavaScript for YUTorah Notes Extension

let selectedFile = null;
let currentCacheKey = null;

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

        if (mode === 'default' || hasCustomKey) {
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
        validateAndSetFile(files[0]);
    }
}

/**
 * Handle file selection from input
 */
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        validateAndSetFile(files[0]);
    }
}

/**
 * Validate and set selected file
 */
function validateAndSetFile(file) {
    // Check file type
    const validTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'application/pdf'];
    const validExtensions = ['.mp3', '.m4a', '.pdf'];

    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    const isValidType = validTypes.includes(file.type) || validExtensions.includes(fileExtension);

    if (!isValidType) {
        showError('Invalid file type. Please upload MP3, M4A, or PDF files only.');
        return;
    }

    // Check file size
    const maxSize = file.type === 'application/pdf' ? 20 * 1024 * 1024 : 100 * 1024 * 1024;
    if (file.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        showError(`File too large. Maximum size: ${maxSizeMB}MB`);
        return;
    }

    selectedFile = file;
    displayFileInfo(file);
}

/**
 * Display file information
 */
function displayFileInfo(file) {
    const dropZone = document.getElementById('dropZone');
    const fileInfo = document.getElementById('fileInfo');
    const typeSelector = document.getElementById('typeSelector');

    // Hide drop zone, show file info
    dropZone.style.display = 'none';
    fileInfo.style.display = 'block';

    // Set file details
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);

    // Determine file type
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const fileType = isPDF ? 'PDF Document' : 'Audio File';
    document.getElementById('fileType').textContent = fileType;

    // Show/hide options based on file type
    const ocrOption = document.getElementById('ocrOption');
    const transcriptOption = document.querySelector('input[value="transcript"]').closest('.radio-option');

    if (isPDF) {
        // For PDFs: show Notes and OCR, hide Transcript
        typeSelector.style.display = 'block';
        ocrOption.style.display = 'block';
        transcriptOption.style.display = 'none';
        document.querySelector('input[name="summaryType"][value="notes"]').checked = true;
    } else {
        // For audio: show Notes and Transcript, hide OCR
        typeSelector.style.display = 'block';
        ocrOption.style.display = 'none';
        transcriptOption.style.display = 'block';
        document.querySelector('input[name="summaryType"][value="notes"]').checked = true;
    }

    // Set default title
    const titleInput = document.getElementById('titleInput');
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    titleInput.placeholder = fileNameWithoutExt;
}

/**
 * Clear selected file
 */
function clearFile() {
    selectedFile = null;
    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('fileInput').value = '';
    document.getElementById('titleInput').value = '';
}

/**
 * Update type selector based on file type
 */
function updateTypeSelector() {
    // This is handled in displayFileInfo
}

/**
 * Process the selected file
 */
async function processFile() {
    if (!selectedFile) {
        showError('No file selected');
        return;
    }

    // Get configuration
    const titleInput = document.getElementById('titleInput').value.trim();
    const title = titleInput || selectedFile.name.replace(/\.[^/.]+$/, '');
    const summaryType = document.querySelector('input[name="summaryType"]:checked').value;

    // Show processing UI
    showProcessing();

    try {
        // Check rate limits
        const requestCheck = await Storage.canMakeRequest();
        if (!requestCheck.allowed) {
            const resetDate = new Date(requestCheck.usage.resetDate);
            resetDate.setDate(resetDate.getDate() + 1);
            const hoursUntilReset = Math.ceil((resetDate - new Date()) / (1000 * 60 * 60));

            throw new Error(`Daily limit reached (${requestCheck.limit} requests/day). Resets in ~${hoursUntilReset} hours.\\n\\nFor unlimited access, add your own API key in Settings.`);
        }

        // Get API key
        const mode = await Storage.getKeyMode();
        let apiKey;

        if (mode === 'custom') {
            apiKey = await Storage.getApiKey();
            if (!apiKey) {
                throw new Error('No custom API key configured');
            }
        } else {
            apiKey = getRandomDefaultKey();
        }

        // Update status
        updateProcessingStatus('Uploading file to Gemini...', 25);

        // Determine MIME type
        let mimeType = selectedFile.type;
        if (!mimeType || mimeType === '') {
            const ext = selectedFile.name.split('.').pop().toLowerCase();
            if (ext === 'mp3') mimeType = 'audio/mpeg';
            else if (ext === 'm4a') mimeType = 'audio/mp4';
            else if (ext === 'pdf') mimeType = 'application/pdf';
        }

        // Upload file
        const uploadedFile = await GeminiAPI.uploadFile(apiKey, selectedFile, mimeType);

        updateProcessingStatus('Processing content...', 50);

        // Get custom prompts if available
        let customPrompts = null;
        try {
            customPrompts = await Storage.getCustomPrompts();
        } catch (error) {
            console.log('Using default prompts');
        }

        // Generate content
        const content = await GeminiAPI.generateContent(
            apiKey,
            uploadedFile.uri,
            summaryType,
            customPrompts,
            mimeType  // Pass the MIME type
        );

        updateProcessingStatus('Saving results...', 90);

        // Save to storage
        const cacheKey = generateUploadCacheKey(selectedFile.name, summaryType);
        await Storage.setCachedNotes(cacheKey, content, { title: title });

        // Increment usage if using default keys
        if (mode === 'default') {
            await Storage.incrementDailyUsage();
        }

        updateProcessingStatus('Complete!', 100);

        // Show results
        setTimeout(() => {
            showResults(title, content, cacheKey);
        }, 500);

    } catch (error) {
        console.error('Error processing file:', error);
        showError(error.message || 'An error occurred while processing the file');
    }
}

/**
 * Generate cache key for uploaded file
 */
function generateUploadCacheKey(filename, type) {
    const sanitized = filename
        .replace(/\.[^/.]+$/, '') // Remove extension
        .replace(/[^a-z0-9]/gi, '-') // Replace special chars with hyphens
        .replace(/-+/g, '-') // Remove consecutive hyphens
        .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
        .toLowerCase()
        .substring(0, 50); // Limit length

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

    // Store cache key for navigation
    currentCacheKey = cacheKey;

    document.getElementById('resultTitle').textContent = title;

    // Convert markdown to HTML for preview
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
