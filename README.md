<div align="center">

# 💬 AI Chat Downloader

### A Firefox + Chrome Extension to Download AI Chat Conversations

[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-downloader-tool/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.3-blue?style=for-the-badge)]()

<img src="icons/icon-96.png" alt="Logo" width="96" height="96">

**Save your AI chat conversations as Markdown (.md) or Word (.doc) files with a single click. No sign-up, no data collection, everything runs locally.**

[Installation](#-installation) •
[Features](#-features) •
[Supported Sites](#-supported-sites) •
[Usage](#-usage) •
[Privacy](#-privacy) •
[Contributing](#-contributing)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 📥 **Download as Markdown** | Save chats as clean `.md` files with proper formatting |
| 📄 **Download as Word** | Export chats as `.doc` files that open correctly in Microsoft Word, Google Docs, and LibreOffice |
| 📋 **Copy to Clipboard** | Instantly copy the entire conversation as formatted Markdown |
| 🧠 **Thinking Process** | Optionally capture AI thinking/reasoning blocks when available |
| 🎨 **Rich Formatting** | Preserves bold, italic, code blocks, tables, lists, headings, and links |
| 🔄 **HTML → Markdown** | Converts raw HTML from chat responses into clean, readable Markdown |
| 🌐 **Multi-Platform** | Works on Outlier Playground, ChatGPT, and Claude |
| 🔒 **Privacy First** | No data collected, no network requests, everything stays in your browser |
| ⚡ **One-Click Export** | No configuration needed — just click and download |

---

## 🌐 Supported Sites

| Platform | URL | Status |
|---|---|---|
| Outlier Playground | `outlier.ai` / `dataannotation.tech` | ✅ Fully Supported |
| ChatGPT | `chatgpt.com` / `chat.openai.com` | ✅ Fully Supported |
| Claude | `claude.ai` | ✅ Fully Supported |
| Other AI Chat UIs | Any site with standard chat markup | 🔄 Generic Fallback |

Each platform has **4 fallback extraction strategies** to handle DOM changes and UI updates.

---

## 📦 Installation

### Method 1: Install from Firefox Add-ons (Recommended)

1. Visit the [AI Chat Downloader page on AMO](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-saver/)
2. Click **Add to Firefox**
3. The extension icon will appear in your toolbar 🎉

### Method 2: Load as Temporary Add-on (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/praphulln19/Ai-Chat-Exporter.git
   ```

2. Open Firefox and navigate to:

   ```text
   about:debugging#/runtime/this-firefox
   ```

3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file from the cloned folder
5. The extension icon will appear in your toolbar 🎉

**Note:** Temporary add-ons are removed when you close Firefox. Use Method 1 for permanent installation.

### Method 3: Load Unpacked in Chrome (Development)

1. Open Chrome and navigate to:

   ```text
   chrome://extensions
   ```

2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the extension folder (the one containing `manifest.json`)
5. The extension icon will appear in your toolbar 🎉

---

## 🚀 Usage

1. Open any chat on a supported platform
2. Click the **AI Chat Downloader** icon in your toolbar
3. Choose your options:
   - ✅ Include timestamp in filename
   - ✅ Include metadata header
   - ✅ Include thinking process
   - 📝 Custom filename prefix
4. Click one of the three buttons:
   - 📥 **Download .md** — saves as Markdown
   - 📄 **Download .doc** — saves as Word document
   - 📋 **Copy to Clipboard** — copies formatted Markdown

---

## 📄 Example Output (Markdown)

```text
## 👤 User

What is the capital of France?

***

## 🤖 Assistant

The capital of France is **Paris**. It's located in the north-central
part of the country along the Seine River.
```

---

## 📄 Example Output (Word)

The `.doc` file opens with:

- Calibri font, 11pt body text
- Styled headings with colored borders
- Properly formatted code blocks with monospace font
- Dark text on white background (Word-compatible inline styles)

---

## 🔐 Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the current page to extract chat messages — only when you click the icon |
| `scripting` | Inject the extraction script using Manifest V3 APIs |

That's the only permission. No downloads, no host permissions, no background scripts.

---

## 🔒 Privacy

This extension takes privacy seriously:

- ❌ No data collection — nothing is sent anywhere
- ❌ No analytics or tracking — zero telemetry
- ❌ No external network requests — everything runs locally
- ❌ No background scripts — only runs when you click the icon
- ✅ `activeTab` only — can't access any page unless you explicitly click the extension
- ✅ Open source — read every line of code yourself

Your conversations stay on your machine. Period.

---

## 🧱 Project Structure

```text
ai-chat-downloader/
│
├── 📄 manifest.json          # Extension manifest (v3, Chrome + Firefox)
│
├── 📁 popup/
│   ├── 📄 popup.html         # Extension popup UI
│   ├── 📄 popup.css          # Dark-themed popup styling
│   └── 📄 popup.js           # Core logic:
│                              #   - Chat extraction (injected content script)
│                              #   - HTML → Markdown conversion
│                              #   - HTML → Word conversion
│                              #   - File download handling
│
└── 📁 icons/
    ├── 🖼️ icon-48.png        # Toolbar icon (48x48)
    └── 🖼️ icon-96.png        # High-res icon (96x96)
```

---

## 🛠️ How It Works

- **Extraction** — When you click the icon, a content script is injected into the active tab. It scans the page DOM for chat messages using platform-specific selectors with multiple fallback strategies.
- **Normalization** — Extracted HTML is cleaned up: buttons, images, and UI elements are stripped out. `<strong>` becomes `<b>`, `<em>` becomes `<i>`, etc.
- **Conversion** — Messages are converted to either:
  - **Markdown** — using a recursive DOM walker that produces clean `.md` syntax
  - **Word HTML** — using inline styles on every element for reliable rendering in Word
- **Download** — Files are created as Blobs in the popup context and downloaded via a temporary `<a>` element. No injection needed for the download step.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| "No messages found" | Make sure the chat is fully loaded. Scroll through the conversation first. |
| Extension doesn't appear | Check `about:addons` to make sure it's enabled |
| Word file shows raw HTML | Update to v1.3 — older versions used MHTML which some Word versions don't support |
| Missing formatting in `.md` | The extension converts HTML to Markdown; some complex layouts may simplify |
| ChatGPT/Claude not working | These sites update their DOM frequently. Open an issue and I'll update the selectors. |

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Test on all three platforms (Outlier, ChatGPT, Claude)
5. Submit a pull request

For bug reports or feature requests, please open an issue.
Areas where help is appreciated:

- Adding support for new AI chat platforms
- Improving extraction selectors when sites update their DOM
- Better table/code block handling in Word output

---

## 📄 License

This project is licensed under the MIT License.

---

## 📝 Release Notes

### v1.4 (Current)

- Migrated to Manifest V3 for Chrome + Firefox compatibility
- Added MV3 scripting injection path (no behavior changes)

### v1.3

- Fixed Word (.doc) export — removed MHTML wrapper, now uses clean HTML that Word reliably opens
- Added UTF-8 BOM for proper encoding in Word
- Downloads now happen in popup context (no page injection needed)
- Added `data_collection_permissions` for Firefox 140+ compliance
- Fixed `$1` regex replacements in inline formatting
- Improved ChatGPT extraction with 4 fallback strategies
- Improved Claude extraction with fieldset-based detection
- Added HTML → Markdown converter for rich formatting in `.md` output
- Added table support in both Markdown and Word output

### v1.2

- Added Claude support
- Added ChatGPT support
- Added thinking process capture
- Multiple extraction strategies per platform

### v1.0

- Initial release
- Outlier Playground support
- Markdown and Word export
- Copy to clipboard

---

Made with ❤️ for the AI community

If this extension saves you time, consider giving it a ⭐ on GitHub!