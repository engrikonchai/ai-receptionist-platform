/**
 * AI Receptionist Platform — embeddable widget loader.
 *
 * Usage (see /dashboard/widget in the platform for the exact snippet,
 * with your own widget id already filled in):
 *
 *   <script src="https://<platform-domain>/widget-loader.js"
 *           data-widget-id="<public_widget_id>" async></script>
 *
 * Paste it just before </body> on any normal HTML page. This file is
 * plain, dependency-free JavaScript on purpose — it runs directly on a
 * third-party site, so it can't assume any bundler, framework, or
 * module loader is present. It talks only to this platform's own
 * public, unauthenticated API (/api/public-widget/*), which validates
 * the widget id, enabled state, and this page's origin before ever
 * touching the database — see src/lib/public-widget/runtime.ts in the
 * platform repo for that contract. A resumed conversation also carries
 * an opaque `sessionToken` this script stores and replays verbatim
 * (see src/lib/public-widget/session-token.ts) — it never receives or
 * needs any actual secret key.
 */
(function () {
  'use strict';

  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var widgetId = currentScript.getAttribute('data-widget-id');
  if (!widgetId) {
    console.error('[ai-receptionist-widget] Missing data-widget-id on the loader <script> tag.');
    return;
  }

  var API_ORIGIN = new URL(currentScript.src, window.location.href).origin;
  var VISITOR_KEY = 'aireceptionist:' + widgetId + ':visitor-id';
  var CONVERSATION_KEY = 'aireceptionist:' + widgetId + ':conversation-id';
  var SESSION_TOKEN_KEY = 'aireceptionist:' + widgetId + ':session-token';

  function getOrCreateVisitorId() {
    try {
      var existing = window.localStorage.getItem(VISITOR_KEY);
      if (existing) return existing;
      var id =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : 'visitor_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(VISITOR_KEY, id);
      return id;
    } catch {
      return 'visitor_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    }
  }

  function getStoredConversationId() {
    try {
      return window.localStorage.getItem(CONVERSATION_KEY);
    } catch {
      return null;
    }
  }

  function setStoredConversationId(id) {
    try {
      window.localStorage.setItem(CONVERSATION_KEY, id);
    } catch {
      /* ignore — worst case, next load starts a fresh conversation */
    }
  }

  function getStoredSessionToken() {
    try {
      return window.localStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function setStoredSessionToken(token) {
    try {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch {
      /* ignore — worst case, next load starts a fresh conversation */
    }
  }

  function postJson(path, body) {
    return fetch(API_ORIGIN + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, data: { error: 'Could not reach the assistant.' } };
      });
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  fetch(API_ORIGIN + '/api/public-widget/config?widgetId=' + encodeURIComponent(widgetId))
    .then(function (response) {
      return response.ok ? response.json() : null;
    })
    .catch(function () {
      return null;
    })
    .then(function (config) {
      // No config, or the owner has this widget turned off — never show
      // anything to a real visitor, and never surface why.
      if (!config || !config.enabled) return;
      mountWidget(config);
    });

  function mountWidget(config) {
    var host = document.createElement('div');
    host.id = 'ai-receptionist-widget-root';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483000';
    host.style.bottom = '0';
    host.style[config.position === 'bottom-left' ? 'left' : 'right'] = '0';
    document.body.appendChild(host);

    // Shadow DOM keeps the host page's CSS from ever leaking in (or the
    // widget's own styles leaking out) — the one thing a loader script
    // dropped into an arbitrary, unknown page can't assume otherwise.
    var root = host.attachShadow({ mode: 'open' });

    var color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(config.primaryColor)
      ? config.primaryColor
      : '#1677ff';
    var side = config.position === 'bottom-left' ? 'left' : 'right';

    var style = document.createElement('style');
    style.textContent =
      ':host{all:initial}' +
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '.launcher{position:fixed;' +
      side +
      ':16px;bottom:16px;width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;' +
      'background:' +
      color +
      ';box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center}' +
      '.launcher svg{width:26px;height:26px;fill:#fff}' +
      '.panel{position:fixed;' +
      side +
      ':16px;bottom:84px;width:min(340px,calc(100vw - 32px));height:min(480px,calc(100vh - 140px));' +
      'background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden}' +
      '.panel.open{display:flex}' +
      '.header{background:' +
      color +
      ';color:#fff;padding:14px 16px;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center}' +
      '.close{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1;padding:2px}' +
      '.messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f7f8}' +
      '.bubble{max-width:80%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.4;white-space:pre-wrap}' +
      '.bubble.assistant{align-self:flex-start;background:#fff;border:1px solid #e5e5e5;border-bottom-left-radius:4px}' +
      '.bubble.user{align-self:flex-end;background:' +
      color +
      ';color:#fff;border-bottom-right-radius:4px}' +
      '.composer{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e5e5;background:#fff}' +
      '.composer input{flex:1;border:1px solid #ddd;border-radius:9999px;padding:8px 14px;font-size:13px;outline:none}' +
      '.composer button{background:' +
      color +
      ';color:#fff;border:none;border-radius:9999px;width:34px;height:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
      '.composer button:disabled{opacity:.5;cursor:default}';
    root.appendChild(style);

    var launcher = document.createElement('button');
    launcher.className = 'launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open chat with ' + (config.title || 'us'));
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.03 2 11c0 2.4 1.1 4.57 2.9 6.17-.15 1.15-.6 2.33-1.35 3.33a.5.5 0 0 0 .55.78c1.7-.4 3.2-1.15 4.35-1.95A11.6 11.6 0 0 0 12 20c5.52 0 10-4.03 10-9s-4.48-9-10-9z"/></svg>';
    root.appendChild(launcher);

    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML =
      '<div class="header"><span></span><button class="close" type="button" aria-label="Close chat">✕</button></div>' +
      '<div class="messages" role="log" aria-live="polite"></div>' +
      '<div class="composer">' +
      '<input type="text" placeholder="Type a message…" aria-label="Message" />' +
      '<button type="button" aria-label="Send">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>' +
      '</button></div>';
    root.appendChild(panel);

    panel.querySelector('.header span').textContent = config.title || 'Chat with us';
    var messagesEl = panel.querySelector('.messages');
    var input = panel.querySelector('input');
    var sendButton = panel.querySelector('.composer button');
    var closeButton = panel.querySelector('.close');

    var visitorId = getOrCreateVisitorId();
    var conversationId = null;
    var sessionStarted = false;

    function addBubble(role, text) {
      var bubble = document.createElement('div');
      bubble.className = 'bubble ' + (role === 'user' ? 'user' : 'assistant');
      bubble.innerHTML = escapeHtml(text);
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function ensureSession() {
      if (sessionStarted) return Promise.resolve(true);
      sessionStarted = true;
      return postJson('/api/public-widget/session', {
        publicWidgetId: widgetId,
        visitorId: visitorId,
        conversationId: getStoredConversationId() || undefined,
        sessionToken: getStoredSessionToken() || undefined
      }).then(function (result) {
        if (
          !result.ok ||
          result.data.enabled === false ||
          !result.data.conversationId ||
          !result.data.sessionToken
        ) {
          addBubble('assistant', 'Chat is temporarily unavailable. Please try again shortly.');
          return false;
        }
        conversationId = result.data.conversationId;
        setStoredConversationId(conversationId);
        setStoredSessionToken(result.data.sessionToken);
        (result.data.messages || []).forEach(function (m) {
          addBubble(m.role === 'user' ? 'user' : 'assistant', m.text);
        });
        return true;
      });
    }

    function sendMessage() {
      var text = input.value.trim();
      if (!text || !conversationId) return;
      input.value = '';
      sendButton.disabled = true;
      addBubble('user', text);
      postJson('/api/public-widget/message', {
        publicWidgetId: widgetId,
        visitorId: visitorId,
        conversationId: conversationId,
        message: text,
        sessionToken: getStoredSessionToken()
      })
        .then(function (result) {
          if (!result.ok || !result.data.messages) {
            addBubble('assistant', 'Sorry, something went wrong. Please try again.');
            return;
          }
          result.data.messages.forEach(function (m) {
            if (m.role === 'assistant') addBubble('assistant', m.text);
          });
        })
        .finally(function () {
          sendButton.disabled = false;
          input.focus();
        });
    }

    launcher.addEventListener('click', function () {
      panel.classList.add('open');
      launcher.style.display = 'none';
      ensureSession().then(function () {
        input.focus();
      });
    });
    closeButton.addEventListener('click', function () {
      panel.classList.remove('open');
      launcher.style.display = 'flex';
    });
    sendButton.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') sendMessage();
    });
  }
})();
