// Configuration Template for YUTorah Notes Extension
// Copy this file to config.js and add your actual API keys

// Default API keys for demo mode (10 requests/day limit)
const DEFAULT_KEYS = [
    'YOUR_FIRST_API_KEY_HERE',
    'YOUR_SECOND_API_KEY_HERE'
];

/**
 * Get a random default API key
 */
function getRandomDefaultKey() {
    return DEFAULT_KEYS[Math.floor(Math.random() * DEFAULT_KEYS.length)];
}
