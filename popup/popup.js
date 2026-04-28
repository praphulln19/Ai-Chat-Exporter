document.addEventListener('DOMContentLoaded', function () {
  "use strict";

  var downloadBtn = document.getElementById('downloadBtn');
  var downloadDocBtn = document.getElementById('downloadDocBtn') || document.getElementById('downloadDocxBtn');
  var copyBtn = document.getElementById('copyBtn');
  var statusEl = document.getElementById('status');
  var filenamePrefixInput = document.getElementById('filenamePrefix');

  if (filenamePrefixInput) filenamePrefixInput.value = 'Model chat';

  function getOptions() {
    return {
      includeTimestamp: document.getElementById('includeTimestamp').checked,
      includeMetadata: document.getElementById('includeMetadata').checked,
      includeThinking: document.getElementById('includeThinking').checked,
      filenamePrefix: document.getElementById('filenamePrefix').value || 'Model chat',
    };
  }

  function generateFilename(options, ext) {
    var name = options.filenamePrefix || 'Model chat';
    if (options.includeTimestamp) {
      var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      name += '_' + ts;
    }
    return name + '.' + ext;
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#e74c3c' : '#4ecca3';
  }

  function getMessages() {
    var options = getOptions();
    return browser.tabs.query({ active: true, currentWindow: true })
      .then(function (tabs) {
        return browser.tabs.executeScript(tabs[0].id, {
          code: '(' + extractionScript.toString() + ')(' + JSON.stringify(options.includeThinking) + ')'
        });
      })
      .then(function (results) {
        var result = results[0];
        if (!result || !result.success) throw new Error(result ? result.error : 'Failed to extract.');
        if (!result.messages || result.messages.length === 0) throw new Error('No messages found on this page.');
        return { messages: result.messages, options: options };
      });
  }

  // ==========================================================
  // Content extraction function (injected into page)
  // ==========================================================
  async function extractionScript(includeThinking) {
    try {
      var url = window.location.href;
      var messages = [];

      function wait(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
      }

      function isVisible(el) {
        if (!el) return false;
        var s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && (el.innerText || '').trim().length > 0;
      }

      function cleanNode(node) {
        var clone = node.cloneNode(true);
        var junk = clone.querySelectorAll('button,svg,img,video,audio,canvas,iframe,textarea,input,nav,header,footer');
        for (var i = 0; i < junk.length; i++) junk[i].remove();
        return clone;
      }

      function replaceTag(el, tag) {
        var r = el.ownerDocument.createElement(tag);
        while (el.firstChild) r.appendChild(el.firstChild);
        if (el.parentNode) el.parentNode.replaceChild(r, el);
      }

      function normalizeHTML(node) {
        var clone = cleanNode(node);
        var strongs = clone.querySelectorAll('strong');
        for (var i = 0; i < strongs.length; i++) replaceTag(strongs[i], 'b');
        var ems = clone.querySelectorAll('em');
        for (var i = 0; i < ems.length; i++) replaceTag(ems[i], 'i');
        return clone.innerHTML;
      }

      function addMsg(role, node) {
        if (!node || !isVisible(node)) return;
        var text = (node.innerText || '').trim();
        var html = normalizeHTML(node).trim();
        if (text.length < 1) return;
        messages.push({ role: role, content: text, html: html });
      }

      function dedupe(list) {
        var out = [], seen = {};
        for (var i = 0; i < list.length; i++) {
          var t = list[i].content;
          var fp = t.length <= 250 ? t : t.substring(0, 150) + '|||' + t.substring(t.length - 100);
          var key = list[i].role + '::' + fp;
          if (!seen[key]) { seen[key] = true; out.push(list[i]); }
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

      function sortEls(els) { return Array.from(els).sort(domOrder); }

      // -------------------------------------------------------
      // Fiber helpers for Outlier
      // -------------------------------------------------------
      function getFiberKey(el) {
        var keys = Object.keys(el);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].indexOf('__reactFiber$') === 0) return keys[i];
          if (keys[i].indexOf('__reactInternalInstance$') === 0) return keys[i];
        }
        return null;
      }

      function getMarkdownFromEl(el) {
        if (!el) return null;
        var fKey = getFiberKey(el);
        if (!fKey || !el[fKey]) return null;
        var cur = el[fKey];
        for (var i = 0; i < 12; i++) {
          if (!cur) break;
          if (cur.memoizedProps && typeof cur.memoizedProps.markdown === 'string' && cur.memoizedProps.markdown.length > 5) {
            return cur.memoizedProps.markdown;
          }
          cur = cur.return;
        }
        return null;
      }

      // -------------------------------------------------------
      // Find scroll container for ChatGPT
      // -------------------------------------------------------
      function findChatGPTScrollContainer() {
        var allEls = document.querySelectorAll('*');
        var best = null;
        var bestDiff = 0;
        for (var i = 0; i < allEls.length; i++) {
          var el = allEls[i];
          var style = window.getComputedStyle(el);
          var oy = style.overflowY;
          if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 100) {
            var diff = el.scrollHeight - el.clientHeight;
            if (diff > bestDiff) {
              bestDiff = diff;
              best = el;
            }
          }
        }
        return best || document.scrollingElement || document.documentElement;
      }

      // -------------------------------------------------------
      // Find scroll container for Outlier (unchanged)
      // -------------------------------------------------------
      function getOutlierScrollContainer() {
        var best = null;
        var bestDiff = 0;
        var allDivs = document.querySelectorAll('div');
        for (var i = 0; i < allDivs.length; i++) {
          var el = allDivs[i];
          var cls = (el.className || '').toString();
          if (cls.indexOf('overflow-auto') !== -1 && el.scrollHeight > el.clientHeight) {
            var diff = el.scrollHeight - el.clientHeight;
            if (diff > bestDiff) {
              bestDiff = diff;
              best = el;
            }
          }
        }
        return best || document.scrollingElement || document.documentElement;
      }

      // -------------------------------------------------------
      // ChatGPT: Scroll and collect messages
      // -------------------------------------------------------
      async function chatGPTScrollAndCollect() {
        var scrollEl = findChatGPTScrollContainer();
        var collected = [];
        var seenKeys = {};
        var orderIdx = 0;

        function fingerprint(text) {
          var t = (text || '').trim();
          return t.length <= 300 ? t : t.substring(0, 200) + '|||' + t.substring(t.length - 100);
        }

        function addToCollected(role, content, html) {
          if (!content || content.trim().length < 2) return;
          var key = role + '::' + fingerprint(content);
          if (!seenKeys[key]) {
            seenKeys[key] = true;
            collected.push({ role: role, content: content.trim(), html: (html || content).trim(), _order: orderIdx++ });
          }
        }

        function collectCurrentlyVisible() {
          // Method 1: Use data-message-author-role (current ChatGPT structure)
          var roleNodes = document.querySelectorAll('[data-message-author-role]');
          for (var i = 0; i < roleNodes.length; i++) {
            var node = roleNodes[i];
            var role = node.getAttribute('data-message-author-role');

            var contentEl;
            if (role === 'user') {
              // User messages use whitespace-pre-wrap or similar
              contentEl = node.querySelector('[class*="whitespace"]') || node.querySelector('.whitespace-pre-wrap') || node;
            } else if (role === 'assistant') {
              // Assistant messages have .markdown
              contentEl = node.querySelector('.markdown') || node.querySelector('[class*="markdown"]') || node.querySelector('[class*="prose"]') || node;
            } else {
              contentEl = node;
            }

            var content = (contentEl.innerText || '').trim();
            var html = normalizeHTML(contentEl).trim();

            if (role === 'user') addToCollected('user', content, html);
            else if (role === 'assistant') addToCollected('assistant', content, html);
          }

          // Method 2: Fallback - article conversation turns (old structure)
          if (collected.length === 0) {
            var articles = document.querySelectorAll('article[data-testid^="conversation-turn"]');
            for (var j = 0; j < articles.length; j++) {
              var article = articles[j];
              var userNode = article.querySelector('[data-message-author-role="user"]');
              var assistantNode = article.querySelector('[data-message-author-role="assistant"]');

              if (userNode) {
                var uc = userNode.querySelector('.whitespace-pre-wrap') || userNode.querySelector('[class*="whitespace"]') || userNode;
                addToCollected('user', (uc.innerText || '').trim(), normalizeHTML(uc).trim());
              }
              if (assistantNode) {
                var ac = assistantNode.querySelector('.markdown') || assistantNode.querySelector('[class*="markdown"]') || assistantNode.querySelector('[class*="prose"]') || assistantNode;
                addToCollected('assistant', (ac.innerText || '').trim(), normalizeHTML(ac).trim());
              }
            }
          }

          // Method 3: Fallback - data-message-id elements
          if (collected.length === 0) {
            var msgEls = document.querySelectorAll('[data-message-id]');
            for (var k = 0; k < msgEls.length; k++) {
              var msgEl = msgEls[k];
              var parentRole = msgEl.closest('[data-message-author-role]');
              var role = parentRole ? parentRole.getAttribute('data-message-author-role') : 'unknown';
              var content = (msgEl.innerText || '').trim();
              if (role === 'user' || role === 'assistant') {
                addToCollected(role, content, normalizeHTML(msgEl).trim());
              }
            }
          }
        }

        // Scroll to top first
        scrollEl.scrollTop = 0;
        await wait(500);

        // Keep scrolling to top to load older messages
        var lastHeight = scrollEl.scrollHeight;
        var sameCount = 0;
        for (var i = 0; i < 30; i++) {
          scrollEl.scrollTop = 0;
          await wait(400);
          collectCurrentlyVisible();
          var newHeight = scrollEl.scrollHeight;
          if (newHeight === lastHeight) {
            sameCount++;
            if (sameCount >= 3) break;
          } else {
            sameCount = 0;
            lastHeight = newHeight;
          }
        }

        // Now scroll down to collect all messages
        var step = Math.max(500, Math.floor(scrollEl.clientHeight * 0.7));
        var pos = 0;
        while (pos < scrollEl.scrollHeight) {
          scrollEl.scrollTop = pos;
          await wait(150);
          collectCurrentlyVisible();
          pos += step;
        }

        // Final pass at bottom
        scrollEl.scrollTop = scrollEl.scrollHeight;
        await wait(400);
        collectCurrentlyVisible();

        // Sort by discovery order
        collected.sort(function (a, b) { return a._order - b._order; });
        for (var m = 0; m < collected.length; m++) delete collected[m]._order;

        return collected;
      }

      // -------------------------------------------------------
      // OUTLIER: Scroll and collect (UNCHANGED)
      // -------------------------------------------------------
      async function outlierScrollAndCollect(scrollEl, includeThk) {
        var collected = [];
        var seenKeys = {};
        var orderIdx = 0;

        function fingerprint(text) {
          var t = (text || '').trim();
          return t.length <= 300 ? t : t.substring(0, 200) + '|||' + t.substring(t.length - 100);
        }

        function addToCollected(role, content, html) {
          if (!content || content.trim().length < 2) return;
          var key = role + '::' + fingerprint(content);
          if (!seenKeys[key]) {
            seenKeys[key] = true;
            collected.push({ role: role, content: content.trim(), html: (html || content).trim(), _order: orderIdx++ });
          }
        }

        function collectCurrentlyVisible() {
          var respEls = document.querySelectorAll('[data-testid^="response-turn"]');
          for (var i = 0; i < respEls.length; i++) {
            var respEl = respEls[i];
            var proseEl = respEl.querySelector('[class*="prose"]');
            var markdown = proseEl ? getMarkdownFromEl(proseEl) : null;
            if (!markdown) markdown = getMarkdownFromEl(respEl);
            var content = markdown || (respEl.innerText || '').trim();
            var html = markdown || normalizeHTML(respEl).trim();
            addToCollected('assistant', content, html);
          }

          if (includeThk) {
            var thinkEls = document.querySelectorAll('[data-testid="thinking-process"]');
            for (var j = 0; j < thinkEls.length; j++) {
              var txt = (thinkEls[j].innerText || '').trim();
              addToCollected('assistant-thinking', txt, normalizeHTML(thinkEls[j]).trim());
            }
          }

          var chatContainer =
            document.querySelector('div.flex.flex-col.overflow-x-auto.overflow-y-clip.p-1.w-full.h-full') ||
            document.querySelector('div[class*="overflow-x-auto"][class*="overflow-y-clip"]') ||
            document.querySelector('main') ||
            document.body;

          var children = chatContainer.children;
          for (var k = 0; k < children.length; k++) {
            var child = children[k];
            var tid = child.getAttribute ? (child.getAttribute('data-testid') || '') : '';
            var isResponse = tid.indexOf('response-turn') === 0;
            var isThinking = tid === 'thinking-process';
            var hasResponse = child.querySelector && !!child.querySelector('[data-testid^="response-turn"]');
            var hasThinking = child.querySelector && !!child.querySelector('[data-testid="thinking-process"]');
            var hasModelName = child.querySelector && !!child.querySelector('[data-testid="response-model-name"]');
            var hasRating = child.querySelector && !!(child.querySelector('[data-testid="response-thumbs-up"]') || child.querySelector('[data-testid="response-thumbs-down"]'));

            if (!isResponse && !isThinking && !hasResponse && !hasThinking && !hasModelName && !hasRating) {
              var userTxt = (child.innerText || '').trim();
              if (userTxt.length > 1) {
                addToCollected('user', userTxt, normalizeHTML(child).trim());
              }
            }
          }
        }

        var STEP = 2000;
        var totalHeight = scrollEl.scrollHeight;
        var numSteps = Math.ceil(totalHeight / STEP) + 2;

        scrollEl.scrollTop = 0;
        scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
        await wait(400);
        collectCurrentlyVisible();

        for (var step = 1; step <= numSteps; step++) {
          var targetPos = step * STEP;
          scrollEl.scrollTop = targetPos;
          scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
          await wait(150);
          collectCurrentlyVisible();
          totalHeight = scrollEl.scrollHeight;
          if (targetPos >= totalHeight) break;
        }

        scrollEl.scrollTop = scrollEl.scrollHeight;
        scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
        await wait(400);
        collectCurrentlyVisible();

        collected.sort(function (a, b) { return a._order - b._order; });
        for (var m = 0; m < collected.length; m++) delete collected[m]._order;

        return collected;
      }

      // =====================================================
      // CHATGPT (UPDATED)
      // =====================================================
      if (url.indexOf('chatgpt.com') !== -1 || url.indexOf('chat.openai.com') !== -1) {
        var collected = await chatGPTScrollAndCollect();
        if (collected.length > 0) {
          messages = collected;
        }

        // Fallback: static scan if scroll-collect got nothing
        if (messages.length === 0) {
          var roleNodes = sortEls(document.querySelectorAll('[data-message-author-role]'));
          roleNodes.forEach(function (node) {
            var role = node.getAttribute('data-message-author-role');
            var contentEl;
            if (role === 'user') {
              contentEl = node.querySelector('[class*="whitespace"]') || node.querySelector('.whitespace-pre-wrap') || node;
            } else {
              contentEl = node.querySelector('.markdown') || node.querySelector('[class*="markdown"]') || node.querySelector('[class*="prose"]') || node;
            }
            if (role === 'user') addMsg('user', contentEl);
            else if (role === 'assistant') addMsg('assistant', contentEl);
          });
        }

        // Fallback: old article structure
        if (messages.length === 0) {
          var turnArticles = document.querySelectorAll('article[data-testid^="conversation-turn"]');
          sortEls(turnArticles).forEach(function (article) {
            var userNode = article.querySelector('[data-message-author-role="user"]');
            var assistantNode = article.querySelector('[data-message-author-role="assistant"]');
            if (userNode) addMsg('user', userNode.querySelector('.whitespace-pre-wrap') || userNode.querySelector('[class*="whitespace"]') || userNode);
            if (assistantNode) addMsg('assistant', assistantNode.querySelector('.markdown') || assistantNode.querySelector('[class*="markdown"]') || assistantNode.querySelector('[class*="prose"]') || assistantNode);
          });
        }
      }

      // =====================================================
      // CLAUDE (keeping existing logic)
      // =====================================================
      else if (url.indexOf('claude.ai') !== -1) {
        // Scroll to load all messages
        var claudeScroll = findChatGPTScrollContainer(); // reuse same finder
        claudeScroll.scrollTop = 0;
        await wait(500);
        var lastH = claudeScroll.scrollHeight, sameCnt = 0;
        for (var ci = 0; ci < 20; ci++) {
          claudeScroll.scrollTop = 0;
          await wait(400);
          var newH = claudeScroll.scrollHeight;
          if (newH === lastH) { sameCnt++; if (sameCnt >= 3) break; }
          else { sameCnt = 0; lastH = newH; }
        }
        var cStep = Math.max(500, Math.floor(claudeScroll.clientHeight * 0.7));
        var cPos = 0;
        while (cPos < claudeScroll.scrollHeight) {
          claudeScroll.scrollTop = cPos;
          await wait(150);
          cPos += cStep;
        }
        claudeScroll.scrollTop = claudeScroll.scrollHeight;
        await wait(300);

        var fieldsets = sortEls(document.querySelectorAll('fieldset'));
        fieldsets.forEach(function (fs) {
          var legend = fs.querySelector('legend');
          if (!legend) return;
          var legendText = (legend.innerText || legend.textContent || '').toLowerCase().trim();
          var contentEl = fs.querySelector('[class*="prose"]') || fs.querySelector('[class*="markdown"]') || fs.querySelector('[class*="grid"]') || fs;
          if (legendText.indexOf('you') !== -1 || legendText.indexOf('human') !== -1 || legendText.indexOf('user') !== -1) addMsg('user', contentEl);
          else if (legendText.indexOf('claude') !== -1 || legendText.indexOf('assistant') !== -1) addMsg('assistant', contentEl);
        });

        if (messages.length === 0) {
          var claudeSelectors = [
            { sel: '[data-testid="human-turn"]', role: 'user' },
            { sel: '[data-testid="ai-turn"]', role: 'assistant' },
            { sel: '[data-testid*="human"]', role: 'user' },
            { sel: '[data-testid*="ai"]', role: 'assistant' }
          ];
          var candidates = [];
          claudeSelectors.forEach(function (group) {
            var els = document.querySelectorAll(group.sel);
            for (var k = 0; k < els.length; k++) {
              if (isVisible(els[k])) candidates.push({ el: els[k], role: group.role });
            }
          });
          var filtered = candidates.filter(function (c, idx) {
            return !candidates.some(function (other, oidx) { return oidx !== idx && other.el !== c.el && other.el.contains(c.el); });
          });
          filtered.sort(function (a, b) { return domOrder(a.el, b.el); });
          filtered.forEach(function (item) {
            addMsg(item.role, item.el.querySelector('[class*="prose"]') || item.el.querySelector('[class*="markdown"]') || item.el);
          });
        }

        if (messages.length === 0) {
          var mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
          if (mainEl) {
            var convContainer = mainEl.querySelector('[class*="conversation"]') || mainEl.querySelector('[class*="chat"]') || mainEl;
            Array.from(convContainer.children).filter(function (c) { return c.tagName === 'DIV' && isVisible(c); }).forEach(function (div, di) {
              var guessRole = di % 2 === 0 ? 'user' : 'assistant';
              var ic = (div.className || '').toLowerCase();
              if (ic.indexOf('human') !== -1 || ic.indexOf('user') !== -1) guessRole = 'user';
              if (ic.indexOf('assistant') !== -1 || ic.indexOf('claude') !== -1) guessRole = 'assistant';
              if ((div.innerText || '').trim().length > 1) addMsg(guessRole, div.querySelector('[class*="prose"]') || div.querySelector('[class*="markdown"]') || div);
            });
          }
        }
      }

      // =====================================================
      // OUTLIER / PLAYGROUND (UNCHANGED)
      // =====================================================
      else if (url.indexOf('outlier.ai') !== -1 || url.indexOf('dataannotation.tech') !== -1 || url.indexOf('playground') !== -1) {
        var scrollContainer = getOutlierScrollContainer();
        var collected = await outlierScrollAndCollect(scrollContainer, includeThinking);

        if (collected.length > 0) {
          messages = collected;
        }

        // Fallback: static DOM scan
        if (messages.length === 0) {
          var chatEl =
            document.querySelector('div.flex.flex-col.overflow-x-auto.overflow-y-clip.p-1.w-full.h-full') ||
            document.querySelector('main') ||
            document.body;
          Array.from(chatEl.children).forEach(function (child) {
            var respEl = child.querySelector('[data-testid^="response-turn"]');
            var thinkEl = child.querySelector('[data-testid="thinking-process"]');
            if (respEl) {
              if (thinkEl && includeThinking) addMsg('assistant-thinking', thinkEl);
              addMsg('assistant', respEl);
            } else if ((child.innerText || '').trim().length > 1) {
              addMsg('user', child);
            }
          });
        }
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
        for (var n = 0; n < proseBlocks.length; n++) addMsg('assistant', proseBlocks[n]);
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

    var junk = temp.querySelectorAll('button,svg,img,video,audio,canvas,iframe,script,style');
    for (var j = 0; j < junk.length; j++) junk[j].remove();

    function walk(node) {
      var result = '';
      for (var c = 0; c < node.childNodes.length; c++) {
        var child = node.childNodes[c];
        if (child.nodeType === Node.TEXT_NODE) { result += child.textContent; continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        var tag = child.tagName.toLowerCase();

        if (tag === 'br') result += '\n';
        else if (tag === 'b' || tag === 'strong') { var bi = walk(child).trim(); if (bi) result += '**' + bi + '**'; }
        else if (tag === 'i' || tag === 'em') { var ii = walk(child).trim(); if (ii) result += '*' + ii + '*'; }
        else if (tag === 'code') {
          if (child.parentElement && child.parentElement.tagName.toLowerCase() === 'pre') result += child.textContent;
          else result += '`' + child.textContent + '`';
        }
        else if (tag === 'pre') {
          var ce = child.querySelector('code');
          result += '\n```\n' + (ce ? ce.textContent : child.textContent).trim() + '\n```\n';
        }
        else if (tag === 'h1') result += '\n# ' + walk(child).trim() + '\n\n';
        else if (tag === 'h2') result += '\n## ' + walk(child).trim() + '\n\n';
        else if (tag === 'h3') result += '\n### ' + walk(child).trim() + '\n\n';
        else if (tag === 'h4') result += '\n#### ' + walk(child).trim() + '\n\n';
        else if (tag === 'h5') result += '\n##### ' + walk(child).trim() + '\n\n';
        else if (tag === 'li') {
          var lp = child.parentElement;
          if (lp && lp.tagName.toLowerCase() === 'ol') result += (Array.from(lp.children).indexOf(child) + 1) + '. ' + walk(child).trim() + '\n';
          else result += '- ' + walk(child).trim() + '\n';
        }
        else if (tag === 'ul' || tag === 'ol') result += '\n' + walk(child) + '\n';
        else if (tag === 'p') result += walk(child).trim() + '\n\n';
        else if (tag === 'blockquote') {
          var bqLines = walk(child).trim().split('\n');
          for (var q = 0; q < bqLines.length; q++) bqLines[q] = '> ' + bqLines[q];
          result += bqLines.join('\n') + '\n\n';
        }
        else if (tag === 'table') result += '\n' + tableToMd(child) + '\n';
        else if (tag === 'a') {
          var href = child.getAttribute('href') || '';
          var lt = walk(child).trim();
          result += (href && lt) ? '[' + lt + '](' + href + ')' : lt;
        }
        else result += walk(child);
      }
      return result;
    }

    function tableToMd(table) {
      var rows = table.querySelectorAll('tr');
      if (rows.length === 0) return '';
      var md = '';
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].querySelectorAll('td,th');
        var cellTexts = [];
        for (var d = 0; d < cells.length; d++) cellTexts.push((cells[d].innerText || '').trim().replace(/\|/g, '\\|'));
        md += '| ' + cellTexts.join(' | ') + ' |\n';
        if (r === 0) {
          var sep = [];
          for (var s = 0; s < cellTexts.length; s++) sep.push('---');
          md += '| ' + sep.join(' | ') + ' |\n';
        }
      }
      return md;
    }

    return walk(temp).replace(/\n{3,}/g, '\n\n').trim();
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

      if (msg.role === 'assistant' && msg.html && msg.html.indexOf('<') === -1 && msg.html.length > 10) {
        md += msg.html + '\n\n';
      } else if (msg.html && msg.role !== 'user') {
        md += htmlToMarkdown(msg.html) + '\n\n';
      } else {
        md += msg.content + '\n\n';
      }

      if (i < messages.length - 1) md += '***\n\n';
    }
    return md;
  }

  // ==========================================================
  // Word HTML helpers
  // ==========================================================
  function escapeHTML(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function replaceTagSafe(el, tag) {
    var r = el.ownerDocument.createElement(tag);
    while (el.firstChild) r.appendChild(el.firstChild);
    if (el.parentNode) el.parentNode.replaceChild(r, el);
  }

  function cleanHTMLForWord(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var temp = doc.body;

    var removeEls = temp.querySelectorAll('script,style,button,svg,img,video,audio,canvas,iframe');
    for (var r = 0; r < removeEls.length; r++) removeEls[r].remove();

    var strongs = temp.querySelectorAll('strong');
    for (var s = 0; s < strongs.length; s++) replaceTagSafe(strongs[s], 'b');
    var ems = temp.querySelectorAll('em');
    for (var e = 0; e < ems.length; e++) replaceTagSafe(ems[e], 'i');

    var allEls = temp.querySelectorAll('*');
    for (var a = 0; a < allEls.length; a++) {
      allEls[a].removeAttribute('class');
      allEls[a].removeAttribute('id');
      allEls[a].removeAttribute('data-testid');
      allEls[a].removeAttribute('style');
      allEls[a].removeAttribute('dir');
    }

    var textEls = temp.querySelectorAll('p,li,span,div,b,i,code,pre,h1,h2,h3,h4,h5');
    for (var t = 0; t < textEls.length; t++) textEls[t].setAttribute('style', 'color:#333333;');

    var pres = temp.querySelectorAll('pre');
    for (var p = 0; p < pres.length; p++) pres[p].setAttribute('style', 'color:#333333;background:#f4f4f4;border:1pt solid #dddddd;padding:8pt;white-space:pre-wrap;word-wrap:break-word;font-family:Consolas,monospace;font-size:9pt;');

    var codes = temp.querySelectorAll('code');
    for (var c = 0; c < codes.length; c++) {
      if (codes[c].parentElement && codes[c].parentElement.tagName.toLowerCase() !== 'pre') {
        codes[c].setAttribute('style', 'font-family:Consolas,monospace;font-size:9pt;background:#f0f0f0;padding:1pt 3pt;color:#333333;');
      }
    }

    var lists = temp.querySelectorAll('ul,ol');
    for (var l = 0; l < lists.length; l++) lists[l].setAttribute('style', 'margin:6pt 0 6pt 18pt;color:#333333;');

    var tables = temp.querySelectorAll('table');
    for (var tb = 0; tb < tables.length; tb++) tables[tb].setAttribute('style', 'border-collapse:collapse;width:100%;margin:6pt 0;');

    var cells = temp.querySelectorAll('td,th');
    for (var cl = 0; cl < cells.length; cl++) cells[cl].setAttribute('style', 'border:1pt solid #dddddd;padding:5pt 8pt;font-size:10pt;color:#333333;');

    return temp.innerHTML;
  }

    function inlineFormat(text) {
      return escapeHTML(text)
        .replace(/\*\*(.+?)\*\*/g, '<b>\$1</b>')
        .replace(/\*(.+?)\*/g, '<i>\$1</i>')
        .replace(/`(.+?)`/g, '<code style="font-family:Consolas,monospace;font-size:9pt;background:#f0f0f0;padding:1pt 3pt;color:#333333;">\$1</code>');
    } 

  function formatContent(text) {
    var html = '';
    var lines = text.split('\n');
    var inCode = false, inUL = false, inOL = false;

    function closeLists() {
      if (inUL) { html += '</ul>'; inUL = false; }
      if (inOL) { html += '</ol>'; inOL = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (trimmed.indexOf('```') === 0) {
        closeLists();
        if (inCode) { html += '</code></pre>'; inCode = false; }
        else { html += '<pre style="color:#333333;background:#f4f4f4;border:1pt solid #dddddd;padding:8pt;white-space:pre-wrap;font-family:Consolas,monospace;font-size:9pt;"><code style="color:#333333;">'; inCode = true; }
        continue;
      }
      if (inCode) { html += escapeHTML(line) + '\n'; continue; }

      if (trimmed.indexOf('### ') === 0) { closeLists(); html += '<h3 style="color:#333333;">' + inlineFormat(trimmed.slice(4)) + '</h3>'; }
      else if (trimmed.indexOf('## ') === 0) { closeLists(); html += '<h2 style="color:#2c3e50;">' + inlineFormat(trimmed.slice(3)) + '</h2>'; }
      else if (trimmed.indexOf('# ') === 0) { closeLists(); html += '<h1 style="color:#1a1a2e;">' + inlineFormat(trimmed.slice(2)) + '</h1>'; }
      else if (trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0) {
        if (inOL) { html += '</ol>'; inOL = false; }
        if (!inUL) { html += '<ul style="margin:6pt 0 6pt 18pt;color:#333333;">'; inUL = true; }
        html += '<li style="color:#333333;">' + inlineFormat(trimmed.slice(2)) + '</li>';
      }
      else if (/^\d+\.\s/.test(trimmed)) {
        if (inUL) { html += '</ul>'; inUL = false; }
        if (!inOL) { html += '<ol style="margin:6pt 0 6pt 18pt;color:#333333;">'; inOL = true; }
        html += '<li style="color:#333333;">' + inlineFormat(trimmed.replace(/^\d+\.\s/, '')) + '</li>';
      }
      else if (trimmed === '') { closeLists(); html += '<br>'; }
      else { closeLists(); html += '<p style="color:#333333;">' + inlineFormat(trimmed) + '</p>'; }
    }

    closeLists();
    if (inCode) html += '</code></pre>';
    return html;
  }

  function markdownToWordHTML(mdText) {
    return formatContent(mdText);
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
      if (msg.role === 'assistant' && msg.html && msg.html.indexOf('<') === -1 && msg.html.length > 10) {
        formatted = markdownToWordHTML(msg.html);
      } else if (msg.html && msg.html.indexOf('<') !== -1) {
        formatted = cleanHTMLForWord(msg.html);
      } else {
        formatted = formatContent(escapeHTML(msg.content));
      }

      if (msg.role === 'assistant-thinking') body += '<div class="thinking-block">' + formatted + '</div>';
      else body += formatted;

      body += '</div>';
      if (i < messages.length - 1) body += '<div class="divider"></div>';
    }
    return body;
  }

  // ==========================================================
  // Generate Word document
  // ==========================================================
      function generateWordDoc(bodyHTML) {
        return '<!DOCTYPE html>\n<html xmlns:o="urn:schemas-microsoft-com:office:office"\nxmlns:w="urn:schemas-microsoft-com:office:word"\nxmlns="http://www.w3.org/TR/REC-html40">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">\n<meta name="ProgId" content="Word.Document">\n<meta name="Generator" content="Microsoft Word 15">\n<!--[if gte mso 9]>\n<xml>\n<w:WordDocument>\n<w:View>Print</w:View>\n<w:Zoom>100</w:Zoom>\n<w:DoNotOptimizeForBrowser/>\n</w:WordDocument>\n</xml>\n<![endif]-->\n<style>\n@page WordSection1 { size: 210mm 297mm; margin: 25.4mm 25.4mm 25.4mm 25.4mm; }\ndiv.WordSection1 { page: WordSection1; max-width: 210mm; margin: 0 auto; }\n'

        // ✅ CHANGED: removed -webkit-text-size-adjust: 100%
        // ✅ ADDED: html-level zoom anchoring and box-sizing reset
        + 'html { font-size: 100%; zoom: 1; }\n* { box-sizing: border-box; }\nbody { font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.5; color: #333333; background: white; }\n'

        + 'body, p, li, span, div, td, th { color: #333333 !important; }\np { margin: 0 0 6pt 0; font-size: 11pt; }\nh1 { font-size: 20pt; font-weight: bold; color: #1a1a2e !important; margin: 12pt 0 6pt 0; }\nh2 { font-size: 16pt; font-weight: bold; color: #2c3e50 !important; margin: 12pt 0 4pt 0; border-bottom: 1pt solid #cccccc; padding-bottom: 4pt; }\nh3 { font-size: 13pt; font-weight: bold; color: #333333 !important; margin: 10pt 0 4pt 0; }\npre { font-family: Consolas, monospace; font-size: 9pt; background: #f4f4f4; border: 1pt solid #dddddd; padding: 8pt; margin: 6pt 0; white-space: pre-wrap; word-wrap: break-word; color: #333333 !important; }\ncode { font-family: Consolas, monospace; font-size: 9pt; color: #333333 !important; }\nul, ol { margin: 6pt 0 6pt 18pt; }\nli { font-size: 11pt; margin-bottom: 3pt; color: #333333 !important; }\nb, strong { font-weight: bold; color: #222222 !important; }\ni, em { font-style: italic; color: #333333 !important; }\n.divider { border-top: 1pt solid #cccccc; margin: 14pt 0; }\n.metadata { font-size: 9pt; color: #666666 !important; border-left: 3pt solid #4ecca3; padding: 6pt 10pt; margin-bottom: 14pt; background: #f9f9f9; }\n.user-section h2 { border-bottom-color: #3498db; }\n.assistant-section h2 { border-bottom-color: #4ecca3; }\n.thinking-block { border-left: 3pt solid #6c3483; padding: 6pt 10pt; background: #faf5ff; margin: 6pt 0; font-size: 10pt; color: #555555 !important; }\ntable { border-collapse: collapse; width: 100%; margin: 6pt 0; }\ntd, th { border: 1pt solid #dddddd; padding: 5pt 8pt; font-size: 10pt; color: #333333 !important; }\nth { background: #f4f4f4; font-weight: bold; }\na { color: #2980b9 !important; text-decoration: underline; }\n@media screen { div.WordSection1 { padding: 20px; } }\n@media print { div.WordSection1 { max-width: 100%; } }\n</style>\n</head>\n<body lang="EN-US" style="color:#333333;background:white;">\n<div class="WordSection1" style="color:#333333;">\n'
        + bodyHTML
        + '\n</div>\n</body>\n</html>';
      }

  // ==========================================================
  // Download helper
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
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  // ==========================================================
  // Button handlers
  // ==========================================================
  downloadBtn.addEventListener('click', function () {
    setStatus('Extracting (please wait)...');
    getMessages()
      .then(function (data) {
        var md = toMarkdown(data.messages, data.options);
        var filename = generateFilename(data.options, 'md');
        triggerDownload(md, filename, 'text/markdown;charset=utf-8');
        setStatus('✅ Downloaded ' + data.messages.length + ' messages as .md');
      })
      .catch(function (err) { setStatus('❌ ' + err.message, true); });
  });

  if (downloadDocBtn) {
    downloadDocBtn.addEventListener('click', function () {
      setStatus('Extracting (please wait)...');
      getMessages()
        .then(function (data) {
          var bodyHTML = toWordHTML(data.messages, data.options);
          var fullDoc = generateWordDoc(bodyHTML);
          var filename = generateFilename(data.options, 'doc');
          triggerDownload(fullDoc, filename, 'application/msword;charset=utf-8');
          setStatus('✅ Downloaded ' + data.messages.length + ' messages as .doc');
        })
        .catch(function (err) { setStatus('❌ ' + err.message, true); });
    });
  }

  copyBtn.addEventListener('click', function () {
    setStatus('Extracting (please wait)...');
    getMessages()
      .then(function (data) {
        var md = toMarkdown(data.messages, data.options);
        return navigator.clipboard.writeText(md).then(function () {
          setStatus('✅ Copied ' + data.messages.length + ' messages!');
        });
      })
      .catch(function (err) { setStatus('❌ ' + err.message, true); });
  });
});