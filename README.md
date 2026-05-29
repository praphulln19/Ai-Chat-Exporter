<div align="center">

<img src="icons/icon-96.png" alt="AI Chat Downloader Logo" width="96" height="96">

# AI Chat Downloader

**Export AI chat conversations as Markdown or Word files — with a single click.**

[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-downloader-tool/)
[![Version](https://img.shields.io/badge/Version-1.6-blue?style=for-the-badge)](https://github.com/praphulln19/Ai-Chat-Exporter/releases)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange?style=for-the-badge)]()

[Features](#features) · [Supported Platforms](#supported-platforms) · [Installation](#installation) · [Usage](#usage) · [Privacy](#privacy) · [Contributing](#contributing)

</div>

---

## Overview

AI Chat Downloader is a browser extension for Firefox and Chrome that lets you save your AI conversations in one click. It works locally — no sign-up required, no data sent anywhere, no tracking of any kind.

Export to:
- **Markdown** (`.md`) — clean, portable, and developer-friendly
- **Word Document** (`.doc`) — styled output that opens reliably in Microsoft Word, Google Docs, and LibreOffice
- **Clipboard** — paste formatted Markdown directly anywhere

---

## Features

| Feature | Description |
|---|---|
| **Markdown Export** | Save conversations as clean `.md` files with full formatting preserved |
| **Word Export** | Export as `.doc` with styled headings, code blocks, tables, and lists |
| **Copy to Clipboard** | Instantly copy the full conversation as formatted Markdown |
| **Thinking Blocks** | Optionally capture AI reasoning/thinking blocks when available |
| **Rich Formatting** | Preserves bold, italic, code blocks, tables, numbered lists, headings, and links |
| **HTML to Markdown** | Converts raw chat HTML into clean, readable Markdown automatically |
| **Timestamp Filenames** | Optionally include date/time in the exported filename |
| **Custom Filename Prefix** | Set your own filename prefix before downloading |
| **Privacy First** | Zero network requests — everything runs locally in your browser |
| **One-Click Export** | No configuration needed — open a chat, click the icon, done |

---

## Supported Platforms

| Platform | URL | Status |
|---|---|---|
| **GitHub Copilot** | `github.com/copilot` | Fully Supported |
| **ChatGPT** | `chatgpt.com` · `chat.openai.com` | Fully Supported |
| **Claude** | `claude.ai` | Fully Supported |
| **Outlier Playground** | `outlier.ai` · `dataannotation.tech` | Fully Supported |
| **Other AI Chat UIs** | Any page with standard chat markup | Generic Fallback |

Each supported platform has multiple fallback extraction strategies to handle DOM changes and UI updates gracefully.

---

## Installation

### Option 1 — Firefox Add-ons Store *(Recommended)*

1. Visit the [AI Chat Downloader on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-downloader-tool/)
2. Click **Add to Firefox**
3. The extension icon will appear in your toolbar

---

### Option 2 — Load as Temporary Add-on in Firefox *(Development)*

1. Clone or download the repository:
   ```bash
   git clone https://github.com/praphulln19/Ai-Chat-Exporter.git
   ```

2. Open Firefox and go to:
   ```
   about:debugging#/runtime/this-firefox
   ```

3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file from the cloned folder
5. The extension icon appears in your toolbar

> **Note:** Temporary add-ons are removed when Firefox closes. Use Option 1 for a permanent install.

---

### Option 3 — Load Unpacked in Chrome *(Development)*

1. Open Chrome and go to:
   ```
   chrome://extensions
   ```

2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the folder containing `manifest.json`
5. The extension icon appears in your toolbar

---

## Usage

1. Open any chat on a [supported platform](#supported-platforms)
2. Click the **AI Chat Downloader** icon in your toolbar
3. Configure your export options:

   | Option | Description |
   |---|---|
   | **Include Timestamp** | Appends the current date/time to the filename |
   | **Include Metadata** | Adds a header block with title, date, and message count |
   | **Include Thinking** | Captures AI reasoning/thinking blocks (Outlier) |
   | **Filename Prefix** | Set a custom name for the exported file |

4. Click your preferred export button:
   - **Download .md** — saves as a Markdown file
   - **Download .doc** — saves as a Word document
   - **Copy to Clipboard** — copies Markdown to your clipboard

---

## Example Output

### Markdown (`.md`)

```markdown
> **Title** - Model Chat
> **Date** - 2026-05-29T09:00:00.000Z
> **Messages** - 4

# Model Chat

## User

What is the capital of France?

***

## Assistant

The capital of France is **Paris**. It is located in the north-central
part of the country along the Seine River.
```

### Word (`.doc`)

The exported Word file includes:
- Calibri font, 11pt body text
- Color-accented section headings with bottom borders
- Code blocks with monospace font and a light grey background
- Tables with proper borders and cell padding
- Dark text on a white background using Word-compatible inline styles

---

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Read the currently active tab to extract chat messages — only triggers when you click the icon |
| `scripting` | Inject the extraction script into the page using Manifest V3 APIs |
| `tabs` | Identify the active tab ID for script injection |

No host permissions. No background scripts. No access to any page unless you explicitly click the extension.

---

## Privacy

| | |
|---|---|
| No data collection | Nothing is ever sent to any server |
| No analytics or tracking | Zero telemetry of any kind |
| No external network requests | All processing happens locally in your browser |
| No background scripts | The extension only runs when you click the icon |
| `activeTab` only | Can only access the page you are currently viewing |
| Fully open source | Every line of code is publicly auditable |

Your conversations never leave your machine.

---

## Project Structure

```
Ai-Chat-Exporter/
│
├── manifest.json          # Extension manifest (MV3, Firefox + Chrome)
│
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Dark-themed popup styles
│   └── popup.js           # Core logic:
│                          #   - Platform detection & message extraction
│                          #   - Scroll-and-collect for full conversation history
│                          #   - HTML to Markdown conversion
│                          #   - HTML to Word-compatible HTML conversion
│                          #   - File download & clipboard handling
│
└── icons/
    ├── icon-48.png        # Toolbar icon (48x48)
    └── icon-96.png        # High-resolution icon (96x96)
```

---

## How It Works

1. **Detection** — When you click the icon, the extension identifies which platform you are on based on the current URL.

2. **Extraction** — A content script is injected into the active tab. It scrolls through the conversation to load all messages, then extracts them using platform-specific CSS selectors with multiple fallback strategies.

3. **Normalization** — Extracted HTML is cleaned: UI buttons, icons, images, and navigation elements are stripped. Semantic tags are simplified (`<strong>` to `<b>`, `<em>` to `<i>`).

4. **Conversion** — Messages are converted to the target format:
   - **Markdown** — via a recursive DOM walker that produces standard `.md` syntax
   - **Word HTML** — via inline-styled HTML that renders reliably across all Word-compatible applications

5. **Export** — Files are assembled as Blobs in the popup context and downloaded via a temporary anchor element. No additional page injection is needed for the download step.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `No messages found on this page` | Make sure the conversation is fully loaded. Scroll through it once before clicking the extension. |
| Extension icon not showing | Go to `about:addons` (Firefox) or `chrome://extensions` (Chrome) and ensure the extension is enabled. |
| Only user messages exported | Reload the extension after updating. If the issue persists, open an issue with your platform details. |
| Word file shows raw HTML | Update to v1.3 or later — older versions used MHTML which some Word versions do not support. |
| Formatting missing in `.md` | Complex nested HTML layouts may simplify during conversion. This is expected behavior. |
| Platform not working after update | AI chat platforms update their DOM frequently. Open an issue and the selectors will be updated. |

---

## Contributing

Contributions are welcome. To get started:

```bash
git clone https://github.com/praphulln19/Ai-Chat-Exporter.git
cd Ai-Chat-Exporter
```

1. Create a feature branch: `git checkout -b feature/my-improvement`
2. Make your changes
3. Test on all supported platforms (ChatGPT, Claude, GitHub Copilot, Outlier)
4. Submit a pull request with a clear description of what changed and why

**Areas where help is appreciated:**
- Adding support for new AI chat platforms
- Keeping extraction selectors up to date as platforms change their UI
- Improving table and code block handling in Word output

For bug reports or feature requests, please [open an issue](https://github.com/praphulln19/Ai-Chat-Exporter/issues).

---

## Release Notes

### v1.6 — GitHub Copilot Support
- Added full support for **GitHub Copilot** (`github.com/copilot`)
- Fixed assistant message extraction using confirmed CSS module class names (`ChatMessage-module__ai`)
- Added Copilot-specific scroll container detection (`ChatScrollContainer-module__container`)
- Multi-tier fallback strategy for robust extraction across Copilot UI updates
- Updated extension description to reflect the new supported platform

### v1.5
- Improved Claude extraction with grouped multi-body assistant response handling
- Fixed Claude message ordering using DOM anchor sorting
- Improved ChatGPT scroll-and-collect with upward scroll to load full history

### v1.4
- Migrated to Manifest V3 for Chrome + Firefox compatibility
- Added MV3 `scripting.executeScript` injection path

### v1.3
- Fixed Word (`.doc`) export — replaced MHTML wrapper with clean inline-styled HTML
- Added UTF-8 BOM for correct encoding in Microsoft Word
- Downloads now happen in popup context (no page injection needed for download)
- Added `data_collection_permissions` for Firefox 140+ compliance
- Fixed `$1` regex replacements in inline formatting
- Added HTML to Markdown converter for rich formatting in `.md` output
- Added table support in Markdown and Word output

### v1.2
- Added Claude (`claude.ai`) support
- Added ChatGPT (`chatgpt.com`) support
- Added thinking/reasoning block capture
- Multiple extraction fallback strategies per platform

### v1.0
- Initial release
- Outlier Playground support
- Markdown and Word export
- Copy to clipboard

---

<div align="center">

Made with care for the AI community.

If this extension saves you time, consider giving it a star on [GitHub](https://github.com/praphulln19/Ai-Chat-Exporter).

</div>