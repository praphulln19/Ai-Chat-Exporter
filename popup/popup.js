document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadDocxBtn = document.getElementById('downloadDocxBtn');
  const copyBtn = document.getElementById('copyBtn');
  const status = document.getElementById('status');

  function getOptions() {
    return {
      includeTimestamp: document.getElementById('includeTimestamp').checked,
      includeMetadata: document.getElementById('includeMetadata').checked,
      includeThinking: document.getElementById('includeThinking').checked,
      filenamePrefix: document.getElementById('filenamePrefix').value || 'outlier-chat',
    };
  }

  function generateFilename(options, ext) {
    let name = options.filenamePrefix;
    if (options.includeTimestamp) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      name += `_${ts}`;
    }
    return `${name}.${ext}`;
  }

  function setStatus(msg, isError = false) {
    status.textContent = msg;
    status.style.color = isError ? '#e74c3c' : '#4ecca3';
  }

  // ============================================================
  // Extract chat from the page
  // ============================================================
  async function getMarkdown() {
    const options = getOptions();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0].id;

    const results = await browser.tabs.executeScript(tabId, {
        code: `
        (function() {
            try {
            const messages = [];
            const url = window.location.href;

            // ========================================
            // DETECT WHICH SITE WE'RE ON
            // ========================================

            // --- CHATGPT ---
            if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {

                const turns = document.querySelectorAll('[data-message-author-role]');

                turns.forEach(function(turn) {
                const role = turn.getAttribute('data-message-author-role');
                const textEl = turn.querySelector('.markdown, .whitespace-pre-wrap, [class*="message"]');
                const text = (textEl || turn).innerText.trim();

                if (text && text.length > 0) {
                    if (role === 'user') {
                    messages.push({ role: 'user', content: text });
                    } else if (role === 'assistant') {
                    messages.push({ role: 'assistant', content: text });
                    }
                }
                });

                // Fallback for ChatGPT if above didn't work
                if (messages.length === 0) {
                const articles = document.querySelectorAll('article[data-testid^="conversation-turn"]');
                articles.forEach(function(article) {
                    const userMsg = article.querySelector('[data-message-author-role="user"]');
                    const assistantMsg = article.querySelector('[data-message-author-role="assistant"]');

                    if (userMsg) {
                    const text = userMsg.innerText.trim();
                    if (text) messages.push({ role: 'user', content: text });
                    }
                    if (assistantMsg) {
                    const mdBlock = assistantMsg.querySelector('.markdown');
                    const text = (mdBlock || assistantMsg).innerText.trim();
                    if (text) messages.push({ role: 'assistant', content: text });
                    }
                });
                }
            }

            // --- CLAUDE ---
            else if (url.includes('claude.ai')) {

                const humanMsgs = document.querySelectorAll('[class*="human-turn"], [data-testid="human-turn"]');
                const aiMsgs = document.querySelectorAll('[class*="ai-turn"], [data-testid="ai-turn"]');

                // Try structured approach
                const allTurns = document.querySelectorAll('[class*="turn"]');
                allTurns.forEach(function(turn) {
                const className = (turn.className || '').toString().toLowerCase();
                const text = turn.innerText.trim();
                if (!text) return;

                if (className.includes('human')) {
                    messages.push({ role: 'user', content: text });
                } else if (className.includes('ai') || className.includes('assistant')) {
                    messages.push({ role: 'assistant', content: text });
                }
                });
            }

            // --- OUTLIER PLAYGROUND ---
            else if (url.includes('outlier.ai') || url.includes('dataannotation.tech') || url.includes('playground')) {

                const chatContainer = document.querySelector(
                'div.flex.flex-col.overflow-x-auto.overflow-y-clip.p-1.w-full.h-full'
                );
                const container = chatContainer || document.querySelector('main') || document.body;
                const responseTurns = document.querySelectorAll('[data-testid^="response-turn"]');

                if (responseTurns.length > 0) {
                const children = container.children;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    const hasResponse = child.querySelector('[data-testid^="response-turn"]');
                    const hasThinking = child.querySelector('[data-testid="thinking-process"]');

                    if (hasResponse) {
                    if (hasThinking && ${options.includeThinking}) {
                        const thinkText = hasThinking.innerText.trim();
                        if (thinkText) {
                        messages.push({ role: 'assistant-thinking', content: thinkText });
                        }
                    }
                    const respText = hasResponse.innerText.trim();
                    if (respText) {
                        messages.push({ role: 'assistant', content: respText });
                    }
                    } else {
                    const text = child.innerText.trim();
                    if (text && text.length > 1) {
                        messages.push({ role: 'user', content: text });
                    }
                    }
                }
                }
            }

            // --- GENERIC FALLBACK (any site) ---
            if (messages.length === 0) {

                // Try common patterns
                const selectors = [
                { sel: '[data-message-author-role="user"]', role: 'user' },
                { sel: '[data-message-author-role="assistant"]', role: 'assistant' },
                { sel: '[data-role="user"]', role: 'user' },
                { sel: '[data-role="assistant"]', role: 'assistant' },
                { sel: '[class*="user-message"]', role: 'user' },
                { sel: '[class*="assistant-message"]', role: 'assistant' },
                { sel: '[class*="human"]', role: 'user' },
                { sel: '[class*="bot-message"]', role: 'assistant' },
                ];

                const found = [];
                selectors.forEach(function(s) {
                document.querySelectorAll(s.sel).forEach(function(el) {
                    found.push({ el: el, role: s.role });
                });
                });

                // Sort by DOM order
                found.sort(function(a, b) {
                const pos = a.el.compareDocumentPosition(b.el);
                return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
                });

                found.forEach(function(item) {
                const text = item.el.innerText.trim();
                if (text && text.length > 0) {
                    messages.push({ role: item.role, content: text });
                }
                });
            }

            // Last resort: grab all prose blocks
            if (messages.length === 0) {
                const proseBlocks = document.querySelectorAll('.prose, .markdown, .whitespace-pre-wrap');
                proseBlocks.forEach(function(block) {
                const text = block.innerText.trim();
                if (text) {
                    messages.push({ role: 'assistant', content: text });
                }
                });
            }

            // Deduplicate
            const deduped = [];
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const last = deduped[deduped.length - 1];
                if (!last || last.content !== msg.content) {
                deduped.push(msg);
                }
            }

            return { success: true, messages: deduped };

            } catch (err) {
            return { success: false, error: err.message };
            }
        })();
        `
    });

    const result = results[0];
    if (!result || !result.success) throw new Error(result ? result.error : 'Failed to extract.');
    if (result.messages.length === 0) throw new Error('No messages found.');

    return { messages: result.messages, options };
    }
  // ============================================================
  // Convert messages to Markdown
  // ============================================================
  function toMarkdown(messages, options) {
    let md = '';

    if (options.includeMetadata) {
      md += '> **Title** - Outlier Playground Chat\n';
      md += '> **Date** - ' + new Date().toISOString() + '\n';
      md += '> **Messages** - ' + messages.length + '\n\n';
    }

    md += '# Outlier Playground Chat\n\n';

    messages.forEach((msg, i) => {
      let label = msg.role === 'user' ? '👤 User' :
                  msg.role === 'assistant' ? '🤖 Assistant' :
                  msg.role === 'assistant-thinking' ? '🧠 Thinking' :
                  '💬 ' + msg.role;

      md += '## ' + label + '\n\n';
      md += msg.content + '\n\n';
      if (i < messages.length - 1) md += '***\n\n';
    });

    return md;
  }

  // ============================================================
  // Convert messages to Word-compatible HTML
  // ============================================================
  function toWordHTML(messages, options) {
    let body = '';

    if (options.includeMetadata) {
      body += '<div class="metadata">';
      body += '<p><b>Title</b> - Outlier Playground Chat</p>';
      body += '<p><b>Date</b> - ' + new Date().toISOString() + '</p>';
      body += '<p><b>Messages</b> - ' + messages.length + '</p>';
      body += '</div>';
    }

    body += '<h1>Outlier Playground Chat</h1>';

    messages.forEach((msg, i) => {
      let label, sectionClass;

      if (msg.role === 'user') {
        label = '👤 User';
        sectionClass = 'user-section';
      } else if (msg.role === 'assistant') {
        label = '🤖 Assistant';
        sectionClass = 'assistant-section';
      } else if (msg.role === 'assistant-thinking') {
        label = '🧠 Thinking';
        sectionClass = 'thinking-section';
      } else {
        label = '💬 ' + msg.role;
        sectionClass = '';
      }

      body += '<div class="' + sectionClass + '">';
      body += '<h2>' + label + '</h2>';

      const content = escapeHTML(msg.content);
      const formatted = formatContent(content);

      if (msg.role === 'assistant-thinking') {
        body += '<div class="thinking-block">' + formatted + '</div>';
      } else {
        body += formatted;
      }

      body += '</div>';

      if (i < messages.length - 1) {
        body += '<div class="divider">&nbsp;</div>';
      }
    });

    return body;
  }

  function escapeHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatContent(text) {
    let html = '';
    const lines = text.split('\n');
    let inCode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        if (inCode) {
          html += '</code></pre>';
          inCode = false;
        } else {
          html += '<pre><code>';
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        html += line + '\n';
        continue;
      }

      if (line.startsWith('### ')) {
        html += '<h3>' + line.slice(4) + '</h3>';
      } else if (line.startsWith('## ')) {
        html += '<h3>' + line.slice(3) + '</h3>';
      } else if (line.startsWith('# ')) {
        html += '<h2>' + line.slice(2) + '</h2>';
      } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        html += '<li>' + line.trim().slice(2) + '</li>';
      } else if (/^\d+\.\s/.test(line.trim())) {
        html += '<li>' + line.trim().replace(/^\d+\.\s/, '') + '</li>';
      } else if (line.trim() === '') {
        html += '<br>';
      } else {
        let formatted = line
          .replace(/\*\*(.+?)\*\*/g, '<b>\$1</b>')
          .replace(/\*(.+?)\*/g, '<i>\$1</i>')
          .replace(/`(.+?)`/g, '<code class="inline-code">\$1</code>');
        html += '<p>' + formatted + '</p>';
      }
    }

    if (inCode) html += '</code></pre>';
    return html;
  }

  // ============================================================
  // Generate Word document - MHTML format
  // NO INDENTATION on MIME lines (critical!)
  // ============================================================
