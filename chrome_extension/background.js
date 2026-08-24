// Background service worker for YUTorah Notes Extension
// Handles API calls, caching, and message passing

// Import config, storage and API modules
importScripts('config.js', 'storage.js', 'gemini-api.js');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'processShiur') {
        handleProcessShiur(request, sendResponse);
        return true; // Keep the message channel open for async response
    } else if (request.action === 'processTextShiur') {
        handleProcessTextShiur(request, sendResponse);
        return true;
    } else if (request.action === 'checkApiKey') {
        handleCheckApiKey(sendResponse);
        return true;
    } else if (request.action === 'claimDefaultRequest') {
        handleClaimDefaultRequest(sendResponse);
        return true;
    } else if (request.action === 'getStorageStats') {
        handleGetStorageStats(sendResponse);
        return true;
    } else if (request.action === 'deleteNote') {
        handleDeleteNote(request, sendResponse);
        return true;
    } else if (request.action?.startsWith('bulk')) {
        handleBulkMessage(request, sendResponse);
        return true;
    }
});

const BULK_JOB_STORAGE_KEY = 'bulk_processing_job';
const BULK_JOBS_STORAGE_KEY = 'bulk_processing_jobs';
const BULK_NEXT_MODEL_CALL_KEY = 'bulk_next_model_call_at';
const BULK_RESUME_ALARM = 'bulk-processing-resume';
const BULK_WATCHDOG_ALARM = 'bulk-processing-watchdog';
const BULK_MODEL_INTERVAL_MS = 12500;
const BULK_WORKER_COUNT = 5;
const bulkRunnerPromises = new Map();
let bulkStateLock = Promise.resolve();

async function withBulkStateLock(operation) {
    let release;
    const previous = bulkStateLock;
    bulkStateLock = new Promise(resolve => { release = resolve; });
    await previous;
    try {
        return await operation();
    } finally {
        release();
    }
}

function bulkConsole(level, message, details) {
    const method = console[level] || console.log;
    const prefix = `[YUTorah Bulk] ${new Date().toISOString()} ${message}`;
    if (details === undefined) method.call(console, prefix);
    else method.call(console, prefix, details);
}

function appendBulkLog(job, message, level = 'info') {
    if (!Array.isArray(job.logs)) job.logs = [];
    job.logs.push({ time: Date.now(), level, message: String(message) });
    if (job.logs.length > 200) job.logs.splice(0, job.logs.length - 200);
    bulkConsole(level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info', message, {
        jobId: job.id,
        status: job.status
    });
}

async function recordBulkLog(jobId, message, level = 'info') {
    const job = await getStoredBulkJob(jobId);
    if (!job || job.id !== jobId) return;
    appendBulkLog(job, message, level);
    await saveAndPublishBulkJob(job);
}

function getStoredBulkJobs() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([BULK_JOBS_STORAGE_KEY, BULK_JOB_STORAGE_KEY], result => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else {
                const stored = Array.isArray(result[BULK_JOBS_STORAGE_KEY])
                    ? result[BULK_JOBS_STORAGE_KEY]
                    : result[BULK_JOB_STORAGE_KEY] ? [result[BULK_JOB_STORAGE_KEY]] : [];
                resolve(stored.filter(job => job && job.id));
            }
        });
    });
}

async function getStoredBulkJob(jobId = null) {
    const jobs = await getStoredBulkJobs();
    if (jobId) return jobs.find(job => job.id === jobId) || null;
    return jobs
        .filter(job => ['running', 'paused'].includes(job.status))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] ||
        jobs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}

async function storeBulkJob(job) {
    job.updatedAt = Date.now();
    const jobs = await getStoredBulkJobs();
    const index = jobs.findIndex(candidate => candidate.id === job.id);
    if (index >= 0) jobs[index] = job;
    else jobs.push(job);
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({
            [BULK_JOBS_STORAGE_KEY]: jobs,
            [BULK_JOB_STORAGE_KEY]: job
        }, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(job);
        });
    });
}

async function publishBulkJob(job) {
    try {
        await chrome.runtime.sendMessage({ action: 'bulkQueueUpdated', job });
    } catch (error) {
        // It is normal for no search page to be open while a background job runs.
    }
}

async function saveAndPublishBulkJob(job) {
    await storeBulkJob(job);
    await publishBulkJob(job);
    return job;
}

