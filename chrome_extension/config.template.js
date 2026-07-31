// Configuration Template for YUTorah Notes Extension
// Copy this file to config.js and add your actual API keys

// Default API keys for demo mode (3 requests/day limit)
const DEFAULT_KEYS = [
    'YOUR_FIRST_API_KEY_HERE',
    'YOUR_SECOND_API_KEY_HERE'
];

/**
 * Get a random default API key
 */
function getRandomDefaultKey() {
    const configuredKeys = DEFAULT_KEYS.filter(key =>
        typeof key === 'string' &&
        key.trim() &&
        !key.startsWith('YOUR_')
    );

    return configuredKeys.length
        ? configuredKeys[Math.floor(Math.random() * configuredKeys.length)]
        : null;
}

/**
 * Whether demo mode has at least one usable key configured.
 */
function hasDefaultKey() {
    return DEFAULT_KEYS.some(key =>
        typeof key === 'string' &&
        key.trim() &&
        !key.startsWith('YOUR_')
    );
}
