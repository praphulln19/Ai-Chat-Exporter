# Ai chat exporter

Browser extension that exports chat conversations to Markdown or Word-compatible `.docx`, with quick copy-to-clipboard support. Built for Outlier Playground and works on common AI chat UIs.

## Features
- Export chats to `.md`
- Export chats to `.docx` (Word-compatible HTML/MHTML)
- Copy chat content to clipboard
- Optional metadata header and timestamped filenames
- Optional inclusion of model “thinking” blocks (where available)

## Supported sites
- Outlier Playground (including `outlier.ai`, `dataannotation.tech`, and `/playground` URLs)
- ChatGPT (`chat.openai.com`, `chatgpt.com`)
- Claude (`claude.ai`)
- Generic fallback for sites with common chat DOM patterns

## Install (development)
### Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json` in this repo.

### Chromium-based browsers
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Usage
1. Open a supported chat page.
2. Click the extension icon.
3. Choose options (metadata, timestamp, thinking, filename prefix).
4. Click **Download .md**, **Download .docx**, or **Copy to Clipboard**.

## Permissions
- `activeTab`: read the current page to extract chat messages.
- `downloads`: save exported files.

## Project structure
```
outlier-chat-downloader/
│
├── 📄 manifest.json          # Extension configuration
│
├── 📁 popup/
│   ├── 📄 popup.html         # Extension popup UI
│   ├── 📄 popup.css          # Popup styling
│   └── 📄 popup.js           # Core logic (extraction + download)
│
└── 📁 icons/
    └── 🖼️ icon-96.png        # Extension icon
```

## Notes
- The `.docx` export is generated as Word-compatible HTML/MHTML and should open in Word/LibreOffice.
- Extraction depends on page structure; if a site changes its DOM, fallback extraction may be used.