async function stopBulkWatchdogIfIdle() {
    const jobs = await getStoredBulkJobs();
    if (!jobs.some(job => ['running', 'paused'].includes(job.status))) {
        await chrome.alarms.clear(BULK_WATCHDOG_ALARM);
    }
}

async function handleBulkMessage(request, sendResponse) {
    try {
        if (request.action === 'bulkGetJob') {
            sendResponse({ success: true, job: await getStoredBulkJob(request.jobId || null) });
            return;
        }

        if (request.action === 'bulkGetJobs') {
            const jobs = await getStoredBulkJobs();
            jobs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            sendResponse({ success: true, jobs });
            return;
        }

        if (request.action === 'bulkStart') {
            const mode = await Storage.getKeyMode();
            const apiKey = await Storage.getApiKey();
            if ((mode === 'custom' && !apiKey) || (mode !== 'custom' && !hasDefaultKey())) {
                sendResponse({
                    success: false,
                    error: 'No usable Gemini API key is configured. Add your own key in Settings or enable the default keys.'
                });
                return;
            }
            const items = Array.isArray(request.items) ? request.items : [];
            if (!items.length) {
                sendResponse({ success: false, error: 'No shiurim were selected.' });
                return;
            }
            const options = {
                type: ['notes', 'maamar', 'transcript'].includes(request.options?.type) ? request.options.type : 'notes',
                transcriptMode: request.options?.transcriptMode === 'enhanced' ? 'enhanced' : 'verbatim',
                allowFallbackModels: Boolean(request.options?.allowFallbackModels),
                formats: {
                    docx: Boolean(request.options?.formats?.docx),
                    pdf: Boolean(request.options?.formats?.pdf)
                },
                filename: String(request.options?.filename || 'yutorah-bulk-results')
            };
            const job = {
                id: `bulk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                status: 'running',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                nextCallAt: 0,
                pauseKind: null,
                pauseReason: '',
                retryAt: null,
                logs: [],
                options,
                items: items.map((item, index) => ({
                    id: String(item.id || ''),
                    title: String(item.title || `Shiur ${item.id || index + 1}`),
                    speaker: String(item.speaker || ''),
                    url: String(item.url || `https://www.yutorah.org/lectures/details?shiurid=${item.id}`),
                    order: index,
                    status: 'queued',
                    phase: 'Waiting',
                    cacheKey: null,
                    error: null
                }))
            };
            appendBulkLog(job, `Queue created with ${job.items.length} item${job.items.length === 1 ? '' : 's'}.`);
            appendBulkLog(job, `Gemini key mode: ${mode === 'custom' ? 'your saved key' : 'extension default key'}.`);
            appendBulkLog(job, `Up to ${Math.min(BULK_WORKER_COUNT, job.items.length)} items will prepare in parallel; Gemini generation remains limited to 5 calls per minute.`);
            await withBulkStateLock(() => saveAndPublishBulkJob(job));
            chrome.alarms.create(BULK_WATCHDOG_ALARM, { periodInMinutes: 1 });
            startBulkRunner(job.id);
            sendResponse({ success: true, job });
            return;
        }

        const job = await getStoredBulkJob(request.jobId || null);
        if (!job) {
            sendResponse({ success: false, error: 'No bulk queue was found.' });
            return;
        }

        if (request.action === 'bulkPause') {
            job.status = 'paused';
            job.pauseKind = 'user';
            job.pauseReason = 'Paused by you. Completed items are already saved.';
            job.retryAt = null;
        } else if (request.action === 'bulkResume') {
            job.status = 'running';
            job.pauseKind = null;
            job.pauseReason = '';
            job.retryAt = null;
            job.items.forEach(item => {
                if (item.status === 'processing') item.status = 'queued';
            });
        } else if (request.action === 'bulkCancel') {
            job.status = 'cancelled';
            job.pauseKind = null;
            job.pauseReason = '';
            job.retryAt = null;
        } else {
            sendResponse({ success: false, error: 'Unknown bulk action.' });
            return;
        }

        await saveAndPublishBulkJob(job);
        if (job.status === 'cancelled') await stopBulkWatchdogIfIdle();
        if (job.status === 'running') startBulkRunner(job.id);
        sendResponse({ success: true, job });
    } catch (error) {
        sendResponse({ success: false, error: error.message || 'Could not update the bulk queue.' });
    }
}

