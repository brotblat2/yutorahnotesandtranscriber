# 🔑 YUTorah Notes - Setup Guide

Welcome to YUTorah Notes! This guide will help you set up the extension and get your Gemini API key.

## ⚠️ IMPORTANT PRIVACY NOTICE

**The developer (the person who created this extension) does NOT have access to your API key!**

- Your API key is stored **locally in your browser** using Chrome's extension storage
- The key is **never transmitted** to any third-party servers
- All processing happens directly between **your browser** and **Google's Gemini API**
- Your notes are stored **locally in your browser** - they never leave your device

## 📋 Prerequisites

- Google Chrome or any Chromium-based browser (Edge, Brave, etc.)
- A Google account (free)

## 🚀 Step 1: Install the Extension

1. Download or clone this extension
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `chrome_extension` folder
6. The extension is now installed!

## 🔑 Step 2: Get Your Gemini API Key

### Why do you need an API key?

This extension uses Google's Gemini AI to generate notes and transcripts from audio files. To use Gemini, you need your own API key. **The good news:** Google provides a generous free tier!

### How to get your API key:

1. **Go to Google AI Studio**
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with your Google account

2. **Create an API Key**
   - Click "Create API Key" button
   - Select "Create API key in new project" (or choose an existing project)
   - Your API key will be generated instantly

3. **Copy the API Key**
   - Click the copy button next to your new API key
   - **Important:** Keep this key secure! Don't share it publicly

### Visual Guide:

```
┌─────────────────────────────────────────┐
│  Google AI Studio                       │
│  ┌───────────────────────────────────┐  │
│  │  Create API Key                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ ○ Create API key in new     │  │  │
│  │  │   project                    │  │  │
│  │  │                              │  │  │
│  │  │ ○ Create API key in          │  │  │
│  │  │   existing project           │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Your API Key:                          │
│  ┌───────────────────────────────────┐  │
│  │ AIzaSy.....................xyz   📋│  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## ⚙️ Step 3: Configure the Extension

1. **Open Extension Settings**
   - Click the extension icon in your browser toolbar
   - Or right-click the extension icon and select "Options"
   - Or go to `chrome://extensions/` and click "Details" → "Extension options"

2. **Enter Your API Key**
   - Paste your API key in the "API Key" field
   - Click "Save API Key"
   - Optionally, click "Test Connection" to verify it works

3. **You're Done!**
   - The extension is now ready to use

## 📝 Step 4: Use the Extension

1. **Visit a YUTorah Page**
   - Go to any shiur page on https://www.yutorah.org/
   - Example: https://www.yutorah.org/lectures/1154805

2. **Generate Notes or Transcript**
   - You'll see two buttons at the top of the page:
     - **"Summarize Shiur"** - Generates detailed notes
     - **"Transcribe Shiur"** - Generates a verbatim transcript
   - Click either button

3. **Wait for Processing**
   - The extension will download the MP3, upload it to Gemini, and generate content
   - This may take 30-60 seconds depending on the audio length
   - A new tab will open with your notes/transcript when ready

4. **View Your Notes**
   - Notes are automatically saved and cached
   - Click "View All Notes" in settings to see all saved notes
   - You can search, export, or delete notes

## 💾 Managing Your Notes

### Storage Location

All notes are stored locally in your browser's extension storage:
- **Windows:** `%LocalAppData%\Google\Chrome\User Data\Default\Extensions\`
- **Mac:** `~/Library/Application Support/Google/Chrome/Default/Extensions/`
- **Linux:** `~/.config/google-chrome/Default/Extensions/`

### Storage Limits

- Chrome extensions have a 10MB local storage quota
- Each note is typically 5-20KB
- You can store hundreds of notes before hitting the limit

### Export/Import

- **Export:** Go to Settings → Storage Management → "Export Notes"
  - Downloads a JSON file with all your notes
  - Use this to backup your notes

- **Import:** Go to Settings → Storage Management → "Import Notes"
  - Upload a previously exported JSON file
  - Merges imported notes with existing ones

## 🆓 Gemini API Free Tier Limits

Google provides a generous free tier for Gemini API:

- **Rate Limits:**
  - 15 requests per minute
  - 1 million tokens per minute
  - 1,500 requests per day

- **What this means for you:**
  - You can process about 15 shiurim per minute
  - Approximately 1,500 shiurim per day
  - **This is more than enough for personal use!**

- **Costs:**
  - The free tier should cover most personal use
  - If you exceed limits, you'll need to upgrade to a paid plan
  - Paid plans are very affordable (typically a few cents per request)

## 🔒 Privacy & Security

### What data is collected?

**NONE!** This extension:
- ✅ Stores your API key locally in your browser
- ✅ Stores notes locally in your browser
- ✅ Sends audio directly from your browser to Google's Gemini API
- ❌ Does NOT send any data to the extension developer
- ❌ Does NOT track your usage
- ❌ Does NOT collect any personal information

### Who has access to your API key?

**ONLY YOU!**
- Your API key is stored in Chrome's local storage
- It's encrypted by Chrome's built-in security
- The extension developer has **NO ACCESS** to your key
- No third-party servers are involved

### Can the developer see my notes?

**NO!**
- All notes are stored locally in your browser
- They never leave your device
- The extension developer cannot see your notes

## ❓ Troubleshooting

### "No API key configured" error

- Make sure you've entered your API key in the extension settings
- Click "Test Connection" to verify the key is valid

### "Could not find MP3 link on the page"

- The YUTorah page may not have an audio file
- Try a different shiur page
- Make sure you're on a lecture page, not a search results page

### "API request failed" error

- Your API key may be invalid - get a new one from Google AI Studio
- You may have exceeded the free tier rate limits - wait a minute and try again
- Check your internet connection

### Notes not appearing

- Check the extension settings → Storage Management to see if notes are saved
- Try clearing your browser cache and reloading the extension

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Open the browser console (F12) and look for error messages
3. Report issues on GitHub: [Your GitHub URL]

## 📜 License

This extension is open source and free to use. See LICENSE file for details.

---

**Enjoy using YUTorah Notes! 📝✨**
