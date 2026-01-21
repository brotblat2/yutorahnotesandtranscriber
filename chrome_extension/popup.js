document.addEventListener('DOMContentLoaded', () => {
    // Check API key status
    checkApiKeyStatus();

    // Event Listeners
    document.getElementById('openSettings').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('viewNotes').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
    });

    document.getElementById('uploadFile').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('upload.html') });
    });

    document.getElementById('openHelp').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('SETUP.md') }); // Or link to online docs
    });
});

async function checkApiKeyStatus() {
    const statusDot = document.getElementById('statusIndicator');

    // We need to access storage. Since we are in a popup, we can use chrome.storage directly
    // or use the Storage helper if we import it. Let's use chrome.storage direct for simplicity here.
    chrome.storage.local.get(['gemini_api_key'], (result) => {
        if (result.gemini_api_key) {
            statusDot.classList.add('active');
            statusDot.title = "API Key Configured";
        } else {
            statusDot.classList.add('inactive');
            statusDot.title = "API Key Missing";
        }
    });
}