function startBulkRunner(jobId) {
    if (!jobId) return Promise.resolve();
    if (bulkRunnerPromises.has(jobId)) {
        bulkConsole('debug', 'Runner already active.');
        return bulkRunnerPromises.get(jobId);
    }
    bulkConsole('info', 'Starting background queue runner.', { jobId });
    const runner = runBulkQueue(jobId)
        .catch(error => console.error('Bulk queue runner failed:', error))
        .finally(() => { bulkRunnerPromises.delete(jobId); });
    bulkRunnerPromises.set(jobId, runner);
    return runner;
}

async function waitForBulkModelSlot(jobId) {
    while (true) {
        const decision = await withBulkStateLock(async () => {
            const job = await getStoredBulkJob(jobId);
            if (!job || job.id !== jobId || job.status !== 'running') {
                const error = new Error('Bulk queue stopped');
                error.code = 'BULK_STOPPED';
                throw error;
            }
            const timing = await new Promise((resolve, reject) => {
                chrome.storage.local.get([BULK_NEXT_MODEL_CALL_KEY], result => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(result[BULK_NEXT_MODEL_CALL_KEY] || 0);
                });
            });
            const waitMs = Math.max(0, Number(timing || 0) - Date.now());
            if (waitMs > 0) return { waitMs };
            const nextCallAt = Date.now() + BULK_MODEL_INTERVAL_MS;
            job.nextCallAt = nextCallAt;
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ [BULK_NEXT_MODEL_CALL_KEY]: nextCallAt }, () => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve();
                });
            });
            await storeBulkJob(job);
            return { acquired: true };
        });
        if (decision.acquired) {
            bulkConsole('info', 'Gemini generation slot acquired.', { jobId });
            return;
        }
        bulkConsole('debug', `Rate-limit gate: waiting ${Math.ceil(decision.waitMs / 1000)}s before the next Gemini generation call.`, { jobId });
        await new Promise(resolve => setTimeout(resolve, Math.min(decision.waitMs, 30000)));
    }
}

async function getBulkApiKey() {
    const mode = await Storage.getKeyMode();
    const key = await Storage.getApiKey();
    if (mode === 'custom') {
        if (key) return key;
        bulkConsole('error', 'Queue cannot start because Custom Key mode is selected but no key is saved.');
        const error = new Error('Your Gemini API key is missing. Add it in Settings, then resume this queue.');
        error.code = 'BULK_CONFIGURATION';
        throw error;
    }
    const defaultKey = getRandomDefaultKey();
    if (!defaultKey) {
        bulkConsole('error', 'Queue cannot start because no default Gemini key is configured.');
        const error = new Error('No default Gemini API key is configured. Add your own key in Settings.');
        error.code = 'BULK_CONFIGURATION';
        throw error;
    }
    bulkConsole('warn', 'Using the extension default Gemini key; the provider may enforce the shared daily quota.');
    return defaultKey;
}

async function setBulkItemState(jobId, itemId, changes) {
    return withBulkStateLock(async () => {
        const job = await getStoredBulkJob(jobId);
        if (!job || job.id !== jobId) return null;
        const item = job.items.find(candidate => candidate.id === itemId);
        if (!item) return job;
        Object.assign(item, changes);
        if (changes.phase) appendBulkLog(job, `${item.id}: ${changes.phase}`);
        return saveAndPublishBulkJob(job);
    });
}

