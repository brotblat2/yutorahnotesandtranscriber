// Compatibility layer for current Gemini 3.x GenerateContent requests.
// Loaded before gemini-api.js so legacy callers continue to work safely.
(() => {
    if (globalThis.__shiurNotesGeminiCompatInstalled) return;
    globalThis.__shiurNotesGeminiCompatInstalled = true;

    const nativeFetch = globalThis.fetch.bind(globalThis);
    const MODEL_REPLACEMENTS = new Map([
        ['gemini-2.5-flash', 'gemini-3.5-flash'],
        ['gemini-3-flash-preview', 'gemini-3.6-flash']
    ]);

    function isGeminiGenerationUrl(value) {
        const url = String(value || '');
        return url.includes('generativelanguage.googleapis.com') && url.includes(':generateContent');
    }

    function normalizeGeminiUrl(value) {
        let normalized = String(value || '');
        if (!isGeminiGenerationUrl(normalized)) return normalized;
        for (const [oldModel, newModel] of MODEL_REPLACEMENTS) {
            normalized = normalized.replace(`/models/${oldModel}:generateContent`, `/models/${newModel}:generateContent`);
        }
        return normalized;
    }

    function normalizeBody(body) {
        if (typeof body !== 'string') return body;
        try {
            const data = JSON.parse(body);
            if (data?.generationConfig && typeof data.generationConfig === 'object') {
                delete data.generationConfig.temperature;
                delete data.generationConfig.topP;
                delete data.generationConfig.top_p;
                delete data.generationConfig.topK;
                delete data.generationConfig.top_k;
                delete data.generationConfig.candidateCount;
                delete data.generationConfig.candidate_count;
            }
            return JSON.stringify(data);
        } catch {
            return body;
        }
    }

    globalThis.fetch = function shiurNotesCompatibleFetch(input, init = {}) {
        const originalUrl = typeof input === 'string' ? input : input?.url;
        if (!isGeminiGenerationUrl(originalUrl)) return nativeFetch(input, init);

        const normalizedUrl = normalizeGeminiUrl(originalUrl);
        const nextInit = { ...init, body: normalizeBody(init?.body) };
        if (typeof input === 'string') return nativeFetch(normalizedUrl, nextInit);

        const nextRequest = new Request(normalizedUrl, input);
        return nativeFetch(nextRequest, nextInit);
    };
})();
