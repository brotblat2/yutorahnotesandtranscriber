// Gemini API client for YUTorah Notes Extension
// Refactored for Gemini 2.5 Flash and production robustness

/**
 * Default prompts extracted to keep logic clean.
 * formatting is stripped of excess indentation to save tokens and ensure clarity.
 */
const DEFAULT_PROMPTS = {
    transcript: `Generate a verbatim transcript of this audio shiur. 
Rules:
- CRITICAL: MAKE SURE THE ENTIRE DURATION OF THE SHIUR IS TRANSCRIBED. DO NOT stop in the middle.
- Hebrew terms must be written in Hebrew script.
- Do not summarize or explain.
- Mark unclear audio as [inaudible].
- CRITICAL: DO NOT HALLUCINATE. If you do not hear sensible audio, do not make things up.
- CRITICAL: DO NOT time-stamp. 

If you cannot access the contents of the audio file or if it is silent/invalid, respond with exactly:
"sorry can't access the audio file"`,

    maamar: `כתוב "חבורה" תורנית מעמיקה ומורחבת (סיכום שיעור למדני) על בסיס תוכן קובץ השמע/הטקסט.

חובה: הטקסט כולו חייב להיכתב בעברית תורנית-ישיבתית בלבד.

**הנחיית יסוד: סגנון ושפה (Beis Medrash Style)**
1. אל תכתוב בסגנון עיתונאי, אקדמי או "עברית מודרנית" קצרה.
2. השתמש ב"לשון הקודש" ובסגנון המקובל בעולם הישיבות (עברית משולבת במונחים ארמיים מקובלים).
3. השתמש בביטויים המחברים את הלוגיקה: "והנה", "ולכאורה יש להקשות", "וביאור הדברים", "ונראה לומר", "חילוק זה מבואר", "היוצא לנו מזה".
4. אל תסכם בקיצור. המטרה היא **לשחזר את המהלך** (The Mahalech) במלואו, תוך הרחבת הסברא.

**מבנה החבורה:**

## שם הסוגיה / הנושא הכללי

### [כותרת משנה לכל מהלך או יסוד בסוגיה]

**הוראות לכתיבת התוכן:**

1. **בניית המהלך:**
   עבור כל נושא בשיעור, כתוב בסדר הלוגי הבא:
   * **הצגת הנתונים:** ציטוט הגמרא/הראשונים.
   * **הקושיא:** מה קשה כאן? הסבר את הקושיא באריכות.
   * **התירוץ:** הסבר המהלך המתרץ.
   * **הסברא:** אל תכתוב רק את המסקנה. הסבר את ה"למה" - מה עומד בבסיס הדברים?

2. **עיבוי והרחבה:**
   * כל פסקה חייבת להיות ארוכה (10-15 שורות לפחות).
   * אסור לדלג על שלבים לוגיים. יש לפרט כל שלב.
   * אם הוזכרה מחלוקת - הסבר בפירוט את שיטות הצדדים ואת שורש המחלוקת.

3. **שילוב מקורות:**
   * שבץ את שמות המפרשים בגוף הטקסט (מודגש).
   * כתוב רק מה שנאמר בשיעור, אך "תרגם" את הדיבור לסגנון כתוב ועשיר.
   * אין להשתמש במילים באנגלית.

אם אינך יכול לגשת לתוכן הקובץ, כתוב בדיוק: "sorry can't access the audio file".`,

    ocr: `Extract and format ALL text from this PDF document. Follow these rules strictly:

LANGUAGE REQUIREMENT: Preserve the original language of the text. Hebrew text must remain in Hebrew script, English in English.



FORMATTING:
- Preserve document structure (headers, paragraphs, lists, footnotes).
- Use markdown formatting (# for titles, **bold**, *italic*).
- Use > for block quotes.
- Use [^1] for footnote markers.

CONTENT REQUIREMENTS:
- Extract ALL text. Do not skip pages.
- Preserve tables using markdown syntax.
- Keep footnotes/endnotes.
- Do NOT add commentary or summaries.
- Do NOT translate.

If the PDF is unreadable, corrupted, or contains no extractable text, respond with exactly:
"sorry can't extract text from this PDF"`,

    kol_halashon_notes: `Follow these rules strictly:
Take extensive notes of this audio file.

LANGUAGE STYLE: Write in "Yeshivish" style - English sentences naturally integrating Hebrew/Aramaic terms.
Example: "If a husband claims he paid the כתובה while the wife still holds the document, he is not believed due to the principle of שטרך בידי מאי בעי."

FORMATTING:
- Use ONLY markdown syntax.
- **Bold** key concepts, halakhic categories, and names of Rishonim/Acharonim.
- Use bullet points for arguments and steps.
- ALL hebrew terms must be in hebrew script.

CONTENT FOCUS:
1. **The Flow (המהלך):** Clearly trace the logical progression of the shiur. How does one step lead to the next?
2. **Chidushim (חידושים):** Explicitly highlight novel insights or creative interpretations. Use a section header or bold text to mark them.
3. **Arguments & Proofs:** Detail the shakla v'tarya (give and take).

Structure:
- ## Topic / Sugya
- ### Section Headers (use Hebrew or English)
- **Chidush:** [The novel point]

Do NOT add:
- Introductions or summaries.
- Timestamps.
- English translation of Hebrew/Aramaic terms.

If you cannot access the audio, respond: "sorry can't access the audio file"`,

    notes: `Follow these rules strictly:
Take extensive notes of this audio file.

LANGUAGE REQUIREMENT: Write ALL explanatory content, descriptions, and notes in ENGLISH ONLY.
HEBREW TERMS: Write Hebrew terms, phrases, and quotations in Hebrew script only (do NOT translate or transliterate them).
Use ONLY markdown syntax (no HTML).

Structure:
- ## for major sections
- ### for subtopics/analytical stages
- Bullet points (-) for arguments, proofs, questions, nafka minot.
- **Bold** for key concepts and halakhic categories.

Content Guidelines:
- Preserve the full logical content.
- Do NOT omit arguments, proofs, or questions.
- Do NOT collapse steps; explain the reasoning fully.
- You MAY rephrase sentences for flow/clarity, but keep the ideas verbatim.
- If it is a classic Talmudic shiur, explain how logical arguments fit back into the sources (Gemara/Rishonim).

Do NOT add:
- Introductions, conclusions, or meta-summaries.
- Logistical/administrative details.

CRITICAL: DO NOT HALLUCINATE. Ensure every point is derived directly from the audio.
CRITICAL: Maintain consistent depth throughout (including the end of the shiur).

If you cannot access the contents of the audio file or if it is silent/invalid, respond with exactly:
"sorry can't access the audio file"`
};