async function processBulkItem(job, item) {
    bulkConsole('info', `Preparing item ${item.id}: ${item.title}` , { jobId: job.id, itemId: item.id, type: job.options.type });
    const apiKey = await getBulkApiKey();
    const isEnhanced = job.options.type === 'transcript' && job.options.transcriptMode === 'enhanced';
    const finalType = isEnhanced ? 'enhanced' : job.options.type;
    const cacheKey = `yutorah_${item.id}_${finalType}`;
    const cached = await Storage.getCachedNotes(cacheKey);
    if (cached) return { cacheKey, cached: true };

    const modelOptions = {
        allowFallbackModels: job.options.allowFallbackModels,
        beforeModelAttempt: () => waitForBulkModelSlot(job.id)
    };
    const metadata = {
        title: item.title,
        speaker: item.speaker,
        modelUsed: null,
        isFallback: false
    };
    const progress = message => setBulkItemState(job.id, item.id, { phase: message });

    if (isEnhanced) {
        const temporaryKey = `bulk_temp_${job.id}_${item.id}`;
        let transcript = await Storage.getCachedNotes(temporaryKey);
        let transcriptResult = null;
        if (!transcript) {
            bulkConsole('info', `Fetching audio and creating verbatim transcript for ${item.id}.`, { jobId: job.id });
            await setBulkItemState(job.id, item.id, { phase: 'Creating verbatim transcript' });
            transcriptResult = await GeminiAPI.processShiur(apiKey, item.url, 'transcript', progress, modelOptions);
            transcript = transcriptResult.text;
            await Storage.setCachedNotes(temporaryKey, transcript, {
                title: `${item.title} (temporary transcript)`,
                modelUsed: transcriptResult.model,
                isFallback: transcriptResult.isFallback
            });
        }
        bulkConsole('info', `Sending transcript enhancement request for ${item.id}.`, { jobId: job.id });
        await setBulkItemState(job.id, item.id, { phase: 'Enhancing transcript' });
        const customPrompts = await Storage.getCustomPrompts();
        const enhanced = await GeminiAPI.generateContentFromText(
            apiKey,
            transcript,
            'enhance_transcript',
            customPrompts,
            modelOptions
        );
        metadata.modelUsed = enhanced.model;
        metadata.isFallback = Boolean(transcriptResult?.isFallback || enhanced.isFallback);
        await Storage.setCachedNotes(cacheKey, enhanced.text, metadata);
        await Storage.deleteNote(temporaryKey);
    } else {
        bulkConsole('info', `Fetching audio and creating ${finalType} for ${item.id}.`, { jobId: job.id });
        await setBulkItemState(job.id, item.id, { phase: `Creating ${finalType}` });
        const result = await GeminiAPI.processShiur(apiKey, item.url, finalType, progress, modelOptions);
        metadata.modelUsed = result.model;
        metadata.isFallback = result.isFallback;
        await Storage.setCachedNotes(cacheKey, result.text, metadata);
    }

    bulkConsole('info', `Saved ${item.id} to the extension library.`, { jobId: job.id, cacheKey });
    return { cacheKey, cached: false };
}

function classifyBulkError(error, allowFallbackModels) {
    if (error?.code === 'BULK_STOPPED') return { stopped: true };
    if (error?.code === 'BULK_CONFIGURATION') {
        return { pause: true, kind: 'configuration', reason: error.message, retryMs: null };
    }
    const message = String(error?.message || error || 'Unknown error');
    const lower = message.toLowerCase();
    if (/429|resource_exhausted|rate.?limit|too many requests|quota/.test(lower)) {
        return {
            pause: true,
            kind: 'throttle',
            reason: 'Gemini throttled the queue. It has been paused safely and will retry in one minute.',
            retryMs: 60000
        };
    }
    if (/failed to fetch|networkerror|network error|internet|offline|connection|load failed|502|503|504/.test(lower)) {
        return {
            pause: true,
            kind: 'network',
            reason: 'The internet connection was interrupted. The queue is saved and will retry automatically.',
            retryMs: 30000
        };
    }
    if (/model|unsupported/.test(lower) && /not found|not available|not supported|invalid|404|403/.test(lower)) {
        return {
            pause: true,
            kind: 'model',
            reason: 'Gemini rejected the selected model for this key. Enable fallback models or choose a model your key can access.',
            retryMs: null
        };
    }
    if (/api key|401|403|permission_denied|unauthenticated/.test(lower)) {
        return {
            pause: true,
            kind: 'configuration',
            reason: 'Gemini rejected the API key. Check the key in Settings, then resume the queue.',
            retryMs: null
        };
    }
    if (!allowFallbackModels && /model|unsupported/.test(lower)) {
        return {
            pause: true,
            kind: 'model',
            reason: 'The preferred model was unavailable. Fallback models are disabled, so the queue paused without switching models.',
            retryMs: null
        };
    }
    return { itemError: true, reason: message };
}

