<div align="center">

# 💬 GPT Chat Downloader

### A Firefox Extension to Download AI Chat Conversations

[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/firefox/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0-blue?style=for-the-badge)]()

<img src="icons/icon-96.png" alt="Logo" width="96" height="96">

**Download your AI chat conversations as Markdown (.md) or Word (.docx) files with one click.**

[Installation](#-installation) •
[Features](#-features) •
[Supported Sites](#-supported-sites) •
[Usage](#-usage) •
[Contributing](#-contributing)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 📥 **Download as Markdown** | Save chats as clean `.md` files |
| 📄 **Download as Word** | Export chats as `.docx` files with proper formatting |
| 📋 **Copy to Clipboard** | Instantly copy the entire conversation |
| 🧠 **Thinking Process** | Captures AI thinking/reasoning blocks |
| 🎨 **Formatted Output** | Preserves code blocks, headers, lists, and styling |
| 🌐 **Multi-Site Support** | Works on multiple AI chat platforms |
| ⚡ **One-Click Export** | No configuration needed — just click and download |

---

## 🌐 Supported Sites

| Platform | Status |
|---|---|
| [Outlier Playground](https://playground.outlier.ai) | ✅ Fully Supported |
| [ChatGPT](https://chatgpt.com) | ✅ Supported |
| [Claude](https://claude.ai) | ✅ Supported |
| Other AI Chat UIs | 🔄 Generic Fallback |

---

## 📦 Installation

### Method 1: Load as Temporary Add-on (Development)

1. Clone this repository:
    ```bash
    git clone https://github.com/praphulln19/Ai-Chat-Exporter.git
    ```
2. Open Firefox and navigate to:

    `about:debugging#/runtime/this-firefox`

3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file from the cloned folder.
5. The extension icon will appear in your toolbar. 🎉

### Method 2: Load Unpacked (Chromium)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

---

## 🚀 Usage

1. Open a supported chat page.
2. Click the extension icon.
3. Choose options (metadata, timestamp, thinking, filename prefix).
4. Click **Download .md**, **Download .docx**, or **Copy to Clipboard**.

---

## 🔐 Permissions

- `activeTab`: read the current page to extract chat messages.
- `downloads`: save exported files.

---

## 🧱 Project Structure

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

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you’d like to change.

---

## 📄 License

This project is licensed under the MIT License. See `LICENSE` for details.

---

## 📝 Notes

- The `.docx` export is generated as Word-compatible HTML/MHTML and should open in Word/LibreOffice.
- Extraction depends on page structure; if a site changes its DOM, fallback extraction may be used.