function generateWordDoc(bodyHTML) {
    // Force dark text by adding inline color to all tags in the body HTML
    const darkBodyHTML = bodyHTML
      .replace(/<p>/g, '<p style="color:#333333;">')
      .replace(/<li>/g, '<li style="color:#333333;">')
      .replace(/<h1>/g, '<h1 style="color:#1a1a2e;">')
      .replace(/<h2>/g, '<h2 style="color:#2c3e50;">')
      .replace(/<h3>/g, '<h3 style="color:#333333;">')
      .replace(/<pre>/g, '<pre style="color:#333333; background:#f4f4f4;">')
      .replace(/<code>/g, '<code style="color:#333333;">');

    const htmlContent = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<!--[if gte mso 9]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
</o:OfficeDocumentSettings>
</xml>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page WordSection1 {
  size: 8.5in 11.0in;
  margin: 1.0in 1.0in 1.0in 1.0in;
  mso-page-orientation: portrait;
}
div.WordSection1 { page: WordSection1; }
body {
  font-family: Calibri, sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #333333 !important;
  mso-themecolor: text1;
  background: white;
}
/* Force all text dark */
body, p, li, span, div, td, th {
  color: #333333 !important;
  mso-style-textfill-fill-color: #333333;
}
p {
  margin: 0in;
  margin-bottom: 6pt;
  font-family: Calibri, sans-serif;
  font-size: 11pt;
  color: #333333;
}
h1 {
  font-family: Calibri, sans-serif;
  font-size: 20pt;
  font-weight: bold;
  color: #1a1a2e !important;
  margin-top: 12pt;
  margin-bottom: 6pt;
}
h2 {
  font-family: Calibri, sans-serif;
  font-size: 16pt;
  font-weight: bold;
  color: #2c3e50 !important;
  margin-top: 12pt;
  margin-bottom: 4pt;
  border-bottom: 1pt solid #cccccc;
  padding-bottom: 4pt;
}
h3 {
  font-family: Calibri, sans-serif;
  font-size: 13pt;
  font-weight: bold;
  color: #333333 !important;
  margin-top: 10pt;
  margin-bottom: 4pt;
}
pre {
  font-family: Consolas, monospace;
  font-size: 9pt;
  background: #f4f4f4;
  border: 1pt solid #dddddd;
  padding: 8pt;
  margin: 6pt 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #333333 !important;
}
code {
  font-family: Consolas, monospace;
  font-size: 9pt;
  color: #333333 !important;
}
.inline-code {
  font-family: Consolas, monospace;
  font-size: 9pt;
  background: #f0f0f0;
  padding: 1pt 3pt;
  color: #333333 !important;
}
li {
  font-family: Calibri, sans-serif;
  font-size: 11pt;
  margin-bottom: 3pt;
  color: #333333 !important;
}
b, strong { color: #222222 !important; }
i, em { color: #333333 !important; }
.divider {
  border: none;
  border-top: 1pt solid #cccccc;
  margin: 14pt 0;
}
.metadata {
  font-size: 9pt;
  color: #666666 !important;
  border-left: 3pt solid #4ecca3;
  padding: 6pt 10pt;
  margin-bottom: 14pt;
  background: #f9f9f9;
}
.user-section h2 { color: #2c3e50 !important; border-bottom-color: #3498db; }
.assistant-section h2 { color: #0f3460 !important; border-bottom-color: #4ecca3; }
.thinking-block {
  border-left: 3pt solid #6c3483;
  padding: 6pt 10pt;
  background: #faf5ff;
  margin: 6pt 0;
  font-size: 10pt;
  color: #555555 !important;
}
table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
td, th { border: 1pt solid #dddddd; padding: 5pt 8pt; font-size: 10pt; color: #333333 !important; }
th { background: #f4f4f4; font-weight: bold; }
</style>
</head>
<body lang="EN-US" style="color:#333333; background:white;">
<div class="WordSection1" style="color:#333333;">
${darkBodyHTML}
</div>
</body>
</html>`;

    return 'MIME-Version: 1.0\r\n' +
      'Content-Type: multipart/related; boundary="----=_NextPart_boundary"\r\n' +
      '\r\n' +
      '------=_NextPart_boundary\r\n' +
      'Content-Location: file:///C:/chat.htm\r\n' +
      'Content-Type: text/html; charset="utf-8"\r\n' +
      '\r\n' +
      htmlContent + '\r\n' +
      '\r\n' +
      '------=_NextPart_boundary--\r\n';
  }

  // ============================================================
  // Trigger download inside the page
  // ============================================================
  async function downloadFile(content, filename, mimeType) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    await browser.tabs.executeScript(tabs[0].id, {
      code: `
        (function() {
          const content = ${JSON.stringify(content)};
          const filename = ${JSON.stringify(filename)};
          const mime = ${JSON.stringify(mimeType)};
          const blob = new Blob([content], { type: mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
        })();
      `
    });
  }

  // ============================================================
  // DOWNLOAD MARKDOWN
  // ============================================================
  downloadBtn.addEventListener('click', async () => {
    setStatus('Extracting...');
    try {
      const { messages, options } = await getMarkdown();
      const md = toMarkdown(messages, options);
      const filename = generateFilename(options, 'md');
      await downloadFile(md, filename, 'text/markdown;charset=utf-8');
      setStatus('✅ Downloaded ' + messages.length + ' messages as .md');
    } catch (err) {
      setStatus('❌ ' + err.message, true);
    }
  });

  // ============================================================
  // DOWNLOAD DOC
  // ============================================================
  downloadDocxBtn.addEventListener('click', async () => {
    setStatus('Extracting...');
    try {
      const { messages, options } = await getMarkdown();
      const bodyHTML = toWordHTML(messages, options);
      const fullDoc = generateWordDoc(bodyHTML);
      const filename = generateFilename(options, 'doc');

      await downloadFile(fullDoc, filename, 'application/msword');

      setStatus('✅ Downloaded ' + messages.length + ' messages as .doc');
    } catch (err) {
      setStatus('❌ ' + err.message, true);
    }
  });

  // ============================================================
  // COPY TO CLIPBOARD
  // ============================================================
  copyBtn.addEventListener('click', async () => {
    setStatus('Extracting...');
    try {
      const { messages, options } = await getMarkdown();
      const md = toMarkdown(messages, options);
      await navigator.clipboard.writeText(md);
      setStatus('✅ Copied ' + messages.length + ' messages!');
    } catch (err) {
      setStatus('❌ ' + err.message, true);
    }
  });
});