async function pauseBulkJob(jobId, itemId, classification) {
    const retryAt = await withBulkStateLock(async () => {
        const job = await getStoredBulkJob(jobId);
        if (!job || job.id !== jobId) return null;
        const item = job.items.find(candidate => candidate.id === itemId);
        if (item) {
            item.status = 'queued';
            item.phase = 'Waiting to retry';
            item.error = null;
        }
        job.status = 'paused';
        job.pauseKind = classification.kind;
        job.pauseReason = classification.reason;
        job.retryAt = classification.retryMs ? Date.now() + classification.retryMs : null;
        appendBulkLog(job, `Queue paused: ${classification.reason}`, 'warn');
        await saveAndPublishBulkJob(job);
        return job.retryAt;
    });
    if (retryAt) chrome.alarms.create(BULK_RESUME_ALARM, { when: retryAt });
}

async function recoverInterruptedBulkItems(jobId) {
    return withBulkStateLock(async () => {
        const job = await getStoredBulkJob(jobId);
        if (!job || job.id !== jobId || job.status !== 'running') return job;
        const interrupted = job.items.filter(item => item.status === 'processing');
        interrupted.forEach(item => {
            item.status = 'queued';
            item.phase = 'Resuming';
        });
        if (interrupted.length) {
            appendBulkLog(job, `Re-queued ${interrupted.length} interrupted item${interrupted.length === 1 ? '' : 's'}.`, 'warn');
            await saveAndPublishBulkJob(job);
        }
        return job;
    });
}

async function claimNextBulkItem(jobId) {
    return withBulkStateLock(async () => {
        const job = await getStoredBulkJob(jobId);
        if (!job || job.id !== jobId || job.status !== 'running') return null;
        const item = job.items.find(candidate => candidate.status === 'queued');
        if (!item) return null;
        appendBulkLog(job, `Starting item ${item.id}: ${item.title}`);
        item.status = 'processing';
        item.phase = 'Preparing audio';
        item.error = null;
        await saveAndPublishBulkJob(job);
        return { job: { ...job, options: { ...job.options } }, item: { ...item } };
    });
}

async function finishBulkItem(jobId, item, result) {
    return withBulkStateLock(async () => {
        const job = await getStoredBulkJob(jobId);
        if (!job || job.id !== jobId) return;
        const latestItem = job.items.find(candidate => candidate.id === item.id);
        if (latestItem) {
            latestItem.status = 'complete';
            latestItem.phase = result.cached ? 'Already in library' : 'Saved to library';
            latestItem.cacheKey = result.cacheKey;
            latestItem.error = null;
        }
        appendBulkLog(job, `Finished item ${item.id}: saved to library.`);
        await saveAndPublishBulkJob(job);
    });
}

async function failBulkItem(jobId, item, classification, error) {
    const rawError = String(error?.message || error || 'Unknown error')
        .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]')
        .slice(0, 500);
    return withBulkStateLock(async () => {
        const job = await getStoredBulkJob(jobId);
        if (!job || job.id !== jobId) return;
        appendBulkLog(job, `API error for ${item.id}: ${rawError}`, 'error');
        const latestItem = job.items.find(candidate => candidate.id === item.id);
        if (latestItem) {
            latestItem.status = 'error';
            latestItem.phase = 'Skipped';
            latestItem.error = classification.reason;
        }
        await saveAndPublishBulkJob(job);
    });
}

async function runBulkWorker(jobId, workerNumber) {
    bulkConsole('info', `Worker ${workerNumber} started.`, { jobId });
    while (true) {
        const claim = await claimNextBulkItem(jobId);
        if (!claim) return;
        const { job, item } = claim;
        try {
            const result = await processBulkItem(job, item);
            await finishBulkItem(jobId, item, result);
        } catch (error) {
            bulkConsole('error', `Worker ${workerNumber}: item ${item.id} failed.`, { jobId, error: error?.message || String(error) });
            const classification = classifyBulkError(error, job.options.allowFallbackModels);
            if (classification.stopped) {
                bulkConsole('warn', `Worker ${workerNumber} stopped because the queue is no longer running.`, { jobId });
                return;
            }
            if (classification.pause) {
                await pauseBulkJob(jobId, item.id, classification);
                return;
            }
            await failBulkItem(jobId, item, classification, error);
        }
    }
}

