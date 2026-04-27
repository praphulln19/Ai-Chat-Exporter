document.addEventListener('DOMContentLoaded', function () {
  "use strict";

  var downloadBtn = document.getElementById('downloadBtn');
  var downloadDocBtn =
    document.getElementById('downloadDocBtn') ||
    document.getElementById('downloadDocxBtn');
  var copyBtn = document.getElementById('copyBtn');
  var statusEl = document.getElementById('status');
  var filenamePrefixInput = document.getElementById('filenamePrefix');

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
    var name = options.filenamePrefix || 'Model chat';
    if (options.includeTimestamp) {
      var ts = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      name += '_' + ts;
    }
    return name + '.' + ext;
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#e74c3c' : '#4ecca3';
  }

  // ==========================================================
  // Extract messages from the active tab
  // ==========================================================
  function getMessages() {
    var options = getOptions();

    return browser.tabs
      .query({ active: true, currentWindow: true })
      .then(function (tabs) {
        var tabId = tabs[0].id;

        return browser.tabs.executeScript(tabId, {
          code: '(' + extractionScript.toString() + ')(' + JSON.stringify(options.includeThinking) + ')'
        });
      })
      .then(function (results) {
        var result = results[0];
        if (!result || !result.success) {
          throw new Error(result ? result.error : 'Failed to extract.');
        }
        if (!result.messages || result.messages.length === 0) {
          throw new Error('No messages found on this page.');
        }
        return { messages: result.messages, options: options };
      });
  }

  // ==========================================================
  // Content extraction function (injected into page)
  // ==========================================================
  function extractionScript(includeThinking) {
    try {
      var url = window.location.href;
      var messages = [];

      function isVisible(el) {
        if (!el) return false;
        var s = window.getComputedStyle(el);
        var t = (el.innerText || '').trim();
        return s && s.display !== 'none' && s.visibility !== 'hidden' && t.length > 0;
      }

      function cleanNode(node) {
        var clone = node.cloneNode(true);
        var junk = clone.querySelectorAll(
          'button, svg, img, video, audio, canvas, iframe, textarea, input, nav, header, footer'
        );
        for (var i = 0; i < junk.length; i++) {
          junk[i].remove();
        }
        return clone;
      }

      function replaceTag(el, tagName) {
        var replacement = el.ownerDocument.createElement(tagName);
        while (el.firstChild) {
          replacement.appendChild(el.firstChild);
        }
        if (el.parentNode) {
          el.parentNode.replaceChild(replacement, el);
        }
      }

      function normalizeHTML(node) {
        var clone = cleanNode(node);
        var strongs = clone.querySelectorAll('strong');
        for (var i = 0; i < strongs.length; i++) {
          replaceTag(strongs[i], 'b');
        }
        var ems = clone.querySelectorAll('em');
        for (var j = 0; j < ems.length; j++) {
          replaceTag(ems[j], 'i');
        }
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

      function sortEls(els) {
        return Array.from(els).sort(domOrder);
      }

      // =====================================================
      // CHATGPT
      // =====================================================
      if (url.indexOf('chatgpt.com') !== -1 || url.indexOf('chat.openai.com') !== -1) {

        var turnArticles = document.querySelectorAll('article[data-testid^="conversation-turn"]');

        if (turnArticles.length > 0) {
          sortEls(turnArticles).forEach(function (article) {
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

        if (messages.length === 0) {
          var roleNodes = sortEls(document.querySelectorAll('[data-message-author-role]'));
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

        if (messages.length === 0) {
          var groups = document.querySelectorAll('main [class*="group"]');
          sortEls(groups).forEach(function (g) {
            var u = g.querySelector('[data-message-author-role="user"]');
            var a = g.querySelector('[data-message-author-role="assistant"]');
            if (u) addMsg('user', u.querySelector('.whitespace-pre-wrap') || u);
            if (a) addMsg('assistant', a.querySelector('.markdown') || a.querySelector('.whitespace-pre-wrap') || a);
          });
        }

        if (messages.length === 0) {
          var threadContainer =
            document.querySelector('[class*="thread"]') ||
            document.querySelector('main [role="presentation"]') ||
            document.querySelector('main');

          if (threadContainer) {
            Array.from(threadContainer.children).forEach(function (child) {
              var u2 = child.querySelector('[data-message-author-role="user"]');
              var a2 = child.querySelector('[data-message-author-role="assistant"]');
              if (u2) addMsg('user', u2.querySelector('.whitespace-pre-wrap') || u2);
              if (a2) addMsg('assistant', a2.querySelector('.markdown') || a2);
            });
          }
        }
      }

      // =====================================================
      // CLAUDE
      // =====================================================
      else if (url.indexOf('claude.ai') !== -1) {

        var fieldsets = sortEls(document.querySelectorAll('fieldset'));
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
            var els = document.querySelectorAll(group.sel);
            for (var k = 0; k < els.length; k++) {
              if (isVisible(els[k])) candidates.push({ el: els[k], role: group.role });
            }
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

        if (messages.length === 0) {
          var allDivs = Array.from(document.querySelectorAll('div[class], section[class]'));
          var turnDivs = allDivs.filter(function (el) {
            var cls = (el.className || '').toString().toLowerCase();
            return cls.indexOf('human') !== -1 || cls.indexOf('user') !== -1 ||
                   cls.indexOf('assistant') !== -1 || cls.indexOf('response') !== -1;
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

        if (messages.length === 0) {
          var mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
          if (mainEl) {
            var convContainer = mainEl.querySelector('[class*="conversation"]')
              || mainEl.querySelector('[class*="chat"]')
              || mainEl;

            var childDivs = Array.from(convContainer.children).filter(function (c) {
              return c.tagName === 'DIV' && isVisible(c);
            });

            childDivs.forEach(function (div, idx) {
              var guessRole = idx % 2 === 0 ? 'user' : 'assistant';
              var innerCls = (div.className || '').toString().toLowerCase();
              if (innerCls.indexOf('human') !== -1 || innerCls.indexOf('user') !== -1) guessRole = 'user';
              if (innerCls.indexOf('assistant') !== -1 || innerCls.indexOf('claude') !== -1) guessRole = 'assistant';

              if ((div.innerText || '').trim().length > 1) {
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

      // =====================================================
      // OUTLIER / PLAYGROUND
      // =====================================================
      else if (url.indexOf('outlier.ai') !== -1 || url.indexOf('dataannotation.tech') !== -1 || url.indexOf('playground') !== -1) {
        var container =
          document.querySelector('div.flex.flex-col.overflow-x-auto.overflow-y-clip.p-1.w-full.h-full') ||
          document.querySelector('main') ||
          document.body;

        Array.from(container.children).forEach(function (child) {
          var responseEl = child.querySelector('[data-testid^="response-turn"]');
          var thinkingEl = child.querySelector('[data-testid="thinking-process"]');

          if (responseEl) {
            if (thinkingEl && includeThinking) addMsg('assistant-thinking', thinkingEl);
            addMsg('assistant', responseEl);
          } else {
            var txt = (child.innerText || '').trim();
            if (txt.length > 1) addMsg('user', child);
          }
        });
      }

      // =====================================================
      // GENERIC FALLBACK
      // =====================================================
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
          var els = document.querySelectorAll(s.sel);
          for (var m = 0; m < els.length; m++) {
            if (isVisible(els[m])) fallbackFound.push({ el: els[m], role: s.role });
          }
        });

        fallbackFound.sort(function (a, b) { return domOrder(a.el, b.el); });
        fallbackFound.forEach(function (item) { addMsg(item.role, item.el); });
      }

      if (messages.length === 0) {
        var proseBlocks = document.querySelectorAll('.prose, .markdown, .whitespace-pre-wrap');
        for (var n = 0; n < proseBlocks.length; n++) {
          addMsg('assistant', proseBlocks[n]);
        }
      }

      return { success: true, messages: dedupe(messages) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================================
  // HTML to Markdown converter
  // ==========================================================
  function htmlToMarkdown(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var temp = doc.body;

    var junkEls = temp.querySelectorAll(
      'button, svg, img, video, audio, canvas, iframe, script, style'
    );
    for (var j = 0; j < junkEls.length; j++) {
      junkEls[j].remove();
    }

    function walk(node) {
      var result = '';

      for (var c = 0; c < node.childNodes.length; c++) {
        var child = node.childNodes[c];

        if (child.nodeType === Node.TEXT_NODE) {
          result += child.textContent;
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        var tag = child.tagName.toLowerCase();

        if (tag === 'br') {
          result += '\n';
        } else if (tag === 'b' || tag === 'strong') {
          var boldInner = walk(child).trim();
          if (boldInner) result += '**' + boldInner + '**';
        } else if (tag === 'i' || tag === 'em') {
          var italicInner = walk(child).trim();
          if (italicInner) result += '*' + italicInner + '*';
        } else if (tag === 'code') {
          if (child.parentElement && child.parentElement.tagName.toLowerCase() === 'pre') {
            result += child.textContent;
          } else {
            result += '`' + child.textContent + '`';
          }
        } else if (tag === 'pre') {
          var codeEl = child.querySelector('code');
          var codeText = codeEl ? codeEl.textContent : child.textContent;
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
          var liParent = child.parentElement;
          if (liParent && liParent.tagName.toLowerCase() === 'ol') {
            var index = Array.from(liParent.children).indexOf(child) + 1;
            result += index + '. ' + walk(child).trim() + '\n';
          } else {
            result += '- ' + walk(child).trim() + '\n';
          }
        } else if (tag === 'ul' || tag === 'ol') {
          result += '\n' + walk(child) + '\n';
        } else if (tag === 'p') {
          result += walk(child).trim() + '\n\n';
        } else if (tag === 'blockquote') {
          var bqInner = walk(child).trim();
          var bqLines = bqInner.split('\n');
          for (var q = 0; q < bqLines.length; q++) {
            bqLines[q] = '> ' + bqLines[q];
          }
          result += bqLines.join('\n') + '\n\n';
        } else if (tag === 'table') {
          result += '\n' + tableToMarkdown(child) + '\n';
        } else if (tag === 'a') {
          var href = child.getAttribute('href') || '';
          var linkText = walk(child).trim();
          if (href && linkText) {
            result += '[' + linkText + '](' + href + ')';
          } else {
            result += linkText;
          }
        } else {
          result += walk(child);
        }
      }

      return result;
    }

    function tableToMarkdown(table) {
      var rows = table.querySelectorAll('tr');
      if (rows.length === 0) return '';

      var md = '';
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].querySelectorAll('td, th');
        var cellTexts = [];
        for (var d = 0; d < cells.length; d++) {
          cellTexts.push((cells[d].innerText || '').trim().replace(/\|/g, '\\|'));
        }
        md += '| ' + cellTexts.join(' | ') + ' |\n';

        if (r === 0) {
          var sep = [];
          for (var s = 0; s < cellTexts.length; s++) {
            sep.push('---');
          }
          md += '| ' + sep.join(' | ') + ' |\n';
        }
      }
      return md;
    }

    var mdResult = walk(temp);
    mdResult = mdResult.replace(/\n{3,}/g, '\n\n').trim();
    return mdResult;
  }

  // ==========================================================
  // Markdown output
  // ==========================================================
  function toMarkdown(messages, options) {
    var md = '';

    if (options.includeMetadata) {
      md += '> **Title** - Model Chat\n';
      md += '> **Date** - ' + new Date().toISOString() + '\n';
      md += '> **Messages** - ' + messages.length + '\n\n';
    }

    md += '# Model Chat\n\n';

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var label;

      if (msg.role === 'user') label = '👤 User';
      else if (msg.role === 'assistant') label = '🤖 Assistant';
      else if (msg.role === 'assistant-thinking') label = '🧠 Thinking';
      else label = '💬 ' + msg.role;

      md += '## ' + label + '\n\n';

      if (msg.html && msg.role !== 'user') {
        md += htmlToMarkdown(msg.html) + '\n\n';
      } else {
        md += msg.content + '\n\n';
      }

      if (i < messages.length - 1) {
        md += '***\n\n';
      }
    }

    return md;
  }

  // ==========================================================
  // Word HTML helpers
  // ==========================================================
  function escapeHTML(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function replaceTagSafe(el, tagName) {
    var replacement = el.ownerDocument.createElement(tagName);
    while (el.firstChild) {
      replacement.appendChild(el.firstChild);
    }
    if (el.parentNode) {
      el.parentNode.replaceChild(replacement, el);
    }
  }

  function cleanHTMLForWord(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var temp = doc.body;

    var removeEls = temp.querySelectorAll(
      'script, style, button, svg, img, video, audio, canvas, iframe'
    );
    for (var r = 0; r < removeEls.length; r++) {
      removeEls[r].remove();
    }

    var strongs = temp.querySelectorAll('strong');
    for (var s = 0; s < strongs.length; s++) {
      replaceTagSafe(strongs[s], 'b');
    }

    var ems = temp.querySelectorAll('em');
    for (var e = 0; e < ems.length; e++) {
      replaceTagSafe(ems[e], 'i');
    }

    var allEls = temp.querySelectorAll('*');
    for (var a = 0; a < allEls.length; a++) {
      allEls[a].removeAttribute('class');
      allEls[a].removeAttribute('id');
      allEls[a].removeAttribute('data-testid');
      allEls[a].removeAttribute('style');
      allEls[a].removeAttribute('dir');
    }

    var textEls = temp.querySelectorAll('p, li, span, div, b, i, code, pre, h1, h2, h3, h4, h5');
    for (var t = 0; t < textEls.length; t++) {
      textEls[t].setAttribute('style', 'color:#333333;');
    }

    var pres = temp.querySelectorAll('pre');
    for (var p = 0; p < pres.length; p++) {
      pres[p].setAttribute('style',
        'color:#333333;background:#f4f4f4;border:1pt solid #dddddd;padding:8pt;white-space:pre-wrap;word-wrap:break-word;font-family:Consolas,monospace;font-size:9pt;'
      );
    }

    var codes = temp.querySelectorAll('code');
    for (var c = 0; c < codes.length; c++) {
      if (codes[c].parentElement && codes[c].parentElement.tagName.toLowerCase() !== 'pre') {
        codes[c].setAttribute('style',
          'font-family:Consolas,monospace;font-size:9pt;background:#f0f0f0;padding:1pt 3pt;color:#333333;'
        );
      }
    }

    var lists = temp.querySelectorAll('ul, ol');
    for (var l = 0; l < lists.length; l++) {
      lists[l].setAttribute('style', 'margin:6pt 0 6pt 18pt;color:#333333;');
    }

    var tables = temp.querySelectorAll('table');
    for (var tb = 0; tb < tables.length; tb++) {
      tables[tb].setAttribute('style', 'border-collapse:collapse;width:100%;margin:6pt 0;');
    }

    var cells = temp.querySelectorAll('td, th');
    for (var cl = 0; cl < cells.length; cl++) {
      cells[cl].setAttribute('style',
        'border:1pt solid #dddddd;padding:5pt 8pt;font-size:10pt;color:#333333;'
      );
    }

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
    var html = '';
    var lines = text.split('\n');
    var inCode = false;
    var inUL = false;
    var inOL = false;

    function closeLists() {
      if (inUL) { html += '</ul>'; inUL = false; }
      if (inOL) { html += '</ol>'; inOL = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (trimmed.indexOf('```') === 0) {
        closeLists();
        if (inCode) {
          html += '</code></pre>';
          inCode = false;
        } else {
          html += '<pre style="color:#333333;background:#f4f4f4;border:1pt solid #dddddd;padding:8pt;white-space:pre-wrap;font-family:Consolas,monospace;font-size:9pt;"><code style="color:#333333;">';
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        html += escapeHTML(line) + '\n';
        continue;
      }

      if (trimmed.indexOf('### ') === 0) {
        closeLists();
        html += '<h3 style="color:#333333;">' + inlineFormat(trimmed.slice(4)) + '</h3>';
      } else if (trimmed.indexOf('## ') === 0) {
        closeLists();
        html += '<h2 style="color:#2c3e50;">' + inlineFormat(trimmed.slice(3)) + '</h2>';
      } else if (trimmed.indexOf('# ') === 0) {
        closeLists();
        html += '<h1 style="color:#1a1a2e;">' + inlineFormat(trimmed.slice(2)) + '</h1>';
      } else if (trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0) {
        if (inOL) { html += '</ol>'; inOL = false; }
        if (!inUL) { html += '<ul style="margin:6pt 0 6pt 18pt;color:#333333;">'; inUL = true; }
        html += '<li style="color:#333333;">' + inlineFormat(trimmed.slice(2)) + '</li>';
      } else if (/^\d+\.\s/.test(trimmed)) {
        if (inUL) { html += '</ul>'; inUL = false; }
        if (!inOL) { html += '<ol style="margin:6pt 0 6pt 18pt;color:#333333;">'; inOL = true; }
        html += '<li style="color:#333333;">' + inlineFormat(trimmed.replace(/^\d+\.\s/, '')) + '</li>';
      } else if (trimmed === '') {
        closeLists();
        html += '<br>';
      } else {
        closeLists();
        html += '<p style="color:#333333;">' + inlineFormat(trimmed) + '</p>';
      }
    }

    closeLists();
    if (inCode) html += '</code></pre>';
    return html;
  }

  // ==========================================================
  // Word HTML output
  // ==========================================================
  function toWordHTML(messages, options) {
    var body = '';

    if (options.includeMetadata) {
      body += '<div class="metadata">';
      body += '<p style="color:#666666;"><b>Title</b> - Model Chat</p>';
      body += '<p style="color:#666666;"><b>Date</b> - ' + new Date().toISOString() + '</p>';
      body += '<p style="color:#666666;"><b>Messages</b> - ' + messages.length + '</p>';
      body += '</div>';
    }

    body += '<h1 style="color:#1a1a2e;">Model Chat</h1>';

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var label = '💬 ' + msg.role;
      var sectionClass = '';

      if (msg.role === 'user') { label = '👤 User'; sectionClass = 'user-section'; }
      else if (msg.role === 'assistant') { label = '🤖 Assistant'; sectionClass = 'assistant-section'; }
      else if (msg.role === 'assistant-thinking') { label = '🧠 Thinking'; sectionClass = 'thinking-section'; }

      body += '<div class="' + sectionClass + '">';
      body += '<h2 style="color:#2c3e50;">' + label + '</h2>';

      var formatted;
      if (msg.html) {
        formatted = cleanHTMLForWord(msg.html);
      } else {
        formatted = formatContent(escapeHTML(msg.content));
      }

      if (msg.role === 'assistant-thinking') {
        body += '<div class="thinking-block">' + formatted + '</div>';
      } else {
        body += formatted;
      }

      body += '</div>';

      if (i < messages.length - 1) {
        body += '<div class="divider"></div>';
      }
    }

    return body;
  }

  // ==========================================================
  // Generate Word document (clean HTML - NO MHTML wrapper)
  // ==========================================================
  function generateWordDoc(bodyHTML) {
    return '<!DOCTYPE html>\n' +
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
      'xmlns:w="urn:schemas-microsoft-com:office:word"\n' +
      'xmlns="http://www.w3.org/TR/REC-html40">\n' +
      '<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="ProgId" content="Word.Document">\n' +
      '<meta name="Generator" content="Microsoft Word 15">\n' +
      '<!--[if gte mso 9]>\n' +
      '<xml>\n' +
      '<w:WordDocument>\n' +
      '<w:View>Print</w:View>\n' +
      '<w:Zoom>100</w:Zoom>\n' +
      '<w:DoNotOptimizeForBrowser/>\n' +
      '</w:WordDocument>\n' +
      '</xml>\n' +
      '<![endif]-->\n' +
      '<style>\n' +
      '@page WordSection1 {\n' +
      '  size: 8.5in 11.0in;\n' +
      '  margin: 1.0in 1.0in 1.0in 1.0in;\n' +
      '}\n' +
      'div.WordSection1 { page: WordSection1; }\n' +
      'body {\n' +
      '  font-family: Calibri, sans-serif;\n' +
      '  font-size: 11pt;\n' +
      '  line-height: 1.5;\n' +
      '  color: #333333;\n' +
      '  background: white;\n' +
      '}\n' +
      'body, p, li, span, div, td, th { color: #333333 !important; }\n' +
      'p { margin: 0 0 6pt 0; font-size: 11pt; }\n' +
      'h1 { font-size: 20pt; font-weight: bold; color: #1a1a2e !important; margin: 12pt 0 6pt 0; }\n' +
      'h2 { font-size: 16pt; font-weight: bold; color: #2c3e50 !important; margin: 12pt 0 4pt 0; border-bottom: 1pt solid #cccccc; padding-bottom: 4pt; }\n' +
      'h3 { font-size: 13pt; font-weight: bold; color: #333333 !important; margin: 10pt 0 4pt 0; }\n' +
      'pre { font-family: Consolas, monospace; font-size: 9pt; background: #f4f4f4; border: 1pt solid #dddddd; padding: 8pt; margin: 6pt 0; white-space: pre-wrap; word-wrap: break-word; color: #333333 !important; }\n' +
      'code { font-family: Consolas, monospace; font-size: 9pt; color: #333333 !important; }\n' +
      'ul, ol { margin: 6pt 0 6pt 18pt; }\n' +
      'li { font-size: 11pt; margin-bottom: 3pt; color: #333333 !important; }\n' +
      'b, strong { font-weight: bold; color: #222222 !important; }\n' +
      'i, em { font-style: italic; color: #333333 !important; }\n' +
      '.divider { border-top: 1pt solid #cccccc; margin: 14pt 0; }\n' +
      '.metadata { font-size: 9pt; color: #666666 !important; border-left: 3pt solid #4ecca3; padding: 6pt 10pt; margin-bottom: 14pt; background: #f9f9f9; }\n' +
      '.user-section h2 { border-bottom-color: #3498db; }\n' +
      '.assistant-section h2 { border-bottom-color: #4ecca3; }\n' +
      '.thinking-block { border-left: 3pt solid #6c3483; padding: 6pt 10pt; background: #faf5ff; margin: 6pt 0; font-size: 10pt; color: #555555 !important; }\n' +
      'table { border-collapse: collapse; width: 100%; margin: 6pt 0; }\n' +
      'td, th { border: 1pt solid #dddddd; padding: 5pt 8pt; font-size: 10pt; color: #333333 !important; }\n' +
      'th { background: #f4f4f4; font-weight: bold; }\n' +
      'a { color: #2980b9 !important; text-decoration: underline; }\n' +
      '</style>\n' +
      '</head>\n' +
      '<body lang="EN-US" style="color:#333333;background:white;">\n' +
      '<div class="WordSection1" style="color:#333333;">\n' +
      bodyHTML + '\n' +
      '</div>\n' +
      '</body>\n' +
      '</html>';
  }

  // ==========================================================
  // Download helper (runs in popup - no injection needed)
  // ==========================================================
  function triggerDownload(content, filename, mimeType) {
    var BOM = '\uFEFF';
    var blob = new Blob([BOM + content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 5000);
  }

  // ==========================================================
  // Button handlers
  // ==========================================================
  downloadBtn.addEventListener('click', function () {
    setStatus('Extracting...');
    getMessages()
      .then(function (data) {
        var md = toMarkdown(data.messages, data.options);
        var filename = generateFilename(data.options, 'md');
        triggerDownload(md, filename, 'text/markdown;charset=utf-8');
        setStatus('✅ Downloaded ' + data.messages.length + ' messages as .md');
      })
      .catch(function (err) {
        setStatus('❌ ' + err.message, true);
      });
  });

  if (downloadDocBtn) {
    downloadDocBtn.addEventListener('click', function () {
      setStatus('Extracting...');
      getMessages()
        .then(function (data) {
          var bodyHTML = toWordHTML(data.messages, data.options);
          var fullDoc = generateWordDoc(bodyHTML);
          var filename = generateFilename(data.options, 'doc');
          triggerDownload(fullDoc, filename, 'application/msword;charset=utf-8');
          setStatus('✅ Downloaded ' + data.messages.length + ' messages as .doc');
        })
        .catch(function (err) {
          setStatus('❌ ' + err.message, true);
        });
    });
  }

  copyBtn.addEventListener('click', function () {
    setStatus('Extracting...');
    getMessages()
      .then(function (data) {
        var md = toMarkdown(data.messages, data.options);
        return navigator.clipboard.writeText(md).then(function () {
          setStatus('✅ Copied ' + data.messages.length + ' messages!');
        });
      })
      .catch(function (err) {
        setStatus('❌ ' + err.message, true);
      });
  });
});