// Gemini API Client
const GeminiAPI = {
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',

    /**
     * Light cleanup for known Gemini LaTeX artifacts
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
        const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
        console.log('Uploading file:', fileBlob.name || 'audio file');

        const initiateResponse = await fetch(uploadUrl, {
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
            throw new Error(`Upload failed (${initiateResponse.status}): ${errorText || 'No error details'}`);
        }

        const resumableUrl = initiateResponse.headers.get('X-Goog-Upload-URL');
        if (!resumableUrl) throw new Error('Missing resumable upload URL');

        const uploadResponse = await fetch(resumableUrl, {
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
            const res = await fetch(`${this.BASE_URL}/${fileName}?key=${apiKey}`);
            const data = await res.json();

            if (data.state === 'ACTIVE') return;
            if (data.state === 'FAILED') throw new Error('Gemini file processing failed');

            await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error('Timed out waiting for Gemini file processing');
    },

    /**
     * Generate transcript or notes
     */
    async generateContent(apiKey, fileUri, requestType = 'notes', customPrompts = null, mimeType = 'audio/mpeg') {
        // Use different model order based on request type
        // Maamar mode uses gemini-2.5-flash by default for better Hebrew output
        const models = requestType === 'maamar'
            ? ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash']
            : ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash'];
        let lastError = null;

        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            const url = `${this.BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

            try {
                console.log(`Attempting generation with model: ${model}`);

                let prompt;

                // 1. Check for Custom Prompts
                if (customPrompts) {
                    if (requestType === 'transcript' && customPrompts.transcriptPrompt) {
                        prompt = customPrompts.transcriptPrompt;
                    } else if (requestType === 'notes' && customPrompts.notesPrompt) {
                        prompt = customPrompts.notesPrompt;
                    } else if (requestType === 'maamar' && customPrompts.maamarPrompt) {
                        prompt = customPrompts.maamarPrompt;
                    }
                }

                // 2. Fall back to Default Prompts
                if (!prompt) {
                    if (requestType === 'transcript') {
                        prompt = DEFAULT_PROMPTS.transcript;
                    } else if (requestType === 'maamar') {
                        prompt = DEFAULT_PROMPTS.maamar;
                    } else if (requestType === 'ocr') {
                        prompt = DEFAULT_PROMPTS.ocr;
                    } else if (requestType === 'kol_halashon_notes') {
                        prompt = DEFAULT_PROMPTS.kol_halashon_notes;
                    } else {
                        // Default to notes
                        prompt = DEFAULT_PROMPTS.notes;
                    }
                }

                console.log(`Sending request with prompt type: ${requestType}`);

                const body = {
                    contents: [{
                        parts: [
                            { fileData: { mimeType: mimeType, fileUri } },
                            { text: prompt }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.2,
                        topP: 0.9,
                        maxOutputTokens: 65000,
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }
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
            }
        }

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

        const audioSrc = doc.querySelector('audio')?.getAttribute('src') ||
            doc.querySelector('audio source')?.getAttribute('src');

        if (audioSrc) return new URL(audioSrc, pageUrl).href;

        throw new Error('No MP3 found on YUTorah page');
    },

    /**
     * Process transcript using chunked approach for large files
     * @param {string} apiKey - Gemini API key
     * @param {Blob} audioBlob - Audio file blob
     * @param {function} progressCallback - Callback for progress updates (current, total, percent, message)
     * @returns {string} Merged transcript
     */
    async processTranscriptChunked(apiKey, audioBlob, progressCallback = null) {
        console.log('Starting chunked transcription for', (audioBlob.size / 1024 / 1024).toFixed(2), 'MB file');

        // Split audio into chunks
        progressCallback?.(0, 100, 0, 'Splitting audio into chunks...');
        const chunks = AudioChunker.chunkAudioBlob(audioBlob, 10, 30); // 10MB chunks, 30s overlap

        console.log(`Created ${chunks.length} chunks`);

        // Upload all chunks in parallel
        progressCallback?.(0, chunks.length * 2, 5, `Uploading ${chunks.length} chunks...`);

        const uploadPromises = chunks.map(async (chunk, index) => {
            console.log(`Uploading chunk ${index + 1}/${chunks.length}`);
            const file = await this.uploadFile(apiKey, chunk.blob, 'audio/mpeg');
            return {
                ...chunk,
                fileUri: file.uri,
                fileName: file.name
            };
        });

        const uploadedChunks = await Promise.all(uploadPromises);
        console.log('All chunks uploaded successfully');

        // Process transcriptions sequentially to maintain order
        const transcriptChunks = [];

        for (let i = 0; i < uploadedChunks.length; i++) {
            const chunk = uploadedChunks[i];
            const progressPercent = Math.round(((i + 1) / uploadedChunks.length) * 100);
            const estimatedMinutes = AudioChunker.estimateDurationMinutes(chunk.size);

            progressCallback?.(
                i + 1,
                uploadedChunks.length,
                progressPercent,
                `Transcribing chunk ${i + 1} of ${uploadedChunks.length} (~${estimatedMinutes} min)...`
            );

            console.log(`Transcribing chunk ${i + 1}/${uploadedChunks.length}`);

            const transcript = await this.generateContent(
                apiKey,
                chunk.fileUri,
                'transcript',
                null,
                'audio/mpeg'
            );

            transcriptChunks.push({
                index: i,
                transcript: transcript,
                startByte: chunk.startByte,
                endByte: chunk.endByte
            });
        }

        // Merge transcripts
        progressCallback?.(chunks.length, chunks.length, 100, 'Merging transcripts...');
        console.log('Merging transcript chunks');

        const mergedTranscript = this.mergeTranscriptChunks(transcriptChunks);

        console.log('Chunked transcription complete');
        return mergedTranscript;
    },

    /**
     * Merge transcript chunks by detecting and removing overlapping content
     * @param {Array} chunks - Array of {index, transcript, startByte, endByte}
     * @returns {string} Merged transcript
     */
    mergeTranscriptChunks(chunks) {
        if (chunks.length === 0) return '';
        if (chunks.length === 1) return chunks[0].transcript;

        // Sort by index to ensure correct order
        chunks.sort((a, b) => a.index - b.index);

        let mergedText = chunks[0].transcript;

        for (let i = 1; i < chunks.length; i++) {
            const currentChunk = chunks[i].transcript;

            // Try to find overlap between end of merged text and start of current chunk
            // Look at last 500 chars of merged and first 1000 chars of current
            const searchInMerged = mergedText.slice(-500);
            const searchInCurrent = currentChunk.slice(0, 1000);

            let overlapFound = false;

            // Try to find matching phrases (at least 50 chars)
            for (let overlapLen = Math.min(searchInMerged.length, searchInCurrent.length); overlapLen >= 50; overlapLen--) {
                const endPhrase = searchInMerged.slice(-overlapLen);

                if (searchInCurrent.includes(endPhrase)) {
                    // Found overlap - skip the overlapping part in current chunk
                    const overlapIndex = searchInCurrent.indexOf(endPhrase);
                    const skipLength = overlapIndex + overlapLen;
                    const remainder = currentChunk.slice(skipLength);

                    mergedText += remainder;
                    overlapFound = true;
                    console.log(`Found overlap of ${overlapLen} chars between chunks ${i - 1} and ${i}`);
                    break;
                }
            }

            if (!overlapFound) {
                // No overlap detected, just concatenate with separator
                console.log(`No overlap found between chunks ${i - 1} and ${i}, concatenating`);
                mergedText += '\n\n' + currentChunk;
            }
        }

        return mergedText;
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
     * @param {string} apiKey - Gemini API key
     * @param {string} mp3Url - Direct URL to MP3 file
     * @param {string} requestType - Type of request ('notes', 'transcript', 'maamar', 'ocr')
     * @param {function} progressCallback - Optional callback for progress updates
     * @returns {string} Generated content
     */
    async processShiurFromUrl(apiKey, mp3Url, requestType = 'notes', progressCallback = null) {
        console.log('Processing shiur from URL:', mp3Url);

        // Determine prompt type
        let effectiveRequestType = requestType;
        if (requestType === 'notes' && mp3Url.includes('kolhalashon.com')) {
            console.log('Detected Kol Halashon URL, using specialized prompt');
            effectiveRequestType = 'kol_halashon_notes';
        }

        console.log('Downloading audio...');
        const blob = await this.downloadMP3(mp3Url);

        const fileSizeMB = blob.size / 1024 / 1024;
        console.log(`Downloaded ${fileSizeMB.toFixed(2)}MB audio file`);

        // Use chunked transcription for transcript mode on files > 5MB
        if (requestType === 'transcript' && fileSizeMB > 5) {
            console.log('Using chunked transcription for large file');
            return await this.processTranscriptChunked(apiKey, blob, progressCallback);
        }

        // Standard processing for all other modes and small files
        console.log('Uploading to Gemini...');
        const file = await this.uploadFile(apiKey, blob);

        console.log('Generating content with type:', effectiveRequestType);

        let customPrompts = null;
        if (typeof Storage !== 'undefined' && Storage.getCustomPrompts) {
            try {
                customPrompts = await Storage.getCustomPrompts();
            } catch (error) {
                console.log('Could not load custom prompts, using defaults:', error);
            }
        }

        const result = await this.generateContent(apiKey, file.uri, effectiveRequestType, customPrompts);
        console.log('Processing complete');
        return result;
    }
};

// Export for extension / Node compatibility
if (typeof module !== 'undefined') {
    module.exports = GeminiAPI;
}