async function finalizeBulkQueue(jobId) {
    const completed = await withBulkStateLock(async () => {
        const job = await getStoredBulkJob(jobId);
        if (!job || job.id !== jobId || job.status !== 'running') return false;
        if (job.items.some(item => ['queued', 'processing'].includes(item.status))) return false;
        job.status = 'complete';
        job.pauseKind = null;
        job.pauseReason = '';
        job.retryAt = null;
        appendBulkLog(job, 'Queue completed.');
        await saveAndPublishBulkJob(job);
        return true;
    });
    if (completed) {
        await stopBulkWatchdogIfIdle();
    }
    return completed;
}

async function runBulkQueue(jobId) {
    bulkConsole('info', 'Queue runner entered with parallel preparation workers.');
    const initialJob = await getStoredBulkJob(jobId);
    if (!initialJob || initialJob.status !== 'running') {
        bulkConsole('info', 'Queue runner stopped because no running job was found.', { status: initialJob?.status || 'missing' });
        return;
    }
    await recoverInterruptedBulkItems(initialJob.id);
    const workerCount = Math.min(BULK_WORKER_COUNT, initialJob.items.length);
    await Promise.all(Array.from({ length: workerCount }, (_, index) => runBulkWorker(initialJob.id, index + 1)));
    await finalizeBulkQueue(initialJob.id);
}

async function resumePersistedBulkJob() {
    const jobs = await getStoredBulkJobs();
    for (const job of jobs) {
        bulkConsole('info', 'Checking persisted queue after startup/alarm.', { jobId: job.id, status: job.status });
        if (job.status === 'running') {
            await recoverInterruptedBulkItems(job.id);
            startBulkRunner(job.id);
        } else if (job.status === 'paused' && job.retryAt && job.retryAt <= Date.now()) {
            await withBulkStateLock(async () => {
                const latest = await getStoredBulkJob(job.id);
                if (!latest || latest.status !== 'paused') return;
                latest.status = 'running';
                latest.pauseKind = null;
                latest.pauseReason = '';
                latest.retryAt = null;
                appendBulkLog(latest, 'Retry window reached; queue resumed.');
                await saveAndPublishBulkJob(latest);
            });
            startBulkRunner(job.id);
        }
    }
}

chrome.alarms.onAlarm.addListener(alarm => {
    bulkConsole('debug', `Alarm fired: ${alarm.name}.`);
    if (alarm.name === BULK_RESUME_ALARM || alarm.name === BULK_WATCHDOG_ALARM) resumePersistedBulkJob();
});
chrome.runtime.onStartup.addListener(resumePersistedBulkJob);

/**
 * Handle shiur processing request
 */
