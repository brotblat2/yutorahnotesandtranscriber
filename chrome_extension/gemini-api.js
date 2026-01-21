// Gemini API client for YUTorah Notes Extension
// Refactored for Gemini 2.5 Flash and production robustness

// API keys are loaded from config.js (not committed to git)
// config.js defines DEFAULT_KEYS array and getRandomDefaultKey() function

const GeminiAPI = {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',

    /**
     * Light cleanup for known Gemini LaTeX artifacts
     * (intentionally conservative)
     */
    cleanFormatting(text) {
        if (!text) return text;

        // Remove \text{...}
        text = text.replace(/\\text\{([^}]*)\}/g, '$1');

        // Remove wrapping $$ or $ only when clearly LaTeX-style
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, '$1');

        return text.trim();
    },

    /**
     * Upload a file to Gemini using resumable upload
     */
    async uploadFile(apiKey, fileBlob, mimeType = 'audio/mpeg') {
        // File Upload API uses /upload/v1beta/files
        const initiateUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

        console.log('Initiating upload to:', initiateUrl);

        const initiateResponse = await fetch(initiateUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': fileBlob.size.toString(),
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: { display_name: 'yutorah_shiur.mp3' }
            })
        });

        if (!initiateResponse.ok) {
            const errorText = await initiateResponse.text();
            console.error('Upload initiation failed with status:', initiateResponse.status);
            console.error('Response headers:', [...initiateResponse.headers.entries()]);
            console.error('Error body:', errorText);
            throw new Error(`Upload failed (${initiateResponse.status}): ${errorText || 'No error details'}`);
        }

        const uploadUrl = initiateResponse.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) {
            throw new Error('Missing resumable upload URL');
        }

        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
                'Content-Type': mimeType
            },
            body: fileBlob
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('File upload failed:', errorText);
            throw new Error(`File upload failed: ${errorText}`);
        }

        const fileData = await uploadResponse.json();
        await this.waitForFileProcessing(apiKey, fileData.file.name);

        return fileData.file;
    },

    /**
     * Poll until Gemini finishes processing the file
     */
    async waitForFileProcessing(apiKey, fileName, maxAttempts = 30) {
        for (let i = 0; i < maxAttempts; i++) {
            const res = await fetch(`${this.baseUrl}/${fileName}?key=${apiKey}`);
            const data = await res.json();

            if (data.state === 'ACTIVE') return;
            if (data.state === 'FAILED') {
                throw new Error('Gemini file processing failed');
            }

            await new Promise(r => setTimeout(r, 2000));
        }

        throw new Error('Timed out waiting for Gemini file processing');
    },

    /**
     * Generate transcript or notes
     */
    async generateContent(apiKey, fileUri, requestType = 'notes', customPrompts = null, mimeType = 'audio/mpeg') {
        // Try primary model first, fall back to secondary on error
        const models = ['gemini-3-flash-preview', 'gemini-2.5-flash'];
        let lastError = null;

        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            const url = `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`;

            try {
                console.log(`Attempting generation with model: ${model}`);

                let prompt;

                // Use custom prompts if provided
                if (customPrompts) {
                    if (requestType === 'transcript' && customPrompts.transcriptPrompt) {
                        prompt = customPrompts.transcriptPrompt;
                    } else if (requestType === 'notes' && customPrompts.notesPrompt) {
                        prompt = customPrompts.notesPrompt;
                    }
                }

                // Fall back to default prompts if no custom prompt
                if (!prompt) {
                    prompt = requestType === 'transcript'
                        ? `Generate a verbatim or near-verbatim transcript of this audio shiur. You can remove filler words and repetitions.
Rules:
- Hebrew terms must be written in Hebrew script.
- Do not summarize or explain.
- Mark unclear audio as [inaudible].
- CRITICAL: DO NOT HALLUCINATE. If you do not hear sensible audio, do not make things up.
- CRITICAL: DO NOT time-stamp. 

If you cannot access the contents of the audio file or if it is silent/invalid, respond with exactly:
"sorry can't access the audio file"`
                        :
                        `Follow these rules strictly:

LANGUAGE REQUIREMENT: Write ALL explanatory content, descriptions, and notes in ENGLISH ONLY.

HEBREW TERMS: Write Hebrew terms, phrases, and quotations in Hebrew script only (do NOT translate or transliterate them into English).

Use ONLY markdown syntax (no HTML).

Structure the notes as follows:

Use ## for major sections or conceptual units

Use ### for subtopics, analytical stages, or distinct shittot

Use bullet points (-) for arguments, proofs, questions, nafka minot, and structured reasoning

Use bold for:

Key concepts

Halakhic categories

Names of sugyot or governing principles

Preserve the full logical content of the shiur, but present it with clearer thematic organization:

Do NOT omit any arguments, proofs, questions, or conclusions

Do NOT collapse steps or skip intermediate reasoning

You MAY rephrase sentences so they are slightly longer, smoother, and less verbatim, as long as all ideas and details are fully preserved

Group closely related points under coherent conceptual headings where appropriate

If sources are mentioned (e.g., Gemara, Rishonim, Acharonim), record them clearly and accurately

If it is a classic Talmudic shiur, and a logical argument is made and is plugged back in to explain the sources, record how the argument explains or deals with the source.

Do NOT add:

Any introduction, conclusion, framing, or summary not present in the shiur

Any meta statements about the task, the audio, or note-taking

Do NOT include any logistical, administrative, or meta information mentioned in the shiur.

STYLE GUIDANCE (IMPORTANT):

Aim for thematic clarity over verbatim transcription

Prefer complete, explanatory sentences over fragmented speech patterns

Preserve the shiur's analytical depth while improving readability and conceptual flow.

CRITICAL: All notes must be in English except for Hebrew terms, which must appear in Hebrew script only.
CRITICAL: DO NOT HALLUCINATE. Ensure every point is derived directly from the audio.

Return ONLY the formatted notes.

If you cannot access the contents of the audio file or if it is silent/invalid, respond with exactly:
"sorry can't access the audio file"
`;
                }

                const body = {
                    contents: [
                        {
                            parts: [
                                {
                                    fileData: {
                                        mimeType: mimeType,
                                        fileUri
                                    }
                                },
                                { text: prompt }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.2,
                        topP: 0.9,

                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }
                    ]
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText);
                }

                const data = await response.json();
                const parts = data?.candidates?.[0]?.content?.parts;

                if (!Array.isArray(parts)) {
                    throw new Error('No content generated by Gemini');
                }

                const text = parts
                    .filter(p => typeof p.text === 'string')
                    .map(p => p.text)
                    .join('\n');

                console.log(`Successfully generated content with model: ${model}`);
                return this.cleanFormatting(text);

            } catch (error) {
                console.error(`Error with model ${model}:`, error.message);
                lastError = error;

                // If this is not the last model, continue to next
                if (i < models.length - 1) {
                    console.log(`Falling back to next model...`);
                    continue;
                }

                // If this was the last model, throw the error
                throw lastError;
            }
        }

        // Should never reach here, but just in case
        throw lastError || new Error('Failed to generate content with all available models');
    },

    /**
     * Download MP3
     */
    async downloadMP3(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`MP3 download failed: ${res.statusText}`);
        return res.blob();
    },

    /**
     * Scrape YUTorah page for MP3 URL
     * NOTE: must be run in background context or same-origin
     */
    async getMP3Url(pageUrl) {
        const res = await fetch(pageUrl);
        const html = await res.text();

        const doc = new DOMParser().parseFromString(html, 'text/html');

        for (const a of doc.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href');
            if (href?.toLowerCase().endsWith('.mp3')) {
                return new URL(href, pageUrl).href;
            }
        }

        const audioSrc =
            doc.querySelector('audio')?.getAttribute('src') ||
            doc.querySelector('audio source')?.getAttribute('src');

        if (audioSrc) {
            return new URL(audioSrc, pageUrl).href;
        }

        throw new Error('No MP3 found on YUTorah page');
    },

    /**
     * Main pipeline
     */
    async processShiur(apiKey, pageUrl, requestType = 'notes', progress = null) {
        progress?.('Finding MP3...');
        const mp3Url = await this.getMP3Url(pageUrl);

        progress?.('Downloading audio...');
        const blob = await this.downloadMP3(mp3Url);

        progress?.('Uploading to Gemini...');
        const file = await this.uploadFile(apiKey, blob);

        progress?.('Generating output...');
        const result = await this.generateContent(apiKey, file.uri, requestType);

        progress?.('Done');
        return result;
    },

    /**
     * Process shiur from MP3 URL directly (no scraping needed)
     */
    async processShiurFromUrl(apiKey, mp3Url, requestType = 'notes') {
        console.log('Downloading audio from:', mp3Url);
        const blob = await this.downloadMP3(mp3Url);

        console.log('Uploading to Gemini...');
        const file = await this.uploadFile(apiKey, blob);

        console.log('Generating content...');

        // Load custom prompts if available (only works in extension context)
        let customPrompts = null;
        if (typeof Storage !== 'undefined' && Storage.getCustomPrompts) {
            try {
                customPrompts = await Storage.getCustomPrompts();
            } catch (error) {
                console.log('Could not load custom prompts, using defaults:', error);
            }
        }

        const result = await this.generateContent(apiKey, file.uri, requestType, customPrompts);

        console.log('Processing complete');
        return result;
    }
};

// Export for extension / Node compatibility
if (typeof module !== 'undefined') {
    module.exports = GeminiAPI;
}
