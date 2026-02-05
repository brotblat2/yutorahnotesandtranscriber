// Utility functions for YUTorah Notes Extension

/**
 * Detect if majority of text is Hebrew
 * @param {string} text - The text to analyze
 * @returns {boolean} - True if Hebrew characters are majority
 */
function isMajorityHebrew(text) {
    // Count Hebrew characters (Unicode range U+0590 to U+05FF)
    const hebrewCharCount = (text.match(/[\u0590-\u05FF]/g) || []).length;

    // Count English/Latin characters
    const englishCharCount = (text.match(/[a-zA-Z]/g) || []).length;

    // Total relevant characters
    const totalRelevantChars = hebrewCharCount + englishCharCount;

    // If no relevant characters, default to false (LTR)
    if (totalRelevantChars === 0) return false;

    // Return true if more than 50% is Hebrew
    return hebrewCharCount / totalRelevantChars > 0.5;
}