async function handleProcessShiur(request, sendResponse) {
    const { mp3Url, type, pageUrl, pageId: requestedPageId, pageTitle, metadata } = request;

    try {
        if (!mp3Url) {
            sendResponse({
                success: false,
                error: 'No MP3 URL provided'
            });
            return;
        }

        // Generate cache key from page URL (if provided) or MP3 URL
        let cacheKey;

        // Helper function to detect site
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

        const sitePrefix = getSitePrefix(pageUrl || mp3Url);

        if (pageUrl) {
            // Try to extract ID from page URL
            let pageId = requestedPageId || null;

            if (sitePrefix === 'yutorah') {
                // YUTorah pattern: /lectures/123456 or /lecture.cfm/123456
                const match = pageUrl.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/);
                if (match) pageId = match[1];
            } else if (sitePrefix === 'kolhalashon') {
                // Kol Halashon pattern: /playShiur/123456
                const match = pageUrl.match(/\/playShiur\/(\d+)/);
                if (match) pageId = match[1];
            } else if (sitePrefix === 'shiurbank' && !pageId) {
                const match = pageUrl.match(/\/shiur\/([\w-]+)/i);
                if (match) pageId = match[1];
            }

            if (pageId) {
                cacheKey = `${sitePrefix}_${pageId}_${type}`;
            } else {
                // Fallback to MP3-based key
                cacheKey = `${sitePrefix}_${mp3Url.split('/').pop().replace(/\.(mp3|m4a|MP3|M4A)/g, '')}_${type}`;
            }
        } else {
            // Fallback to MP3-based key
            cacheKey = `${sitePrefix}_${mp3Url.split('/').pop().replace(/\.(mp3|m4a|MP3|M4A)/g, '')}_${type}`;
        }

        console.log('Using cache key:', cacheKey);

        // Check cache first
        const cachedContent = await Storage.getCachedNotes(cacheKey);
        if (cachedContent) {
            console.log('Returning cached content for:', cacheKey);

            // Try to retrieve modelUsed and isFallback to pass along if it exists
            const cachedNotesFull = await Storage.getAllNotes();
            const noteData = cachedNotesFull[cacheKey] || {};

            sendResponse({
                success: true,
                content: cachedContent,
                model: noteData.modelUsed || null,
                isFallback: noteData.isFallback || false,
                cached: true
            });
            return;
        }

        // Get API key based on mode
        const mode = await Storage.getKeyMode();
        let apiKey;

        if (mode === 'custom') {
            apiKey = await Storage.getApiKey();
            if (!apiKey) {
                sendResponse({
                    success: false,
                    error: 'No custom API key configured. Please add your API key in Settings or switch to default mode.'
                });
                return;
            }
        } else {
            // Use random default key
            apiKey = getRandomDefaultKey();
            if (!apiKey) {
                throw new Error('Default API key is not configured. Please add your own API key in Settings.');
            }
            const requestCheck = await Storage.claimDailyRequest();
            if (!requestCheck.allowed) {
                sendResponse(createDailyLimitResponse(requestCheck));
                return;
            }
            console.log('Using default API key (rate limited mode)');
        }

        // Process the shiur - pass mp3Url directly
        const result = await GeminiAPI.processShiurFromUrl(
            apiKey,
            mp3Url,
            type
        );
        const content = result.text;
        const modelUsed = result.model;
        const isFallback = result.isFallback;

        // Cache the result with extended metadata from page
        const storageMetadata = {
            title: pageTitle,
            sourceUrl: pageUrl,
            categories: metadata?.categories,
            references: metadata?.references,
            venue: metadata?.venue,
            speaker: metadata?.speaker,
            seriesInfo: metadata?.seriesInfo,
            modelUsed: modelUsed,
            isFallback: isFallback
        };
        await Storage.setCachedNotes(cacheKey, content, storageMetadata);

        sendResponse({
            success: true,
            content: content,
            model: modelUsed,
            isFallback: isFallback,
            cached: false
        });
    } catch (error) {
        console.error('Error processing shiur:', error);
        sendResponse({
            success: false,
            error: error.message || 'An error occurred while processing the shiur'
        });
    }
}

/**
 * Handle text processing request (Enhance/Translate)
 */
