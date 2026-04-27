document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadDocBtn =
    document.getElementById('downloadDocBtn') ||
    document.getElementById('downloadDocxBtn');
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

  async function getMessages() {
    const options = getOptions();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0].id;

    const results = await browser.tabs.executeScript(tabId, {
      code: `
        (function() {
          try {
            const includeThinking = ${JSON.stringify(options.includeThinking)};
            const messages = [];
            const url = window.location.href;

            function cleanNode(node) {
              const clone = node.cloneNode(true);

              clone.querySelectorAll('button, svg, img, video, audio, canvas, iframe, textarea, input').forEach(el => el.remove());

              clone.querySelectorAll('[data-testid*="copy"], [aria-label*="Copy"], [aria-label*="copy"]').forEach(el => el.remove());

              return clone;
            }

            function normalizeHTML(node) {
              const clone = cleanNode(node);

              clone.querySelectorAll('strong').forEach(el => {
                el.outerHTML = '<b>' + el.innerHTML + '</b>';
              });

              clone.querySelectorAll('em').forEach(el => {
                el.outerHTML = '<i>' + el.innerHTML + '</i>';
              });

              clone.querySelectorAll('code').forEach(el => {
                el.innerHTML = el.innerHTML;
              });

              return clone.innerHTML;
            }

            function addMessage(role, node) {
              if (!node) return;
              const text = (node.innerText || '').trim();
              const html = normalizeHTML(node).trim();
              if (!text) return;
              messages.push({ role, content: text, html });
            }

            if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
              const turns = document.querySelectorAll('[data-message-author-role]');

              turns.forEach(turn => {
                const role = turn.getAttribute('data-message-author-role');
                const contentEl =
                  turn.querySelector('.markdown') ||
                  turn.querySelector('.whitespace-pre-wrap') ||
                  turn.querySelector('[class*="message"]') ||
                  turn;

                if (role === 'user') addMessage('user', contentEl);
                if (role === 'assistant') addMessage('assistant', contentEl);
              });
            }

            else if (url.includes('claude.ai')) {
              const allTurns = document.querySelectorAll('[class*="turn"], [data-testid="human-turn"], [data-testid="ai-turn"]');

              allTurns.forEach(turn => {
                const className = (turn.className || '').toString().toLowerCase();
                const testId = (turn.getAttribute('data-testid') || '').toLowerCase();

                if (className.includes('human') || testId.includes('human')) {
                  addMessage('user', turn);
                } else if (className.includes('ai') || className.includes('assistant') || testId.includes('ai')) {
                  addMessage('assistant', turn);
                }
              });
            }

            else if (url.includes('outlier.ai') || url.includes('dataannotation.tech') || url.includes('playground')) {
              const container =
                document.querySelector('div.flex.flex-col.overflow-x-auto.overflow-y-clip.p-1.w-full.h-full') ||
                document.querySelector('main') ||
                document.body;

              const children = Array.from(container.children);

              children.forEach(child => {
                const responseEl = child.querySelector('[data-testid^="response-turn"]');
                const thinkingEl = child.querySelector('[data-testid="thinking-process"]');

                if (responseEl) {
                  if (thinkingEl && includeThinking) {
                    addMessage('assistant-thinking', thinkingEl);
                  }
                  addMessage('assistant', responseEl);
                } else {
                  const txt = (child.innerText || '').trim();
                  if (txt.length > 1) {
                    addMessage('user', child);
                  }
                }
              });
            }

            if (messages.length === 0) {
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
              selectors.forEach(s => {
                document.querySelectorAll(s.sel).forEach(el => found.push({ el, role: s.role }));
              });

              found.sort((a, b) => {
                const pos = a.el.compareDocumentPosition(b.el);
                return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
              });

              found.forEach(item => addMessage(item.role, item.el));
            }

            if (messages.length === 0) {
              const proseBlocks = document.querySelectorAll('.prose, .markdown, .whitespace-pre-wrap');
              proseBlocks.forEach(block => addMessage('assistant', block));
            }

            const deduped = [];
            for (let i = 0; i < messages.length; i++) {
              const msg = messages[i];
              const last = deduped[deduped.length - 1];
              if (!last || !(last.content === msg.content && last.role === msg.role)) {
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
    if (!result.messages || result.messages.length === 0) throw new Error('No messages found.');

    return { messages: result.messages, options };
  }

  function toMarkdown(messages, options) {
    let md = '';

    if (options.includeMetadata) {
      md += '> **Title** - Outlier Playground Chat\n';
      md += '> **Date** - ' + new Date().toISOString() + '\n';
      md += '> **Messages** - ' + messages.length + '\n\n';
    }

    md += '# Outlier Playground Chat\n\n';

    messages.forEach((msg, i) => {
      let label = msg.role === 'user'
        ? '👤 User'
        : msg.role === 'assistant'
        ? '🤖 Assistant'
        : msg.role === 'assistant-thinking'
        ? '🧠 Thinking'
        : '💬 ' + msg.role;

      md += '## ' + label + '\n\n';
      md += msg.content + '\n\n';
      if (i < messages.length - 1) md += '***\n\n';
    });

    return md;
  }

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

      const formatted = msg.html
        ? cleanHTMLForWord(msg.html)
        : formatContent(escapeHTML(msg.content));

      if (msg.role === 'assistant-thinking') {
        body += '<div class="thinking-block">' + formatted + '</div>';
      } else {
        body += formatted;
      }

      body += '</div>';

      if (i < messages.length - 1) {
        body += '<div class="divider"></div>';
      }
    });

    return body;
  }

  function escapeHTML(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function cleanHTMLForWord(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp.querySelectorAll('script, style, button, svg, img, video, audio, canvas, iframe').forEach(el => el.remove());

    temp.querySelectorAll('strong').forEach(el => {
      el.outerHTML = '<b>' + el.innerHTML + '</b>';
    });

    temp.querySelectorAll('em').forEach(el => {
      el.outerHTML = '<i>' + el.innerHTML + '</i>';
    });

    temp.querySelectorAll('*').forEach(el => {
      el.removeAttribute('class');
      el.removeAttribute('id');
      el.removeAttribute('data-testid');
      el.removeAttribute('style');
    });

    temp.querySelectorAll('p, li, span, div, b, i, code, pre, h1, h2, h3, h4, h5').forEach(el => {
      el.setAttribute('style', 'color:#333333;');
    });

    temp.querySelectorAll('pre').forEach(pre => {
      pre.setAttribute(
        'style',
        'color:#333333;background:#f4f4f4;border:1pt solid #dddddd;padding:8pt;white-space:pre-wrap;word-wrap:break-word;'
      );
    });

    temp.querySelectorAll('code').forEach(code => {
      if (code.parentElement && code.parentElement.tagName.toLowerCase() !== 'pre') {
        code.setAttribute(
          'style',
          'font-family:Consolas,monospace;font-size:9pt;background:#f0f0f0;padding:1pt 3pt;color:#333333;'
        );
      }
    });

    temp.querySelectorAll('ul, ol').forEach(list => {
      list.setAttribute('style', 'margin:6pt 0 6pt 18pt;color:#333333;');
    });

    return temp.innerHTML;
  }

  function formatContent(text) {
    let html = '';
    const lines = text.split('\n');
    let inCode = false;
    let inUL = false;
    let inOL = false;

    function closeLists() {
      if (inUL) {
        html += '</ul>';
        inUL = false;
      }
      if (inOL) {
        html += '</ol>';
        inOL = false;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        closeLists();
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
        html += escapeHTML(line) + '\n';
        continue;
      }

      if (trimmed.startsWith('### ')) {
        closeLists();
        html += '<h3>' + inlineFormat(trimmed.slice(4)) + '</h3>';
      } else if (trimmed.startsWith('## ')) {
        closeLists();
        html += '<h2>' + inlineFormat(trimmed.slice(3)) + '</h2>';
      } else if (trimmed.startsWith('# ')) {
        closeLists();
        html += '<h1>' + inlineFormat(trimmed.slice(2)) + '</h1>';
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (inOL) {
          html += '</ol>';
          inOL = false;
        }
        if (!inUL) {
          html += '<ul>';
          inUL = true;
        }
        html += '<li>' + inlineFormat(trimmed.slice(2)) + '</li>';
      } else if (/^\\d+\\.\\s/.test(trimmed)) {
        if (inUL) {
          html += '</ul>';
          inUL = false;
        }
        if (!inOL) {
          html += '<ol>';
          inOL = true;
        }
        html += '<li>' + inlineFormat(trimmed.replace(/^\\d+\\.\\s/, '')) + '</li>';
      } else if (trimmed === '') {
        closeLists();
        html += '<br>';
      } else {
        closeLists();
        html += '<p>' + inlineFormat(trimmed) + '</p>';
      }
    }

    closeLists();
    if (inCode) html += '</code></pre>';

    return html;
  }

  function inlineFormat(text) {
    return escapeHTML(text)
      .replace(/\\*\\*(.+?)\\*\\*/g, '<b>\$1</b>')
      .replace(/\\*(.+?)\\*/g, '<i>\$1</i>')
      .replace(/`(.+?)`/g, '<code>\$1</code>');
  }

  function generateWordDoc(bodyHTML) {
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
  color: #333333;
  background: white;
}
body, p, li, span, div, td, th {
  color: #333333 !important;
}
p {
  margin: 0 0 6pt 0;
  font-family: Calibri, sans-serif;
  font-size: 11pt;
}
h1 {
  font-family: Calibri, sans-serif;
  font-size: 20pt;
  font-weight: bold;
  color: #1a1a2e !important;
  margin: 12pt 0 6pt 0;
}
h2 {
  font-family: Calibri, sans-serif;
  font-size: 16pt;
  font-weight: bold;
  color: #2c3e50 !important;
  margin: 12pt 0 4pt 0;
  border-bottom: 1pt solid #cccccc;
  padding-bottom: 4pt;
}
h3 {
  font-family: Calibri, sans-serif;
  font-size: 13pt;
  font-weight: bold;
  color: #333333 !important;
  margin: 10pt 0 4pt 0;
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
}
code {
  font-family: Consolas, monospace;
  font-size: 9pt;
}
ul, ol {
  margin: 6pt 0 6pt 18pt;
}
li {
  font-family: Calibri, sans-serif;
  font-size: 11pt;
  margin-bottom: 3pt;
}
b, strong { font-weight: bold; }
i, em { font-style: italic; }
.divider {
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
.user-section h2 { border-bottom-color: #3498db; }
.assistant-section h2 { border-bottom-color: #4ecca3; }
.thinking-block {
  border-left: 3pt solid #6c3483;
  padding: 6pt 10pt;
  background: #faf5ff;
  margin: 6pt 0;
  font-size: 10pt;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 6pt 0;
}
td, th {
  border: 1pt solid #dddddd;
  padding: 5pt 8pt;
  font-size: 10pt;
}
th {
  background: #f4f4f4;
  font-weight: bold;
}
</style>
</head>
<body lang="EN-US">
<div class="WordSection1">
${bodyHTML}
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

  downloadBtn.addEventListener('click', async () => {
    setStatus('Extracting...');
    try {
      const { messages, options } = await getMessages();
      const md = toMarkdown(messages, options);
      const filename = generateFilename(options, 'md');
      await downloadFile(md, filename, 'text/markdown;charset=utf-8');
      setStatus('✅ Downloaded ' + messages.length + ' messages as .md');
    } catch (err) {
      setStatus('❌ ' + err.message, true);
    }
  });

  if (downloadDocBtn) {
    downloadDocBtn.addEventListener('click', async () => {
      setStatus('Extracting...');
      try {
        const { messages, options } = await getMessages();
        const bodyHTML = toWordHTML(messages, options);
        const fullDoc = generateWordDoc(bodyHTML);
        const filename = generateFilename(options, 'doc');
        await downloadFile(fullDoc, filename, 'application/msword');
        setStatus('✅ Downloaded ' + messages.length + ' messages as .doc');
      } catch (err) {
        setStatus('❌ ' + err.message, true);
      }
    });
  }

  copyBtn.addEventListener('click', async () => {
    setStatus('Extracting...');
    try {
      const { messages, options } = await getMessages();
      const md = toMarkdown(messages, options);
      await navigator.clipboard.writeText(md);
      setStatus('✅ Copied ' + messages.length + ' messages!');
    } catch (err) {
      setStatus('❌ ' + err.message, true);
    }
  });
});