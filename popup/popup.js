document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadDocBtn =
    document.getElementById('downloadDocBtn') ||
    document.getElementById('downloadDocxBtn');
  const copyBtn = document.getElementById('copyBtn');
  const status = document.getElementById('status');
  const filenamePrefixInput = document.getElementById('filenamePrefix');

  if (filenamePrefixInput) {
    filenamePrefixInput.value = 'Model chat';
  }

  function getOptions() {
    return {
      includeTimestamp: document.getElementById('includeTimestamp').checked,
      includeMetadata: document.getElementById('includeMetadata').checked,
      includeThinking: document.getElementById('includeThinking').checked,
      filenamePrefix:
        document.getElementById('filenamePrefix').value || 'Model chat',
    };
  }

  function generateFilename(options, ext) {
    let name = options.filenamePrefix || 'Model chat';
    if (options.includeTimestamp) {
      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      name += '_' + ts;
    }
    return name + '.' + ext;
  }

  function setStatus(msg, isError) {
    status.textContent = msg;
    status.style.color = isError ? '#e74c3c' : '#4ecca3';
  }

  // ==========================================================
  // Extract messages from the active tab
  // ==========================================================
  async function getMessages() {
    const options = getOptions();
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tabId = tabs[0].id;

    const results = await browser.tabs.executeScript(tabId, {
      code: `
(async function () {
  try {
    var includeThinking = ${JSON.stringify(options.includeThinking)};
    var url = window.location.href;
    var messages = [];

    function wait(ms) {
      return new Promise(function (r) { setTimeout(r, ms); });
    }

    function isVisible(el) {
      if (!el) return false;
      var s = window.getComputedStyle(el);
      var t = (el.innerText || '').trim();
      return s && s.display !== 'none' && s.visibility !== 'hidden' && t.length > 0;
    }

    function cleanNode(node) {
      var clone = node.cloneNode(true);
      clone.querySelectorAll(
        'button, svg, img, video, audio, canvas, iframe, textarea, input, nav, header, footer'
      ).forEach(function (el) { el.remove(); });
      return clone;
    }

    function normalizeHTML(node) {
      var clone = cleanNode(node);
      clone.querySelectorAll('strong').forEach(function (el) {
        el.outerHTML = '<b>' + el.innerHTML + '</b>';
      });
      clone.querySelectorAll('em').forEach(function (el) {
        el.outerHTML = '<i>' + el.innerHTML + '</i>';
      });
      return clone.innerHTML;
    }

    function addMsg(role, node) {
      if (!node || !isVisible(node)) return;
      var text = (node.innerText || '').trim();
      var html = normalizeHTML(node).trim();
      if (!text || text.length < 1) return;
      messages.push({ role: role, content: text, html: html });
    }

    function dedupe(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var prev = out[out.length - 1];
        if (!prev || !(prev.role === list[i].role && prev.content === list[i].content)) {
          out.push(list[i]);
        }
      }
      return out;
    }

    function domOrder(a, b) {
      if (a === b) return 0;
      var pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    }

    await wait(800);

    /* =====================================================
       CHATGPT  (chatgpt.com / chat.openai.com)
       ===================================================== */
    if (url.indexOf('chatgpt.com') !== -1 || url.indexOf('chat.openai.com') !== -1) {

      /* Strategy 1: conversation-turn articles */
      var turnArticles = document.querySelectorAll(
        'article[data-testid^="conversation-turn"]'
      );

      if (turnArticles.length > 0) {
        Array.from(turnArticles).sort(function (a, b) { return domOrder(a, b); })
          .forEach(function (article) {
            var userNode = article.querySelector('[data-message-author-role="user"]');
            var assistantNode = article.querySelector('[data-message-author-role="assistant"]');

            if (userNode) {
              var uc = userNode.querySelector('.whitespace-pre-wrap')
                    || userNode.querySelector('[class*="whitespace"]')
                    || userNode;
              addMsg('user', uc);
            }
            if (assistantNode) {
              var ac = assistantNode.querySelector('.markdown')
                    || assistantNode.querySelector('[class*="markdown"]')
                    || assistantNode.querySelector('[class*="prose"]')
                    || assistantNode.querySelector('.whitespace-pre-wrap')
                    || assistantNode;
              addMsg('assistant', ac);
            }
          });
      }

      /* Strategy 2: data-message-author-role nodes */
      if (messages.length === 0) {
        var roleNodes = Array.from(
          document.querySelectorAll('[data-message-author-role]')
        ).sort(domOrder);

        roleNodes.forEach(function (node) {
          var role = node.getAttribute('data-message-author-role');
          var content =
            node.querySelector('.markdown') ||
            node.querySelector('[class*="markdown"]') ||
            node.querySelector('.whitespace-pre-wrap') ||
            node.querySelector('[class*="prose"]') ||
            node;

          if (role === 'user') addMsg('user', content);
          else if (role === 'assistant') addMsg('assistant', content);
        });
      }

      /* Strategy 3: group selector on main */
      if (messages.length === 0) {
        var groups = document.querySelectorAll('main [class*="group"]');
        Array.from(groups).sort(domOrder).forEach(function (g) {
          var u = g.querySelector('[data-message-author-role="user"]');
          var a = g.querySelector('[data-message-author-role="assistant"]');
          if (u) {
            var uc2 = u.querySelector('.whitespace-pre-wrap') || u;
            addMsg('user', uc2);
          }
          if (a) {
            var ac2 = a.querySelector('.markdown') || a.querySelector('.whitespace-pre-wrap') || a;
            addMsg('assistant', ac2);
          }
        });
      }

      /* Strategy 4: thread container children */
      if (messages.length === 0) {
        var threadContainer =
          document.querySelector('[class*="thread"]') ||
          document.querySelector('main [role="presentation"]') ||
          document.querySelector('main');

        if (threadContainer) {
          var kids = Array.from(threadContainer.children);
          kids.forEach(function (child) {
            var u2 = child.querySelector('[data-message-author-role="user"]');
            var a2 = child.querySelector('[data-message-author-role="assistant"]');
            if (u2) {
              addMsg('user', u2.querySelector('.whitespace-pre-wrap') || u2);
            }
            if (a2) {
              addMsg('assistant', a2.querySelector('.markdown') || a2);
            }
          });
        }
      }
    }

    /* =====================================================
       CLAUDE  (claude.ai)
       ===================================================== */
    else if (url.indexOf('claude.ai') !== -1) {

      /* Strategy 1: fieldset-based turns (current Claude UI) */
      var fieldsets = Array.from(
        document.querySelectorAll('fieldset')
      ).sort(domOrder);

      fieldsets.forEach(function (fs) {
        var legend = fs.querySelector('legend');
        if (!legend) return;
        var legendText = (legend.innerText || legend.textContent || '').toLowerCase().trim();

        var contentEl =
          fs.querySelector('[class*="prose"]') ||
          fs.querySelector('[class*="markdown"]') ||
          fs.querySelector('[class*="grid"]') ||
          fs;

        if (legendText.indexOf('you') !== -1 || legendText.indexOf('human') !== -1 || legendText.indexOf('user') !== -1) {
          addMsg('user', contentEl);
        } else if (legendText.indexOf('claude') !== -1 || legendText.indexOf('assistant') !== -1) {
          addMsg('assistant', contentEl);
        }
      });

      /* Strategy 2: data-testid based */
      if (messages.length === 0) {
        var claudeSelectors = [
          { sel: '[data-testid="human-turn"]', role: 'user' },
          { sel: '[data-testid="ai-turn"]', role: 'assistant' },
          { sel: '[data-testid*="human"]', role: 'user' },
          { sel: '[data-testid*="ai"]', role: 'assistant' },
          { sel: '[data-testid*="user"]', role: 'user' },
          { sel: '[data-testid*="assistant"]', role: 'assistant' }
        ];

        var candidates = [];
        claudeSelectors.forEach(function (group) {
          document.querySelectorAll(group.sel).forEach(function (el) {
            if (isVisible(el)) candidates.push({ el: el, role: group.role });
          });
        });

        var filtered2 = candidates.filter(function (c, idx) {
          return !candidates.some(function (other, oidx) {
            return oidx !== idx && other.el !== c.el && other.el.contains(c.el);
          });
        });

        filtered2.sort(function (a, b) { return domOrder(a.el, b.el); });
        filtered2.forEach(function (item) {
          var contentEl =
            item.el.querySelector('[class*="prose"]') ||
            item.el.querySelector('[class*="markdown"]') ||
            item.el.querySelector('[class*="font-claude"]') ||
            item.el;
          addMsg(item.role, contentEl);
        });
      }

      /* Strategy 3: class name scanning */
      if (messages.length === 0) {
        var allDivs = Array.from(document.querySelectorAll('div[class], section[class]'));
        var turnDivs = allDivs.filter(function (el) {
          var cls = (el.className || '').toString().toLowerCase();
          return (
            cls.indexOf('human') !== -1 ||
            cls.indexOf('user') !== -1 ||
            cls.indexOf('assistant') !== -1 ||
            cls.indexOf('response') !== -1
          );
        });

        turnDivs.sort(domOrder);
        turnDivs.forEach(function (el) {
          var cls = (el.className || '').toString().toLowerCase();
          var role = null;
          if (cls.indexOf('human') !== -1 || cls.indexOf('user') !== -1) role = 'user';
          else if (cls.indexOf('assistant') !== -1 || cls.indexOf('response') !== -1) role = 'assistant';

          if (role) {
            var contentEl =
              el.querySelector('[class*="prose"]') ||
              el.querySelector('[class*="markdown"]') ||
              el;
            addMsg(role, contentEl);
          }
        });
      }

      /* Strategy 4: alternating children of main */
      if (messages.length === 0) {
        var mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
        if (mainEl) {
          var conversationContainer = mainEl.querySelector('[class*="conversation"]')
            || mainEl.querySelector('[class*="chat"]')
            || mainEl;

          var childDivs = Array.from(conversationContainer.children).filter(function (c) {
            return c.tagName === 'DIV' && isVisible(c);
          });

          childDivs.forEach(function (div, idx) {
            var guessRole = idx % 2 === 0 ? 'user' : 'assistant';
            var innerCls = (div.className || '').toString().toLowerCase();

            if (innerCls.indexOf('human') !== -1 || innerCls.indexOf('user') !== -1) guessRole = 'user';
            if (innerCls.indexOf('assistant') !== -1 || innerCls.indexOf('claude') !== -1) guessRole = 'assistant';

            var innerText = (div.innerText || '').trim();
            if (innerText.length > 1) {
              var contentEl =
                div.querySelector('[class*="prose"]') ||
                div.querySelector('[class*="markdown"]') ||
                div;
              addMsg(guessRole, contentEl);
            }
          });
        }
      }
    }

    /* =====================================================
       OUTLIER / PLAYGROUND
       ===================================================== */
    else if (
      url.indexOf('outlier.ai') !== -1 ||
      url.indexOf('dataannotation.tech') !== -1 ||
      url.indexOf('playground') !== -1
    ) {
      var container =
        document.querySelector(
          'div.flex.flex-col.overflow-x-auto.overflow-y-clip.p-1.w-full.h-full'
        ) ||
        document.querySelector('main') ||
        document.body;

      var containerChildren = Array.from(container.children);

      containerChildren.forEach(function (child) {
        var responseEl = child.querySelector('[data-testid^="response-turn"]');
        var thinkingEl = child.querySelector('[data-testid="thinking-process"]');

        if (responseEl) {
          if (thinkingEl && includeThinking) {
            addMsg('assistant-thinking', thinkingEl);
          }
          addMsg('assistant', responseEl);
        } else {
          var txt = (child.innerText || '').trim();
          if (txt.length > 1) {
            addMsg('user', child);
          }
        }
      });
    }

    /* =====================================================
       GENERIC FALLBACK
       ===================================================== */
    if (messages.length === 0) {
      var fallbackSelectors = [
        { sel: '[data-message-author-role="user"]', role: 'user' },
        { sel: '[data-message-author-role="assistant"]', role: 'assistant' },
        { sel: '[data-role="user"]', role: 'user' },
        { sel: '[data-role="assistant"]', role: 'assistant' },
        { sel: '[class*="user-message"]', role: 'user' },
        { sel: '[class*="assistant-message"]', role: 'assistant' },
        { sel: '[class*="human"]', role: 'user' },
        { sel: '[class*="bot-message"]', role: 'assistant' },
        { sel: '[class*="ai-message"]', role: 'assistant' }
      ];

      var fallbackFound = [];
      fallbackSelectors.forEach(function (s) {
        document.querySelectorAll(s.sel).forEach(function (el) {
          if (isVisible(el)) fallbackFound.push({ el: el, role: s.role });
        });
      });

      fallbackFound.sort(function (a, b) { return domOrder(a.el, b.el); });
      fallbackFound.forEach(function (item) { addMsg(item.role, item.el); });
    }

    if (messages.length === 0) {
      var proseBlocks = document.querySelectorAll('.prose, .markdown, .whitespace-pre-wrap');
      proseBlocks.forEach(function (block) { addMsg('assistant', block); });
    }

    return { success: true, messages: dedupe(messages) };
  } catch (err) {
    return { success: false, error: err.message + ' | ' + err.stack };
  }
})();
      `,
    });

    const result = results[0];
    if (!result || !result.success) {
      throw new Error(result ? result.error : 'Failed to extract.');
    }
    if (!result.messages || result.messages.length === 0) {
      throw new Error('No messages found on this page.');
    }

    return { messages: result.messages, options };
  }

  // ==========================================================
  // HTML to Markdown converter
  // ==========================================================
  function htmlToMarkdown(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp
      .querySelectorAll(
        'button, svg, img, video, audio, canvas, iframe, script, style'
      )
      .forEach((el) => el.remove());

    function walk(node) {
      let result = '';

      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          result += child.textContent;
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = child.tagName.toLowerCase();

        if (tag === 'br') {
          result += '\n';
        } else if (tag === 'b' || tag === 'strong') {
          const inner = walk(child).trim();
          if (inner) result += '**' + inner + '**';
        } else if (tag === 'i' || tag === 'em') {
          const inner = walk(child).trim();
          if (inner) result += '*' + inner + '*';
        } else if (tag === 'code') {
          if (
            child.parentElement &&
            child.parentElement.tagName.toLowerCase() === 'pre'
          ) {
            result += child.textContent;
          } else {
            result += '`' + child.textContent + '`';
          }
        } else if (tag === 'pre') {
          const codeEl = child.querySelector('code');
          const codeText = codeEl ? codeEl.textContent : child.textContent;
          result += '\n```\n' + codeText.trim() + '\n```\n';
        } else if (tag === 'h1') {
          result += '\n# ' + walk(child).trim() + '\n\n';
        } else if (tag === 'h2') {
          result += '\n## ' + walk(child).trim() + '\n\n';
        } else if (tag === 'h3') {
          result += '\n### ' + walk(child).trim() + '\n\n';
        } else if (tag === 'h4') {
          result += '\n#### ' + walk(child).trim() + '\n\n';
        } else if (tag === 'h5') {
          result += '\n##### ' + walk(child).trim() + '\n\n';
        } else if (tag === 'li') {
          const parent = child.parentElement;
          if (parent && parent.tagName.toLowerCase() === 'ol') {
            const index =
              Array.from(parent.children).indexOf(child) + 1;
            result += index + '. ' + walk(child).trim() + '\n';
          } else {
            result += '- ' + walk(child).trim() + '\n';
          }
        } else if (tag === 'ul' || tag === 'ol') {
          result += '\n' + walk(child) + '\n';
        } else if (tag === 'p') {
          result += walk(child).trim() + '\n\n';
        } else if (tag === 'blockquote') {
          const inner = walk(child).trim();
          result +=
            inner
              .split('\n')
              .map((l) => '> ' + l)
              .join('\n') + '\n\n';
        } else if (tag === 'table') {
          result += '\n' + tableToMarkdown(child) + '\n';
        } else if (tag === 'a') {
          const href = child.getAttribute('href') || '';
          const inner = walk(child).trim();
          if (href && inner) {
            result += '[' + inner + '](' + href + ')';
          } else {
            result += inner;
          }
        } else {
          result += walk(child);
        }
      }

      return result;
    }

    function tableToMarkdown(table) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      let md = '';
      rows.forEach((row, rowIdx) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const cellTexts = cells.map((c) =>
          (c.innerText || '').trim().replace(/\|/g, '\\|')
        );
        md += '| ' + cellTexts.join(' | ') + ' |\n';

        if (rowIdx === 0) {
          md += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
        }
      });

      return md;
    }

    let result = walk(temp);
    result = result.replace(/\n{3,}/g, '\n\n').trim();
    return result;
  }

  // ==========================================================
  // Markdown output
  // ==========================================================
  function toMarkdown(messages, options) {
    let md = '';

    if (options.includeMetadata) {
      md += '> **Title** - Model Chat\n';
      md += '> **Date** - ' + new Date().toISOString() + '\n';
      md += '> **Messages** - ' + messages.length + '\n\n';
    }

    md += '# Model Chat\n\n';

    messages.forEach((msg, i) => {
      const label =
        msg.role === 'user'
          ? '👤 User'
          : msg.role === 'assistant'
          ? '🤖 Assistant'
          : msg.role === 'assistant-thinking'
          ? '🧠 Thinking'
          : '💬 ' + msg.role;

      md += '## ' + label + '\n\n';

      if (msg.html && msg.role !== 'user') {
        md += htmlToMarkdown(msg.html) + '\n\n';
      } else {
        md += msg.content + '\n\n';
      }

      if (i < messages.length - 1) {
        md += '***\n\n';
      }
    });

    return md;
  }

  // ==========================================================
  // Word HTML output
  // ==========================================================
  function escapeHTML(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function cleanHTMLForWord(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp
      .querySelectorAll(
        'script, style, button, svg, img, video, audio, canvas, iframe'
      )
      .forEach((el) => el.remove());

    temp.querySelectorAll('strong').forEach((el) => {
      el.outerHTML = '<b>' + el.innerHTML + '</b>';
    });

    temp.querySelectorAll('em').forEach((el) => {
      el.outerHTML = '<i>' + el.innerHTML + '</i>';
    });

    temp.querySelectorAll('*').forEach((el) => {
      el.removeAttribute('class');
      el.removeAttribute('id');
      el.removeAttribute('data-testid');
      el.removeAttribute('style');
      el.removeAttribute('dir');
    });

    temp
      .querySelectorAll(
        'p, li, span, div, b, i, code, pre, h1, h2, h3, h4, h5'
      )
      .forEach((el) => {
        el.setAttribute('style', 'color:#333333;');
      });

    temp.querySelectorAll('pre').forEach((pre) => {
      pre.setAttribute(
        'style',
        'color:#333333;background:#f4f4f4;border:1pt solid #dddddd;padding:8pt;white-space:pre-wrap;word-wrap:break-word;font-family:Consolas,monospace;font-size:9pt;'
      );
    });

    temp.querySelectorAll('code').forEach((code) => {
      if (
        code.parentElement &&
        code.parentElement.tagName.toLowerCase() !== 'pre'
      ) {
        code.setAttribute(
          'style',
          'font-family:Consolas,monospace;font-size:9pt;background:#f0f0f0;padding:1pt 3pt;color:#333333;'
        );
      }
    });

    temp.querySelectorAll('ul, ol').forEach((list) => {
      list.setAttribute('style', 'margin:6pt 0 6pt 18pt;color:#333333;');
    });

    temp.querySelectorAll('table').forEach((table) => {
      table.setAttribute(
        'style',
        'border-collapse:collapse;width:100%;margin:6pt 0;'
      );
    });

    temp.querySelectorAll('td, th').forEach((cell) => {
      cell.setAttribute(
        'style',
        'border:1pt solid #dddddd;padding:5pt 8pt;font-size:10pt;color:#333333;'
      );
    });

    return temp.innerHTML;
  }

  function inlineFormat(text) {
    return escapeHTML(text)
      .replace(/\*\*(.+?)\*\*/g, '<b>\$1</b>')
      .replace(/\*(.+?)\*/g, '<i>\$1</i>')
      .replace(
        /`(.+?)`/g,
        '<code style="font-family:Consolas,monospace;font-size:9pt;background:#f0f0f0;padding:1pt 3pt;color:#333333;">\$1</code>'
      );
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
          html +=
            '<pre style="color:#333333;background:#f4f4f4;border:1pt solid #dddddd;padding:8pt;white-space:pre-wrap;font-family:Consolas,monospace;font-size:9pt;"><code style="color:#333333;">';
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
        html +=
          '<h3 style="color:#333333;">' +
          inlineFormat(trimmed.slice(4)) +
          '</h3>';
      } else if (trimmed.startsWith('## ')) {
        closeLists();
        html +=
          '<h2 style="color:#2c3e50;">' +
          inlineFormat(trimmed.slice(3)) +
          '</h2>';
      } else if (trimmed.startsWith('# ')) {
        closeLists();
        html +=
          '<h1 style="color:#1a1a2e;">' +
          inlineFormat(trimmed.slice(2)) +
          '</h1>';
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (inOL) {
          html += '</ol>';
          inOL = false;
        }
        if (!inUL) {
          html += '<ul style="margin:6pt 0 6pt 18pt;color:#333333;">';
          inUL = true;
        }
        html +=
          '<li style="color:#333333;">' +
          inlineFormat(trimmed.slice(2)) +
          '</li>';
      } else if (/^\d+\.\s/.test(trimmed)) {
        if (inUL) {
          html += '</ul>';
          inUL = false;
        }
        if (!inOL) {
          html += '<ol style="margin:6pt 0 6pt 18pt;color:#333333;">';
          inOL = true;
        }
        html +=
          '<li style="color:#333333;">' +
          inlineFormat(trimmed.replace(/^\d+\.\s/, '')) +
          '</li>';
      } else if (trimmed === '') {
        closeLists();
        html += '<br>';
      } else {
        closeLists();
        html +=
          '<p style="color:#333333;">' + inlineFormat(trimmed) + '</p>';
      }
    }

    closeLists();
    if (inCode) html += '</code></pre>';
    return html;
  }

  function toWordHTML(messages, options) {
    let body = '';

    if (options.includeMetadata) {
      body += '<div class="metadata">';
      body +=
        '<p style="color:#666666;"><b>Title</b> - Model Chat</p>';
      body +=
        '<p style="color:#666666;"><b>Date</b> - ' +
        new Date().toISOString() +
        '</p>';
      body +=
        '<p style="color:#666666;"><b>Messages</b> - ' +
        messages.length +
        '</p>';
      body += '</div>';
    }

    body += '<h1 style="color:#1a1a2e;">Model Chat</h1>';

    messages.forEach((msg, i) => {
      let label = '💬 ' + msg.role;
      let sectionClass = '';

      if (msg.role === 'user') {
        label = '👤 User';
        sectionClass = 'user-section';
      } else if (msg.role === 'assistant') {
        label = '🤖 Assistant';
        sectionClass = 'assistant-section';
      } else if (msg.role === 'assistant-thinking') {
        label = '🧠 Thinking';
        sectionClass = 'thinking-section';
      }

      body += '<div class="' + sectionClass + '">';
      body += '<h2 style="color:#2c3e50;">' + label + '</h2>';

      const formatted = msg.html
        ? cleanHTMLForWord(msg.html)
        : formatContent(escapeHTML(msg.content));

      if (msg.role === 'assistant-thinking') {
        body +=
          '<div class="thinking-block">' + formatted + '</div>';
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

  // ==========================================================
  // Generate Word document (MHTML)
  // ==========================================================
  function generateWordDoc(bodyHTML) {
    const htmlContent =
      `<html xmlns:v="urn:schemas-microsoft-com:vml"
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
p { margin: 0 0 6pt 0; font-size: 11pt; }
h1 { font-size: 20pt; font-weight: bold; color: #1a1a2e !important; margin: 12pt 0 6pt 0; }
h2 { font-size: 16pt; font-weight: bold; color: #2c3e50 !important; margin: 12pt 0 4pt 0; border-bottom: 1pt solid #cccccc; padding-bottom: 4pt; }
h3 { font-size: 13pt; font-weight: bold; color: #333333 !important; margin: 10pt 0 4pt 0; }
pre { font-family: Consolas, monospace; font-size: 9pt; background: #f4f4f4; border: 1pt solid #dddddd; padding: 8pt; margin: 6pt 0; white-space: pre-wrap; word-wrap: break-word; color: #333333 !important; }
code { font-family: Consolas, monospace; font-size: 9pt; color: #333333 !important; }
ul, ol { margin: 6pt 0 6pt 18pt; }
li { font-size: 11pt; margin-bottom: 3pt; color: #333333 !important; }
b, strong { font-weight: bold; color: #222222 !important; }
i, em { font-style: italic; color: #333333 !important; }
.divider { border-top: 1pt solid #cccccc; margin: 14pt 0; }
.metadata { font-size: 9pt; color: #666666 !important; border-left: 3pt solid #4ecca3; padding: 6pt 10pt; margin-bottom: 14pt; background: #f9f9f9; }
.user-section h2 { border-bottom-color: #3498db; }
.assistant-section h2 { border-bottom-color: #4ecca3; }
.thinking-block { border-left: 3pt solid #6c3483; padding: 6pt 10pt; background: #faf5ff; margin: 6pt 0; font-size: 10pt; color: #555555 !important; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
td, th { border: 1pt solid #dddddd; padding: 5pt 8pt; font-size: 10pt; color: #333333 !important; }
th { background: #f4f4f4; font-weight: bold; }
a { color: #2980b9 !important; text-decoration: underline; }
</style>
</head>
<body lang="EN-US" style="color:#333333;background:white;">
<div class="WordSection1" style="color:#333333;">
` +
      bodyHTML +
      `
</div>
</body>
</html>`;

    return (
      'MIME-Version: 1.0\r\n' +
      'Content-Type: multipart/related; boundary="----=_NextPart_boundary"\r\n' +
      '\r\n' +
      '------=_NextPart_boundary\r\n' +
      'Content-Location: file:///C:/chat.htm\r\n' +
      'Content-Type: text/html; charset="utf-8"\r\n' +
      '\r\n' +
      htmlContent +
      '\r\n' +
      '\r\n' +
      '------=_NextPart_boundary--\r\n'
    );
  }

  // ==========================================================
  // Download helper
  // ==========================================================
  async function downloadFile(content, filename, mimeType) {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    await browser.tabs.executeScript(tabs[0].id, {
      code: `
        (function() {
          var content = ${JSON.stringify(content)};
          var filename = ${JSON.stringify(filename)};
          var mime = ${JSON.stringify(mimeType)};
          var blob = new Blob([content], { type: mime });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
        })();
      `,
    });
  }

  // ==========================================================
  // Button handlers
  // ==========================================================
  downloadBtn.addEventListener('click', async () => {
    setStatus('Extracting...');
    try {
      const { messages, options } = await getMessages();
      const md = toMarkdown(messages, options);
      const filename = generateFilename(options, 'md');
      await downloadFile(md, filename, 'text/markdown;charset=utf-8');
      setStatus(
        '✅ Downloaded ' + messages.length + ' messages as .md'
      );
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
        setStatus(
          '✅ Downloaded ' + messages.length + ' messages as .doc'
        );
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