async function handleProcessTextShiur(request, sendResponse) {
    const { text, type, metadata, originalKey, overwrite } = request;

    try {
        if (!text) {
            sendResponse({
                success: false,
                error: 'No text provided'
            });
            return;
        }

        let newType = type;
        if (type === 'enhance_transcript') {
            newType = 'enhanced';
        } else if (type === 'translate_english_hebrew') {
            newType = 'translated_eng';
        } else if (type === 'translate_beis_medrash') {
            newType = 'translated_heb';
        }

        const processedLabels = {
            enhanced: 'Enhanced',
            translated_eng: 'English Translation',
            translated_heb: 'Lashon Kodesh Translation'
        };
        const processedLabel = processedLabels[newType] || 'Processed';
        const sourceTitle = String(metadata?.title || 'Processed Text').trim();
        let cacheKey;
        let savedTitle = sourceTitle;

        if (overwrite && originalKey) {
            cacheKey = originalKey;
        } else {
            // Keep the source key readable and give every generated copy an
            // unambiguous variant suffix. The double separators also let the
            // viewer distinguish the result type from the source note type.
            const sourceKey = String(originalKey || `upload_processed_text_${Date.now()}`)
                .replace(/__(enhanced|translated_eng|translated_heb)__[^_]+$/, '');
            cacheKey = `${sourceKey}__${newType}__${Date.now().toString(36)}`;

            const titleStem = sourceTitle.replace(/\s+—\s+(Enhanced|English Translation|Lashon Kodesh Translation)(?: \(\d+\))?$/, '');
            const proposedTitle = `${titleStem} — ${processedLabel}`;
            const notes = await Storage.getAllNotes();
            const existingTitles = new Set(Object.values(notes).map(note => note.title).filter(Boolean));
            savedTitle = proposedTitle;
            let copyNumber = 2;
            while (existingTitles.has(savedTitle)) {
                savedTitle = `${proposedTitle} (${copyNumber++})`;
            }
        }

        console.log('Using cache key for text process:', cacheKey);

        // Get API key
        const mode = await Storage.getKeyMode();
        let apiKey;

        if (mode === 'custom') {
            apiKey = await Storage.getApiKey();
            if (!apiKey) {
                sendResponse({
                    success: false,
                    error: 'No custom API key configured. Please add your API key in Settings or switch to default mode.'
                });
                return;
            }
        } else {
            apiKey = getRandomDefaultKey();
            if (!apiKey) {
                throw new Error('Default API key is not configured. Please add your own API key in Settings.');
            }
            const requestCheck = await Storage.claimDailyRequest();
            if (!requestCheck.allowed) {
                sendResponse(createDailyLimitResponse(requestCheck));
                return;
            }
            console.log('Using default API key (rate limited mode)');
        }

        // Process the text
        const result = await GeminiAPI.generateContentFromText(
            apiKey,
            text,
            type
        );
        const content = result.text;
        const modelUsed = result.model;
        const isFallback = result.isFallback;

        // Cache the result
        const storageMetadata = {
            title: savedTitle,
            categories: metadata?.categories,
            references: metadata?.references,
            venue: metadata?.venue,
            speaker: metadata?.speaker,
            seriesInfo: metadata?.seriesInfo,
            modelUsed: modelUsed,
            isFallback: isFallback
        };
        await Storage.setCachedNotes(cacheKey, content, storageMetadata);

        sendResponse({
            success: true,
            content: content,
            model: modelUsed,
            isFallback: isFallback,
            newKey: cacheKey,
            newType,
            title: savedTitle,
            overwritten: Boolean(overwrite && originalKey)
        });
    } catch (error) {
        console.error('Error processing text:', error);
        sendResponse({
            success: false,
            error: error.message || 'An error occurred while processing the text'
        });
    }
}


/**
 * Check if API key is configured
 */
async function handleCheckApiKey(sendResponse) {
    try {
        const mode = await Storage.getKeyMode();
        const hasApiKey = mode === 'default'
            ? typeof hasDefaultKey === 'function' && hasDefaultKey()
            : !!(await Storage.getApiKey());
        sendResponse({
            success: true,
            hasApiKey
        });
    } catch (error) {
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

function createDailyLimitResponse(requestCheck) {
    const resetDate = new Date(`${requestCheck.usage.resetDate}T00:00:00`);
    resetDate.setDate(resetDate.getDate() + 1);
    const hoursUntilReset = Math.max(1, Math.ceil((resetDate - new Date()) / (1000 * 60 * 60)));

    return {
        success: false,
        error: `Daily limit reached (${requestCheck.limit} requests/day). Resets in ~${hoursUntilReset} hours.\n\nFor unlimited access, add your own API key in Settings.`,
        rateLimitExceeded: true
    };
}

async function handleClaimDefaultRequest(sendResponse) {
    try {
        const mode = await Storage.getKeyMode();
        if (mode !== 'default') {
            sendResponse({ success: true, allowed: true });
            return;
        }

        const requestCheck = await Storage.claimDailyRequest();
        sendResponse(requestCheck.allowed
            ? { success: true, allowed: true, usage: requestCheck.usage }
            : createDailyLimitResponse(requestCheck));
    } catch (error) {
        sendResponse({ success: false, error: error.message || 'Unable to check the daily limit.' });
    }
}

/**
 * Get storage statistics
 */
async function handleGetStorageStats(sendResponse) {
    try {
        const stats = await Storage.getStorageStats();
        sendResponse({
            success: true,
            stats: stats
        });
    } catch (error) {
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

/**
 * Handle delete note request
 */
async function handleDeleteNote(request, sendResponse) {
    const { url, type } = request;

    try {
        // Generate cache key from URL
        const cacheKey = Storage.generateCacheKey(url, type);

        if (!cacheKey) {
            sendResponse({
                success: false,
                error: 'Invalid URL format'
            });
            return;
        }

        // Delete from storage
        await Storage.deleteNote(cacheKey);

        sendResponse({
            success: true
        });
    } catch (error) {
        console.error('Error deleting note:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Open options page on first install
        chrome.runtime.openOptionsPage();
    }
    resumePersistedBulkJob();
});


