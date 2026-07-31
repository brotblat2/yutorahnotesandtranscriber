(function () {
    'use strict';

    const jobsElement = document.getElementById('jobs');
    const summaryElement = document.getElementById('summary');

    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(response);
            });
        });
    }

    function escapeText(value) {
        const span = document.createElement('span');
        span.textContent = value || '';
        return span.innerHTML;
    }

    function formatLog(job) {
        return (Array.isArray(job.logs) ? job.logs : []).slice(-80).map(entry => {
            const stamp = new Date(entry.time || Date.now()).toLocaleTimeString();
            return `[${stamp}] ${entry.message}`;
        }).join('\n') || 'No activity recorded yet.';
    }

    function outputLabel(type) {
        return ({ notes: 'Notes', maamar: 'Maamar', transcript: 'Transcript' })[type] || 'Notes';
    }

    function renderJobs(jobs) {
        const running = jobs.filter(job => job.status === 'running').length;
        const paused = jobs.filter(job => job.status === 'paused').length;
        const completeJobs = jobs.filter(job => job.status === 'complete').length;
        summaryElement.innerHTML = `
            <span class="summary-pill"><strong>${jobs.length}</strong> Total Queues</span>
            <span class="summary-pill running"><strong>${running}</strong> Running</span>
            <span class="summary-pill paused"><strong>${paused}</strong> Paused</span>
            <span class="summary-pill complete"><strong>${completeJobs}</strong> Complete</span>`;
        if (!jobs.length) {
            jobsElement.innerHTML = '<div class="empty-state">Start a bulk queue from a YUTorah search page. It will appear here automatically.</div>';
            return;
        }
        jobsElement.innerHTML = jobs.map(job => {
            const complete = job.items.filter(item => item.status === 'complete').length;
            const failed = job.items.filter(item => item.status === 'error').length;
            const done = complete + failed;
            const percent = job.items.length ? Math.round((done / job.items.length) * 100) : 0;
            const canPause = job.status === 'running';
            const canResume = job.status === 'paused';
            const canCancel = ['running', 'paused'].includes(job.status);
            const formats = [job.options?.formats?.docx ? 'Word' : '', job.options?.formats?.pdf ? 'PDF' : ''].filter(Boolean).join(' + ') || 'Library Only';
            const current = job.items.find(item => item.status === 'processing');
            const created = new Date(job.createdAt || job.updatedAt || Date.now()).toLocaleString();
            return `
                <article class="job-card">
                    <header class="job-card-header">
                        <div>
                            <h2 class="job-title">${escapeText(job.options?.filename || 'YUTorah Bulk Queue')}</h2>
                            <p class="job-meta">${outputLabel(job.options?.type)} · ${escapeText(formats)} · ${escapeText(created)}</p>
                            <p class="job-current">${current ? `Processing: ${escapeText(current.title)}` : escapeText(job.pauseReason || 'Queue saved in the background')}</p>
                        </div>
                        <span class="job-status ${escapeText(job.status)}">${escapeText(job.status)}</span>
                    </header>
                    <div class="job-card-body">
                        <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
                        <p class="job-progress">${complete} complete · ${failed} skipped · ${job.items.length - done} remaining</p>
                        <pre class="job-log">${escapeText(formatLog(job))}</pre>
                        <div class="job-actions">
                            ${canPause ? `<button class="job-button" data-action="bulkPause" data-job-id="${escapeText(job.id)}">Pause</button>` : ''}
                            ${canResume ? `<button class="job-button" data-action="bulkResume" data-job-id="${escapeText(job.id)}">Resume</button>` : ''}
                            ${canCancel ? `<button class="job-button danger" data-action="bulkCancel" data-job-id="${escapeText(job.id)}">Cancel</button>` : ''}
                        </div>
                    </div>
                </article>`;
        }).join('');
    }

    async function refresh() {
        try {
            const response = await sendMessage({ action: 'bulkGetJobs' });
            renderJobs(response?.jobs || []);
        } catch (error) {
            summaryElement.textContent = `Could not load queues: ${error.message}`;
        }
    }

    jobsElement.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        button.disabled = true;
        try {
            await sendMessage({ action: button.dataset.action, jobId: button.dataset.jobId });
            await refresh();
        } finally {
            button.disabled = false;
        }
    });
    document.getElementById('refresh').addEventListener('click', refresh);
    refresh();
    window.setInterval(refresh, 3000);
})();
