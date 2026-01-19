// Sidebar JavaScript
// Handles progress updates and results display

console.log('Sidebar script loaded');

let currentContent = '';
let currentType = '';
let currentUrl = '';

// Listen for messages from content script
window.addEventListener('message', (event) => {
    console.log('Sidebar received raw message:', event);

    // Accept messages from parent window
    if (event.source !== window.parent) {
        console.log('Message not from parent, ignoring');
        return;
    }

    console.log('Sidebar processing message:', event.data);

    const { action, data } = event.data;

    switch (action) {
        case 'INIT':
            console.log('INIT received');
            initSidebar(data);
            break;
        case 'PROGRESS':
            console.log('PROGRESS received');
            updateProgress(data);
            break;
        case 'SUCCESS':
            console.log('SUCCESS received');
            showResults(data);
            break;
        case 'ERROR':
            console.log('ERROR received');
            showError(data);
            break;
        default:
            console.log('Unknown action:', action);
    }
});

function initSidebar(data) {
    console.log('Initializing sidebar with:', data);
    currentType = data.type;
    currentUrl = data.url || window.parent.location.href;
    const badge = document.getElementById('typeBadge');
    if (badge) {
        badge.textContent = data.type === 'transcript' ? 'Transcript' : 'Notes';
        console.log('Badge updated');
    } else {
        console.error('typeBadge element not found');
    }
}

function updateProgress(data) {
    console.log('Updating progress:', data);
    const { message, progress } = data;

    const progressText = document.getElementById('progressText');
    if (progressText) {
        progressText.innerHTML = `<span class="spinner"></span>${message}`;
    }

    if (progress !== undefined) {
        const progressFill = document.getElementById('progressBarFill');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    }
}

function showResults(data) {
    console.log('Showing results');
    currentContent = data.content;

    // Hide progress section
    const progressSection = document.getElementById('progressSection');
    if (progressSection) {
        progressSection.style.display = 'none';
    }

    // Show results section
    const resultsSection = document.getElementById('resultsSection');
    const resultsContent = document.getElementById('resultsContent');
    const actions = document.getElementById('actions');

    if (resultsContent) {
        resultsContent.innerHTML = renderMarkdown(data.content);
    }
    if (resultsSection) {
        resultsSection.classList.add('visible');
    }
    if (actions) {
        actions.classList.add('visible');
    }
}

function showError(data) {
    console.log('Showing error:', data);
    const { message, isRetryable } = data;

    // Hide progress section
    const progressSection = document.getElementById('progressSection');
    if (progressSection) {
        progressSection.style.display = 'none';
    }

    // Show error section
    const errorSection = document.getElementById('errorSection');
    const errorText = document.getElementById('errorText');
    const tryAgainBtn = document.getElementById('tryAgainBtn');

    if (errorText) {
        errorText.textContent = message;
    }

    // Show Try Again button if error is retryable (e.g., short audio)
    if (tryAgainBtn) {
        if (isRetryable) {
            tryAgainBtn.style.display = 'block';
        } else {
            tryAgainBtn.style.display = 'none';
        }
    }

    if (errorSection) {
        errorSection.classList.add('visible');
    }
}

// Simple markdown renderer
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

// Close sidebar
const closeBtn = document.getElementById('closeSidebar');
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        console.log('Close button clicked');
        window.parent.postMessage({ action: 'CLOSE_SIDEBAR' }, '*');
    });
}

// Try Again button (for retryable errors)
const tryAgainBtn = document.getElementById('tryAgainBtn');
if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', () => {
        console.log('Try Again button clicked');
        // Hide error section and show progress
        const errorSection = document.getElementById('errorSection');
        const progressSection = document.getElementById('progressSection');

        if (errorSection) errorSection.classList.remove('visible');
        if (progressSection) progressSection.style.display = 'block';

        // Send regenerate message to retry
        window.parent.postMessage({
            action: 'REGENERATE_NOTE',
            data: {
                type: currentType,
                url: currentUrl
            }
        }, '*');
    });
}


// Download as markdown
const downloadBtn = document.getElementById('downloadBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        console.log('Download MD button clicked');
        const blob = new Blob([currentContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `yutorah-${currentType}-${Date.now()}.md`;
        a.click();

        URL.revokeObjectURL(url);
    });
}

// Download as DOCX (using HTML format with UTF-8 for Hebrew support)
const downloadDocxBtn = document.getElementById('downloadDocxBtn');
if (downloadDocxBtn) {
    downloadDocxBtn.addEventListener('click', () => {
        console.log('Download DOCX button clicked');

        // Convert markdown to HTML with proper formatting
        let html = currentContent;

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
        }).join('\n\n');

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
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `yutorah-${currentType}-${Date.now()}.doc`;
        a.click();

        URL.revokeObjectURL(url);
    });
}

// Delete note
const deleteBtn = document.getElementById('deleteBtn');
if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
        console.log('Delete button clicked');
        if (!confirm('Are you sure you want to delete this note? This cannot be undone.')) {
            return;
        }

        try {
            // Send message to parent to delete the note
            window.parent.postMessage({
                action: 'DELETE_NOTE',
                data: {
                    type: currentType,
                    url: currentUrl
                }
            }, '*');

            // Close the sidebar
            window.parent.postMessage({ action: 'CLOSE_SIDEBAR' }, '*');
        } catch (error) {
            console.error('Delete error:', error);
            alert('Error deleting note: ' + error.message);
        }
    });
}

// Redo/Regenerate note
const redoBtn = document.getElementById('redoBtn');
if (redoBtn) {
    redoBtn.addEventListener('click', async () => {
        console.log('Redo button clicked');
        if (!confirm('Regenerate this note? The current version will be replaced.')) {
            return;
        }

        try {
            // Send message to parent to regenerate the note
            window.parent.postMessage({
                action: 'REGENERATE_NOTE',
                data: {
                    type: currentType,
                    url: currentUrl
                }
            }, '*');

            // Reset UI to show progress
            const progressSection = document.getElementById('progressSection');
            const resultsSection = document.getElementById('resultsSection');
            const actions = document.getElementById('actions');

            if (progressSection) progressSection.style.display = 'block';
            if (resultsSection) resultsSection.classList.remove('visible');
            if (actions) actions.classList.remove('visible');

            updateProgress({ message: 'Regenerating...', progress: 0 });
        } catch (error) {
            console.error('Redo error:', error);
            alert('Error regenerating note: ' + error.message);
        }
    });
}

// Signal that sidebar is ready
console.log('Sidebar sending READY message');
window.parent.postMessage({ action: 'SIDEBAR_READY' }, '*');
console.log('Sidebar initialization complete');
