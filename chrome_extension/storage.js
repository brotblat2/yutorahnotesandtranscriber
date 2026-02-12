// Storage abstraction layer for YUTorah Notes Extension
// Handles all chrome.storage operations and cache management

const Storage = {
    /**
     * Generates a cache key from the URL and request type
     * Format: yutorah_{id}_{type} or upload_{filename}_{type}
     * Example: yutorah_1154805_notes or upload_myfile_notes
     */
    generateCacheKey(url, requestType = 'notes') {
        // Check if this is an uploaded file
        if (url.startsWith('upload://')) {
            // Return the cache key directly from the URL
            return url.replace('upload://', '');
        }

        // Kol Halashon file - extract lecture ID
        if (url.includes('kolhalashon.com')) {
            const match = url.match(/\/playShiur\/(\d+)/);
            if (match) {
                return `kolhalashon_${match[1]}_${requestType}`;
            }
        }

        // YUTorah file - extract lecture ID
        const match = url.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/);
        if (match) {
            return `yutorah_${match[1]}_${requestType}`;
        }
        return null;
    },

    /**
     * Normalizes any YUTorah URL to the standard format
     * Returns: https://www.yutorah.org/lectures/{lecture_id}
     */
    normalizeUrl(url) {
        // Kol Halashon
        if (url.includes('kolhalashon.com')) {
            const match = url.match(/\/playShiur\/(\d+)/);
            if (match) {
                return `https://www.kolhalashon.com/he/regularSite/playShiur/${match[1]}/-1/0/false`;
            }
        }

        // YUTorah
        const match = url.match(/\/(?:lectures|sidebar\/lecturedata|lecture\.cfm)\/(\d+)/);
        if (match) {
            return `https://www.yutorah.org/lectures/${match[1]}`;
        }
        return null;
    },

    /**
     * Get cached notes for a specific cache key
     */
    async getCachedNotes(cacheKey) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([cacheKey], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result[cacheKey] || null);
                }
            });
        });
    },

    /**
     * Set cached notes for a specific cache key
     */
    async setCachedNotes(cacheKey, notes, metadata = {}) {
        return new Promise((resolve, reject) => {
            const data = {
                [cacheKey]: notes,
                [`${cacheKey}_timestamp`]: Date.now()
            };

            // Store title if provided
            if (metadata.title) {
                data[`${cacheKey}_title`] = metadata.title;
            }

            // Store extracted metadata fields
            if (metadata.categories && metadata.categories.length > 0) {
                data[`${cacheKey}_categories`] = metadata.categories;
            }
            if (metadata.references && metadata.references.length > 0) {
                data[`${cacheKey}_references`] = metadata.references;
            }
            if (metadata.venue) {
                data[`${cacheKey}_venue`] = metadata.venue;
            }
            if (metadata.speaker) {
                data[`${cacheKey}_speaker`] = metadata.speaker;
            }
            if (metadata.seriesInfo) {
                data[`${cacheKey}_series`] = metadata.seriesInfo;
            }

            // Auto-generate tags from metadata
            const autoTags = [];
            if (metadata.categories) {
                autoTags.push(...metadata.categories);
            }
            if (metadata.venue) {
                autoTags.push(metadata.venue);
            }
            if (metadata.speaker) {
                autoTags.push(metadata.speaker);
            }
            // Remove duplicates and only store if we have tags
            if (autoTags.length > 0) {
                data[`${cacheKey}_tags`] = [...new Set(autoTags)];
            }

            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    },

    /**
     * Get the Gemini API key from storage
     */
    async getApiKey() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['gemini_api_key'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result.gemini_api_key || null);
                }
            });
        });
    },

    /**
     * Set the Gemini API key in storage
     */
    async setApiKey(apiKey) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ gemini_api_key: apiKey }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    },

    /**
     * Get all cached notes
     */
    async getAllNotes() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(null, (items) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    // Filter out non-note items (API key, timestamps, etc.)
                    const notes = {};
                    for (const [key, value] of Object.entries(items)) {
                        // Include yutorah_, kolhalashon_, and upload_ prefixed items
                        if ((key.startsWith('yutorah_') || key.startsWith('kolhalashon_') || key.startsWith('upload_')) &&
                            !key.endsWith('_timestamp') &&
                            !key.endsWith('_title') &&
                            !key.endsWith('_tags') &&
                            !key.endsWith('_categories') &&
                            !key.endsWith('_references') &&
                            !key.endsWith('_venue') &&
                            !key.endsWith('_speaker') &&
                            !key.endsWith('_series')) {
                            notes[key] = {
                                content: value,
                                timestamp: items[`${key}_timestamp`] || null,
                                title: items[`${key}_title`] || null,
                                tags: items[`${key}_tags`] || [],
                                categories: items[`${key}_categories`] || [],
                                references: items[`${key}_references`] || [],
                                venue: items[`${key}_venue`] || null,
                                speaker: items[`${key}_speaker`] || null,
                                series: items[`${key}_series`] || null
                            };
                        }
                    }
                    resolve(notes);
                }
            });
        });
    },

    /**
     * Delete a specific note by cache key
     */
    async deleteNote(cacheKey) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove([
                cacheKey,
                `${cacheKey}_timestamp`,
                `${cacheKey}_title`,
                `${cacheKey}_tags`,
                `${cacheKey}_categories`,
                `${cacheKey}_references`,
                `${cacheKey}_venue`,
                `${cacheKey}_speaker`,
                `${cacheKey}_series`
            ], () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    },

    /**
     * Get tags for a specific note
     */
    async getTags(cacheKey) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([`${cacheKey}_tags`], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result[`${cacheKey}_tags`] || []);
                }
            });
        });
    },

    /**
     * Set tags for a specific note
     */
    async setTags(cacheKey, tags) {
        return new Promise((resolve, reject) => {
            // Ensure tags is an array of strings
            const tagArray = Array.isArray(tags) ? tags : [];
            const cleanedTags = tagArray.map(tag => String(tag).trim()).filter(tag => tag.length > 0);

            chrome.storage.local.set({ [`${cacheKey}_tags`]: cleanedTags }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    },

    /**
     * Get all unique tags across all notes
     */
    async getAllTags() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(null, (items) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    const allTags = new Set();
                    for (const [key, value] of Object.entries(items)) {
                        if (key.endsWith('_tags') && Array.isArray(value)) {
                            value.forEach(tag => allTags.add(tag));
                        }
                    }
                    resolve(Array.from(allTags).sort());
                }
            });
        });
    },

    /**
     * Get storage usage statistics
     */
    async getStorageStats() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    chrome.storage.local.get(null, (items) => {
                        const noteCount = Object.keys(items).filter(
                            key => (key.startsWith('yutorah_') || key.startsWith('kolhalashon_')) && !key.endsWith('_timestamp')
                        ).length;

                        resolve({
                            bytesInUse,
                            noteCount,
                            // chrome.storage.local quota is typically 10MB
                            quotaBytes: 10 * 1024 * 1024,
                            percentUsed: (bytesInUse / (10 * 1024 * 1024)) * 100
                        });
                    });
                }
            });
        });
    },

    /**
     * Export all notes as JSON
     */
    async exportNotes() {
        const notes = await this.getAllNotes();
        return JSON.stringify(notes, null, 2);
    },

    /**
     * Import notes from JSON
     */
    async importNotes(jsonString) {
        try {
            const notes = JSON.parse(jsonString);
            const promises = [];

            for (const [key, data] of Object.entries(notes)) {
                if (key.startsWith('yutorah_') || key.startsWith('kolhalashon_')) {
                    promises.push(this.setCachedNotes(key, data.content));
                }
            }

            await Promise.all(promises);
            return true;
        } catch (error) {
            throw new Error('Invalid JSON format');
        }
    },

    /**
     * Clear all cached notes (keeps API key)
     */
    async clearAllNotes() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(null, (items) => {
                const keysToRemove = Object.keys(items).filter(
                    key => key.startsWith('yutorah_') || key.startsWith('kolhalashon_')
                );

                chrome.storage.local.remove(keysToRemove, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(true);
                    }
                });
            });
        });
    },

    /**
     * Get custom prompts
     */
    async getCustomPrompts() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['custom_notes_prompt', 'custom_transcript_prompt'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve({
                        notesPrompt: result.custom_notes_prompt || null,
                        transcriptPrompt: result.custom_transcript_prompt || null
                    });
                }
            });
        });
    },

    /**
     * Set custom prompts
     */
    async setCustomPrompts(notesPrompt, transcriptPrompt) {
        return new Promise((resolve, reject) => {
            const data = {};
            if (notesPrompt !== null && notesPrompt !== undefined) {
                data.custom_notes_prompt = notesPrompt;
            }
            if (transcriptPrompt !== null && transcriptPrompt !== undefined) {
                data.custom_transcript_prompt = transcriptPrompt;
            }

            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    },

    /**
     * Get API key mode ('default' or 'custom')
     */
    async getKeyMode() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['api_key_mode'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    // Default to 'default' mode for new users
                    resolve(result.api_key_mode || 'default');
                }
            });
        });
    },

    /**
     * Set API key mode
     */
    async setKeyMode(mode) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ api_key_mode: mode }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    },

    /**
     * Get daily usage statistics
     * Returns: { count: number, resetDate: string }
     */
    async getDailyUsage() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['daily_usage_count', 'daily_usage_reset_date'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    const today = new Date().toISOString().split('T')[0];
                    const resetDate = result.daily_usage_reset_date || today;

                    // Reset count if it's a new day
                    if (resetDate !== today) {
                        resolve({ count: 0, resetDate: today });
                    } else {
                        resolve({
                            count: result.daily_usage_count || 0,
                            resetDate: resetDate
                        });
                    }
                }
            });
        });
    },

    /**
     * Increment daily usage count
     */
    async incrementDailyUsage() {
        const usage = await this.getDailyUsage();
        const today = new Date().toISOString().split('T')[0];

        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                daily_usage_count: usage.count + 1,
                daily_usage_reset_date: today
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(usage.count + 1);
                }
            });
        });
    },

    /**
     * Reset daily usage count (called when new day detected)
     */
    async resetDailyUsage() {
        const today = new Date().toISOString().split('T')[0];

        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                daily_usage_count: 0,
                daily_usage_reset_date: today
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    },

    /**
     * Check if user can make a request based on mode and limits
     * Returns: { allowed: boolean, reason: string, usage: object }
     */
    async canMakeRequest() {
        const mode = await this.getKeyMode();

        // Custom key mode has no limits
        if (mode === 'custom') {
            return { allowed: true, reason: 'custom_key', usage: null };
        }

        // Default mode has 3 requests per day limit
        const usage = await this.getDailyUsage();
        const DAILY_LIMIT = 3;

        if (usage.count >= DAILY_LIMIT) {
            return {
                allowed: false,
                reason: 'rate_limit_exceeded',
                usage: usage,
                limit: DAILY_LIMIT
            };
        }

        return {
            allowed: true,
            reason: 'default_key',
            usage: usage,
            limit: DAILY_LIMIT
        };
    },

    /**
     * Get all series with their associated shiurim
     * Returns array of series objects with shiurim arrays
     */
    async getAllSeries() {
        const notes = await this.getAllNotes();
        const seriesMap = new Map();

        for (const [cacheKey, note] of Object.entries(notes)) {
            if (note.series) {
                const seriesID = note.series.seriesID;
                if (!seriesMap.has(seriesID)) {
                    seriesMap.set(seriesID, {
                        seriesID: note.series.seriesID,
                        seriesName: note.series.seriesName,
                        seriesURL: note.series.seriesURL,
                        shiurim: []
                    });
                }
                seriesMap.get(seriesID).shiurim.push({
                    cacheKey,
                    title: note.title,
                    timestamp: note.timestamp
                });
            }
        }

        return Array.from(seriesMap.values());
    },

    /**
     * Get notes by series ID
     * Returns array of notes belonging to a specific series
     */
    async getNotesBySeries(seriesID) {
        const notes = await this.getAllNotes();
        return Object.entries(notes)
            .filter(([_, note]) => note.series?.seriesID === seriesID)
            .map(([cacheKey, note]) => ({ cacheKey, ...note }));
    }
};

// Make Storage available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
