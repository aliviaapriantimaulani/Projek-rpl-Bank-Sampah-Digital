/**
 * Bank Sampah Digital - AI Assistant Chatbot Frontend Controller
 *
 * Rendering rules (important):
 * - Never inject AI text into the document without escaping/sanitizing it.
 * - Never use replaceWith() on document-level nodes.
 * - If Markdown parsing or sanitizing fails, fall back to textContent so the
 *   answer is shown as plain text instead of being lost.
 */

const Chatbot = {
  isOpen: false,
  isTyping: false,
  history: [],
  containerEl: null,
  windowEl: null,
  fabEl: null,
  messagesEl: null,
  inputEl: null,
  sendBtnEl: null,

  MAX_HISTORY_MESSAGES: 10,
  REQUEST_TIMEOUT_MS: 45000,
  activeRequestController: null,

  defaultPrompts: [
    'Halo! Siapa kamu?',
    'Berapa harga sampah botol plastik saat ini?',
    'Bagaimana cara menabung sampah di Bank Sampah Digital?',
    'Kategori sampah apa yang paling mahal?',
    'Berapa saldo dan poin tabungan saya?',
  ],

  // Conservative allow-list for AI-generated HTML.
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'strong', 'em', 'u', 's', 'del',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'span', 'div',
  ],
  allowedAttributes: ['href', 'target', 'rel', 'class'],

  init() {
    this.renderElements();
    this.attachEventListeners();
    this.loadSuggestions();
  },

  renderElements() {
    if (document.getElementById('chatbot-root')) return;

    const root = document.createElement('div');
    root.id = 'chatbot-root';
    root.innerHTML = `
      <!-- Floating Chat Launcher Button (FAB with Chat Icon) -->
      <button type="button" class="chatbot-fab" id="chatbot-fab" aria-label="Buka Chatbot Asisten AI" title="Tanya Asisten AI Bank Sampah">
        <span class="chatbot-fab-pulse"></span>
        <div class="chatbot-fab-icon">
          <!-- Modern SVG Speech Bubble Chat Icon -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <span class="chatbot-fab-tooltip">💬 Tanya Asisten AI</span>
      </button>

      <!-- Floating Chatbot Window -->
      <div class="chatbot-window" id="chatbot-window" role="dialog" aria-modal="true" aria-labelledby="chatbot-header-title">
        <!-- Header -->
        <div class="chatbot-header">
          <div class="chatbot-header-info">
            <div class="chatbot-avatar">🌱</div>
            <div>
              <div class="chatbot-title" id="chatbot-header-title">Asisten AI Bank Sampah</div>
              <div class="chatbot-badge-nous">
                <span>⚡</span> <span>Asisten Data &amp; Layanan</span>
              </div>
            </div>
          </div>
          <div class="chatbot-header-actions">
            <button type="button" class="chatbot-btn-icon" id="chatbot-btn-reset" title="Mulai Percakapan Baru">🔄</button>
            <button type="button" class="chatbot-btn-icon" id="chatbot-btn-close" title="Tutup Chat">✕</button>
          </div>
        </div>

        <!-- Chat Messages Container -->
        <div class="chatbot-body" id="chatbot-messages">
          <div class="chatbot-welcome-card">
            <div class="chatbot-welcome-title">
              <span>👋</span>
              <span>Halo! Saya Asisten AI Bank Sampah Digital</span>
            </div>
            <div>
              Saya siap menjawab pertanyaan seputar identitas saya, jenis &amp; harga sampah terkini, cara menabung sampah, saldo tabungan, serta data operasional sesuai hak akses Anda.
            </div>
            <div class="chatbot-suggestions" id="chatbot-suggestion-chips">
              <!-- Dynamically rendered -->
            </div>
          </div>
        </div>

        <!-- Footer / Input Form -->
        <div class="chatbot-footer">
          <form class="chatbot-form" id="chatbot-form">
            <input
              type="text"
              class="chatbot-input"
              id="chatbot-input"
              placeholder="Ketik pertanyaan dalam Bahasa Indonesia..."
              autocomplete="off"
              maxlength="1000"
            />
            <button type="submit" class="chatbot-send-btn" id="chatbot-send-btn" title="Kirim Pesan">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
          <div class="chatbot-meta-tag">
            <span>🟢 AI Assistant &amp; Real-Time Database</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    this.containerEl = root;
    this.fabEl = document.getElementById('chatbot-fab');
    this.windowEl = document.getElementById('chatbot-window');
    this.messagesEl = document.getElementById('chatbot-messages');
    this.inputEl = document.getElementById('chatbot-input');
    this.sendBtnEl = document.getElementById('chatbot-send-btn');
  },

  attachEventListeners() {
    this.fabEl.addEventListener('click', () => this.toggle());
    document.getElementById('chatbot-btn-close').addEventListener('click', () => this.toggle(false));
    document.getElementById('chatbot-btn-reset').addEventListener('click', () => this.resetConversation());

    // Form submit handler
    this.containerEl.querySelector('.chatbot-form').addEventListener('submit', (e) => this.handleSubmit(e));

    // Close when ESC key is pressed
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.toggle(false);
      }
    });
  },

  async loadSuggestions() {
    const container = document.getElementById('chatbot-suggestion-chips');
    if (!container) return;

    const userRole = (typeof State !== 'undefined' && State.getRole) ? State.getRole() : '';
    let prompts = this.defaultPrompts;
    try {
      if (typeof API !== 'undefined' && API.getChatbotSuggestions) {
        const res = await API.getChatbotSuggestions(userRole);
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          prompts = res.data;
        }
      }
    } catch (e) {
      // Fallback to defaultPrompts
    }

    container.innerHTML = '';
    prompts.forEach((prompt) => {
      const text = String(prompt || '').trim();
      if (!text) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chatbot-chip';

      const icon = document.createElement('span');
      icon.textContent = '💬';
      const label = document.createElement('span');
      label.textContent = text;

      button.appendChild(icon);
      button.appendChild(label);
      button.addEventListener('click', () => this.askQuick(text));
      container.appendChild(button);
    });
  },

  toggle(forceState) {
    this.isOpen = typeof forceState === 'boolean' ? forceState : !this.isOpen;
    if (this.isOpen) {
      this.windowEl.classList.add('is-open');
      this.loadSuggestions();
      setTimeout(() => this.inputEl?.focus(), 150);
      this.scrollToBottom();
    } else {
      this.windowEl.classList.remove('is-open');
    }
  },

  askQuick(question) {
    if (!this.isOpen) this.toggle(true);
    this.sendMessage(question);
  },

  handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const query = this.inputEl.value.trim();
    if (!query || this.isTyping) return;
    this.sendMessage(query);
  },

  /**
   * Send a question to the AI assistant.
   * @param {string} text
   * @param {Object} [options]
   * @param {boolean} [options.appendUserMessage=true] Set false when retrying.
   */
  async sendMessage(text, options = {}) {
    const question = String(text || '').trim();
    if (!question || this.isTyping) return;

    // Ambil data session user aktif (dari State atau API/localStorage)
    const currentUser = (typeof State !== 'undefined' && State.user)
      ? State.user
      : (typeof API !== 'undefined' && API.getUser ? API.getUser() : null);

    const userRole = (currentUser?.role || 'GUEST').toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const userContext = {
      id_user: currentUser?.id || currentUser?.id_user || null,
      id: currentUser?.id || currentUser?.id_user || null,
      name: currentUser?.name || '',
      role: userRole,
      email: currentUser?.email || '',
      isAdmin: isAdmin,
      customer_id: currentUser?.customer_id || null,
    };

    const appendUserMessage = options.appendUserMessage !== false;

    if (this.inputEl) this.inputEl.value = '';
    if (appendUserMessage) {
      this.appendUserMessage(question);
      this.history.push({ role: 'user', content: question });
    }

    this.setTyping(true);

    // Abort the in-flight request if it takes too long so the UI never hangs.
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.activeRequestController = controller;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);
    }

    try {
      const historyPayload = this.history.slice(-this.MAX_HISTORY_MESSAGES);
      const res = await API.askAiAssistant(question, historyPayload, {
        timeout: this.REQUEST_TIMEOUT_MS,
        signal: controller ? controller.signal : undefined,
        userContext: userContext
      });

      // The backend wraps payloads as { success, message, data }. Accept a plain
      // object/string as well so a future API change cannot blank the bubble.
      const payload = res && res.data !== undefined && res.data !== null ? res.data : res;
      const reply =
        (typeof payload === 'string' && payload) ||
        (payload && (payload.answer || payload.reply || payload.response)) ||
        '';

      if (!reply || !String(reply).trim()) {
        throw new Error('Asisten AI mengembalikan jawaban kosong.');
      }

      const modelLabels = {
        'gpt-4o': 'GPT-4o',
        'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
        'gemini-1-5-pro': 'Gemini 1.5 Pro',
        'deepseek-r1': 'DeepSeek R1',
      };
      const activeModelKey = (typeof State !== 'undefined' && State.getAiModel)
        ? State.getAiModel()
        : (localStorage.getItem('bs_ai_model') || 'gpt-4o');
      const fallbackModelName = modelLabels[activeModelKey] || activeModelKey;
      const modelName = payload && payload.model ? String(payload.model) : fallbackModelName;
      this.appendBotMessage(String(reply), modelName, {
        source: payload && payload.source,
        functionCall: payload && payload.functionCall,
        authorized: payload && payload.authorized !== false,
        roleAccess: payload && payload.roleAccess,
      });
      this.history.push({ role: 'assistant', content: String(reply) });
    } catch (err) {
      const message = this.describeError(err);
      const messageEl = this.appendBotMessage(message, null, { variant: 'error' });
      this.appendRetryButton(messageEl, question);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.activeRequestController = null;
      this.setTyping(false);
      this.scrollToBottom();
    }
  },

  describeError(err) {
    const raw = (err && err.message) || 'Kesalahan tidak diketahui';
    let detail = '⚠️ Maaf, terjadi kendala saat menghubungi asisten AI.';

    if (/401|unauthorized/i.test(raw)) {
      detail += '\n\n🔒 Sesi Anda telah berakhir. Silakan login kembali.';
    } else if (/403|forbidden/i.test(raw)) {
      detail += '\n\n🚫 Akses ditolak. Anda tidak memiliki izin untuk fitur ini.';
    } else if (/404|not found/i.test(raw)) {
      detail += '\n\n🔍 Endpoint AI tidak ditemukan. Hubungi administrator.';
    } else if (/timeout|abort/i.test(raw) || (err && err.name === 'AbortError')) {
      detail += '\n\n⏱️ Permintaan timeout. Server terlalu lama merespons.';
    } else if (/network|failed to fetch|load failed/i.test(raw) || (err && err.name === 'TypeError')) {
      detail += '\n\n📡 Tidak dapat terhubung ke server. Periksa koneksi internet atau pastikan backend berjalan.';
    } else if (/500|internal server/i.test(raw)) {
      detail += '\n\n⚙️ Terjadi kesalahan pada server. Silakan coba lagi nanti.';
    } else if (/kosong/i.test(raw)) {
      detail += '\n\n📝 Asisten tidak mengembalikan jawaban. Silakan coba lagi.';
    } else {
      detail += `\n\n📝 Detail: ${raw}`;
    }

    return detail;
  },

  appendRetryButton(messageEl, question) {
    if (!messageEl) return;
    const bubble = messageEl.querySelector('.chatbot-bubble');
    if (!bubble) return;

    const wrap = document.createElement('div');
    wrap.style.marginTop = '0.5rem';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary btn-sm';
    button.textContent = '🔄 Coba Lagi';
    button.addEventListener('click', () => {
      button.disabled = true;
      this.sendMessage(question, { appendUserMessage: false });
    });

    wrap.appendChild(button);
    bubble.appendChild(wrap);
  },

  appendUserMessage(text) {
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'chatbot-msg chatbot-msg-user';

    const bubble = document.createElement('div');
    bubble.className = 'chatbot-bubble';
    bubble.textContent = String(text);

    const timeEl = document.createElement('div');
    timeEl.className = 'chatbot-msg-time';
    timeEl.textContent = time;

    div.appendChild(bubble);
    div.appendChild(timeEl);
    this.messagesEl.appendChild(div);
    this.scrollToBottom();
  },

  /**
   * Render an assistant message safely.
   * @returns {HTMLElement} the message element (useful for appending actions)
   */
  appendBotMessage(markdownText, modelName, options = {}) {
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'chatbot-msg chatbot-msg-bot';
    if (options.variant === 'error') div.classList.add('chatbot-msg-error');

    const bubble = document.createElement('div');
    bubble.className = 'chatbot-bubble';

    const source = markdownText === null || markdownText === undefined ? '' : String(markdownText);

    let fragment = null;
    let errorMessage = null;
    try {
      const formattedHtml = this.parseSimpleMarkdown(source);
      if (formattedHtml && String(formattedHtml).trim()) {
        fragment = this.htmlToFragment(formattedHtml);
      }
    } catch (err) {
      console.warn('[Chatbot] Markdown rendering failed, using plain text:', err && err.message);
      formattedHtml = '';
      fragment = null;
    }

    // If fragment is valid, use it; otherwise fall back to plain textContent
    try {
      if (fragment && fragment.childNodes && fragment.childNodes.length) {
        bubble.appendChild(fragment);
      } else {
        // Last-resort fallback: plain text via textContent so content is never lost.
        // This also avoids HierarchyRequestError from replaceWith on root elements.
        const plain = document.createElement('span');
        plain.style.whiteSpace = 'pre-wrap';
        plain.textContent = source;
        bubble.appendChild(plain);
      }
    } catch (err) {
      // HierarchyRequestError or other DOM error — use textContent unconditionally
      console.warn('[Chatbot] DOM error when appending bubble, using textContent fallback:', err && err.message);
      const plain = document.createElement('span');
      plain.style.whiteSpace = 'pre-wrap';
      plain.textContent = source;
      bubble.appendChild(plain);
    }

    // Output murni teks/markdown dinamis AI tanpa komponen UI badge/card statis yang di-hardcode
    if (modelName) {
      const badge = document.createElement('div');
      badge.style.cssText = 'font-size: 0.65rem; color: #10b981; margin-top: 0.35rem; font-weight: 600;';
      badge.textContent = `✨ ${modelName}`;
      bubble.appendChild(badge);
    }

    const timeEl = document.createElement('div');
    timeEl.className = 'chatbot-msg-time';
    timeEl.textContent = time;

    div.appendChild(bubble);
    div.appendChild(timeEl);
    this.messagesEl.appendChild(div);
    this.scrollToBottom();

    return div;
  },

  setTyping(typing) {
    this.isTyping = typing;
    const existing = document.getElementById('chatbot-typing-indicator');

    if (typing) {
      if (!existing) {
        const div = document.createElement('div');
        div.id = 'chatbot-typing-indicator';
        div.className = 'chatbot-msg chatbot-msg-bot';
        div.innerHTML = `
          <div class="chatbot-typing">
            <span class="chatbot-typing-dot"></span>
            <span class="chatbot-typing-dot"></span>
            <span class="chatbot-typing-dot"></span>
            <span style="font-size: 0.75rem; color: #64748b; margin-left: 0.3rem;">Asisten sedang merespons...</span>
          </div>
        `;
        this.messagesEl.appendChild(div);
        this.scrollToBottom();
      }
      if (this.sendBtnEl) this.sendBtnEl.disabled = true;
    } else {
      if (existing) existing.remove();
      if (this.sendBtnEl) this.sendBtnEl.disabled = false;
    }
  },

  resetConversation() {
    this.history = [];
    const msgs = this.messagesEl.querySelectorAll('.chatbot-msg');
    msgs.forEach((m) => m.remove());
    this.appendBotMessage('Percakapan telah direset. Silakan tanyakan hal lain yang ingin Anda ketahui!');
  },

  scrollToBottom() {
    setTimeout(() => {
      if (this.messagesEl) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      }
    }, 50);
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Convert already-sanitized HTML into a detached DocumentFragment.
   *
   * This deliberately uses a <template> (an inert document) and never calls
   * replaceWith()/append() on the live document, which is what used to throw
   * "HierarchyRequestError: Only one element on document allowed".
   */
  htmlToFragment(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    return document.importNode(template.content, true);
  },

  /**
   * Sanitize HTML using DOMPurify when available, otherwise a safe
   * <template>-based allow-list walker (no document.replaceWith usage).
   */
  sanitizeHtml(html) {
    const input = String(html || '');
    if (!input.trim()) return '';

    // Use DOMPurify when available — it's the safest sanitizer.
    // It never calls replaceWith() on the live document root.
    if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      try {
        const clean = window.DOMPurify.sanitize(input, {
          ALLOWED_TAGS: this.allowedTags,
          ALLOWED_ATTR: this.allowedAttributes,
          ALLOW_DATA_ATTR: false,
          FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'],
          FORBID_ATTR: ['style', 'srcset', 'onerror', 'onload', 'onclick'],
          KEEP_CONTENT: true,
        });
        return clean === null || clean === undefined ? '' : String(clean);
      } catch (err) {
        console.warn('[Chatbot] DOMPurify failed, using fallback sanitizer:', err && err.message);
      }
    }

    // Fallback: template-based sanitizer that never uses replaceWith() on document nodes.
    try {
      return this.sanitizeHtmlFallback(input);
    } catch (err) {
      console.warn('[Chatbot] Fallback sanitizer failed:', err && err.message);
      return '';
    }
  },

  sanitizeHtmlFallback(html) {
    const allowedTags = new Set(this.allowedTags);
    const allowedAttributes = new Set(this.allowedAttributes);
    const dropEntirely = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'link', 'meta', 'base', 'head', 'html', 'body', 'svg', 'math']);
    const urlAttrs = new Set(['href', 'src', 'xlink:href']);

    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const root = template.content;

    const elements = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) elements.push(walker.currentNode);

    elements.forEach((el) => {
      const tag = el.tagName ? el.tagName.toLowerCase() : '';

      if (!allowedTags.has(tag)) {
        if (dropEntirely.has(tag)) {
          el.remove();
          return;
        }
        // Unwrap unknown tags (keep their text/children).
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        return;
      }

      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim();

        if (!allowedAttributes.has(name)) {
          el.removeAttribute(attr.name);
          return;
        }
        if (urlAttrs.has(name) && !/^(https?:|mailto:|tel:|#|\/)/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      });

      if (tag === 'a') {
        el.setAttribute('rel', 'noopener noreferrer');
        if (!el.getAttribute('target')) el.setAttribute('target', '_blank');
      }
    });

    return template.innerHTML;
  },

  /** Inline formatting for a single line of already-untrusted text. */
  renderInline(text) {
    const input = text === null || text === undefined ? '' : String(text);

    // Protect inline code first: identifiers such as `ai_analysis_records`
    // must never be treated as Markdown emphasis.
    return input
      .split(/(`[^`\n]*`)/g)
      .map((part) => {
        if (/^`[^`\n]*`$/.test(part)) {
          return `<code>${this.escapeHtml(part.slice(1, -1))}</code>`;
        }

        let out = this.escapeHtml(part);

        // Bold: **text** and __text__
        out = out.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');

        // Strikethrough
        out = out.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');

        // Italic: single *text* (never part of **)
        out = out.replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<em>$2</em>');

        // Italic: _text_ only when the underscores are word boundaries.
        // This keeps snake_case identifiers (branch_id, account_no) intact.
        out = out.replace(/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');

        // Links: only http(s) URLs are linked.
        out = out.replace(
          /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // Remove unmatched bold markers so raw ** never reaches users.
        out = out.replace(/\*\*/g, '');

        return out;
      })
      .join('');
  },

  isTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ''));
  },

  splitTableRow(line) {
    let row = String(line || '').trim();
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|')) row = row.slice(0, -1);
    return row.split('|').map((cell) => cell.trim());
  },

  /**
   * Consume a Markdown list (bullets or numbered) including indented
   * continuation lines and blank lines between items. Returns the items and
   * the index where parsing should resume.
   */
  consumeList(lines, startIndex, itemPattern) {
    const items = [];
    let i = startIndex;

    while (i < lines.length) {
      const match = lines[i].match(itemPattern);
      if (!match) break;

      let text = match[1];
      i += 1;

      while (i < lines.length) {
        const next = lines[i];
        if (/^\s*$/.test(next)) break;
        if (itemPattern.test(next)) break;
        if (/^\s*```/.test(next)) break;
        if (/^\s{0,3}#{1,6}\s+/.test(next)) break;
        if (/^\s*>\s?/.test(next)) break;
        if (/^\s*[-*+]\s+/.test(next) || /^\s*\d+[.)]\s+/.test(next)) break;
        if (next.includes('|') && i + 1 < lines.length && this.isTableSeparator(lines[i + 1])) break;
        text += `\n${next.trim()}`;
        i += 1;
      }

      items.push(text);

      // Allow a blank line between list items without ending the list.
      let j = i;
      while (j < lines.length && /^\s*$/.test(lines[j])) j += 1;
      if (j < lines.length && itemPattern.test(lines[j])) {
        i = j;
        continue;
      }
      break;
    }

    return { items, nextIndex: i };
  },

  /**
   * Lightweight, line-based Markdown renderer.
   * Produces valid HTML (no <p> nesting around block elements) and never
   * throws on odd input; callers still keep a textContent fallback.
   */
  parseSimpleMarkdown(text) {
    if (!text) return '';

    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Blank line: paragraph break.
      if (/^\s*$/.test(line)) {
        i += 1;
        continue;
      }

      // Fenced code block
      if (/^\s*```/.test(line)) {
        const codeLines = [];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1; // closing fence
        out.push(`<pre><code>${this.escapeHtml(codeLines.join('\n'))}</code></pre>`);
        continue;
      }

      // Table (header row + separator row)
      if (line.includes('|') && i + 1 < lines.length && this.isTableSeparator(lines[i + 1])) {
        const headers = this.splitTableRow(line);
        i += 2;

        const rows = [];
        while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
          rows.push(this.splitTableRow(lines[i]));
          i += 1;
        }

        let table = '<table class="data-table"><thead><tr>';
        headers.forEach((cell) => {
          table += `<th>${this.renderInline(cell)}</th>`;
        });
        table += '</tr></thead><tbody>';
        rows.forEach((row) => {
          table += '<tr>';
          headers.forEach((_, idx) => {
            table += `<td>${this.renderInline(row[idx] || '')}</td>`;
          });
          table += '</tr>';
        });
        table += '</tbody></table>';
        out.push(table);
        continue;
      }

      // Heading
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        out.push(`<h${level}>${this.renderInline(heading[2])}</h${level}>`);
        i += 1;
        continue;
      }

      // Horizontal rule
      if (/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      // Blockquote
      if (/^\s*>\s?/.test(line)) {
        const quoted = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*>\s?/, ''));
          i += 1;
        }
        out.push(`<blockquote>${this.renderInline(quoted.join(' '))}</blockquote>`);
        continue;
      }

      // Unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        const parsed = this.consumeList(lines, i, /^\s*[-*+]\s+(.*)$/);
        i = parsed.nextIndex;
        out.push(`<ul>${parsed.items.map((item) => `<li>${this.renderInline(item).replace(/\n/g, '<br>')}</li>`).join('')}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const parsed = this.consumeList(lines, i, /^\s*\d+[.)]\s+(.*)$/);
        i = parsed.nextIndex;
        out.push(`<ol>${parsed.items.map((item) => `<li>${this.renderInline(item).replace(/\n/g, '<br>')}</li>`).join('')}</ol>`);
        continue;
      }

      // Paragraph: collect until a blank line or the start of another block.
      const paragraph = [];
      while (i < lines.length) {
        const current = lines[i];
        if (/^\s*$/.test(current)) break;
        if (/^\s*```/.test(current)) break;
        if (/^\s{0,3}#{1,6}\s+/.test(current)) break;
        if (/^\s*>\s?/.test(current)) break;
        if (/^\s*[-*+]\s+/.test(current)) break;
        if (/^\s*\d+[.)]\s+/.test(current)) break;
        if (current.includes('|') && i + 1 < lines.length && this.isTableSeparator(lines[i + 1])) break;
        paragraph.push(current);
        i += 1;
      }
      out.push(`<p>${paragraph.map((row) => this.renderInline(row)).join('<br>')}</p>`);
    }

    const sanitized = this.sanitizeHtml(out.join(''));
    return sanitized && String(sanitized).trim() ? String(sanitized) : '';
  },
};

// Global helpers accessible from UI buttons
window.Chatbot = Chatbot;
window.toggleChatbot = (state) => Chatbot.toggle(state);
window.quickAskChatbot = (prompt) => Chatbot.askQuick(prompt);

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Chatbot.init());
} else {
  Chatbot.init();
}
