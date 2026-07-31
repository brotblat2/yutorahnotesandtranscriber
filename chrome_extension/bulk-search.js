// Bulk processing UI for YUTorah search pages.
(function () {
    'use strict';

    // The bulk queue is intentionally limited to the canonical YUTorah search URL.
    // This prevents it from appearing on lecture pages or look-alike domains.
    if (!location.href.startsWith('https://www.yutorah.org/search')) return;

    let results = [];
    let activeJob = null;
    let draggedId = null;
    let defaultOrderApplied = false;
    let jobPollTimer = null;
    let lastLoggedActivity = '';
    const jobSessionKey = `yutorah_bulk_job_${location.href}`;
    let currentJobId = sessionStorage.getItem(jobSessionKey) || '';
    const autoDownloadedJobs = new Set();

    const launcher = document.createElement('button');
    launcher.id = 'yutorah-bulk-launcher';
    launcher.type = 'button';
    launcher.className = 'yutorah-action-btn';
    launcher.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 2.5h10v2H3v-2Zm0 4h10v2H3v-2Zm0 4h6v2H3v-2Z" fill="currentColor"/>
        </svg>
        <span class="btn-text">Bulk process results</span>`;

    const panel = document.createElement('aside');
    panel.id = 'yutorah-bulk-panel';
    panel.setAttribute('aria-label', 'Bulk process search results');
    panel.innerHTML = `
        <div class="ybp-shell">
            <div class="ybp-header">
                <div><p class="ybp-kicker">Shiur AI Assistant</p><h2>Bulk process results</h2></div>
                <button class="ybp-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="ybp-body">
                <div id="ybp-status" class="ybp-status">Review the search results, choose an output, and start the queue.</div>
                <details class="ybp-log-section" open>
                    <summary>Activity log</summary>
                    <pre id="ybp-log" class="ybp-log">Waiting for the queue to start.</pre>
                </details>
                <section class="ybp-section">
                    <div class="ybp-result-summary">
                        <div><h3 id="ybp-count">Search results</h3><p class="ybp-help">Drag items or use the arrows to change their order.</p></div>
                        <button id="ybp-refresh" class="ybp-btn" type="button">Refresh list</button>
                    </div>
                    <ol id="ybp-list" class="ybp-list"></ol>
                </section>
                <section class="ybp-section" id="ybp-options">
                    <h3>Output:</h3>
                    <select id="ybp-type" class="ybp-select">
                        <option value="notes">Notes</option>
                        <option value="maamar">Maamar (Hebrew article)</option>
                        <option value="transcript">Transcript</option>
                    </select>
                    <div id="ybp-transcript-options" class="ybp-row ybp-hidden">
                        <label><input type="radio" name="ybp-transcript-mode" value="verbatim" checked> Verbatim</label>
                        <label><input type="radio" name="ybp-transcript-mode" value="enhanced"> Enhanced</label>
                    </div>
                    <p id="ybp-call-estimate" class="ybp-help"></p>
                    <h3>Download Formats</h3>
                    <p class="ybp-help">The selected files download automatically when the queue finishes. You can change Word/PDF selection before downloading again.</p>
                    <div class="ybp-row ybp-row-wrap">
                        <label class="ybp-check"><input id="ybp-docx" type="checkbox" checked> Word Document (.docx)</label>
                        <label class="ybp-check"><input id="ybp-pdf" type="checkbox"> PDF Document (.pdf)</label>
                    </div>
                    <label class="ybp-field">File name
                        <input id="ybp-filename" type="text" value="yutorah-bulk-results" maxlength="90">
                    </label>
                    <label class="ybp-check ybp-row">
                        <input id="ybp-fallback" type="checkbox">
                        Allow fallback models if the preferred model fails
                    </label>
                    <p class="ybp-help">Fallback is off by default. The queue pauses instead of silently using a lower-priority model.</p>
                </section>
                <section id="ybp-progress-section" class="ybp-section ybp-hidden">
                    <h3>Queue progress</h3>
                    <div class="ybp-progress"><div id="ybp-progress-fill"></div></div>
                    <p id="ybp-progress-text" class="ybp-progress-text"></p>
                    <div class="ybp-row">
                        <button id="ybp-pause" class="ybp-btn" type="button">Pause</button>
                        <button id="ybp-resume" class="ybp-btn ybp-hidden" type="button">Resume</button>
                        <button id="ybp-cancel" class="ybp-btn ybp-btn-danger" type="button">Cancel</button>
                    </div>
                </section>
            </div>
            <div class="ybp-footer">
                <div class="ybp-row">
                    <button id="ybp-start" class="ybp-btn ybp-btn-primary" type="button">Start bulk processing</button>
                    <button id="ybp-download" class="ybp-btn ybp-btn-primary ybp-hidden" type="button">Download Results</button>
                </div>
            </div>
        </div>`;

    function attachLauncher() {
        const actionContainer = document.getElementById('yutorah-transcribe-container');
        if (!actionContainer) return false;
        actionContainer.insertBefore(launcher, actionContainer.firstChild);
        return true;
    }

    if (!attachLauncher()) {
        const observer = new MutationObserver(() => {
            if (attachLauncher()) observer.disconnect();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.setTimeout(() => observer.disconnect(), 5000);
    }
    document.body.appendChild(panel);

    const $ = selector => panel.querySelector(selector);
    const status = $('#ybp-status');
    const list = $('#ybp-list');

    function setStatus(message, kind = '') {
        status.textContent = message;
        status.className = `ybp-status${kind ? ` is-${kind}` : ''}`;
    }

    function renderActivityLog(job) {
        const log = $('#ybp-log');
        const entries = Array.isArray(job?.logs) ? job.logs : [];
        log.textContent = entries.length
            ? entries.slice(-100).map(entry => {
                const stamp = new Date(entry.time || Date.now()).toLocaleTimeString();
                return `[${stamp}] ${entry.message}`;
            }).join('\n')
            : 'Waiting for the queue to start.';
        log.scrollTop = log.scrollHeight;

        const signature = entries.map(entry => `${entry.time}:${entry.message}`).join('|');
        if (signature && signature !== lastLoggedActivity) {
            lastLoggedActivity = signature;
            console.info('[YUTorah Bulk]', entries[entries.length - 1].message, {
                jobId: job.id,
                status: job.status,
                progress: `${job.items?.filter(item => item.status === 'complete').length || 0}/${job.items?.length || 0}`
            });
        }
    }

    function extractResults() {
        if (activeJob && ['running', 'paused'].includes(activeJob.status)) return;
        const seen = new Set();
        const found = [];
        document.querySelectorAll('#searchResults a.name.shiur[data-id], #searchResults a.shiur[data-id]').forEach(anchor => {
            const id = String(anchor.dataset.id || '').trim();
            if (!id || seen.has(id)) return;
            seen.add(id);
            const row = anchor.closest('li');
            const speaker = row?.querySelector('.speaker-li + dd a, dd a[href*="/teachers/"]')?.textContent?.trim() || '';
            found.push({
                id,
                title: anchor.getAttribute('title')?.trim() || anchor.textContent.trim() || `Shiur ${id}`,
                speaker,
                url: new URL(anchor.href, location.href).href
            });
        });
        results = found;
        renderResults();
        updateEstimate();
    }

    function renderResults() {
        $('#ybp-count').textContent = `${results.length} shiur${results.length === 1 ? '' : 'im'} selected`;
        list.innerHTML = '';
        results.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'ybp-item';
            const locked = activeJob && ['running', 'paused'].includes(activeJob.status);
            li.draggable = !locked;
            li.dataset.id = item.id;
            li.innerHTML = `
                <span class="ybp-order">${index + 1}</span>
                <div><div class="ybp-item-title"></div><div class="ybp-item-meta"></div></div>
                <div class="ybp-item-actions">
                    <button class="ybp-icon-btn" data-action="up" type="button" title="Move up">↑</button>
                    <button class="ybp-icon-btn" data-action="down" type="button" title="Move down">↓</button>
                    <button class="ybp-icon-btn" data-action="remove" type="button" title="Remove">×</button>
                </div>`;
            li.querySelector('.ybp-item-title').textContent = item.title;
            const itemMeta = item.speaker || `Shiur ${item.id}`;
            li.querySelector('.ybp-item-meta').textContent = item.phase ? `${itemMeta} · ${item.phase}` : itemMeta;
            li.querySelectorAll('button').forEach(button => { button.disabled = Boolean(locked); });
            list.appendChild(li);
        });
    }

    async function loadAllSearchResults() {
        if (activeJob && ['running', 'paused'].includes(activeJob.status)) return;
        const refreshButton = $('#ybp-refresh');
        refreshButton.disabled = true;
        refreshButton.textContent = 'Loading…';
        setStatus('Loading all result rows and collection items from this search…');
        let stablePasses = 0;
        let previousCount = -1;

        try {
            for (let pass = 0; pass < 30 && stablePasses < 3; pass++) {
                const collectionHeadings = [...document.querySelectorAll('#searchResults .shiurim-collections-list .heading-line')]
                    .filter(heading => !heading.closest('.shiurim-collections-list')?.querySelector('.more-results a.shiur[data-id]'));
                const showMore = document.querySelector('#searchShowMore:not(.hide-element)');
                let triggered = false;
                collectionHeadings.forEach(heading => {
                    heading.click();
                    triggered = true;
                });
                if (showMore && (showMore.offsetWidth || showMore.offsetHeight || showMore.getClientRects().length)) {
                    showMore.click();
                    triggered = true;
                }
                await new Promise(resolve => setTimeout(resolve, triggered ? 900 : 250));
                const count = new Set([...document.querySelectorAll('#searchResults a.shiur[data-id]')].map(anchor => anchor.dataset.id)).size;
                stablePasses = count === previousCount ? stablePasses + 1 : 0;
                previousCount = count;
            }
            extractResults();
            if (!defaultOrderApplied) {
                results.reverse();
                defaultOrderApplied = true;
                renderResults();
                updateEstimate();
            }
            setStatus(`${results.length} unique shiur${results.length === 1 ? '' : 'im'} loaded. Remove or reorder anything before starting.`);
        } catch (error) {
            extractResults();
            if (!defaultOrderApplied) {
                results.reverse();
                defaultOrderApplied = true;
                renderResults();
                updateEstimate();
            }
            setStatus(`Loaded ${results.length} results. Some additional rows may not have loaded: ${error.message}`, 'paused');
        } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = 'Reload all';
        }
    }

    function moveResult(id, direction) {
        const index = results.findIndex(item => item.id === id);
        const next = index + direction;
        if (index < 0 || next < 0 || next >= results.length) return;
        [results[index], results[next]] = [results[next], results[index]];
        renderResults();
    }

    function selectedOptions() {
        const type = $('#ybp-type').value;
        return {
            type,
            transcriptMode: panel.querySelector('input[name="ybp-transcript-mode"]:checked')?.value || 'verbatim',
            allowFallbackModels: $('#ybp-fallback').checked,
            formats: { docx: $('#ybp-docx').checked, pdf: $('#ybp-pdf').checked },
            filename: sanitizeBulkFilename($('#ybp-filename').value.trim() || 'yutorah-bulk-results')
        };
    }

    function sanitizeBulkFilename(value) {
        return String(value || 'yutorah-bulk-results')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^[.-]+|[.-]+$/g, '')
            .slice(0, 90) || 'yutorah-bulk-results';
    }

    function updateEstimate() {
        const options = selectedOptions();
        const callsPerItem = options.type === 'transcript' && options.transcriptMode === 'enhanced' ? 2 : 1;
        const calls = results.length * callsPerItem;
        const minutes = calls ? Math.ceil(calls / 5) : 0;
        $('#ybp-call-estimate').textContent = `${calls} Gemini generation call${calls === 1 ? '' : 's'} · at least about ${minutes} minute${minutes === 1 ? '' : 's'} at 5 calls/minute.`;
    }

    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(response);
            });
        });
    }

    async function pollJobStatus() {
        try {
            if (!currentJobId) return;
            const response = await sendMessage({ action: 'bulkGetJob', jobId: currentJobId });
            if (!response?.job) return;
            activeJob = response.job;
            renderJob();
            if (['complete', 'cancelled'].includes(activeJob.status)) stopJobPolling();
        } catch (error) {
            console.warn('[YUTorah Bulk] Could not refresh queue status:', error.message);
        }
    }

    function startJobPolling() {
        if (jobPollTimer) return;
        pollJobStatus();
        jobPollTimer = window.setInterval(pollJobStatus, 3000);
    }

    function stopJobPolling() {
        if (!jobPollTimer) return;
        window.clearInterval(jobPollTimer);
        jobPollTimer = null;
    }

    async function startJob() {
        if (!results.length) {
            setStatus('No shiurim were found. Expand any collection results, then refresh the list.', 'error');
            return;
        }
        const options = selectedOptions();
        if (!options.formats.docx && !options.formats.pdf) {
            setStatus('Select Word, PDF, or both before starting.', 'error');
            return;
        }
        $('#ybp-start').disabled = true;
        try {
            const response = await sendMessage({ action: 'bulkStart', items: results, options });
            if (!response?.success) throw new Error(response?.error || 'Could not start bulk processing.');
            activeJob = response.job;
            currentJobId = activeJob.id;
            sessionStorage.setItem(jobSessionKey, currentJobId);
            renderJob();
            startJobPolling();
        } catch (error) {
            setStatus(error.message, 'error');
            $('#ybp-start').disabled = false;
        }
    }

    async function changeJob(action) {
        const response = await sendMessage({ action, jobId: currentJobId || activeJob?.id });
        if (response?.job) {
            activeJob = response.job;
            renderJob();
        } else if (!response?.success) {
            setStatus(response?.error || 'Could not update the queue.', 'error');
        }
    }

    function renderJob() {
        if (!activeJob) return;
        results = activeJob.items.map(item => ({ ...item }));
        renderActivityLog(activeJob);
        renderResults();
        const completed = activeJob.items.filter(item => item.status === 'complete').length;
        const failed = activeJob.items.filter(item => item.status === 'error').length;
        const total = activeJob.items.length;
        const done = completed + failed;
        $('#ybp-progress-section').classList.remove('ybp-hidden');
        $('#ybp-progress-fill').style.width = `${total ? (done / total) * 100 : 0}%`;
        $('#ybp-progress-text').textContent = `${completed} complete · ${failed} skipped · ${total - done} remaining`;
        $('#ybp-options').querySelectorAll('input, select').forEach(control => {
            control.disabled = ['running', 'paused'].includes(activeJob.status);
        });
        $('#ybp-refresh').disabled = ['running', 'paused'].includes(activeJob.status);
        const canStartAnother = ['complete', 'cancelled'].includes(activeJob.status);
        $('#ybp-start').classList.toggle('ybp-hidden', !canStartAnother);
        $('#ybp-start').textContent = activeJob.status === 'complete' ? 'Start another queue' : 'Start bulk processing';
        $('#ybp-start').disabled = false;
        $('#ybp-pause').classList.toggle('ybp-hidden', activeJob.status !== 'running');
        $('#ybp-resume').classList.toggle('ybp-hidden', activeJob.status !== 'paused');
        $('#ybp-cancel').classList.toggle('ybp-hidden', !['running', 'paused'].includes(activeJob.status));
        $('#ybp-download').classList.toggle('ybp-hidden', activeJob.status !== 'complete' || completed === 0);

        if (activeJob.status === 'running') {
            const current = activeJob.items.find(item => item.status === 'processing');
            setStatus(current ? `Processing: ${current.title}` : 'Queue is running in the background. You may close this panel.', '');
        } else if (activeJob.status === 'paused') {
            setStatus(activeJob.pauseReason || 'Queue paused. Resume when you are ready.', 'paused');
        } else if (activeJob.status === 'complete') {
            setStatus(`Bulk processing complete. ${completed} saved to your extension library${failed ? `; ${failed} could not be processed` : ''}.`, 'complete');
        } else if (activeJob.status === 'cancelled') {
            setStatus('Queue cancelled. Completed items remain saved in your library.', 'paused');
        }
        if (activeJob.status === 'complete' && completed > 0 && !autoDownloadedJobs.has(activeJob.id)) {
            autoDownloadedJobs.add(activeJob.id);
            setTimeout(() => downloadJob(), 250);
        }
    }

    async function downloadJob() {
        if (!activeJob) return;
        const options = activeJob.options;
        const selectedFormats = activeJob.status === 'complete'
            ? { docx: $('#ybp-docx').checked, pdf: $('#ybp-pdf').checked }
            : options.formats;
        const formats = selectedFormats.docx || selectedFormats.pdf ? selectedFormats : options.formats;
        const pdfWindow = formats.pdf ? window.open('', '_blank') : null;
        try {
            const completed = activeJob.items.filter(item => item.status === 'complete' && item.cacheKey);
            const noteData = [];
            for (const item of completed) {
                const content = await Storage.getCachedNotes(item.cacheKey);
                if (content) noteData.push({ ...item, content });
            }
            let html = '<h1>YUTorah Bulk Results</h1><ul>';
            noteData.forEach((note, index) => {
                html += `<li>${index + 1}. ${escapeForBulkHtml(note.title)}</li>`;
            });
            html += '</ul><hr style="page-break-after: always; border: none;">';
            noteData.forEach((note, index) => {
                html += `<h1>${index + 1}. ${escapeForBulkHtml(note.title)}</h1>`;
                if (note.speaker) html += `<p><em>${escapeForBulkHtml(note.speaker)}</em></p>`;
                html += renderMarkdownToHtml(note.content, 1);
                if (index < noteData.length - 1) html += '<hr style="page-break-after: always; border: none;">';
            });
            const overallText = noteData.map(note => note.content).join('\n\n');
            const filename = options.filename || 'yutorah-bulk-results';
            if (formats.docx) triggerDownload(createDocxBlob(html, filename, overallText), `${filename}.docx`);
            if (formats.pdf) exportAsPdf(html, overallText, filename, pdfWindow);
        } catch (error) {
            if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
            setStatus(`Could not prepare the download: ${error.message}`, 'error');
        }
    }

    function escapeForBulkHtml(value) {
        const span = document.createElement('span');
        span.textContent = value || '';
        return span.innerHTML;
    }

    launcher.addEventListener('click', () => {
        panel.classList.add('is-open');
        startJobPolling();
        sendMessage({ action: 'bulkGetJob', jobId: currentJobId || undefined }).then(response => {
            if (response?.job && response.job.id === currentJobId) {
                activeJob = response.job;
                renderJob();
            } else {
                loadAllSearchResults();
            }
        }).catch(() => loadAllSearchResults());
    });
    $('.ybp-close').addEventListener('click', () => {
        panel.classList.remove('is-open');
        stopJobPolling();
    });
    $('#ybp-refresh').addEventListener('click', loadAllSearchResults);
    $('#ybp-type').addEventListener('change', () => {
        $('#ybp-transcript-options').classList.toggle('ybp-hidden', $('#ybp-type').value !== 'transcript');
        updateEstimate();
    });
    panel.querySelectorAll('input[name="ybp-transcript-mode"]').forEach(input => input.addEventListener('change', updateEstimate));
    $('#ybp-start').addEventListener('click', startJob);
    $('#ybp-pause').addEventListener('click', () => changeJob('bulkPause'));
    $('#ybp-resume').addEventListener('click', () => changeJob('bulkResume'));
    $('#ybp-cancel').addEventListener('click', () => changeJob('bulkCancel'));
    $('#ybp-download').addEventListener('click', downloadJob);

    list.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        const item = event.target.closest('.ybp-item');
        if (!button || !item || activeJob && ['running', 'paused'].includes(activeJob.status)) return;
        if (button.dataset.action === 'up') moveResult(item.dataset.id, -1);
        if (button.dataset.action === 'down') moveResult(item.dataset.id, 1);
        if (button.dataset.action === 'remove') {
            results = results.filter(result => result.id !== item.dataset.id);
            renderResults();
            updateEstimate();
        }
    });
    list.addEventListener('dragstart', event => {
        const item = event.target.closest('.ybp-item');
        if (!item) return;
        draggedId = item.dataset.id;
        item.classList.add('is-dragging');
    });
    list.addEventListener('dragend', event => {
        event.target.closest('.ybp-item')?.classList.remove('is-dragging');
        draggedId = null;
    });
    list.addEventListener('dragover', event => {
        event.preventDefault();
        const target = event.target.closest('.ybp-item');
        if (!target || !draggedId || target.dataset.id === draggedId) return;
        const from = results.findIndex(item => item.id === draggedId);
        const to = results.findIndex(item => item.id === target.dataset.id);
        if (from < 0 || to < 0) return;
        const [moved] = results.splice(from, 1);
        results.splice(to, 0, moved);
        renderResults();
    });

    chrome.runtime.onMessage.addListener(message => {
        if (message.action === 'bulkQueueUpdated' && message.job) {
            if (!currentJobId || message.job.id !== currentJobId) return;
            activeJob = message.job;
            renderJob();
            if (panel.classList.contains('is-open')) startJobPolling();
        }
    });
    window.addEventListener('online', () => {
        if (activeJob?.status === 'paused' && activeJob.pauseKind === 'network') changeJob('bulkResume');
    });

    updateEstimate();
})();
