# 📝 YUTorah Notes - Chrome Extension

> Generate AI-powered notes and transcripts from YUTorah shiurim with one click - completely private and local!

## ✨ Features

- 🎯 **One-Click Processing** - Generate notes or transcripts directly from any YUTorah page
- 🔒 **100% Private** - All processing happens between your browser and Google's Gemini API
- 💾 **Local Storage** - Notes are saved locally in your browser, never on external servers
- 🆓 **Free to Use** - Uses Google's generous free tier (1,500 requests/day)
- 🌐 **No Hosting Required** - Everything runs in your browser extension
- 📱 **Offline Access** - View cached notes even without internet
- 🔍 **Search & Organize** - Search through all your saved notes
- 📤 **Export/Import** - Backup and restore your notes as JSON

## 🚀 Quick Start

### 1. Install the Extension

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `chrome_extension` folder
6. Done! The extension is now installed

### 2. Get Your Gemini API Key

**⚠️ IMPORTANT: The developer does NOT have access to your API key!**

Your API key is stored locally in your browser and never shared with anyone.

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key

### 3. Configure the Extension

1. Click the extension icon or right-click → "Options"
2. Paste your API key
3. Click "Save API Key"
4. Optionally click "Test Connection" to verify

### 4. Start Using!

1. Visit any YUTorah shiur page (e.g., https://www.yutorah.org/lectures/1154805)
2. Click "Summarize Shiur" for notes or "Transcribe Shiur" for transcript
3. Wait 30-60 seconds for processing
4. View your notes in a new tab!

## 📖 Detailed Setup Guide

For detailed setup instructions with screenshots and troubleshooting, see [SETUP.md](SETUP.md).

## 🔒 Privacy & Security

### What makes this extension private?

- ✅ **No Backend Server** - Everything runs in your browser
- ✅ **Local Storage** - Notes stored in browser extension storage
- ✅ **Direct API Calls** - Audio sent directly from browser to Google Gemini
- ✅ **No Tracking** - Zero analytics or data collection
- ✅ **Open Source** - Inspect the code yourself!

### Who has access to what?

| Data | You | Extension Developer | Google |
|------|-----|-------------------|--------|
| API Key | ✅ | ❌ | ❌ |
| Notes | ✅ | ❌ | ❌ |
| Audio Files | ✅ | ❌ | ✅ (temporary) |
| Generated Content | ✅ | ❌ | ✅ (temporary) |

**The extension developer has ZERO access to your API key or notes!**

## 💡 How It Works

```
┌─────────────┐
│  YUTorah    │
│  Page       │
└──────┬──────┘
       │ 1. Click button
       ▼
┌─────────────┐
│  Extension  │
│  (Browser)  │
└──────┬──────┘
       │ 2. Download MP3
       │ 3. Upload to Gemini
       │ 4. Get notes/transcript
       │ 5. Save locally
       ▼
┌─────────────┐
│  Local      │
│  Storage    │
└─────────────┘
```

## 📊 Storage & Limits

### Local Storage

- **Quota:** 10MB (Chrome extension limit)
- **Typical Note Size:** 5-20KB
- **Capacity:** Hundreds of notes
- **Location:** Browser's extension storage (encrypted by Chrome)

### Gemini API Free Tier

- **15 requests/minute**
- **1,500 requests/day**
- **1 million tokens/minute**
- **More than enough for personal use!**

## 🎨 Features in Detail

### Summarize Shiur

Generates comprehensive notes including:
- Main topics and themes
- Key concepts and ideas
- Hebrew terms (in Hebrew script)
- Organized with headers and bullet points
- Markdown formatted

### Transcribe Shiur

Generates verbatim transcript including:
- Speaker identification
- Hebrew terms (in Hebrew script)
- Paragraph breaks for topic changes
- Timestamps for unclear audio

### Notes Management

- **View All Notes** - Browse all saved notes
- **Search** - Find notes by content
- **Export** - Download notes as JSON
- **Import** - Restore from backup
- **Delete** - Remove individual notes or clear all

## 🛠️ Development

### Project Structure

```
chrome_extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (API calls)
├── content.js            # Injected into YUTorah pages
├── storage.js            # Storage abstraction layer
├── gemini-api.js         # Gemini API client
├── options.html/js/css   # Settings page
├── viewer.html/js/css    # Notes viewer
├── button-style.css      # Button styles
├── icons/                # Extension icons
├── SETUP.md             # Setup guide
└── README.md            # This file
```

### Technologies Used

- **Manifest V3** - Latest Chrome extension standard
- **Chrome Storage API** - Local data persistence
- **Gemini API** - AI-powered content generation
- **Vanilla JavaScript** - No frameworks needed
- **Modern CSS** - Responsive design

## 🙏 Acknowledgments

- **YUTorah** - For providing amazing Torah content
- **Google Gemini** - For the AI API
- **Chrome Extensions** - For the platform

**Made with ❤️ for Torah learning**

**Remember: Your API key and notes are 100% private and stored locally!**
