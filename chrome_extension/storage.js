// Storage abstraction layer for YUTorah Notes Extension
// Handles all chrome.storage operations and cache management

const Storage = {
    /**
     * Generates a cache key from the URL and request type
     * Format: yutorah_{id}_{type}
     * Example: yutorah_1154805_notes
     */
    generateCacheKey(url, requestType = 'notes') {
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
                        if (key.startsWith('yutorah_') && !key.endsWith('_timestamp') && !key.endsWith('_title')) {
                            notes[key] = {
                                content: value,
                                timestamp: items[`${key}_timestamp`] || null,
                                title: items[`${key}_title`] || null
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
            chrome.storage.local.remove([cacheKey, `${cacheKey}_timestamp`], () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
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
                            key => key.startsWith('yutorah_') && !key.endsWith('_timestamp')
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
                if (key.startsWith('yutorah_')) {
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
                    key => key.startsWith('yutorah_')
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
    }
};

// Make Storage available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
