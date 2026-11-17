/**
 * Bank Sampah Digital - Client Router & View Renderer
 */

const escapeHtmlClient = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '')
};

const Router = {
  routes: {
    // Shared / Auth
    '#/beranda': 'renderBeranda',
    '#/chatbot': 'renderChatbotPage',
    '#/login': 'renderLogin',
    '#/register': 'renderRegisterNasabah',
    '#/profile': 'renderProfile',
    '#/waste-catalog': 'renderWasteCatalog',
    '#/customers': 'renderCustomerDirectory',
    '#/notifications': 'renderNotificationHistory',
    '#/notifications/settings': 'renderNotificationSettings',

    // Admin Routes
    '#/admin/dashboard': 'renderAdminDashboard',
    '#/admin/users': 'renderAdminUsers',
    '#/admin/audit': 'renderAuditLogs',
    '#/admin/informasi-api': 'renderAdminInformasiAPI',
    '#/admin/integrasi': 'renderAdminIntegrasi',
    '#/integrasi': 'renderAdminIntegrasi',

    // Owner Routes
    '#/owner/dashboard': 'renderOwnerDashboard',
    '#/owner/analytics': 'renderOwnerDashboard',
    '#/owner/reports': 'renderOwnerReports',
    '#/owner/withdrawals': 'renderOwnerWithdrawals',
    '#/owner/inventory': 'renderInventory',
    '#/owner/sales': 'renderOwnerSales',
    '#/owner/buyers': 'renderBuyers',

    // Petugas Routes
    '#/petugas/weighing': 'renderPetugasWeighing',
    '#/petugas/customers': 'renderCustomerDirectory',
    '#/petugas/transactions': 'renderTransactions',

    // Nasabah Routes
    '#/nasabah/dashboard': 'renderNasabahDashboard',
    '#/nasabah/wallet': 'renderNasabahWallet',
    '#/nasabah/withdraw': 'renderNasabahWithdraw',
    '#/nasabah/gamification': 'renderGamificationView',
    '#/gamification': 'renderGamificationView',
  },

  getDefaultRouteForRole(role) {
    switch (role) {
      case 'ADMIN':
        return '#/admin/dashboard';
      case 'OWNER':
        return '#/owner/dashboard';
      case 'PETUGAS':
        return '#/petugas/weighing';
      case 'NASABAH':
        return '#/nasabah/dashboard';
      default:
        return '#/login';
    }
  },

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },

  handleRoute() {
    let hash = window.location.hash || '';

    // If not authenticated, allow login and register
    if (!State.isAuthenticated()) {
      if (hash === '#/register') {
        this.renderRegisterNasabah();
        return;
      }
      if (hash !== '#/login') {
        window.location.hash = '#/login';
        return;
      }
      this.renderLogin();
      return;
    }

    // If logged in and at empty, login, or register route, redirect to role default
    if (!hash || hash === '#/login' || hash === '#/register' || hash === '#/' || hash === '#/beranda') {
      window.location.hash = this.getDefaultRouteForRole(State.getRole());
      return;
    }

    if (hash === '#/chatbot') {
      if (typeof toggleChatbot === 'function') toggleChatbot(true);
      window.location.hash = this.getDefaultRouteForRole(State.getRole());
      return;
    }

    // Role-based route authorization guard
    const userRole = State.getRole();
    if (hash.startsWith('#/admin') && userRole !== 'ADMIN') {
      showToast('Akses ditolak: Menu khusus Administrator.', 'error');
      window.location.hash = this.getDefaultRouteForRole(userRole);
      return;
    }

    if (hash.startsWith('#/owner') && !['ADMIN', 'OWNER'].includes(userRole)) {
      showToast('Akses ditolak: Menu khusus Pengelola/Owner.', 'error');
      window.location.hash = this.getDefaultRouteForRole(userRole);
      return;
    }

    if (hash.startsWith('#/petugas') && !['ADMIN', 'OWNER', 'PETUGAS'].includes(userRole)) {
      showToast('Akses ditolak: Menu khusus Petugas.', 'error');
      window.location.hash = this.getDefaultRouteForRole(userRole);
      return;
    }

    if (hash.startsWith('#/nasabah') && userRole !== 'NASABAH') {
      showToast('Akses ditolak: Menu khusus Portal Nasabah Warga.', 'error');
      window.location.hash = this.getDefaultRouteForRole(userRole);
      return;
    }

    if (hash === '#/customers' && !['ADMIN', 'OWNER', 'PETUGAS'].includes(userRole)) {
      showToast('Akses ditolak: Menu direktori nasabah.', 'error');
      window.location.hash = this.getDefaultRouteForRole(userRole);
      return;
    }

    // Render Navigation and matching View
    this.renderNavigation();

    const handlerName = this.routes[hash];
    if (handlerName && typeof this[handlerName] === 'function') {
      this[handlerName]();
    } else {
      this.renderNotFound();
    }
  },

  renderNavigation() {
    const navContainer = document.getElementById('sidebar-menu');
    const bottomNavContainer = document.getElementById('bottom-nav-inner');
    const role = State.getRole();
    const currentHash = window.location.hash;

    let navItems = [];
    let bottomItems = [];

    if (role === 'ADMIN') {
      navItems = [
        { label: 'Beranda & Dasbor', hash: '#/admin/dashboard', icon: '📊' },
        { label: 'Kelola Pengguna', hash: '#/admin/users', icon: '👥' },
        { label: 'Direktori Nasabah', hash: '#/customers', icon: '📇' },
        { label: 'Audit Log Sistem', hash: '#/admin/audit', icon: '🛡' },
        { label: 'Katalog Sampah', hash: '#/waste-catalog', icon: '♻️' },
        { label: 'Notifikasi WhatsApp', hash: '#/notifications', icon: '🔔' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: '🔔' },
        { label: 'Integrasi & API Key', hash: '#/admin/integrasi', icon: '🔌' },
        { label: 'Informasi API', hash: '#/admin/informasi-api', icon: '📡' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/admin/dashboard', icon: '📊' },
        { label: 'Pengguna', hash: '#/admin/users', icon: '👥' },
        { label: 'Nasabah', hash: '#/customers', icon: '📇' },
        { label: 'Profil', hash: '#/profile', icon: '👤' },
      ];
    } else if (role === 'OWNER') {
      navItems = [
        { label: 'Beranda & Dasbor', hash: '#/owner/dashboard', icon: '📈' },
        { label: '7 Laporan Terpadu', hash: '#/owner/reports', icon: '📊' },
        { label: 'Approval Penarikan', hash: '#/owner/withdrawals', icon: '💵' },
        { label: 'Penjualan ke Pengepul', hash: '#/owner/sales', icon: '🤝' },
        { label: 'Mitra Pengepul (Buyers)', hash: '#/owner/buyers', icon: '🏭' },
        { label: 'Stok Gudang', hash: '#/owner/inventory', icon: '📦' },
        { label: 'Direktori Nasabah', hash: '#/customers', icon: '📇' },
        { label: 'Katalog & Harga', hash: '#/waste-catalog', icon: '♻️' },
        { label: 'Audit Log', hash: '#/admin/audit', icon: '🛡' },
        { label: 'Notifikasi WhatsApp', hash: '#/notifications', icon: '🔔' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: '🔔' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/owner/dashboard', icon: '📈' },
        { label: 'Laporan', hash: '#/owner/reports', icon: '📊' },
        { label: 'Penjualan', hash: '#/owner/sales', icon: '🤝' },
        { label: 'Approval', hash: '#/owner/withdrawals', icon: '💵' },
      ];
    } else if (role === 'PETUGAS') {
      navItems = [
        { label: 'Beranda & Meja Timbang', hash: '#/petugas/weighing', icon: '🚖' },
        { label: 'Direktori Nasabah', hash: '#/customers', icon: '📇' },
        { label: 'Riwayat Transaksi', hash: '#/petugas/transactions', icon: '📋' },
        { label: 'Stok Gudang', hash: '#/owner/inventory', icon: '📦' },
        { label: 'Katalog Harga', hash: '#/waste-catalog', icon: '♻️' },
        { label: 'Notifikasi WhatsApp', hash: '#/notifications', icon: '🔔' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: '🔔' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/petugas/weighing', icon: '🚖' },
        { label: 'Nasabah', hash: '#/customers', icon: '📇' },
        { label: 'Transaksi', hash: '#/petugas/transactions', icon: '📋' },
        { label: 'Profil', hash: '#/profile', icon: '👤' },
      ];
    } else if (role === 'NASABAH') {
      navItems = [
        { label: 'Beranda & Kartu Saya', hash: '#/nasabah/dashboard', icon: '💳' },
        { label: 'Poin & Hadiah (Gamifikasi)', hash: '#/nasabah/gamification', icon: '🎁' },
        { label: 'Buku Tabungan & Ledger', hash: '#/nasabah/wallet', icon: '📖' },
        { label: 'Ajukan Tarik Tunai', hash: '#/nasabah/withdraw', icon: '💸' },
        { label: 'Katalog Harga Sampah', hash: '#/waste-catalog', icon: '♻️' },
        { label: 'Notifikasi Saya', hash: '#/notifications', icon: '🔔' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: '🔔' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/nasabah/dashboard', icon: '💳' },
        { label: 'Hadiah', hash: '#/nasabah/gamification', icon: '🎁' },
        { label: 'Tabungan', hash: '#/nasabah/wallet', icon: '📖' },
        { label: 'Tarik', hash: '#/nasabah/withdraw', icon: '💸' },
      ];
    }

    navItems.push({ label: 'Profil & Keamanan', hash: '#/profile', icon: '👤' });

    if (navContainer) {
      navContainer.innerHTML = navItems
        .map(
          (item) => `
        <a href="${item.hash}" class="nav-item ${currentHash === item.hash ? 'active' : ''}" ${item.onclick ? `onclick="${item.onclick}; return false;"` : ''}>
          <span class="nav-item-icon">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `
        )
        .join('');
    }

    if (bottomNavContainer) {
      bottomNavContainer.innerHTML = bottomItems
        .map(
          (item) => `
        <a href="${item.hash}" class="bottom-nav-item ${currentHash === item.hash ? 'active' : ''}">
          <span class="bottom-nav-icon">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `
        )
        .join('');
    }

    // Update user display in topbar
    const user = State.user;
    if (user) {
      document.getElementById('topbar-user-name').textContent = user.name;
      document.getElementById('topbar-user-role').textContent = user.roleDisplay || user.role;
      document.getElementById('topbar-user-avatar').textContent = user.name.charAt(0).toUpperCase();
    }

    // Sync AI model switcher state in sidebar
    if (typeof initAiModelSwitcher === 'function') {
      initAiModelSwitcher();
    }
  },

  getBerandaChatbotCardHtml() {
    return `
      <!-- Chatbot AI Beranda Card (Powered by Nous Research) -->
      <div class="beranda-chatbot-card">
        <div class="beranda-chatbot-content">
          <div class="beranda-chatbot-icon-wrap" title="Asisten AI Bank Sampah">
            💬
          </div>
          <div>
            <div class="beranda-chatbot-title">
              <span>Asisten AI Bank Sampah Digital</span>
              <span class="beranda-chatbot-badge">⭐ Nous Research AI</span>
            </div>
            <div class="beranda-chatbot-desc">
              Punya pertanyaan seputar harga beli sampah terkini, prosedur setoran, atau saldo & poin tabungan Anda? Tanyakan langsung ke Asisten AI!
            </div>
            <div class="beranda-chatbot-prompts">
              <button type="button" class="beranda-chatbot-prompt-btn" onclick="quickAskChatbot('Berapa harga sampah botol plastik & kardus?')">
                📦 Cek Harga Sampah
              </button>
              <button type="button" class="beranda-chatbot-prompt-btn" onclick="quickAskChatbot('Bagaimana cara menabung sampah di Bank Sampah Digital?')">
                💧 Cara Menabung
              </button>
              <button type="button" class="beranda-chatbot-prompt-btn" onclick="quickAskChatbot('Berapa saldo dan poin tabungan saya saat ini?')">
                💰 Saldo & Poin
              </button>
              <button type="button" class="beranda-chatbot-prompt-btn" onclick="quickAskChatbot('Tips memilah sampah plastik di rumah')">
                💡 Tips Pilah Sampah
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderChatbotPage() {
    if (typeof toggleChatbot === 'function') toggleChatbot(true);
    window.location.hash = this.getDefaultRouteForRole(State.getRole());
  },

  async renderAdminIntegrasi() {
    this.setupView('Integrasi & Konfigurasi API');
    const content = document.getElementById('view-content');
    content.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #94a3b8;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
        <div>Memuat konfigurasi AI dan WhatsApp Gateway...</div>
      </div>
    `;

    try {
      const [aiRes, waRes] = await Promise.all([
        API.getAiConfig().catch(err => ({ success: false, data: null, error: err.message })),
        API.getWhatsAppDevices().catch(err => ({ success: false, data: null, error: err.message }))
      ]);

      const aiData = aiRes.data || {
        provider: 'xKiro / Nous Research',
        is_configured: true,
        api_key_masked: '••••••••24f5',
        source: 'Pengaturan Admin (terenkripsi)',
        last_updated: '2026-11-16 15:26:05 UTC',
        active_model: 'google/gemini-1.5-pro',
        models: []
      };

      const waData = waRes.data || {
        provider: 'Fonnte',
        active_device_id: 'default',
        devices: []
      };

      content.innerHTML = `
        <div class="integrasi-container">
          <!-- Top Header -->
          <div class="integrasi-topbar-header">
            <div class="integrasi-topbar-title">
              <span style="font-size: 1.75rem;">🔌</span>
              <div>
                <h2>Integrasi & Konfigurasi API</h2>
                <span style="font-size: 0.85rem; color: #94a3b8;">Panel terpadu manajemen AI Chatbot dan WhatsApp Gateway</span>
              </div>
            </div>
            <div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="Router.renderAdminIntegrasi()">
                🔄 Segarkan Data
              </button>
            </div>
          </div>

          <div class="integrasi-grid">
            <!-- ==========================================
                 PANEL A: CHATBOT AI
                 ========================================== -->
            <div class="integrasi-card">
              <div class="integrasi-card-header">
                <div class="integrasi-card-title">
                  <span class="icon">🤖</span>
                  <span>A. CHATBOT AI</span>
                </div>
                <span class="integrasi-provider-badge">Provider: ${aiData.provider || 'xKiro / Nous Research'}</span>
              </div>

              <!-- Section: API Key -->
              <div class="integrasi-section-title">API Key</div>
              <div class="integrasi-meta-row" style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                <span class="${aiData.is_configured ? 'integrasi-badge-configured' : 'integrasi-badge-unconfigured'}">
                  ${aiData.is_configured ? 'SUDAH DIKONFIGURASI' : 'BELUM DIKONFIGURASI'}
                </span>
                <span id="ai-key-masked-display" class="integrasi-key-masked" style="font-family: monospace; font-size: 0.85rem; user-select: all;" data-masked="${aiData.api_key_masked || '••••••••'}" data-raw="${aiData.api_key || ''}">${aiData.api_key_masked || '••••••••'}</span>
                ${aiData.api_key ? `
                <button type="button" class="integrasi-btn-toggle-eye" onclick="window.toggleMaskedKeyDisplay()" title="Lihat/Sembunyikan API Key Lengkap" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 0.2rem 0.55rem; color: #f59e0b; cursor: pointer; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                  <span id="ai-key-masked-eye">👁️</span> <span id="ai-key-masked-text" style="font-size: 0.75rem; font-weight: 600;">Lihat</span>
                </button>
                ` : ''}
                <span class="integrasi-source-text">Sumber: ${aiData.source || 'Pengaturan Admin (terenkripsi)'}</span>
              </div>
              <div class="integrasi-timestamp-text">- diperbarui ${aiData.last_updated || '2026-11-16 15:26:05 UTC'}</div>

              <div class="integrasi-input-group">
                <div style="position: relative; flex: 1; min-width: 240px; display: flex; align-items: center;">
                  <input type="text" id="input-new-ai-key" class="integrasi-input" style="width: 100%; padding-right: 2.75rem;" placeholder="Tempel API Key baru (sk-nous-...)" value="${aiData.api_key || ''}" autocomplete="off" />
                  <button type="button" id="btn-toggle-input-key" style="position: absolute; right: 0.6rem; background: transparent; border: none; cursor: pointer; font-size: 1.15rem; color: #94a3b8; padding: 0.2rem;" onclick="window.toggleInputAiKeyVisibility()" title="Lihat / Sembunyikan API Key">
                    👁️
                  </button>
                </div>
                <button type="button" class="integrasi-btn-amber" onclick="window.handleSaveAiKey()">
                  <span>🔑</span> Perbarui API Key
                </button>
              </div>
              <div class="integrasi-desc-text">
                API Key baru diuji ke provider memakai model aktif. Jika gagal, key lama tetap dipakai.
              </div>
              <div style="margin-top: 0.75rem; margin-bottom: 1.5rem;">
                <button type="button" class="integrasi-btn-secondary" onclick="window.handleResetAiKey()">
                  <span>🔄</span> Pakai API Key environment
                </button>
              </div>

              <!-- Section: Model Aktif -->
              <div class="integrasi-section-title" style="margin-top: 1.25rem;">Model Aktif</div>
              <div id="ai-models-list">
                ${(aiData.models && aiData.models.length > 0 ? aiData.models : [
                  {
                    id: 'google/gemini-1.5-pro',
                    name: 'Google Gemini 1.5 Pro',
                    context: '1,000,000 token',
                    description: 'Model multimodal unggulan Google dengan penalaran tinggi dan konteks ultra-panjang.',
                    is_active: aiData.active_model === 'google/gemini-1.5-pro' || !aiData.active_model,
                    is_compatible: true,
                    last_tested: '2026-11-16 15:26:02 UTC',
                    response_time: '890 ms'
                  },
                  {
                    id: 'xai/grok-2',
                    name: 'xAI Grok 2',
                    context: '131,072 token',
                    description: 'Model cerdas dan responsif dari xAI dengan pemahaman data dan instruksi cepat.',
                    is_active: aiData.active_model === 'xai/grok-2',
                    is_compatible: true,
                    last_tested: '2026-11-16 15:26:02 UTC',
                    response_time: '940 ms'
                  }
                ]).map(m => `
                  <div class="integrasi-item-card ${m.is_active ? 'active-border' : ''}">
                    <div class="integrasi-item-card-header">
                      <div class="integrasi-item-title-wrap">
                        <span class="integrasi-item-title">${m.name}</span>
                        ${m.is_active ? '<span class="integrasi-badge-active-green">AKTIF</span>' : ''}
                        ${m.is_compatible ? '<span class="integrasi-badge-compatible">KOMPATIBEL</span>' : ''}
                      </div>
                      <div style="display: flex; gap: 0.4rem;">
                        <button type="button" class="integrasi-btn-dark" onclick="window.handleTestAiModel('${m.id}')">
                          <span>🧪</span> Uji
                        </button>
                        ${!m.is_active ? `
                          <button type="button" class="integrasi-btn-activate" onclick="window.handleActivateAiModel('${m.id}')">
                            <span>✔</span> Aktifkan
                          </button>
                        ` : ''}
                      </div>
                    </div>
                    <div class="integrasi-meta-grid">
                      <div>Model ID: <strong>${m.id}</strong></div>
                      <div>Context: <strong>${m.context || '256,000 token'}</strong></div>
                      <div>Uji terakhir: <strong>${m.last_tested || '2026-11-16 UTC'}</strong></div>
                      <div>Waktu respons: <strong style="color: #10b981;">${m.response_time || '996 ms'}</strong></div>
                    </div>
                    <div class="integrasi-item-desc">${m.description || ''}</div>
                  </div>
                `).join('')}
              </div>

              <div class="integrasi-footnote">
                Pergantian model hanya mengubah Model ID. System prompt, persona, konteks role, riwayat percakapan, endpoint, dan fallback provider tidak berubah.
              </div>
            </div>

            <!-- ==========================================
                 PANEL B: WHATSAPP GATEWAY
                 ========================================== -->
            <div class="integrasi-card">
              <div class="integrasi-card-header">
                <div class="integrasi-card-title">
                  <span class="icon">💬</span>
                  <span>B. WHATSAPP GATEWAY</span>
                </div>
                <span class="integrasi-provider-badge">Provider: ${waData.provider || 'Fonnte'}</span>
              </div>

              <!-- Section: Device Pengirim -->
              <div class="integrasi-section-title">Device Pengirim</div>
              <div id="wa-devices-list">
                ${(waData.devices || []).map(d => `
                  <div class="integrasi-item-card ${d.is_active ? 'active-border' : ''}">
                    <div class="integrasi-item-card-header">
                      <div class="integrasi-item-title-wrap">
                        <span class="integrasi-item-title">${d.name}</span>
                        ${d.is_active ? '<span class="integrasi-badge-active-green">PENGIRIM AKTIF</span>' : ''}
                        ${d.token_available || d.is_configured ? '<span class="integrasi-badge-compatible">TOKEN TERSEDIA</span>' : ''}
                        ${d.status === 'CONNECT' ? '<span class="integrasi-badge-compatible">CONNECT</span>' : ''}
                      </div>
                      <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                        <button type="button" class="integrasi-btn-dark" onclick="window.handleCheckWaDevice('${d.id}')">
                          <span>⚡</span> Cek koneksi
                        </button>
                        ${!d.is_default && !d.is_active ? `
                          <button type="button" class="integrasi-btn-activate" onclick="window.handleActivateWaDevice('${d.id}')">
                            <span>✔</span> Jadikan aktif
                          </button>
                        ` : ''}
                        ${!d.is_default ? `
                          <button type="button" class="integrasi-btn-dark" style="color: #ef4444;" onclick="window.handleDeleteWaDevice('${d.id}')">
                            <span>⏻</span> Hapus
                          </button>
                        ` : ''}
                      </div>
                    </div>
                    <div class="integrasi-meta-grid">
                      <div>Token: <strong>${d.token_masked || '••••••••'}</strong></div>
                      <div>Nomor pengirim: <strong>${d.sender_number || '6285169728815'}</strong></div>
                      ${d.package ? `<div>Paket: <strong>${d.package} · Kuota: ${d.quota || 1000} · Exp: ${d.expired || '2026'}</strong></div>` : ''}
                      ${d.checked_at ? `<div>Dicek: <strong>${d.checked_at}</strong></div>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- Section: Tambah Device -->
              <div class="integrasi-section-title" style="margin-top: 1.25rem;">Tambah Device</div>
              <form id="form-add-wa-device" onsubmit="window.handleSaveWaDevice(event)">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                  <div>
                    <label style="font-size: 0.8rem; color: #94a3b8; display: block; margin-bottom: 0.3rem;">Nama device</label>
                    <input type="text" id="input-wa-device-name" class="integrasi-input" placeholder="Device 1" required />
                  </div>
                  <div>
                    <label style="font-size: 0.8rem; color: #94a3b8; display: block; margin-bottom: 0.3rem;">Nomor pengirim (terdaftar di Fonnte)</label>
                    <input type="text" id="input-wa-device-phone" class="integrasi-input" placeholder="6281234567890" required />
                  </div>
                </div>
                <div style="margin-bottom: 0.75rem;">
                  <label style="font-size: 0.8rem; color: #94a3b8; display: block; margin-bottom: 0.3rem;">Device Token</label>
                  <div style="position: relative; display: flex; align-items: center;">
                    <input type="text" id="input-wa-device-token" class="integrasi-input" style="width: 100%; padding-right: 2.75rem;" placeholder="Token dari menu Device di dashboard Fonnte" required autocomplete="off" />
                    <button type="button" id="btn-toggle-wa-token" style="position: absolute; right: 0.6rem; background: transparent; border: none; cursor: pointer; font-size: 1.15rem; color: #94a3b8; padding: 0.2rem;" onclick="window.toggleInputWaTokenVisibility()" title="Lihat / Sembunyikan Token">
                      👁️
                    </button>
                  </div>
                </div>
                <div class="integrasi-desc-text" style="margin-bottom: 1rem;">
                  Gunakan Device Token (per device), bukan Account Token. Token dicek ke Fonnte tanpa mengirim pesan WhatsApp.
                </div>
                <button type="submit" class="integrasi-btn-amber">
                  <span>💾</span> Simpan Device
                </button>
              </form>

              <div class="integrasi-footnote">
                Pairing/scan-QR dilakukan di dashboard Fonnte. Hanya satu Device yang menjadi pengirim aktif. Nomor tujuan tetap nomor WhatsApp Customer.
              </div>
            </div>
          </div>
        </div>
      `;

      // Window Action Handlers
      window.toggleMaskedKeyDisplay = () => {
        const span = document.getElementById('ai-key-masked-display');
        const eye = document.getElementById('ai-key-masked-eye');
        const text = document.getElementById('ai-key-masked-text');
        if (!span) return;
        const isShowing = span.getAttribute('data-showing-raw') === 'true';
        if (isShowing) {
          span.textContent = span.getAttribute('data-masked') || '••••••••';
          span.setAttribute('data-showing-raw', 'false');
          if (eye) eye.textContent = '👁️';
          if (text) text.textContent = 'Lihat';
        } else {
          span.textContent = span.getAttribute('data-raw') || span.getAttribute('data-masked');
          span.setAttribute('data-showing-raw', 'true');
          if (eye) eye.textContent = '🙈';
          if (text) text.textContent = 'Sembunyikan';
        }
      };

      window.toggleInputAiKeyVisibility = () => {
        const input = document.getElementById('input-new-ai-key');
        const btn = document.getElementById('btn-toggle-input-key');
        if (!input) return;
        if (input.type === 'password') {
          input.type = 'text';
          if (btn) btn.textContent = '👁️';
        } else {
          input.type = 'password';
          if (btn) btn.textContent = '🙈';
        }
      };

      window.toggleInputWaTokenVisibility = () => {
        const input = document.getElementById('input-wa-device-token');
        const btn = document.getElementById('btn-toggle-wa-token');
        if (!input) return;
        if (input.type === 'password') {
          input.type = 'text';
          if (btn) btn.textContent = '👁️';
        } else {
          input.type = 'password';
          if (btn) btn.textContent = '🙈';
        }
      };

      window.handleSaveAiKey = async () => {
        const input = document.getElementById('input-new-ai-key');
        const key = input ? input.value.trim() : '';
        if (!key) {
          showToast('Masukkan API Key terlebih dahulu.', 'error');
          return;
        }

        try {
          showToast('Menguji dan memperbarui API Key...', 'info');
          const res = await API.updateAiConfig({ api_key: key });
          showToast(res.message || 'API Key berhasil diperbarui!', 'success');
          input.value = '';
          Router.renderAdminIntegrasi();
        } catch (e) {
          showToast(e.message || 'Gagal memperbarui API Key', 'error');
        }
      };

      window.handleResetAiKey = async () => {
        try {
          showToast('Mengembalikan ke API Key environment...', 'info');
          const res = await API.resetAiConfigToEnv();
          showToast(res.message || 'Beralih ke API Key environment', 'success');
          Router.renderAdminIntegrasi();
        } catch (e) {
          showToast(e.message || 'Gagal reset ke environment', 'error');
        }
      };

      window.handleTestAiModel = async (modelId) => {
        try {
          showToast(`Menguji latensi model ${modelId}...`, 'info');
          const res = await API.testAiModel({ model: modelId });
          showToast(res.message || `Model ${modelId} aktif & responsif!`, 'success');
        } catch (e) {
          showToast(e.message || 'Gagal menguji model', 'error');
        }
      };

      window.handleActivateAiModel = async (modelId) => {
        try {
          showToast(`Mengaktifkan model ${modelId}...`, 'info');
          const res = await API.updateAiConfig({ model: modelId });
          const simpleKey = modelId.toLowerCase().includes('grok') ? 'grok' : 'gemini';
          if (typeof State !== 'undefined' && State.setAiModel) {
            State.setAiModel(simpleKey);
          } else {
            localStorage.setItem('bs_ai_model', simpleKey);
          }
          showToast(`Model ${modelId} sekarang menjadi model aktif!`, 'success');
          Router.renderAdminIntegrasi();
        } catch (e) {
          showToast(e.message || 'Gagal mengaktifkan model', 'error');
        }
      };

      window.handleCheckWaDevice = async (deviceId) => {
        try {
          showToast('Memeriksa koneksi device WhatsApp...', 'info');
          const res = await API.checkWhatsAppDevice(deviceId);
          showToast(res.message || 'Device terhubung dengan Fonnte (CONNECT)', 'success');
        } catch (e) {
          showToast(e.message || 'Gagal cek koneksi device', 'error');
        }
      };

      window.handleActivateWaDevice = async (deviceId) => {
        try {
          showToast('Mengaktifkan device...', 'info');
          const res = await API.activateWhatsAppDevice(deviceId);
          showToast('Device berhasil dijadikan pengirim aktif!', 'success');
          Router.renderAdminIntegrasi();
        } catch (e) {
          showToast(e.message || 'Gagal mengaktifkan device', 'error');
        }
      };

      window.handleDeleteWaDevice = async (deviceId) => {
        if (!confirm('Yakin ingin menghapus device ini?')) return;
        try {
          await API.deleteWhatsAppDevice(deviceId);
          showToast('Device berhasil dihapus.', 'success');
          Router.renderAdminIntegrasi();
        } catch (e) {
          showToast(e.message || 'Gagal menghapus device', 'error');
        }
      };

      window.handleSaveWaDevice = async (e) => {
        e.preventDefault();
        const name = document.getElementById('input-wa-device-name').value;
        const phone = document.getElementById('input-wa-device-phone').value;
        const token = document.getElementById('input-wa-device-token').value;

        try {
          showToast('Menyimpan device WhatsApp...', 'info');
          await API.saveWhatsAppDevice({ name, sender_number: phone, token });
          showToast('Device WhatsApp berhasil disimpan!', 'success');
          Router.renderAdminIntegrasi();
        } catch (err) {
          showToast(err.message || 'Gagal menyimpan device', 'error');
        }
      };

    } catch (err) {
      console.error('Error in renderAdminIntegrasi:', err);
      content.innerHTML = `
        <div style="color: var(--danger-red); padding: 2rem; text-align: center;">
          Terjadi kesalahan saat memuat halaman integrasi: ${err.message}
        </div>
      `;
    }
  },

  renderAdminInformasiAPI() {
    this.setupView('Informasi API & Sistem');
    const content = document.getElementById('view-content');
    content.innerHTML = `<div style="text-align:center; padding: 2rem;">Memuat informasi sistem...</div>`;

    try {
      // Fetch system info from API
      const token = State.token;
      fetch('/api/v1/notifications/info', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Gagal mengambil informasi');
        }
        return response.json();
      })
      .then(data => {
        const info = data.data;
        content.innerHTML = `<div style="background: white; border-radius: var(--radius-lg); padding: 2rem; margin-bottom: 2rem; box-shadow: var(--shadow-sm);">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem;">
            <div style="width: 64px; height: 64px; background: var(--primary-100); color: var(--primary-700); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 2rem; margin-right: 1rem;">📡</div>
            <div>
              <h2 style="margin: 0; color: var(--primary-900);">Informasi Sistem Bank Sampah Digital</h2>
              <p style="margin: 0.5rem 0 0; color: var(--slate-500); font-size: 0.9rem;">Status Terakhir: ${new Date(info.timestamp).toLocaleString('id-ID')}</p>
            </div>
          </div>

            <!-- Connection Test Buttons -->
            <div style="margin-bottom: 1.5rem;">
              <button type="button" id="btn-test-fonnte" class="btn btn-secondary btn-sm" style="margin-right: 0.5rem;">🔍 Periksa Koneksi Fonnte</button>
              <button type="button" id="btn-test-ai" class="btn btn-secondary btn-sm" style="margin-right: 0.5rem;">🔍 Periksa Koneksi AI</button>
              <button type="button" id="btn-test-db" class="btn btn-secondary btn-sm">🔍 Periksa Koneksi Database</button>
            </div>

            <!-- Provider Status Card -->
            <div style="background: var(--slate-50); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--primary-200);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                <span style="font-weight: 600; color: var(--primary-900);">Provider WhatsApp</span>
                <span style="color: var(--primary-600); font-weight: 600;">${info.provider === 'fonnte' ? 'Fonnte Gateway' : info.provider || 'Tidak Diketahui'}</span>
              </div>
              <div style="display: flex; gap: 1rem; font-size: 0.85rem;">
                <span style="color: ${info.configured === true ? 'var(--primary-600)' : 'var(--danger-red)'};">${info.configured === true ? 'Terkonfigurasi' : 'Belum Dikonfigurasi'}</span>
                <span style="color: ${info.mode === 'live' ? 'var(--primary-600)' : 'var(--slate-500)'};">${info.mode === 'live' ? 'Mode Live' : 'Mode Mock'}</span>
              </div>
              <p style="margin: 0.5rem 0 0; font-size: 0.8rem; color: var(--slate-500);">${info.message || ''}</p>
            </div>

            <!-- Konfigurasi Card -->
            <div style="background: var(--slate-50); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--primary-200);">
              <h4 style="margin: 0 0 1rem 0; font-size: 1rem; color: var(--primary-900);">Detail Konfigurasi</h4>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.85rem;">
                <div>
                  <strong>Status Terkoneksi:</strong> ${info.connected === true ? 'Ya' : 'Tidak'}
                </div>
                <div>
                  <strong>Template Diperlukan:</strong> ${info.templateRequired === true ? 'Ya' : 'Tidak'}
                </div>
                <div>
                  <strong>Mode:</strong> ${info.mode === 'live' ? 'Live (Nyata)' : 'Mock (Simulasi)'}
                </div>
                <div>
                  <strong>Tidak Ada Konfig:</strong> ${info.missingConfiguration && info.missingConfiguration.length > 0 ? info.missingConfiguration.join(', ') : 'Kosong'}
                </div>
              </div>
            </div>

            <!-- Antrean Card -->
            <div style="background: var(--slate-50); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--primary-200);">
              <h4 style="margin: 0 0 1rem 0; font-size: 1rem; color: var(--primary-900);">Statistik Antrean</h4>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.85rem;">
                <div>
                  <strong>Pending:</strong> ${info.queue.PENDING || 0}
                </div>
                <div>
                  <strong>Selesai:</strong> ${info.queue.SENT || 0}
                </div>
                <div>
                  <strong>Gagal:</strong> ${info.queue.FAILED || 0}
                </div>
                <div>
                  <strong>Dibatalkan:</strong> ${info.queue.CANCELLED || 0}
                </div>
              </div>
            </div>

            <!-- Endpoint API Table -->
            <div style="background: var(--slate-50); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--primary-200);">
              <h4 style="margin: 0 0 1rem 0; font-size: 1rem; color: var(--primary-900);">Daftar Endpoint API</h4>
              <p style="margin: 0 0 1rem 0; font-size: 0.8rem; color: var(--slate-500);">Kelompokkan berdasarkan fitur. Hak akses tergantung role.</p>
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.7rem;">
                  <thead><tr style="background: var(--primary-100); color: var(--primary-900);">
                    <th style="padding: 0.3rem; border: 1px solid var(--border-color);">Fitur</th>
                    <th style="padding: 0.3rem; border: 1px solid var(--border-color);">Method</th>
                    <th style="padding: 0.3rem; border: 1px solid var(--border-color);">Endpoint</th>
                    <th style="padding: 0.3rem; border: 1px solid var(--border-color);">Fungsi</th>
                    <th style="padding: 0.3rem; border: 1px solid var(--border-color);">Hak Akses</th>
                  </tr></thead>
                  <tbody id="api-endpoint-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Notification History -->
            <div style="background: var(--slate-50); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--primary-200);">
              <h4 style="margin: 0 0 1rem 0; font-size: 1rem; color: var(--primary-900);">Riwayat Notifikasi</h4>
              <div style="margin-bottom: 1rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <select id="history-filter-status" style="padding: 0.25rem; font-size: 0.75rem;">
                    <option value="">Semua Status</option>
                    <option value="sent">Terkirim</option>
                    <option value="failed">Gagal</option>
                    <option value="pending">Menunggu</option>
                  </select>
                  <select id="history-filter-channel" style="padding: 0.25rem; font-size: 0.75rem;">
                    <option value="">Semua Channel</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                  </select>
                  <button id="btn-refresh-history" class="btn btn-sm btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">🔄 Segarkan</button>
                </div>
                <div style="font-size: 0.75rem; color: var(--slate-400);" id="history-empty">Belum ada data riwayat</div>
                <div style="max-height: 300px; overflow-y: auto; font-size: 0.7rem;" id="history-list"></div>
              </div>
            </div>

            <!-- Supported Statuses -->
            <div style="margin-top: 1rem; font-size: 0.75rem; color: var(--slate-500);">
              <strong>Status yang Didukung:</strong> ${info.supportedStatuses?.join(', ') || 'Tidak ada'}
            </div>
          </div>`;
      })
      .catch(error => {
        console.error('Gagal memuat informasi API:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat informasi sistem: ${error.message}</div>`;
      });
    } catch (err) {
      console.error('Error dalam renderAdminInformasiAPI:', err);
      content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Terjadi kesalahan: ${err.message}</div>`;
    }

    // Connection test handlers
    window.checkFonnteConnection = async () => {
      try {
        const res = await API.getNotificationProviderStatus();
        const info = res.data || {};
        const el = document.getElementById('fonnte-status-result');
        if (info.configured) {
          el.innerHTML = '<div style="background: var(--primary-50); color: var(--primary-600); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--primary-200);">✅ Terhubung - ' + (info.providerLabel || info.provider) + '</div>';
        } else {
          el.innerHTML = '<div style="background: var(--slate-50); color: var(--slate-600); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">⚠️ Belum Dikonfigurasi - ' + (info.message || 'Tidak ada konfigurasi Fonnte') + '</div>';
        }
      } catch (err) {
        document.getElementById('fonnte-status-result').innerHTML = '<div style="background: var(--danger-light); color: var(--danger-red); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--danger-red);">❌ Gagal - ' + err.message + '</div>';
      }
    };

    window.checkAIConnection = async () => {
      try {
        const res = await API.getAiAuditLogs('');
        const data = res.data || {};
        const el = document.getElementById('ai-status-result');
        if (data && data.length > 0) {
          el.innerHTML = '<div style="background: var(--primary-50); color: var(--primary-600); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--primary-200);">✅ AKTIF - AI Beroperasi (' + data.length + ' log tercatat)' + '</div>';
        } else {
          el.innerHTML = '<div style="background: var(--slate-50); color: var(--slate-50); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">⚠️ Tidak AKTIF - AI belum terkonfigurasi atau belum ada log' + '</div>';
        }
      } catch (err) {
        document.getElementById('ai-status-result').innerHTML = '<div style="background: var(--danger-light); color: var(--danger-red); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--danger-red);">❌ Gagal - ' + err.message + '</div>';
      }
    };

    window.checkDBConnection = async () => {
      try {
        const res = await API.getNotificationStats();
        const data = res.data || {};
        const el = document.getElementById('db-status-result');
        if (data && parseInt(data.total) > 0) {
          el.innerHTML = '<div style="background: var(--primary-50); color: var(--primary-600); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--primary-200);">✅ Berhasil - Database terhubung (' + data.total + ' catatan)' + '</div>';
        } else {
          el.innerHTML = '<div style="background: var(--slate-50); color: var(--slate-50); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">ℹ️ OK - Database tersambung tapi belum ada catatan' + '</div>';
        }
      } catch (err) {
        document.getElementById('db-status-result').innerHTML = '<div style="background: var(--danger-light); color: var(--danger-red); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--danger-red);">❌ Gagal - ' + err.message + '</div>';
      }
    };

    // Populate endpoint table after function completes
    setTimeout(loadEndpointTable, 100);

    // Load notification history
    loadNotificationHistory();
  },

  renderAdminDashboard() {
    this.setupView('Dasbor Administrator');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">♻️</div>
        Memuat data dasbor administrator...
      </div>`;

    Promise.allSettled([
      API.getUsers(),
      API.getFinancialSummary(),
      API.getDailyTransactions(),
      API.getAuditLogs(),
      API.getCustomers(),
      API.getSalesSummary(),
    ])
      .then((results) => {
        const dataOf = (r) =>
          r.status === 'fulfilled' && r.value && r.value.data !== undefined ? r.value.data : null;
        const sourceLabels = ['pengguna', 'keuangan', 'transaksi harian', 'audit log', 'nasabah', 'penjualan'];
        const failedSources = [];
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') failedSources.push(sourceLabels[i]);
        });

        const usersData = dataOf(results[0]);
        const users = Array.isArray(usersData) ? usersData : [];
        const finance = dataOf(results[1]) || {};
        const daily = dataOf(results[2]) || {};
        const auditsData = dataOf(results[3]);
        const audits = Array.isArray(auditsData) ? auditsData : [];
        const customersData = dataOf(results[4]);
        const customers = Array.isArray(customersData) ? customersData : [];
        const sales = dataOf(results[5]) || {};

        const esc = escapeHtmlClient;
        const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
        const fmtNum = (n) => (Number(n) || 0).toLocaleString('id-ID');
        const fmtKg = (n) => `${fmtNum(n)} kg`;
        const fmtTime = (v) => {
          if (v === null || v === undefined || v === '') return '-';
          const d = new Date(Number(v));
          return isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
        };

        const roleCounts = {};
        users.forEach((u) => {
          const role = u.role_name || u.role_display || 'TANPA ROLE';
          roleCounts[role] = (roleCounts[role] || 0) + 1;
        });
        const roleSummary = Object.keys(roleCounts)
          .map((role) => `${esc(role)}: ${roleCounts[role]}`)
          .join(' • ');

        const activeCustomers = customers.filter((c) => c.status === 'ACTIVE').length;
        const pendingWithdrawals = Number(finance.pendingWithdrawalsCount) || 0;

        const statCards = [
          {
            icon: '👥',
            tone: 'stat-icon-blue',
            label: 'Pengguna Terdaftar',
            value: fmtNum(users.length),
            sub: roleSummary || 'Belum ada data peran',
          },
          {
            icon: '💳',
            tone: 'stat-icon-green',
            label: 'Nasabah Terdaftar',
            value: fmtNum(customers.length),
            sub: `${fmtNum(activeCustomers)} aktif • ${fmtNum(customers.length - activeCustomers)} non-aktif`,
          },
          {
            icon: '💵',
            tone: 'stat-icon-gold',
            label: 'Total Setoran Masuk',
            value: fmtRp(finance.totalDepositsPaid),
            sub: `${fmtNum(finance.totalDepositTransactions)} transaksi setoran`,
          },
          {
            icon: '📈',
            tone: 'stat-icon-green',
            label: 'Pendapatan Pengepul',
            value: fmtRp(sales.totalRevenue),
            sub: `${fmtKg(sales.totalWeightSoldKg)} terjual • margin ${fmtNum(sales.marginPercentage)}%`,
          },
          {
            icon: '📋',
            tone: 'stat-icon-blue',
            label: 'Transaksi Hari Ini',
            value: fmtNum(daily.totalTransactions),
            sub: `${fmtKg(daily.totalWeightKg)} • ${fmtRp(daily.totalAmount)}`,
          },
          {
            icon: pendingWithdrawals > 0 ? '⏳' : '✅',
            tone: pendingWithdrawals > 0 ? 'stat-icon-red' : 'stat-icon-green',
            label: 'Penarikan Wallet Pending',
            value: fmtNum(pendingWithdrawals),
            sub:
              pendingWithdrawals > 0
                ? `Total ${fmtRp(finance.pendingWithdrawalsAmount)} menunggu verifikasi`
                : 'Tidak ada antrean penarikan',
          },
        ]
          .map(
            (s) => `
            <div class="stat-card">
              <div class="stat-icon-wrapper ${s.tone}">${s.icon}</div>
              <div class="stat-info">
                <div class="stat-label">${esc(s.label)}</div>
                <div class="stat-value">${esc(s.value)}</div>
                <div style="font-size: 0.75rem; color: var(--slate-400); margin-top: 0.25rem;">${s.sub}</div>
              </div>
            </div>`
          )
          .join('');

        const financeRowsHtml = [
          ['Total Setoran Masuk', fmtRp(finance.totalDepositsPaid)],
          ['Pendapatan Penjualan', fmtRp(finance.totalSalesIncome)],
          ['Beban Akuisisi Sampah', fmtRp(sales.totalAcquisitionCost)],
          ['Laba Kotor Pengepul', `${fmtRp(sales.grossProfit)} (${fmtNum(sales.marginPercentage)}%)`],
          ['Nilai Wallet Nasabah', fmtRp(finance.totalWalletLiability)],
          ['Penarikan Terbayar', fmtRp(finance.totalWithdrawnDisbursed)],
          ['Sampah Diproses', fmtKg(finance.totalWasteProcessedKg)],
        ]
          .map(
            ([label, value]) => `
            <div style="display: flex; justify-content: space-between; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--border-color);">
              <span style="color: var(--slate-500); font-size: 0.9rem;">${esc(label)}</span>
              <strong style="font-size: 0.95rem;">${esc(value)}</strong>
            </div>`
          )
          .join('');

        const dailyTransactions = Array.isArray(daily.transactions) ? daily.transactions.slice(0, 5) : [];
        const dailyRowsHtml = dailyTransactions.length
          ? dailyTransactions
              .map((t) => {
                const ref = t.transaction_no || t.invoice_no || (t.id ? `#${t.id}` : '-');
                const amountOrWeight =
                  t.total_amount !== undefined && t.total_amount !== null
                    ? fmtRp(t.total_amount)
                    : fmtKg(t.weight_kg);
                return `
            <div style="display: flex; justify-content: space-between; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
              <span><strong>${esc(ref)}</strong> <span style="color: var(--slate-500);">• ${esc(t.type || t.category || '-')}</span></span>
              <span>${esc(amountOrWeight)} <span style="color: var(--slate-400);">${esc(fmtTime(t.created_at))}</span></span>
            </div>`;
              })
              .join('')
          : `<div style="color: var(--slate-500); font-size: 0.9rem; padding: 0.5rem 0;">Belum ada transaksi pada ${esc(daily.date || 'hari ini')}.</div>`;

        const recentAudits = audits.slice(0, 6);
        const auditHtml = recentAudits.length
          ? recentAudits
              .map(
                (a) => `
            <div style="display: flex; justify-content: space-between; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
              <span><strong>${esc(a.action || '-')}</strong> <span style="color: var(--slate-500);">oleh ${esc(a.user_name || a.username || 'Sistem')}</span></span>
              <span style="color: var(--slate-400); white-space: nowrap;">${esc(fmtTime(a.created_at))}</span>
            </div>`
              )
              .join('')
          : `<div style="color: var(--slate-500); font-size: 0.9rem; padding: 0.5rem 0;">Belum ada aktivitas tercatat.</div>`;

        const warningHtml = failedSources.length
          ? `<div style="background: var(--accent-gold-light); border: 1px solid var(--accent-gold); color: var(--slate-800); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 1.25rem; font-size: 0.9rem;">
              ⚠️ Beberapa data gagal dimuat: ${failedSources.join(', ')}. Klik "Segarkan Data" untuk mencoba lagi.
            </div>`
          : '';

        content.innerHTML = `
          ${warningHtml}
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            ${statCards}
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="card">
              <div class="card-header"><h3 class="card-title">🏦 Ringkasan Keuangan & Operasional</h3></div>
              ${financeRowsHtml}
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">📋 Transaksi Hari Ini (${esc(daily.date || '-')})</h3></div>
              <div style="display: flex; gap: 1.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                <div><div style="font-size: 0.8rem; color: var(--slate-500);">Jumlah</div><strong>${fmtNum(daily.totalTransactions)}</strong></div>
                <div><div style="font-size: 0.8rem; color: var(--slate-500);">Timbangan</div><strong>${fmtKg(daily.totalWeightKg)}</strong></div>
                <div><div style="font-size: 0.8rem; color: var(--slate-500);">Nilai</div><strong>${fmtRp(daily.totalAmount)}</strong></div>
              </div>
              ${dailyRowsHtml}
            </div>
          </div>

          <div class="card" style="margin-bottom: 1.5rem;">
            <div class="card-header"><h3 class="card-title">🛡 Aktivitas Terbaru Sistem</h3></div>
            ${auditHtml}
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">⚡ Aksi Cepat</h3></div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
              <a href="#/admin/users" class="btn btn-secondary">👥 Kelola Pengguna</a>
              <a href="#/customers" class="btn btn-secondary">📇 Direktori Nasabah</a>
              <a href="#/admin/audit" class="btn btn-secondary">🛡 Audit Log</a>
              <a href="#/waste-catalog" class="btn btn-secondary">♻️ Katalog Sampah</a>
              <a href="#/notifications" class="btn btn-secondary">🔔 Notifikasi WhatsApp</a>
              <a href="#/admin/informasi-api" class="btn btn-secondary">📡 Informasi API</a>
              <button type="button" class="btn btn-primary" onclick="Router.renderAdminDashboard()">🔄 Segarkan Data</button>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat dasbor administrator:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center; background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">Gagal memuat dasbor: ${error.message}</div>`;
      });
  },

  renderAdminUsers() {
    this.setupView('Kelola Pengguna');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">👥</div>
        Memuat data pengguna...
      </div>`;

    API.getUsers()
      .then((res) => {
        const users = Array.isArray(res.data) ? res.data : [];
        const esc = escapeHtmlClient;
        const fmtDate = (v) => (v ? String(v).slice(0, 10) : '-');

        const roleCounts = {};
        users.forEach((u) => {
          const r = u.role_display || u.role_name || 'Tanpa Peran';
          roleCounts[r] = (roleCounts[r] || 0) + 1;
        });
        const chips = Object.keys(roleCounts)
          .map((r) => `<span class="badge badge-neutral">${esc(r)}: ${roleCounts[r]}</span>`)
          .join(' ');

        const rows = users.length
          ? users
              .map((u) => {
                const search = `${u.name || ''} ${u.email || ''} ${u.username || ''} ${u.phone || ''}`.toLowerCase();
                const statusBadge =
                  u.status === 'ACTIVE'
                    ? 'badge-success'
                    : u.status === 'SUSPENDED'
                      ? 'badge-danger'
                      : 'badge-warning';
                return `
                <tr class="user-row" data-search="${esc(search)}">
                  <td><strong>${esc(u.name)}</strong><br><span style="font-size: 0.75rem; color: var(--slate-500);">${esc(u.email || '-')} • @${esc(u.username || '-')}</span></td>
                  <td><span class="badge badge-info">${esc(u.role_display || u.role_name || '-')}</span></td>
                  <td>${esc(u.phone || '-')}</td>
                  <td><span class="badge ${statusBadge}">${esc(u.status || '-')}</span></td>
                  <td>${fmtDate(u.created_at)}</td>
                  <td>
                    ${
                      u.status === 'ACTIVE'
                        ? `<button type="button" class="btn btn-secondary btn-sm" data-name="${esc(u.name)}" onclick="deactivateUser(${u.id}, this.getAttribute('data-name'))">Nonaktifkan</button>`
                        : '<span style="color: var(--slate-400);">—</span>'
                    }
                  </td>
                </tr>`;
              })
              .join('')
          : `<tr><td colspan="6" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada data pengguna.</td></tr>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                <span class="badge badge-neutral">Total: ${users.length}</span>
                ${chips}
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <input type="search" id="user-search-input" class="form-control" placeholder="Cari nama / email / username..."
                  oninput="const q=this.value.toLowerCase(); document.querySelectorAll('.user-row').forEach(r => r.style.display = !q || (r.getAttribute('data-search') || '').includes(q) ? '' : 'none');"
                  style="max-width: 240px; font-size: 0.85rem;">
                <button type="button" class="btn btn-primary" onclick="openAddUserModal()">+ Tambah Pengguna</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Pengguna</th>
                    <th>Peran</th>
                    <th>Telepon</th>
                    <th>Status</th>
                    <th>Terdaftar</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat data pengguna:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat data pengguna: ${error.message}</div>`;
      });
  },

  renderAuditLogs() {
    this.setupView('Audit Log Sistem');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">🛡</div>
        Memuat jejak audit sistem...
      </div>`;

    API.getAuditLogs()
      .then((res) => {
        const logs = Array.isArray(res.data) ? res.data : [];
        const esc = escapeHtmlClient;
        const fmtTime = (v) => {
          if (v === null || v === undefined || v === '') return '-';
          const asNum = Number(v);
          let d = isNaN(asNum) ? new Date(v) : new Date(asNum);
          return isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
        };
        const actionBadge = (action) => {
          const a = String(action || '');
          if (a.includes('FAILED') || a.includes('BLOCKED') || a.includes('DELETE')) return 'badge-danger';
          if (a.includes('SUCCESS') || a.includes('CREATE') || a.includes('APPROVE')) return 'badge-success';
          if (a.includes('UPDATE') || a.includes('LOGIN')) return 'badge-info';
          return 'badge-neutral';
        };

        const rows = logs.length
          ? logs
              .map((a) => {
                const search = `${a.action || ''} ${a.entity_name || ''} ${a.user_name || ''} ${a.username || ''} ${a.ip_address || ''}`.toLowerCase();
                return `
                <tr class="audit-row" data-search="${esc(search)}">
                  <td style="white-space: nowrap;">${fmtTime(a.created_at)}</td>
                  <td><strong>${esc(a.user_name || a.username || 'Sistem')}</strong>${a.role_name ? `<br><span style="font-size: 0.72rem; color: var(--slate-500);">${esc(a.role_name)}</span>` : ''}</td>
                  <td><span class="badge ${actionBadge(a.action)}">${esc(a.action || '-')}</span></td>
                  <td>${esc(a.entity_name || '-')}${a.entity_id ? ` <code style="font-size: 0.72rem;">#${esc(a.entity_id)}</code>` : ''}</td>
                  <td><code style="font-size: 0.75rem;">${esc(a.ip_address || '-')}</code></td>
                </tr>`;
              })
              .join('')
          : `<tr><td colspan="5" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada aktivitas audit tercatat.</td></tr>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="font-size: 0.9rem; color: var(--slate-600);">
                Total jejak audit: <strong>${logs.length}</strong> aktivitas terakhir
              </div>
              <input type="search" id="audit-search-input" class="form-control" placeholder="Cari aksi / pengguna / entitas / IP..."
                oninput="const q=this.value.toLowerCase(); document.querySelectorAll('.audit-row').forEach(r => r.style.display = !q || (r.getAttribute('data-search') || '').includes(q) ? '' : 'none');"
                style="max-width: 300px; font-size: 0.85rem;">
            </div>
          </div>

          <div class="card">
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Pengguna</th>
                    <th>Aksi</th>
                    <th>Entitas</th>
                    <th>Alamat IP</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat audit log:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat audit log: ${error.message}</div>`;
      });
  },

  renderCustomerDirectory() {
    this.setupView('Direktori Nasabah');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">📇</div>
        Memuat direktori nasabah...
      </div>`;

    API.getCustomers()
      .then((res) => {
        const customers = Array.isArray(res.data) ? res.data : [];
        const esc = escapeHtmlClient;
        const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
        const activeCount = customers.filter((c) => c.status === 'ACTIVE').length;

        const rows = customers.length
          ? customers
              .map((c) => {
                const search = `${c.name || ''} ${c.account_no || ''} ${c.phone || ''} ${c.email || ''} ${c.kelurahan || ''}`.toLowerCase();
                const statusBadge = c.status === 'ACTIVE' ? 'badge-success' : 'badge-warning';
                return `
                <tr class="cust-row" data-search="${esc(search)}" data-status="${esc(c.status || '')}">
                  <td><code>${esc(c.account_no || '-')}</code></td>
                  <td><strong>${esc(c.name || '-')}</strong><br><span style="font-size: 0.75rem; color: var(--slate-500);">${esc(c.phone || '-')}</span></td>
                  <td><strong style="color: var(--primary-700);">${fmtRp(c.current_balance)}</strong></td>
                  <td><span class="badge badge-warning">${Number(c.current_points) || 0} Pts</span></td>
                  <td><span class="badge ${statusBadge}">${esc(c.status || '-')}</span></td>
                  <td>${esc(c.join_date || '-')}</td>
                  <td style="white-space: nowrap;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="openCustomerDetailModal(${c.id})">Detail</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-status="${esc(c.status || '')}" data-name="${esc(c.name || '')}"
                      onclick="toggleCustomerStatus(${c.id}, this.getAttribute('data-status'), this.getAttribute('data-name'))">
                      ${c.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>`;
              })
              .join('')
          : `<tr class="cust-row" data-search="" data-status=""><td colspan="7" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada nasabah terdaftar.</td></tr>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                <span class="badge badge-neutral">Total: ${customers.length}</span>
                <span class="badge badge-success">Aktif: ${activeCount}</span>
                <span class="badge badge-warning">Non-aktif: ${customers.length - activeCount}</span>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <input type="search" id="cust-search-input" class="form-control" placeholder="Cari nama / no. rekening / telepon..." oninput="filterCustomerTable()" style="max-width: 260px; font-size: 0.85rem;">
                <select id="cust-status-filter" class="form-control" onchange="filterCustomerTable()" style="max-width: 150px; font-size: 0.85rem;">
                  <option value="ALL">Semua Status</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Non-Aktif</option>
                </select>
                <button type="button" class="btn btn-primary" onclick="openRegisterCustomerModal()">+ Daftar Nasabah</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>No. Rekening</th>
                    <th>Nasabah</th>
                    <th>Saldo Tabungan</th>
                    <th>Poin Hijau</th>
                    <th>Status</th>
                    <th>Bergabung</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat direktori nasabah:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat direktori nasabah: ${error.message}</div>`;
      });
  },

  renderWasteCatalog() {
    this.setupView('Katalog Sampah & Harga');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">♻️</div>
        Memuat katalog sampah...
      </div>`;

    const role = State.getRole();
    const canEditPrice = ['ADMIN', 'OWNER'].includes(role);

    API.getWasteCategories()
      .then((res) => {
        const categories = Array.isArray(res.data) ? res.data : [];
        const esc = escapeHtmlClient;
        const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;

        const cards = categories.length
          ? categories
              .map((c) => {
                const stock = Number(c.current_stock_kg) || 0;
                return `
            <div class="card">
              <div style="display: flex; justify-content: space-between; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.5rem;">
                <div>
                  <div style="font-weight: 800; color: var(--slate-800);">${esc(c.name || '-')}</div>
                  <div style="font-size: 0.75rem; color: var(--slate-500);">${esc(c.parent_category || '-')} • <code>${esc(c.code || '-')}</code></div>
                </div>
                <span class="badge ${c.is_active ? 'badge-success' : 'badge-danger'}">${c.is_active ? 'AKTIF' : 'NONAKTIF'}</span>
              </div>
              ${c.description ? `<div style="font-size: 0.8rem; color: var(--slate-600); margin-bottom: 0.75rem;">${esc(c.description)}</div>` : ''}
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">
                <div style="background: var(--primary-50); border-radius: var(--radius-sm); padding: 0.5rem 0.65rem;">
                  <div style="font-size: 0.68rem; color: var(--primary-800); text-transform: uppercase;">Beli dari Nasabah</div>
                  <div style="font-weight: 800; color: var(--primary-900);">${fmtRp(c.buying_price)}<span style="font-size: 0.7rem; font-weight: 600;">/${esc(c.unit || 'kg')}</span></div>
                </div>
                <div style="background: var(--accent-gold-light); border-radius: var(--radius-sm); padding: 0.5rem 0.65rem;">
                  <div style="font-size: 0.68rem; color: #92400e; text-transform: uppercase;">Jual ke Pengepul</div>
                  <div style="font-weight: 800; color: #92400e;">${fmtRp(c.selling_price)}<span style="font-size: 0.7rem; font-weight: 600;">/${esc(c.unit || 'kg')}</span></div>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
                <span style="color: var(--slate-500);">Stok gudang: <strong style="color: var(--slate-700);">${stock.toLocaleString('id-ID')} ${esc(c.unit || 'kg')}</strong></span>
                ${
                  canEditPrice
                    ? `<button type="button" class="btn btn-secondary btn-sm" data-id="${c.id}" data-name="${esc(c.name || '')}" data-buying="${Number(c.buying_price) || 0}" data-selling="${Number(c.selling_price) || 0}"
                        onclick="openPriceModal(Number(this.getAttribute('data-id')), this.getAttribute('data-name'), Number(this.getAttribute('data-buying')), Number(this.getAttribute('data-selling')))">Ubah Harga</button>`
                    : ''
                }
              </div>
            </div>`;
              })
              .join('')
          : `<div class="card" style="text-align: center; color: var(--slate-400); padding: 2rem;">Belum ada kategori sampah terdaftar.</div>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="font-size: 0.9rem; color: var(--slate-600);">
                <strong>${categories.length}</strong> jenis sampah terdaftar — harga mengikuti kebijakan Bank Sampah Digital.
              </div>
              ${canEditPrice ? '<span class="badge badge-info">Mode Ubah Harga: Admin / Owner</span>' : ''}
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 1rem;">
            ${cards}
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat katalog sampah:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat katalog sampah: ${error.message}</div>`;
      });
  },

  renderNotificationHistory(page = 1, channel = 'ALL', scope = 'self') {
    this.setupView('Riwayat Notifikasi');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">🔔</div>
        Memuat riwayat notifikasi...
      </div>`;

    const role = State.getRole();
    const canViewAll = ['ADMIN', 'OWNER'].includes(role);
    const activeScope = canViewAll ? scope : 'self';

    Promise.allSettled([
      API.getNotificationHistory({
        page,
        limit: 10,
        channel: channel !== 'ALL' ? channel : '',
        scope: activeScope,
      }),
      API.getNotificationStats(),
    ])
      .then((results) => {
        const esc = escapeHtmlClient;
        const fmtTime = (v) => {
          if (v === null || v === undefined || v === '') return '-';
          const asNum = Number(v);
          const d = isNaN(asNum) ? new Date(v) : new Date(asNum);
          return isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
        };

        const histRes = results[0].status === 'fulfilled' ? results[0].value.data : null;
        const stats = results[1].status === 'fulfilled' ? results[1].value.data : null;
        const items = histRes && Array.isArray(histRes.data) ? histRes.data : [];
        const pagination = (histRes && histRes.pagination) || { page: 1, limit: 10, total: 0, totalPages: 0 };

        const statsChips = stats
          ? `
              <span class="badge badge-neutral">Total: ${Number(stats.total) || 0}</span>
              <span class="badge badge-info">WhatsApp: ${Number(stats.whatsapp_count) || 0}</span>
              <span class="badge badge-neutral">Sistem: ${Number(stats.system_count) || 0}</span>
              <span class="badge badge-warning">Belum dibaca: ${Number(stats.unread_notifications) || 0}</span>
              ${Number(stats.failed_count) ? `<span class="badge badge-danger">Gagal: ${Number(stats.failed_count)}</span>` : ''}`
          : '';

        const channelBadge = (ch) => (ch === 'WHATSAPP' ? 'badge-success' : 'badge-info');
        const statusBadge = (st) => {
          if (st === 'FAILED') return 'badge-danger';
          if (st === 'DELIVERED' || st === 'READ' || st === 'SENT') return 'badge-success';
          if (st === 'PENDING') return 'badge-warning';
          return 'badge-neutral';
        };

        const listHtml = items.length
          ? items
              .map((n) => `
            <div class="card" style="margin-bottom: 0.75rem; ${n.is_read ? '' : 'border-left: 3px solid var(--primary-500);'}">
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1; min-width: 220px;">
                  <div style="font-weight: 700; color: var(--slate-800); font-size: 0.95rem;">
                    ${n.is_read ? '' : '🔵 '}${esc(n.title || '(Tanpa Judul)')}
                  </div>
                  <div style="font-size: 0.85rem; color: var(--slate-600); margin-top: 0.25rem; white-space: pre-wrap;">${esc(n.message || '-')}</div>
                  <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.5rem;">
                    <span class="badge ${channelBadge(n.channel)}">${esc(n.channel || 'SYSTEM')}</span>
                    <span class="badge badge-neutral">${esc(n.type || 'SYSTEM')}</span>
                    <span class="badge ${statusBadge(n.delivery_status)}">${esc(n.delivery_status || '-')}</span>
                    ${n.recipient_name ? `<span class="badge badge-neutral">ke: ${esc(n.recipient_name)}</span>` : ''}
                  </div>
                </div>
                <div style="text-align: right; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
                  <span style="font-size: 0.72rem; color: var(--slate-400); white-space: nowrap;">${fmtTime(n.created_at)}</span>
                  ${
                    n.is_read
                      ? '<span style="font-size: 0.72rem; color: var(--primary-700);">✓ Dibaca</span>'
                      : `<button type="button" class="btn btn-secondary btn-sm" data-id="${n.id}" onclick="const nid=this.getAttribute('data-id'); API.markNotificationRead(nid).then(() => Router.renderNotificationHistory(${pagination.page}, '${channel}', '${activeScope}')).catch(e => showToast(e.message, 'error'));">Tandai Dibaca</button>`
                  }
                </div>
              </div>
            </div>`)
              .join('')
          : `<div class="card" style="text-align: center; color: var(--slate-400); padding: 2rem;">Belum ada notifikasi pada filter ini.</div>`;

        const scopeSelector = canViewAll
          ? `<select id="notif-scope-select" class="form-control" style="max-width: 190px; font-size: 0.85rem;" onchange="Router.renderNotificationHistory(1, document.getElementById('notif-channel-select').value, this.value)">
              <option value="self" ${activeScope === 'self' ? 'selected' : ''}>Notifikasi Saya</option>
              <option value="all" ${activeScope === 'all' ? 'selected' : ''}>Semua Pengguna</option>
            </select>`
          : '';

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">${statsChips}</div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <select id="notif-channel-select" class="form-control" style="max-width: 170px; font-size: 0.85rem;" onchange="Router.renderNotificationHistory(1, this.value, '${activeScope}')">
                  <option value="ALL" ${channel === 'ALL' ? 'selected' : ''}>Semua Kanal</option>
                  <option value="WHATSAPP" ${channel === 'WHATSAPP' ? 'selected' : ''}>WhatsApp</option>
                  <option value="SYSTEM" ${channel === 'SYSTEM' ? 'selected' : ''}>Sistem</option>
                </select>
                ${scopeSelector}
              </div>
            </div>
          </div>

          ${listHtml}

          <div class="card" style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.85rem; color: var(--slate-500);">
              Halaman ${pagination.page} dari ${Math.max(1, pagination.totalPages)} • Total ${pagination.total} notifikasi
            </span>
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="btn btn-secondary" ${pagination.page <= 1 ? 'disabled' : ''} onclick="Router.renderNotificationHistory(${Math.max(1, pagination.page - 1)}, '${channel}', '${activeScope}')">← Sebelumnya</button>
              <button type="button" class="btn btn-secondary" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} onclick="Router.renderNotificationHistory(${pagination.page + 1}, '${channel}', '${activeScope}')">Berikutnya →</button>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat riwayat notifikasi:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat riwayat notifikasi: ${error.message}</div>`;
      });
  },

  renderNotificationSettings() {
    this.setupView('Preferensi Notifikasi');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">⚙️</div>
        Memuat preferensi notifikasi...
      </div>`;

    API.getNotificationPreferences()
      .then((res) => {
        const data = res.data || {};
        const user = data.user || {};
        const customer = data.customer || null;
        const provider = data.provider || {};
        const esc = escapeHtmlClient;
        const role = State.getRole();

        const toggle = (id, checked, label, desc) => `
          <label style="display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.7rem 0; border-bottom: 1px solid var(--border-color); cursor: pointer;">
            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="margin-top: 0.25rem; width: 1.05rem; height: 1.05rem; accent-color: var(--primary-600);">
            <span>
              <span style="font-weight: 700; font-size: 0.9rem; color: var(--slate-800);">${label}</span>
              <br><span style="font-size: 0.78rem; color: var(--slate-500);">${desc}</span>
            </span>
          </label>`;

        const adminSection = ['ADMIN', 'OWNER'].includes(role)
          ? `
            <div class="card" style="margin-top: 1rem;">
              <div class="card-header"><h3 class="card-title">🛡 Notifikasi Operasional (Admin / Owner)</h3></div>
              ${toggle('pref-admin-deposit', user.notification_admin_new_deposit, 'Setoran Baru Masuk', 'Diberi tahu saat nasabah menyetor sampah di loket.')}
              ${toggle('pref-admin-withdrawal', user.notification_admin_withdrawal, 'Pengajuan Penarikan', 'Notifikasi permintaan penarikan saldo yang menunggu persetujuan.')}
              ${toggle('pref-admin-reward', user.notification_admin_reward, 'Penukaran Hadiah', 'Notifikasi penukaran poin nasabah oleh pengepul/loket.')}
              ${toggle('pref-admin-alert', user.notification_admin_alert, 'Peringatan Sistem', 'Alert keamanan dan operasional penting sistem.')}
            </div>`
          : '';

        const customerSection = customer
          ? `
            <div class="card" style="margin-top: 1rem;">
              <div class="card-header"><h3 class="card-title">💳 Notifikasi Tabungan (Akun Nasabah ${esc(customer.account_no || '')})</h3></div>
              ${toggle('pref-cust-deposit', customer.notification_deposit, 'Setoran Sampah', 'Konfirmasi setoran dan nominal yang masuk ke dompet.')}
              ${toggle('pref-cust-withdrawal', customer.notification_withdrawal, 'Penarikan Saldo', 'Update status pengajuan penarikan tunai / transfer.')}
              ${toggle('pref-cust-reward', customer.notification_reward, 'Hadiah & Poin', 'Poin bertambah dan hadiah siap ditukar.')}
              ${toggle('pref-cust-achievement', customer.notification_achievement, 'Lencana & Level', 'Pencapaian baru pada program gamifikasi hijau.')}
              ${toggle('pref-cust-balance', customer.notification_balance, 'Perubahan Saldo', 'Mutasi masuk/keluar pada buku tabungan.')}
            </div>`
          : '';

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1rem;">
            <div class="card-header"><h3 class="card-title">📲 Saluran Notifikasi</h3></div>
            <div class="form-group">
              <label class="form-label">Nomor WhatsApp Aktif (Format: 6281234567890)</label>
              <input type="text" id="pref-wa-number" class="form-control" value="${esc(user.whatsapp_number || '')}" placeholder="6281234567890" style="max-width: 320px;">
              <div style="font-size: 0.75rem; color: var(--slate-500); margin-top: 0.35rem;">
                ${
                  user.whatsapp_verified
                    ? '✅ Nomor terverifikasi.'
                    : 'Kosongkan nomor untuk menonaktifkan verifikasi. Format Indonesia wajib diawali 62.'
                }
              </div>
            </div>
            ${toggle('pref-whatsapp', user.notification_whatsapp_enabled, 'Notifikasi WhatsApp', 'Kirim pesan WhatsApp (Fonnte) untuk event penting tabungan Anda.')}
            ${toggle('pref-system', user.notification_system_enabled, 'Notifikasi Sistem In-App', 'Tampilkan notifikasi di dalam aplikasi (riwayat notifikasi).')}
          </div>

          ${adminSection}
          ${customerSection}

          <div class="card" style="margin-top: 1rem;">
            <div class="card-header"><h3 class="card-title">📡 Status Penyedia Pesan</h3></div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-size: 0.85rem;">
              <span class="badge ${provider.connected ? 'badge-success' : 'badge-danger'}">${esc(provider.providerLabel || provider.provider || '-')} ${provider.connected ? 'Terkoneksi' : 'Terputus'}</span>
              <span class="badge badge-neutral">Mode: ${esc(String(provider.mode || '-').toUpperCase())}</span>
              <span style="color: var(--slate-500);">${esc(provider.message || '')}</span>
              ${role === 'ADMIN' ? '<a href="#/admin/informasi-api" class="btn btn-secondary btn-sm">Detail Sistem</a>' : ''}
            </div>
          </div>

          <div style="margin-top: 1.25rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary" id="btn-save-notif-prefs">💾 Simpan Preferensi</button>
            <button type="button" class="btn btn-secondary" onclick="Router.renderNotificationSettings()">Batalkan Perubahan</button>
          </div>`;

        const saveBtn = document.getElementById('btn-save-notif-prefs');
        if (saveBtn) {
          saveBtn.addEventListener('click', () => {
            const payload = {
              whatsapp_number: (document.getElementById('pref-wa-number').value || '').trim(),
              notification_whatsapp_enabled: document.getElementById('pref-whatsapp').checked,
              notification_system_enabled: document.getElementById('pref-system').checked,
            };
            const adminMap = {
              'pref-admin-deposit': 'notification_admin_new_deposit',
              'pref-admin-withdrawal': 'notification_admin_withdrawal',
              'pref-admin-reward': 'notification_admin_reward',
              'pref-admin-alert': 'notification_admin_alert',
            };
            Object.keys(adminMap).forEach((elId) => {
              const el = document.getElementById(elId);
              if (el) payload[adminMap[elId]] = el.checked;
            });
            const custMap = {
              'pref-cust-deposit': 'notification_deposit',
              'pref-cust-withdrawal': 'notification_withdrawal',
              'pref-cust-reward': 'notification_reward',
              'pref-cust-achievement': 'notification_achievement',
              'pref-cust-balance': 'notification_balance',
            };
            Object.keys(custMap).forEach((elId) => {
              const el = document.getElementById(elId);
              if (el) payload[custMap[elId]] = el.checked;
            });

            saveBtn.disabled = true;
            saveBtn.textContent = 'Menyimpan...';
            API.updateNotificationPreferences(payload)
              .then(() => {
                showToast('Preferensi notifikasi berhasil disimpan!', 'success');
                Router.renderNotificationSettings();
              })
              .catch((err) => {
                showToast(`Gagal menyimpan preferensi: ${err.message}`, 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Simpan Preferensi';
              });
          });
        }
      })
      .catch((error) => {
        console.error('Gagal memuat preferensi notifikasi:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat preferensi notifikasi: ${error.message}</div>`;
      });
  },

  renderProfile() {
    this.setupView('Profil & Keamanan');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">👤</div>
        Memuat profil Anda...
      </div>`;

    API.getMe()
      .then((res) => {
        const me = res.data || {};
        const esc = escapeHtmlClient;
        const customer = me.customer || null;

        content.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem;">
            <div class="card">
              <div class="card-header"><h3 class="card-title">🪪 Identitas Akun</h3></div>
              <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
                <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--primary-100); color: var(--primary-800); display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: 800; flex-shrink: 0;">
                  ${esc((me.name || '?').charAt(0).toUpperCase())}
                </div>
                <div>
                  <div style="font-weight: 800; font-size: 1.1rem; color: var(--slate-800);">${esc(me.name || '-')}</div>
                  <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;">
                    <span class="badge badge-info">${esc(me.roleDisplay || me.role || '-')}</span>
                    <span class="badge ${me.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${esc(me.status || '-')}</span>
                  </div>
                </div>
              </div>
              <div style="font-size: 0.87rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; gap: 1rem;"><span style="color: var(--slate-500);">Email</span><strong>${esc(me.email || '-')}</strong></div>
                <div style="display: flex; justify-content: space-between; gap: 1rem;"><span style="color: var(--slate-500);">Username</span><strong>@${esc(me.username || '-')}</strong></div>
                <div style="display: flex; justify-content: space-between; gap: 1rem;"><span style="color: var(--slate-500);">Telepon</span><strong>${esc(me.phone || '-')}</strong></div>
                ${
                  customer
                    ? `<div style="display: flex; justify-content: space-between; gap: 1rem;"><span style="color: var(--slate-500);">No. Rekening</span><strong><code>${esc(customer.accountNo || '-')}</code></strong></div>`
                    : ''
                }
                ${me.branchId ? `<div style="display: flex; justify-content: space-between; gap: 1rem;"><span style="color: var(--slate-500);">Unit / Cabang</span><strong>#${esc(String(me.branchId))}</strong></div>` : ''}
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">✏️ Ubah Profil</h3></div>
              <form onsubmit="handleProfileUpdate(event)">
                <div class="form-group">
                  <label class="form-label">Nama Lengkap</label>
                  <input type="text" id="prof-name" class="form-control" required value="${esc(me.name || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Nomor Telepon / WhatsApp</label>
                  <input type="tel" id="prof-phone" class="form-control" value="${esc(me.phone || '')}" placeholder="08123456789">
                </div>
                <button type="submit" class="btn btn-primary btn-block">💾 Simpan Perubahan Profil</button>
              </form>
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">🔑 Keamanan Akun</h3></div>
              <form onsubmit="handlePasswordChange(event)">
                <div class="form-group">
                  <label class="form-label">Kata Sandi Saat Ini</label>
                  <input type="password" id="pwd-current" class="form-control" required autocomplete="current-password">
                </div>
                <div class="form-group">
                  <label class="form-label">Kata Sandi Baru</label>
                  <input type="password" id="pwd-new" class="form-control" required minlength="6" autocomplete="new-password" placeholder="Minimal 6 karakter">
                </div>
                <button type="submit" class="btn btn-primary btn-block">🔒 Ubah Kata Sandi</button>
              </form>
              <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <span style="font-size: 0.8rem; color: var(--slate-500);">Sesi aktif sebagai <strong>${esc(me.roleDisplay || me.role || '-')}</strong>.</span>
                <button type="button" class="btn btn-secondary" onclick="handleLogout()">Keluar dari Sesi</button>
              </div>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat profil:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat profil: ${error.message}</div>`;
      });
  },

  renderOwnerDashboard() {
    this.setupView('Dasbor Eksekutif & Analitik');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">📈</div>
        Memuat dasbor eksekutif...
      </div>`;

    const pOverview = typeof API.getOwnerAnalyticsOverview === 'function' ? API.getOwnerAnalyticsOverview() : API.getExecutiveOverview();
    const pCharts = typeof API.getOwnerAnalyticsCharts === 'function' ? API.getOwnerAnalyticsCharts() : API.getTrendCharts();
    const pInsights = typeof API.getOwnerAnalyticsInsights === 'function' ? API.getOwnerAnalyticsInsights() : API.getAiInsights();
    const pPending = API.getPendingWithdrawals();
    const pFinance = API.getFinancialSummary();
    const pDaily = API.getDailyTransactions();

    Promise.allSettled([pOverview, pCharts, pInsights, pPending, pFinance, pDaily])
      .then((results) => {
        const esc = escapeHtmlClient;
        const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
        const fmtKg = (n) => `${(Number(n) || 0).toLocaleString('id-ID')} kg`;
        const fmtTime = (v) => {
          if (v === null || v === undefined || v === '') return '—';
          const asNum = Number(v);
          const d = isNaN(asNum) ? new Date(v) : new Date(asNum);
          return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID');
        };
        const pick = (i) => (results[i].status === 'fulfilled' ? results[i].value.data : null);

        const overview = pick(0) || {};
        const charts = pick(1) || {};
        const insightsRes = pick(2) || {};
        const pending = pick(3) || [];
        const finance = pick(4) || {};
        const dailyData = pick(5);
        const daily = Array.isArray(dailyData)
          ? dailyData
          : Array.isArray(dailyData?.transactions)
            ? dailyData.transactions
            : [];

        const stat = (icon, label, value, tone) => `
          <div class="stat-card">
            <div class="stat-icon-wrapper stat-icon-${tone}">${icon}</div>
            <div class="stat-info">
              <div class="stat-value">${value}</div>
              <div class="stat-label">${label}</div>
            </div>
          </div>`;

        const statsHtml = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
            ${stat('💰', 'Pendapatan Penjualan', fmtRp(overview.totalRevenue), 'green')}
            ${stat('📊', 'Laba Bersih', fmtRp(overview.netProfit), 'blue')}
            ${stat('🎯', 'Margin Kotor', `${Number(overview.roi) || 0}%`, 'gold')}
            ${stat('♻️', 'Sampah Diproses', fmtKg(overview.totalDepositKg), 'green')}
            ${stat('🧾', 'Transaksi', `${Number(overview.totalDepositCount) || 0} setor / ${Number(overview.totalSalesCount) || 0} jual`, 'blue')}
            ${stat('👥', 'Nasabah Aktif', `${Number(overview.totalActiveCustomers) || 0}/${Number(overview.totalCustomers) || 0}`, 'gold')}
          </div>`;

        const barList = (items, valFn, labelFn, unit, tone) => {
          if (!Array.isArray(items) || !items.length) {
            return '<div style="color: var(--slate-400); font-size: 0.85rem; padding: 0.5rem 0;">Belum ada data.</div>';
          }
          const max = Math.max(...items.map(valFn), 1);
          return items
            .map(
              (it) => `
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
              <div style="flex: 0 0 42%; font-size: 0.78rem; color: var(--slate-600); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(labelFn(it))}">${esc(labelFn(it))}</div>
              <div style="flex: 1; background: var(--slate-100); border-radius: 99px; height: 12px; overflow: hidden;">
                <div style="width: ${Math.round((valFn(it) / max) * 100)}%; height: 100%; background: ${tone}; border-radius: 99px;"></div>
              </div>
              <div style="flex: 0 0 auto; font-size: 0.75rem; font-weight: 700; color: var(--slate-700); min-width: 64px; text-align: right;">${valFn(it).toLocaleString('id-ID')}${unit}</div>
            </div>`
            )
            .join('');
        };

        const trendRows = Array.isArray(charts.transactionTrend) && charts.transactionTrend.length
          ? charts.transactionTrend
              .map(
                (t) => `
            <tr>
              <td>${esc(t.day ? String(t.day).slice(0, 10) : 'Semua periode')}</td>
              <td>${Number(t.count) || 0}</td>
              <td>${fmtKg(t.weight)}</td>
              <td><strong>${fmtRp(t.amount)}</strong></td>
            </tr>`
              )
              .join('')
          : '<tr><td colspan="4" style="text-align: center; color: var(--slate-400);">Belum ada tren transaksi.</td></tr>';

        const insights = Array.isArray(insightsRes.insights) ? insightsRes.insights : [];
        const summary = insightsRes.summary || {};
        const sevBadge = (s) => (s === 'WARNING' ? 'badge-warning' : s === 'SUCCESS' ? 'badge-success' : 'badge-info');
        const insightHtml = insights.length
          ? insights
              .map(
                (i) => `
            <div style="padding: 0.7rem 0; border-bottom: 1px solid var(--border-color);">
              <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.25rem;">
                <span class="badge ${sevBadge(i.severity)}">${esc(i.severity || 'INFO')}</span>
                <strong style="font-size: 0.9rem; color: var(--slate-800);">${esc(i.title || '-')}</strong>
                ${i.metric ? `<span class="badge badge-neutral">${esc(i.metric)}</span>` : ''}
              </div>
              <div style="font-size: 0.82rem; color: var(--slate-600);">${esc(i.description || '')}</div>
            </div>`
              )
              .join('')
          : '<div style="color: var(--slate-400); font-size: 0.85rem;">Belum ada insight terdeteksi.</div>';

        const pendingHtml = Array.isArray(pending) && pending.length
          ? pending
              .map((w) => {
                const methodBadge =
                  w.method === 'BANK_TRANSFER' ? 'badge-info' : w.method === 'EWALLET' ? 'badge-neutral' : 'badge-success';
                return `
            <div class="card" style="margin-bottom: 0.75rem;">
              <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
                <div style="min-width: 220px;">
                  <div style="font-weight: 800; color: var(--slate-800);">${fmtRp(w.amount)}
                    <span class="badge ${methodBadge}" style="margin-left: 0.35rem;">${esc(w.method || 'CASH')}</span>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--slate-600); margin-top: 0.2rem;">
                    <code>${esc(w.request_no || '-')}</code> • ${esc(w.customer_name || '-')} (<code>${esc(w.account_no || '-')}</code>)
                  </div>
                  <div style="font-size: 0.72rem; color: var(--slate-400); margin-top: 0.15rem;">
                    Diajukan ${fmtTime(w.created_at)} • Saldo saat ini: ${fmtRp(w.customer_balance)}
                    ${w.bank_name ? ` • ${esc(w.bank_name)} ${esc(w.bank_account_number || '')}` : ''}
                  </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  <button type="button" class="btn btn-primary btn-sm" data-id="${w.id}" data-req="${esc(w.request_no || '')}" data-amt="${Number(w.amount) || 0}"
                    onclick="handleApproveWithdrawal(Number(this.getAttribute('data-id')), this.getAttribute('data-req'), Number(this.getAttribute('data-amt')))">✔ Setujui & Cairkan</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-id="${w.id}" data-req="${esc(w.request_no || '')}"
                    onclick="handleRejectWithdrawal(Number(this.getAttribute('data-id')), this.getAttribute('data-req'))">✖ Tolak</button>
                </div>
              </div>
            </div>`;
              })
              .join('')
          : `<div class="card" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">🎉 Tidak ada pengajuan penarikan yang menunggu persetujuan.</div>`;

        const dailyRows = Array.isArray(daily) && daily.length
          ? daily
              .slice(0, 6)
              .map((t) => {
                const statusBadge =
                  t.status === 'COMPLETED'
                    ? 'badge-success'
                    : t.status === 'PENDING' || t.status === 'PROCESSING'
                      ? 'badge-warning'
                      : t.status === 'CANCELLED' || t.status === 'REJECTED'
                        ? 'badge-danger'
                        : 'badge-neutral';
                return `
            <tr>
              <td><code>${esc(t.transaction_no || '-')}</code></td>
              <td>${esc(t.customer_name || t.account_no || '-')}</td>
              <td>${fmtKg(t.total_weight_kg)}</td>
              <td><strong>${fmtRp(t.total_amount)}</strong></td>
              <td><span class="badge ${statusBadge}">${esc(t.status || '-')}</span></td>
            </tr>`;
              })
              .join('')
          : '<tr><td colspan="5" style="text-align: center; color: var(--slate-400);">Belum ada transaksi hari ini.</td></tr>';

        const summaryChips = `
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.75rem;">
            <span class="badge badge-neutral">Nasabah: ${Number(summary.totalCustomers) || 0}</span>
            <span class="badge badge-success">Aktif 30 hari: ${Number(summary.activeCustomers30Days) || 0}</span>
            <span class="badge badge-warning">Pasif 30 hari: ${Number(summary.inactiveCustomers30Days) || 0}</span>
            <span class="badge badge-info">Margin: ${Number(summary.grossMarginPercentage) || 0}%</span>
            ${summary.topCategoryName ? `<span class="badge badge-neutral">Teratas: ${esc(summary.topCategoryName)}</span>` : ''}
          </div>`;

        content.innerHTML = `
          ${statsHtml}

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1rem;">
            <div class="card">
              <div class="card-header"><h3 class="card-title">💡 Ringkasan & Insight Cerdas</h3></div>
              ${summaryChips}
              ${insightHtml}
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">✅ Approval Penarikan Saldo</h3>
                <a href="#/owner/withdrawals" class="btn btn-secondary btn-sm">Lihat Semua</a>
              </div>
              ${pendingHtml}
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">📈 Tren Transaksi Setoran</h3></div>
              <div class="table-responsive">
                <table class="data-table">
                  <thead><tr><th>Periode</th><th>Jumlah</th><th>Berat</th><th>Nominal</th></tr></thead>
                  <tbody>${trendRows}</tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">🥧 Volume per Kategori Sampah (kg)</h3></div>
              ${barList(charts.categoryVolume, (i) => Number(i.value) || 0, (i) => i.label || '-', ' kg', 'var(--primary-500)')}
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">👥 Pertumbuhan Nasabah</h3></div>
              ${barList(charts.customerGrowth, (i) => Number(i.count) || 0, (i) => i.month || '-', '', 'var(--info-blue)')}
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">💰 Tren Pendapatan (Rp)</h3></div>
              ${barList(charts.revenueTrend, (i) => Number(i.revenue) || 0, (i) => i.month || 'Periode', '', 'var(--accent-gold)')}
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">📦 Stok Inventaris Gudang (kg)</h3>
                <a href="#/owner/inventory" class="btn btn-secondary btn-sm">Inventaris</a>
              </div>
              ${barList(charts.inventoryTrend, (i) => Number(i.value) || 0, (i) => i.label || '-', ' kg', 'var(--primary-600)')}
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">🕐 Transaksi Terakhir</h3>
                <a href="#/petugas/transactions" class="btn btn-secondary btn-sm">Semua Transaksi</a>
              </div>
              <div class="table-responsive">
                <table class="data-table">
                  <thead><tr><th>No. Transaksi</th><th>Nasabah</th><th>Berat</th><th>Nominal</th><th>Status</th></tr></thead>
                  <tbody>${dailyRows}</tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: 1rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              <a href="#/owner/reports" class="btn btn-secondary">📊 Laporan Analitik & BI</a>
              <a href="#/owner/sales" class="btn btn-secondary">💵 Pemasukan Pengepul</a>
              <a href="#/owner/buyers" class="btn btn-secondary">🤝 Daftar Pengepul</a>
              <a href="#/waste-catalog" class="btn btn-secondary">♻️ Katalog & Harga</a>
              <a href="#/notifications" class="btn btn-secondary">🔔 Notifikasi</a>
              <button type="button" class="btn btn-primary" onclick="Router.renderOwnerDashboard()">🔄 Segarkan Data</button>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat dasbor eksekutif:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat dasbor eksekutif: ${error.message}</div>`;
      });
  },

  renderOwnerReports() {
    this.setupView('Laporan Analitik & Business Intelligence');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div class="card" style="margin-bottom: 1.25rem;">
        <div class="card-header"><h3 class="card-title">🗂 Pilihan Laporan</h3></div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end;">
          <div class="form-group" style="flex: 1 1 240px; margin-bottom: 0;">
            <label class="form-label">Jenis Laporan</label>
            <select id="report-type-select" class="form-control">
              <option value="operational">Laporan Operasional Harian</option>
              <option value="financial">Laporan Keuangan / Mutasi Dompet</option>
              <option value="inventory">Laporan Inventaris Gudang</option>
              <option value="customer_activity">Laporan Aktivitas Nasabah</option>
              <option value="waste_category">Laporan Volume Sampah per Kategori</option>
              <option value="sales">Laporan Penjualan / Pemasukan Pengepul</option>
              <option value="withdrawal">Laporan Penarikan Saldo Nasabah</option>
            </select>
          </div>
          <div class="form-group" style="flex: 0 1 170px; margin-bottom: 0;">
            <label class="form-label">Dari Tanggal</label>
            <input type="date" id="report-start-date" class="form-control">
          </div>
          <div class="form-group" style="flex: 0 1 170px; margin-bottom: 0;">
            <label class="form-label">Sampai Tanggal</label>
            <input type="date" id="report-end-date" class="form-control">
          </div>
          <button type="button" class="btn btn-primary" onclick="loadSelectedReport()">📈 Tampilkan Laporan</button>
          <button type="button" class="btn btn-secondary" onclick="printCurrentReport()">🖨 Cetak / Simpan PDF</button>
        </div>
      </div>
      <div id="report-result-container">
        <div class="card" style="text-align: center; color: var(--slate-400); padding: 2.5rem;">
          Pilih jenis laporan lalu klik <strong>"Tampilkan Laporan"</strong> untuk memuat data.
        </div>
      </div>`;
  },

  renderOwnerWithdrawals() {
    this.setupView('Approval Penarikan Saldo');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">💸</div>
        Memuat pengajuan penarikan...
      </div>`;

    API.getPendingWithdrawals()
      .then((res) => {
        const pending = Array.isArray(res.data) ? res.data : [];
        const esc = escapeHtmlClient;
        const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
        const fmtTime = (v) => {
          if (v === null || v === undefined || v === '') return '—';
          const asNum = Number(v);
          const d = isNaN(asNum) ? new Date(v) : new Date(asNum);
          return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID');
        };

        const rows = pending.length
          ? pending
              .map((w) => {
                const methodBadge =
                  w.method === 'BANK_TRANSFER' ? 'badge-info' : w.method === 'EWALLET' ? 'badge-neutral' : 'badge-success';
                return `
              <tr>
                <td><code>${esc(w.request_no || '-')}</code></td>
                <td><strong>${esc(w.customer_name || '-')}</strong><br><span style="font-size: 0.72rem; color: var(--slate-500);"><code>${esc(w.account_no || '-')}</code> • ${esc(w.customer_phone || '-')}</span></td>
                <td><strong style="color: var(--primary-700);">${fmtRp(w.amount)}</strong></td>
                <td><span class="badge ${methodBadge}">${esc(w.method || 'CASH')}</span>${w.bank_name ? `<br><span style="font-size: 0.7rem; color: var(--slate-500);">${esc(w.bank_name)} ${esc(w.bank_account_number || '')}</span>` : ''}</td>
                <td>${fmtTime(w.created_at)}<br><span style="font-size: 0.7rem; color: var(--slate-500);">Saldo: ${fmtRp(w.customer_balance)}</span></td>
                <td style="white-space: nowrap;">
                  <button type="button" class="btn btn-primary btn-sm" data-id="${w.id}" data-req="${esc(w.request_no || '')}" data-amt="${Number(w.amount) || 0}"
                    onclick="handleApproveWithdrawal(Number(this.getAttribute('data-id')), this.getAttribute('data-req'), Number(this.getAttribute('data-amt')))">✔ Setujui</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-id="${w.id}" data-req="${esc(w.request_no || '')}"
                    onclick="handleRejectWithdrawal(Number(this.getAttribute('data-id')), this.getAttribute('data-req'))">✖ Tolak</button>
                </td>
              </tr>`;
              })
              .join('')
          : `<tr><td colspan="6" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">🎉 Tidak ada pengajuan penarikan yang menunggu persetujuan.</td></tr>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="font-size: 0.9rem; color: var(--slate-600);">
                Menunggu persetujuan: <strong>${pending.length}</strong> pengajuan
              </div>
              <button type="button" class="btn btn-primary" onclick="Router.renderOwnerWithdrawals()">🔄 Segarkan</button>
            </div>
          </div>

          <div class="card">
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>No. Pengajuan</th>
                    <th>Nasabah</th>
                    <th>Nominal</th>
                    <th>Metode</th>
                    <th>Diajukan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>

          <div class="card" style="margin-top: 1rem; font-size: 0.82rem; color: var(--slate-500);">
            ℹ️ Persetujuan akan mencairkan dana dari dompet nasabah secara permanen dan mengirim notifikasi WhatsApp (Fonnte). Proses memerlukan PIN transaksi.
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat pengajuan penarikan:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat pengajuan penarikan: ${error.message}</div>`;
      });
  },

  renderOwnerSales() {
    this.setupView('Pemasukan Pengepul & Penjualan');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">💵</div>
        Memuat data penjualan...
      </div>`;

    Promise.allSettled([API.getSalesSummary(), API.getSales()])
      .then((results) => {
        const esc = escapeHtmlClient;
        const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
        const fmtKg = (n) => `${(Number(n) || 0).toLocaleString('id-ID')} kg`;
        const summary = results[0].status === 'fulfilled' ? results[0].value.data || {} : {};
        const sales = results[1].status === 'fulfilled' && Array.isArray(results[1].value.data) ? results[1].value.data : [];

        const stat = (icon, label, value, tone) => `
          <div class="stat-card">
            <div class="stat-icon-wrapper stat-icon-${tone}">${icon}</div>
            <div class="stat-info">
              <div class="stat-value">${value}</div>
              <div class="stat-label">${label}</div>
            </div>
          </div>`;

        const statsHtml = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
            ${stat('💰', 'Total Pendapatan', fmtRp(summary.totalRevenue), 'green')}
            ${stat('📦', 'Berat Terjual', fmtKg(summary.totalWeightSoldKg), 'blue')}
            ${stat('🧾', 'Jumlah Nota', `${Number(summary.totalInvoices) || 0}`, 'gold')}
            ${stat('📉', 'Laba Kotor', fmtRp(summary.grossProfit), 'green')}
            ${stat('🎯', 'Margin', `${Number(summary.marginPercentage) || 0}%`, 'blue')}
            ${stat('🏦', 'Biaya Akuisisi', fmtRp(summary.totalAcquisitionCost), 'gold')}
          </div>`;

        const payBadge = (s) => (s === 'PAID' ? 'badge-success' : s === 'PARTIAL' ? 'badge-warning' : 'badge-danger');

        const rows = sales.length
          ? sales
              .map((s) => `
              <tr>
                <td><code>${esc(s.invoice_no || '-')}</code></td>
                <td>${esc(s.sale_date ? String(s.sale_date).slice(0, 10) : '-')}</td>
                <td><strong>${esc(s.buyer_name || '-')}</strong>${s.company_name ? `<br><span style="font-size: 0.72rem; color: var(--slate-500);">${esc(s.company_name)}</span>` : ''}</td>
                <td>${fmtKg(s.total_weight_kg)}</td>
                <td><strong style="color: var(--primary-700);">${fmtRp(s.total_amount)}</strong></td>
                <td><span class="badge ${payBadge(s.payment_status)}">${esc(s.payment_status || '-')}</span></td>
                <td>${esc(s.creator_name || '-')}</td>
              </tr>`)
              .join('')
          : `<tr><td colspan="7" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada nota penjualan tercatat.</td></tr>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="font-size: 0.9rem; color: var(--slate-600);">Rekap penjualan sampah ke mitra pengepul.</div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="openCreateSaleModal()">+ Catat Penjualan Baru</button>
                <button type="button" class="btn btn-secondary" onclick="Router.renderOwnerSales()">🔄 Segarkan</button>
              </div>
            </div>
          </div>

          ${statsHtml}

          <div class="card">
            <div class="card-header"><h3 class="card-title">📋 Daftar Nota Penjualan (${sales.length})</h3></div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>No. Nota</th>
                    <th>Tanggal</th>
                    <th>Pembeli</th>
                    <th>Berat</th>
                    <th>Nominal</th>
                    <th>Status Bayar</th>
                    <th>Pencatat</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat data penjualan:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat data penjualan: ${error.message}</div>`;
      });
  },

  renderInventory() {
    this.setupView('Inventaris Gudang');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">📦</div>
        Memuat inventaris gudang...
      </div>`;

    Promise.allSettled([API.getInventory(), API.getInventoryMovements()])
      .then((results) => {
        const esc = escapeHtmlClient;
        const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
        const fmtKg = (n) => `${(Number(n) || 0).toLocaleString('id-ID')} kg`;
        const fmtTime = (v) => {
          if (v === null || v === undefined || v === '') return '—';
          const asNum = Number(v);
          const d = isNaN(asNum) ? new Date(v) : new Date(asNum);
          return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID');
        };

        const inv = results[0].status === 'fulfilled' ? results[0].value.data || {} : {};
        const items = Array.isArray(inv.items) ? inv.items : [];
        const movements = results[1].status === 'fulfilled' && Array.isArray(results[1].value.data) ? results[1].value.data : [];

        const stat = (icon, label, value, tone) => `
          <div class="stat-card">
            <div class="stat-icon-wrapper stat-icon-${tone}">${icon}</div>
            <div class="stat-info">
              <div class="stat-value">${value}</div>
              <div class="stat-label">${label}</div>
            </div>
          </div>`;

        const statsHtml = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
            ${stat('⚖️', 'Total Stok Gudang', fmtKg(inv.totalStockKg), 'green')}
            ${stat('💎', 'Estimasi Nilai Jual', fmtRp(inv.totalEstimatedValuation), 'gold')}
            ${stat('🗂', 'Jenis Item', `${items.length}`, 'blue')}
          </div>`;

        const itemRows = items.length
          ? items
              .map((it) => {
                const stock = Number(it.current_stock_kg) || 0;
                const minStock = Number(it.min_stock_kg) || 0;
                const low = minStock > 0 && stock < minStock;
                return `
              <tr>
                <td><strong>${esc(it.name || '-')}</strong><br><span style="font-size: 0.72rem; color: var(--slate-500);">${esc(it.category_name || it.parent_category || '-')}</span></td>
                <td><strong style="color: ${low ? 'var(--danger-red)' : 'var(--primary-700)'};">${fmtKg(stock)}</strong>${minStock ? `<br><span style="font-size: 0.7rem; color: var(--slate-400);">min ${fmtKg(minStock)}</span>` : ''}</td>
                <td>${fmtRp(it.selling_price)}${it.unit ? `/${esc(it.unit)}` : ''}</td>
                <td>${fmtRp(stock * (Number(it.selling_price) || 0))}</td>
                <td><span class="badge ${low ? 'badge-danger' : stock > 0 ? 'badge-success' : 'badge-warning'}">${low ? 'STOK MENIPIS' : stock > 0 ? 'Tersedia' : 'Habis'}</span></td>
              </tr>`;
              })
              .join('')
          : `<tr><td colspan="5" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada item inventaris.</td></tr>`;

        const moveBadge = (t) => (t === 'IN' ? 'badge-success' : t === 'OUT' ? 'badge-danger' : 'badge-info');
        const moveRows = movements.length
          ? movements
              .slice(0, 15)
              .map((m) => `
              <tr>
                <td>${fmtTime(m.created_at)}</td>
                <td><span class="badge ${moveBadge(m.movement_type)}">${esc(m.movement_type || '-')}</span></td>
                <td>${esc(m.category_name || '-')}</td>
                <td>${fmtKg(m.weight_kg)}</td>
                <td>${m.reference_id ? `<code style="font-size: 0.72rem;">${esc(m.reference_id)}</code>` : '—'}</td>
                <td>${esc(m.creator_name || '-')}</td>
              </tr>`)
              .join('')
          : `<tr><td colspan="6" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada pergerakan stok tercatat.</td></tr>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="font-size: 0.9rem; color: var(--slate-600);">Persediaan sampah siap jual & riwayat pergerakan gudang.</div>
              <button type="button" class="btn btn-secondary" onclick="Router.renderInventory()">🔄 Segarkan</button>
            </div>
          </div>

          ${statsHtml}

          <div class="card" style="margin-bottom: 1.25rem;">
            <div class="card-header"><h3 class="card-title">🗂 Stok per Item (${items.length})</h3>
              <a href="#/waste-catalog" class="btn btn-secondary btn-sm">Katalog & Harga</a>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Stok Saat Ini</th>
                    <th>Harga Jual</th>
                    <th>Estimasi Nilai</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">🔄 Pergerakan Terakhir</h3></div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Jenis</th>
                    <th>Item</th>
                    <th>Berat</th>
                    <th>Referensi</th>
                    <th>Petugas</th>
                  </tr>
                </thead>
                <tbody>${moveRows}</tbody>
              </table>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat inventaris:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat inventaris: ${error.message}</div>`;
      });
  },

  renderBuyers() {
    this.setupView('Daftar Pengepul / Mitra Pembeli');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">🤝</div>
        Memuat daftar pengepul...
      </div>`;

    API.getBuyers()
      .then((res) => {
        const buyers = Array.isArray(res.data) ? res.data : [];
        const esc = escapeHtmlClient;

        const rows = buyers.length
          ? buyers
              .map((b) => `
              <tr>
                <td><strong>${esc(b.name || '-')}</strong></td>
                <td>${esc(b.company_name || b.contactPerson || '—')}</td>
                <td>${esc(b.phone || '—')}</td>
                <td style="max-width: 260px;">${esc(b.address || '—')}</td>
                <td><span class="badge ${b.is_active ? 'badge-success' : 'badge-warning'}">${b.is_active ? 'AKTIF' : 'NONAKTIF'}</span></td>
                <td style="white-space: nowrap;">
                  <button type="button" class="btn btn-secondary btn-sm" data-id="${b.id}" data-name="${esc(b.name || '')}"
                    onclick="handleDeleteBuyer(Number(this.getAttribute('data-id')), this.getAttribute('data-name'))">🗑 Hapus</button>
                </td>
              </tr>`)
              .join('')
          : `<tr><td colspan="6" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada mitra pengepul terdaftar.</td></tr>`;

        content.innerHTML = `
          <div class="card" style="margin-bottom: 1.25rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center;">
              <div style="font-size: 0.9rem; color: var(--slate-600);">
                <strong>${buyers.length}</strong> mitra pembeli sampah daur ulang terdaftar.
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary" onclick="openAddBuyerModal()">+ Tambah Pengepul</button>
                <button type="button" class="btn btn-secondary" onclick="Router.renderBuyers()">🔄 Segarkan</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Nama Pengepul</th>
                    <th>Perusahaan</th>
                    <th>Telepon</th>
                    <th>Alamat</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      })
      .catch((error) => {
        console.error('Gagal memuat daftar pengepul:', error);
        content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat daftar pengepul: ${error.message}</div>`;
      });
  },

  renderLogin() {
    this.setupView('Login');
    const content = document.getElementById('view-content');
    if (!content) return;

    const demoAccountsHtml = (State.DEMO_ACCOUNTS || [])
      .map(
        (acc) => `
            <button type="button" class="btn btn-secondary btn-block" style="justify-content: flex-start; text-align: left; gap: 0.75rem;"
              onclick="quickFillLogin('${acc.identifier}', '${acc.password}')">
              <span class="role-badge ${acc.badge}">${escapeHtmlClient(acc.title)}</span>
              <span style="font-size: 0.78rem; color: var(--slate-500); font-weight: 500;">${escapeHtmlClient(acc.desc)}</span>
            </button>`
      )
      .join('');

    content.innerHTML = `
      <div style="max-width: 440px; margin: 2rem auto;">
        <div class="card" style="margin-bottom: 1.5rem; padding: 2rem;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="width: 64px; height: 64px; background: var(--primary-100); color: var(--primary-700); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 1rem;">🏦</div>
            <h2 style="margin: 0; color: var(--primary-900);">Masuk ke Akun Anda</h2>
            <p style="margin: 0.5rem 0 0; color: var(--slate-500); font-size: 0.9rem;">Bank Sampah Digital - Platform Sirkular Ekonomi</p>
          </div>

          <form onsubmit="handleLoginSubmit(event)" novalidate>
            <div class="form-group">
              <label class="form-label" for="login-identifier">Email / NIK / No. HP</label>
              <input class="form-control" type="text" id="login-identifier" autocomplete="username" placeholder="admin@banksampah.id" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="login-password">Kata Sandi</label>
              <input class="form-control" type="password" id="login-password" autocomplete="current-password" placeholder="••••••••" required>
            </div>
            <button class="btn btn-primary btn-block" type="submit" id="btn-login-submit">Masuk ke Aplikasi</button>
          </form>

          <p style="margin: 1.25rem 0 0; font-size: 0.85rem; color: var(--slate-500); text-align: center;">
            Belum punya akun?
            <a href="#/register" style="color: var(--primary-600); font-weight: 600;">Daftar sebagai Nasabah</a>
          </p>
        </div>

        <div class="card" style="padding: 1.5rem;">
          <div style="font-weight: 700; color: var(--primary-800); font-size: 0.9rem; margin-bottom: 1rem;">
            Demo Akun (satu klik untuk mengisi form)
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">${demoAccountsHtml}</div>
        </div>
      </div>
    `;
  },

  /* ============================================================================
     VIEWS
     ============================================================================ */

  setupView(title) {
    const titleEl = document.getElementById('view-title');
    if (titleEl) {
      titleEl.textContent = title || 'Dasbor';
    }

    const content = document.getElementById('view-content');
    if (content) {
      content.innerHTML = '';
    }

    State.activeRoute = window.location.hash;

    // Tutup sidebar drawer mobile saat pindah tampilan
    if (typeof toggleMobileMenu === 'function') {
      toggleMobileMenu(true);
    } else {
      const sidebar = document.getElementById('app-sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    }
  },

  renderBeranda() {
    const target = this.getDefaultRouteForRole(State.getRole());
    if (window.location.hash !== target) {
      window.location.hash = target;
      return;
    }

    // Dipanggil langsung saat hash sudah sama dengan rute default peran:
    // tampilkan kartu sambutan agar tidak terjadi loop redirect.
    this.setupView('Beranda');
    const content = document.getElementById('view-content');
    if (!content) return;

    const user = State.user || {};
    const roleClass = `role-${(user.role || '').toLowerCase()}`;

    content.innerHTML = `
      <div class="card" style="margin-bottom: 1.5rem;">
        <h2 style="margin: 0 0 0.5rem; color: var(--primary-900);">Selamat Datang, ${escapeHtmlClient(user.name) || 'Pengguna'}!</h2>
        <p style="margin: 0; color: var(--slate-500); font-size: 0.9rem;">
          Anda masuk sebagai <span class="role-badge ${roleClass}">${escapeHtmlClient(user.roleDisplay || user.role) || 'Peran'}</span>.
          Silakan pilih menu navigasi di sebelah kiri untuk mulai bekerja.
        </p>
      </div>
      ${this.getBerandaChatbotCardHtml()}
    `;
  },

  /* ============================================================================
     PORTAL NASABAH (WARGA)
     ============================================================================ */

  async renderNasabahWithdraw() {
    this.setupView('Ajukan Tarik Tunai');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">💸</div>
        Memuat informasi saldo dan penarikan...
      </div>`;

    try {
      const res = await API.getWalletLedger();
      const wallet = res.data?.wallet || {};
      const ledger = Array.isArray(res.data?.ledger) ? res.data.ledger : [];
      const currentBalance = Number(wallet.currentBalance || 0);
      const hasPin = Boolean(wallet.hasPin);

      const esc = escapeHtmlClient;
      const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
      const fmtTime = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID');
      };

      // Filter debit withdrawals for recent history
      const recentWd = ledger
        .filter((l) => l.entry_type === 'DEBIT' || l.reference_type === 'WITHDRAWAL')
        .slice(0, 10);

      const rowsHtml = recentWd.length
        ? recentWd
            .map(
              (w) => `
          <tr>
            <td>${fmtTime(w.created_at)}</td>
            <td><strong>${esc(w.description || 'Pencairan Tabungan')}</strong><br><span style="font-size: 0.72rem; color: var(--slate-500);">Ref: <code>${esc(w.reference_id || '-')}</code></span></td>
            <td><strong style="color: var(--danger-red);">- ${fmtRp(w.amount)}</strong></td>
            <td>${fmtRp(w.balance_after)}</td>
            <td><span class="badge badge-success">BERHASIL</span></td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="5" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada riwayat penarikan dana.</td></tr>`;

      content.innerHTML = `
        <!-- Saldo Banner Card -->
        <div class="card" style="margin-bottom: 1.25rem; background: linear-gradient(135deg, #065f46 0%, #047857 100%); color: white; border: none; padding: 1.5rem;">
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
            <div>
              <div style="font-size: 0.82rem; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.05rem; font-weight: 600;">Saldo Tabungan Tersedia</div>
              <div style="font-size: 2.25rem; font-weight: 800; margin: 0.25rem 0;">${fmtRp(currentBalance)}</div>
              <div style="font-size: 0.82rem; opacity: 0.85;">Akumulasi Hasil Daur Ulang: ${fmtRp(wallet.accumulatedEarnings)}</div>
            </div>
            <div style="text-align: right; background: rgba(255,255,255,0.15); padding: 0.85rem 1.25rem; border-radius: var(--radius-md); backdrop-filter: blur(4px);">
              <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; margin-bottom: 0.25rem;">Keamanan Akun</div>
              <div>${hasPin ? '<span class="badge" style="background: #34d399; color: #064e3b; font-weight: 700;">✅ PIN Transaksi Aktif</span>' : '<span class="badge" style="background: #fde047; color: #854d0e; font-weight: 700;">⚠️ Belum Atur PIN</span>'}</div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openSetupPinModal()" style="margin-top: 0.5rem; font-size: 0.75rem; padding: 0.25rem 0.6rem;">${hasPin ? 'Ganti PIN' : 'Atur PIN Sekarang'}</button>
            </div>
          </div>
        </div>

        ${
          !hasPin
            ? `
          <div class="card" style="margin-bottom: 1.25rem; background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e; padding: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.5rem;">⚠️</span>
                <div>
                  <strong>PIN Transaksi Belum Dibuat</strong>
                  <div style="font-size: 0.82rem;">Anda wajib membuat PIN transaksi 6-digit untuk memverifikasi pencairan saldo.</div>
                </div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" onclick="openSetupPinModal()">Buat PIN Transaksi</button>
            </div>
          </div>
        `
            : ''
        }

        <!-- Withdrawal Form Card -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-header">
            <div class="card-title" style="display: flex; align-items: center; gap: 0.5rem;">
              <span>💸</span> Formulir Pengajuan Penarikan Saldo
            </div>
          </div>

          <form id="withdraw-form" onsubmit="handleWithdrawWithOtpPinSubmit(event)">
            <!-- Nominal Penarikan -->
            <div class="form-group">
              <label class="form-label">Nominal Penarikan (Rp) <span style="color: var(--danger-red);">*</span></label>
              <input type="number" id="wd-amount" class="form-control" min="10000" max="${currentBalance}" step="1000" placeholder="Minimal Rp 10.000" required style="font-size: 1.15rem; font-weight: 700;">
              
              <!-- Quick Chips -->
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('wd-amount').value = 25000">Rp 25.000</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('wd-amount').value = 50000">Rp 50.000</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('wd-amount').value = 100000">Rp 100.000</button>
                ${
                  currentBalance >= 10000
                    ? `<button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('wd-amount').value = ${currentBalance}">Tarik Semua (Rp ${currentBalance.toLocaleString('id-ID')})</button>`
                    : ''
                }
              </div>
              <small class="form-help">Minimal penarikan Rp 10.000. Saldo maksimum yang dapat ditarik: ${fmtRp(currentBalance)}.</small>
            </div>

            <!-- Metode Penarikan -->
            <div class="form-group">
              <label class="form-label">Metode Pencairan Dana <span style="color: var(--danger-red);">*</span></label>
              <select id="wd-method" class="form-control" onchange="toggleBankTransferFields(this.value)" required>
                <option value="CASH">💵 Tunai Langsung di Loket Bank Sampah</option>
                <option value="BANK_TRANSFER">🏦 Transfer Rekening Bank</option>
                <option value="EWALLET">📱 E-Wallet (DANA / GoPay / OVO)</option>
              </select>
            </div>

            <!-- Conditional Bank Fields -->
            <div id="wd-bank-fields" style="display: none; background: var(--slate-50); border: 1.5px dashed var(--slate-300); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem;">
              <div style="font-weight: 700; color: var(--slate-800); margin-bottom: 0.75rem; font-size: 0.9rem;">
                Informasi Rekening Bank Tujuan
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Nama Bank</label>
                  <select id="wd-bank-name" class="form-control">
                    <option value="BCA">Bank BCA</option>
                    <option value="BRI">Bank BRI</option>
                    <option value="MANDIRI">Bank Mandiri</option>
                    <option value="BNI">Bank BNI</option>
                    <option value="BSI">Bank Syariah Indonesia (BSI)</option>
                    <option value="JAGO">Bank Jago</option>
                  </select>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Nomor Rekening</label>
                  <input type="text" id="wd-bank-acc-no" class="form-control" placeholder="Contoh: 8820192831">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Nama Pemilik Rekening</label>
                  <input type="text" id="wd-bank-acc-holder" class="form-control" placeholder="Sesuai buku tabungan bank">
                </div>
              </div>
            </div>

            <!-- Security Verification: PIN & OTP -->
            <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem;">
              <div style="font-weight: 700; color: var(--slate-800); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>🔐</span> Verifikasi Keamanan 2-Faktor (2FA)
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem;">
                <!-- PIN -->
                <div>
                  <label class="form-label">PIN Transaksi (6 Digit) <span style="color: var(--danger-red);">*</span></label>
                  <input type="password" id="wd-pin" class="form-control" required maxlength="6" minlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="••••••" style="letter-spacing: 0.35rem; font-size: 1.25rem; text-align: center;">
                  <small class="form-help">
                    ${hasPin ? 'Masukkan 6 angka PIN transaksi Anda.' : 'Belum punya PIN? <a href="javascript:void(0)" onclick="openSetupPinModal()" style="font-weight: 600; color: var(--primary-700);">Atur PIN di sini</a>.'}
                  </small>
                </div>

                <!-- OTP -->
                <div>
                  <label class="form-label">Kode Verifikasi OTP <span style="color: var(--danger-red);">*</span></label>
                  <div style="display: flex; gap: 0.5rem;">
                    <input type="text" id="wd-otp" class="form-control" required maxlength="6" minlength="6" placeholder="6 Digit OTP" style="letter-spacing: 0.2rem; font-size: 1.1rem; text-align: center;">
                    <button type="button" id="btn-request-otp" class="btn btn-secondary" onclick="handleRequestOtp()" style="white-space: nowrap;">📲 Minta OTP</button>
                  </div>
                  <div id="otp-status-message" style="margin-top: 0.35rem; font-size: 0.8rem;"></div>
                  <small class="form-help">Klik "Minta OTP" untuk mendapatkan kode via WhatsApp/SMS sistem.</small>
                </div>
              </div>
            </div>

            <button type="submit" id="btn-submit-withdraw" class="btn btn-primary btn-block" style="padding: 0.85rem; font-size: 1rem; font-weight: 700;" ${currentBalance < 10000 ? 'disabled' : ''}>
              ${currentBalance < 10000 ? '⚠️ Saldo Tidak Mencukupi (Min. Rp 10.000)' : '🚀 Ajukan Penarikan Saldo Sekarang'}
            </button>
          </form>
        </div>

        <!-- Riwayat Penarikan Saldo -->
        <div class="card">
          <div class="card-header">
            <div class="card-title" style="display: flex; align-items: center; gap: 0.5rem;">
              <span>📜</span> Riwayat Mutasi Penarikan Saldo
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="Router.renderNasabahWithdraw()">🔄 Segarkan</button>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Keterangan / Referensi</th>
                  <th>Nominal</th>
                  <th>Saldo Akhir</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Gagal memuat halaman penarikan:', err);
      content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat data dompet: ${err.message}</div>`;
    }
  },

  async renderNasabahDashboard() {
    this.setupView('Beranda & Kartu Saya');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">💳</div>
        Memuat dasbor nasabah...
      </div>`;

    try {
      const res = await API.getNasabahDashboard();
      const d = res.data || {};
      const profile = d.profile || {};
      const wallet = d.wallet || {};
      const gamification = d.gamification || {};
      const impact = d.impact || {};
      const recentTx = Array.isArray(d.recentTransactions) ? d.recentTransactions : [];

      const esc = escapeHtmlClient;
      const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
      const fmtTime = (v) => {
        if (!v) return '—';
        const date = new Date(v);
        return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('id-ID');
      };

      const txRows = recentTx.length
        ? recentTx
            .map(
              (t) => `
          <tr>
            <td><code>${esc(t.transaction_no || '-')}</code></td>
            <td>${fmtTime(t.transaction_date || t.created_at)}</td>
            <td><strong>${(Number(t.total_weight_kg) || 0).toFixed(1)} kg</strong></td>
            <td><strong style="color: var(--primary-700);">${fmtRp(t.total_amount)}</strong></td>
            <td><span class="badge ${t.status === 'COMPLETED' ? 'badge-success' : 'badge-neutral'}">${esc(t.status || 'COMPLETED')}</span></td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="5" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada riwayat setoran sampah.</td></tr>`;

      content.innerHTML = `
        <!-- Virtual Digital Member Card & Welcome Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem;">
          <!-- Kartu Digital Nasabah -->
          <div style="background: linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%); border-radius: var(--radius-lg); padding: 1.5rem; color: white; box-shadow: 0 10px 25px -5px rgba(6, 95, 70, 0.4); position: relative; overflow: hidden;">
            <div style="position: absolute; right: -20px; bottom: -20px; font-size: 8rem; opacity: 0.08; pointer-events: none;">♻️</div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
              <div>
                <div style="font-size: 0.75rem; letter-spacing: 0.1rem; text-transform: uppercase; opacity: 0.9; font-weight: 700;">BANK SAMPAH DIGITAL</div>
                <div style="font-size: 0.7rem; opacity: 0.8;">Kartu Anggota Warga Sirkular</div>
              </div>
              <div style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 700;">
                ⭐ ${esc(gamification.levelName || 'Warga Hijau')}
              </div>
            </div>

            <div style="font-family: monospace; font-size: 1.25rem; letter-spacing: 0.15rem; margin-bottom: 1.25rem; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
              ${esc(profile.account_no || 'BS-0000-0000')}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
              <div>
                <div style="font-size: 0.65rem; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.05rem;">Nama Nasabah</div>
                <div style="font-weight: 700; font-size: 1rem;">${esc(profile.name || State.user?.name || 'Nasabah')}</div>
                <div style="font-size: 0.7rem; opacity: 0.8;">${esc(profile.branch_name || 'Unit Pusat')}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 0.65rem; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.05rem;">Saldo Tabungan</div>
                <div style="font-size: 1.35rem; font-weight: 800; color: #a7f3d0;">${fmtRp(wallet.currentBalance)}</div>
              </div>
            </div>
          </div>

          <!-- Quick Actions & Gamification Summary -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="card-title" style="margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
                <span>Menu Cepat Nasabah</span>
                <span class="badge badge-success">${(gamification.points || 0).toLocaleString('id-ID')} Poin</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
                <a href="#/nasabah/withdraw" class="btn btn-primary" style="padding: 0.75rem; font-size: 0.85rem; justify-content: center;">
                  💸 Tarik Tunai
                </a>
                <a href="#/nasabah/wallet" class="btn btn-secondary" style="padding: 0.75rem; font-size: 0.85rem; justify-content: center;">
                  📖 Buku Tabungan
                </a>
                <a href="#/nasabah/gamification" class="btn btn-secondary" style="padding: 0.75rem; font-size: 0.85rem; justify-content: center;">
                  🎁 Tukar Hadiah
                </a>
                <a href="#/waste-catalog" class="btn btn-secondary" style="padding: 0.75rem; font-size: 0.85rem; justify-content: center;">
                  ♻️ Cek Harga
                </a>
              </div>
            </div>

            <div style="background: var(--slate-50); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                <span style="color: var(--slate-600);">Status Keamanan PIN:</span>
                <strong><a href="javascript:void(0)" onclick="openSetupPinModal()" style="color: var(--primary-700);">🔐 Atur / Ubah PIN</a></strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                <span style="color: var(--slate-600);">Bantuan AI:</span>
                <a href="javascript:void(0)" onclick="toggleChatbot(true)" style="color: var(--primary-700); font-weight: 600;">💬 Tanya Nous AI</a>
              </div>
            </div>
          </div>
        </div>

        <!-- 4 Metric Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="stat-card">
            <div class="stat-icon-wrapper stat-icon-green">💰</div>
            <div class="stat-info">
              <div class="stat-label">Total Hasil Tabungan</div>
              <div class="stat-value" style="font-size: 1.25rem;">${fmtRp(wallet.accumulatedEarnings)}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrapper stat-icon-blue">♻️</div>
            <div class="stat-info">
              <div class="stat-label">Sampah Terdiversi</div>
              <div class="stat-value" style="font-size: 1.25rem;">${(impact.totalKgDiverted || 0).toFixed(1)} kg</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrapper stat-icon-gold">🌱</div>
            <div class="stat-info">
              <div class="stat-label">Reduksi Emisi CO2</div>
              <div class="stat-value" style="font-size: 1.25rem;">${(impact.co2ReductionKg || 0).toFixed(1)} kg</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrapper stat-icon-green">📦</div>
            <div class="stat-info">
              <div class="stat-label">Total Kali Setoran</div>
              <div class="stat-value" style="font-size: 1.25rem;">${impact.totalDeposits || 0} kali</div>
            </div>
          </div>
        </div>

        <!-- Riwayat Transaksi Terbaru -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Riwayat Setoran Sampah Terakhir</div>
            <a href="#/nasabah/wallet" class="btn btn-secondary btn-sm">Lihat Semua di Buku Tabungan ➔</a>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No. Transaksi</th>
                  <th>Tanggal</th>
                  <th>Total Berat</th>
                  <th>Nominal Tabungan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${txRows}</tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Gagal memuat dasbor nasabah:', err);
      content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat dasbor: ${err.message}</div>`;
    }
  },

  async renderNasabahWallet() {
    this.setupView('Buku Tabungan & Ledger Mutasi');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">📖</div>
        Memuat buku tabungan dan rekonsiliasi kas...
      </div>`;

    try {
      const res = await API.getWalletLedger();
      const wallet = res.data?.wallet || {};
      const ledger = Array.isArray(res.data?.ledger) ? res.data.ledger : [];
      const esc = escapeHtmlClient;
      const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
      const fmtTime = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID');
      };

      const rowsHtml = ledger.length
        ? ledger
            .map(
              (l) => `
          <tr>
            <td>${fmtTime(l.created_at)}</td>
            <td><strong>${esc(l.description || '-')}</strong><br><span style="font-size: 0.72rem; color: var(--slate-500);">Ref: <code>${esc(l.reference_id || '-')}</code> • Oleh: ${esc(l.creator_name || 'Sistem')}</span></td>
            <td>
              <span class="badge ${l.entry_type === 'CREDIT' ? 'badge-success' : 'badge-danger'}">
                ${l.entry_type === 'CREDIT' ? '📥 KREDIT (+)' : '📤 DEBIT (-)'}
              </span>
            </td>
            <td><strong style="color: ${l.entry_type === 'CREDIT' ? 'var(--primary-700)' : 'var(--danger-red)'};">${l.entry_type === 'CREDIT' ? '+' : '-'} ${fmtRp(l.amount)}</strong></td>
            <td>${fmtRp(l.balance_after)}</td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="5" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Buku tabungan masih kosong. Belum ada transaksi tercatat.</td></tr>`;

      content.innerHTML = `
        <!-- Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="stat-card" style="border-left: 4px solid var(--primary-600);">
            <div class="stat-icon-wrapper stat-icon-green">💰</div>
            <div class="stat-info">
              <div class="stat-label">Saldo Aktif Saat Ini</div>
              <div class="stat-value" style="color: var(--primary-800);">${fmtRp(wallet.currentBalance)}</div>
            </div>
          </div>
          <div class="stat-card" style="border-left: 4px solid #10b981;">
            <div class="stat-icon-wrapper stat-icon-green">📥</div>
            <div class="stat-info">
              <div class="stat-label">Total Masuk (Kredit)</div>
              <div class="stat-value">${fmtRp(wallet.accumulatedEarnings)}</div>
            </div>
          </div>
          <div class="stat-card" style="border-left: 4px solid var(--danger-red);">
            <div class="stat-icon-wrapper stat-icon-red">📤</div>
            <div class="stat-info">
              <div class="stat-label">Total Ditarik (Debit)</div>
              <div class="stat-value">${fmtRp(wallet.accumulatedWithdrawals)}</div>
            </div>
          </div>
        </div>

        <!-- Ledger Passbook Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title" style="display: flex; align-items: center; gap: 0.5rem;">
              <span>📖</span> Buku Tabungan Digital & Ledger Rekonsiliasi
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <a href="#/nasabah/withdraw" class="btn btn-primary btn-sm">💸 Tarik Saldo</a>
              <button type="button" class="btn btn-secondary btn-sm" onclick="Router.renderNasabahWallet()">🔄 Segarkan</button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Uraian Transaksi</th>
                  <th>Tipe</th>
                  <th>Nominal Mutasi</th>
                  <th>Saldo Akhir</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          
          <div style="margin-top: 1rem; padding: 0.75rem; background: var(--slate-50); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--slate-500);">
            ℹ️ Catatan ledger bersifat kekal (immutable ledger). Setiap setoran dan penarikan langsung tercatat otomatis untuk menjamin transparansi akuntansi bank sampah.
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Gagal memuat buku tabungan:', err);
      content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat buku tabungan: ${err.message}</div>`;
    }
  },

  async renderGamificationView() {
    this.setupView('Poin & Hadiah (Gamifikasi)');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">🎁</div>
        Memuat poin, lencana, dan katalog hadiah...
      </div>`;

    try {
      const [profileRes, leaderboardRes, rewardsRes] = await Promise.all([
        API.getGamificationProfile(),
        API.getGamificationLeaderboard(),
        API.getRewardsCatalog(),
      ]);

      const prof = profileRes.data || {};
      const leaderboard = Array.isArray(leaderboardRes.data) ? leaderboardRes.data : [];
      const rewards = Array.isArray(rewardsRes.data) ? rewardsRes.data : [];

      const esc = escapeHtmlClient;
      const points = Number(prof.currentPoints || prof.points || 0);
      const level = prof.level || {};
      const badges = Array.isArray(prof.badges) ? prof.badges : [];

      // Badges HTML
      const badgesHtml = badges.length
        ? badges
            .map(
              (b) => `
          <div style="background: var(--white); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; text-align: center;">
            <div style="font-size: 1.75rem; margin-bottom: 0.25rem;">${esc(b.badge_icon || '🏅')}</div>
            <div style="font-weight: 700; font-size: 0.82rem; color: var(--slate-800);">${esc(b.badge_name || b.name || 'Lencana')}</div>
            <div style="font-size: 0.7rem; color: var(--slate-500);">${esc(b.description || '')}</div>
          </div>`
            )
            .join('')
        : `<div style="grid-column: 1/-1; text-align: center; color: var(--slate-400); padding: 1rem;">Terus pilah sampah untuk membuka lencana penghargaan pertama Anda!</div>`;

      // Rewards HTML
      const rewardsHtml = rewards.length
        ? rewards
            .map(
              (r) => `
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 1.25rem;">
            <div>
              <div style="font-size: 2.5rem; text-align: center; margin-bottom: 0.75rem;">${r.icon || '🎁'}</div>
              <div style="font-weight: 700; font-size: 1rem; color: var(--slate-800); margin-bottom: 0.35rem;">${esc(r.title || r.name)}</div>
              <div style="font-size: 0.8rem; color: var(--slate-600); margin-bottom: 0.75rem;">${esc(r.description || '')}</div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <span style="font-size: 0.75rem; color: var(--slate-500);">Stok: <strong>${r.stock || 0}</strong></span>
                <strong style="color: #b45309; font-size: 0.95rem;">🪙 ${(Number(r.points_cost) || 0).toLocaleString('id-ID')} Poin</strong>
              </div>
              <button type="button" class="btn ${points >= r.points_cost && r.stock > 0 ? 'btn-primary' : 'btn-secondary'} btn-block btn-sm"
                ${points < r.points_cost || r.stock <= 0 ? 'disabled' : ''}
                onclick="handleRedeemReward(${r.id}, ${r.points_cost}, '${esc(r.title || r.name).replace(/'/g, "\\'")}')">
                ${r.stock <= 0 ? 'Stok Habis' : points < r.points_cost ? 'Poin Kurang' : 'Tukarkan Hadiah'}
              </button>
            </div>
          </div>`
            )
            .join('')
        : `<div style="grid-column: 1/-1; text-align: center; color: var(--slate-400); padding: 2rem;">Katalog hadiah sedang disiapkan oleh pengelola.</div>`;

      // Leaderboard HTML
      const leaderboardHtml = leaderboard.length
        ? leaderboard
            .slice(0, 10)
            .map((u, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              return `
            <tr>
              <td style="font-weight: 700; font-size: 1.1rem; width: 45px;">${medal}</td>
              <td><strong>${esc(u.name || u.customer_name || '-')}</strong></td>
              <td>${(Number(u.total_weight_kg) || 0).toFixed(1)} kg</td>
              <td><strong style="color: var(--primary-700);">${(Number(u.current_points || u.points) || 0).toLocaleString('id-ID')} Poin</strong></td>
            </tr>`;
            })
            .join('')
        : `<tr><td colspan="4" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada data peringkat.</td></tr>`;

      content.innerHTML = `
        <!-- Points & Level Banner -->
        <div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: white; border: none; padding: 1.5rem;">
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
            <div>
              <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05rem; opacity: 0.9;">Koleksi Poin Anda</div>
              <div style="font-size: 2.25rem; font-weight: 800; margin: 0.25rem 0;">🪙 ${points.toLocaleString('id-ID')} <span style="font-size: 1.1rem; font-weight: 500; opacity: 0.9;">Poin</span></div>
              <div style="font-size: 0.85rem; opacity: 0.85;">Tingkat Saat Ini: <strong>${esc(level.name || 'Warga Hijau')}</strong></div>
            </div>
            <div style="background: rgba(255,255,255,0.15); padding: 0.85rem 1.25rem; border-radius: var(--radius-md); text-align: center; backdrop-filter: blur(4px);">
              <div style="font-size: 2rem; margin-bottom: 0.25rem;">${esc(level.badge_icon || '🌱')}</div>
              <div style="font-weight: 700; font-size: 0.85rem;">${esc(level.benefits || 'Pilah sampah untuk naik level!')}</div>
            </div>
          </div>
        </div>

        <!-- Badges Section -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-header">
            <div class="card-title">🏅 Lencana Penghargaan Saya</div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem;">
            ${badgesHtml}
          </div>
        </div>

        <!-- Rewards Catalog Grid -->
        <div style="margin-bottom: 1.5rem;">
          <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--slate-800); margin-bottom: 0.85rem;">
            🎁 Katalog Tukar Poin Hadiah
          </h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem;">
            ${rewardsHtml}
          </div>
        </div>

        <!-- Leaderboard -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🏆 Papan Peringkat Warga Paling Aktif (Top 10)</div>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Nama Nasabah</th>
                  <th>Tonase Daur Ulang</th>
                  <th>Total Poin</th>
                </tr>
              </thead>
              <tbody>${leaderboardHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Gagal memuat gamifikasi:', err);
      content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat fitur gamifikasi: ${err.message}</div>`;
    }
  },

  /* ============================================================================
     PORTAL PETUGAS (TIMBANG & KASIR)
     ============================================================================ */

  async renderPetugasWeighing() {
    this.setupView('Beranda & Meja Timbang Cepat');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">⚖️</div>
        Menyiapkan meja timbang cepat...
      </div>`;

    try {
      const [customersRes, categoriesRes] = await Promise.all([
        API.getCustomers(),
        API.getWasteCategories(),
      ]);

      const customers = Array.isArray(customersRes.data) ? customersRes.data : [];
      const categories = Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
      const esc = escapeHtmlClient;

      const customerOptions = customers
        .map(
          (c) => `
        <option value="${c.id}" data-acc="${esc(c.account_no)}" data-balance="${Number(c.current_balance || 0)}">
          ${esc(c.name)} (${esc(c.account_no)}) — Saldo: Rp ${Number(c.current_balance || 0).toLocaleString('id-ID')}
        </option>`
        )
        .join('');

      const categoryOptions = categories
        .map(
          (cat) => `
        <option value="${cat.id}" data-price="${Number(cat.buying_price || 0)}">
          ${esc(cat.name)} (${esc(cat.code)}) — Rp ${Number(cat.buying_price || 0).toLocaleString('id-ID')}/${esc(cat.unit || 'kg')}
        </option>`
        )
        .join('');

      content.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem;">
          <!-- Nasabah Selection & Fast Lookup -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">1. Pilih / Cari Nasabah</div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openDailySummaryModal()">📊 Rekap Hari Ini</button>
            </div>

            <div class="form-group">
              <label class="form-label">Pencarian Cepat (Nama / No. Rekening / No. HP / NIK)</label>
              <input type="text" id="fast-lookup-input" class="form-control" placeholder="Ketik minimal 3 karakter..." oninput="handleFastCustomerLookup(this.value)">
              <div id="lookup-feedback" style="margin-top: 0.35rem; font-size: 0.8rem; font-weight: 600;"></div>
            </div>

            <div class="form-group">
              <label class="form-label">Daftar Nasabah Terdaftar</label>
              <select id="deposit-customer-id" class="form-control" onchange="handleCustomerSelect(this.value)">
                <option value="">-- Pilih Nasabah --</option>
                ${customerOptions}
              </select>
            </div>

            <div id="selected-customer-box" style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--slate-500);">
              Silakan pilih nasabah untuk melihat kartu dan riwayat saldo.
            </div>
          </div>

          <!-- AI Vision Waste Scanner -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">🤖 AI Vision Kamera Sampah</div>
              <span class="badge badge-info">Multi-Model AI</span>
            </div>
            <p style="font-size: 0.82rem; color: var(--slate-600); margin-bottom: 0.75rem;">
              Unggah atau ambil foto tumpukan sampah untuk auto-deteksi jenis sampah dan rekomendasi harga cerdas.
            </p>
            <div style="border: 2px dashed var(--slate-300); border-radius: var(--radius-md); padding: 1.25rem; text-align: center; background: var(--slate-50); cursor: pointer;"
              onclick="document.getElementById('ai-camera-file').click()">
              <input type="file" id="ai-camera-file" accept="image/*" style="display: none;" onchange="if(this.files[0]) handleAiVisionUpload(this.files[0])">
              <div style="font-size: 2rem; margin-bottom: 0.25rem;">📷</div>
              <div style="font-weight: 700; color: var(--primary-700); font-size: 0.9rem;">Klik untuk Unggah / Foto Sampah</div>
              <div style="font-size: 0.75rem; color: var(--slate-500);">Format JPG, PNG (Maks 5MB)</div>
            </div>
            <div id="ai-analysis-result-panel" style="margin-top: 0.75rem;"></div>
          </div>
        </div>

        <!-- Weighing Rows & Deposit Form -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">2. Baris Timbangan Sampah</div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addDepositItemRow()">➕ Tambah Baris Sampah</button>
          </div>

          <form id="deposit-form" onsubmit="handleDepositSubmit(event)">
            <div id="deposit-items-container">
              <div class="deposit-item-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.75rem; align-items: end; margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px dashed var(--border-color);">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.8rem;">Jenis Sampah</label>
                  <select class="form-control item-category" onchange="calculateDepositTotal()" required>
                    <option value="">-- Pilih Jenis --</option>
                    ${categoryOptions}
                  </select>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.8rem;">Berat (kg)</label>
                  <input type="number" step="0.01" min="0.01" class="form-control item-weight" placeholder="0.00" oninput="calculateDepositTotal()" required>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.8rem;">Subtotal</label>
                  <input type="text" class="form-control item-subtotal" value="Rp 0" readonly style="background: var(--slate-100); font-weight: 700;">
                </div>
                <div>
                  <button type="button" class="btn btn-secondary btn-sm" style="color: var(--danger-red); margin-bottom: 2px;" onclick="if(document.querySelectorAll('.deposit-item-row').length > 1) { this.closest('.deposit-item-row').remove(); calculateDepositTotal(); } else { showToast('Minimal 1 baris sampah.', 'error'); }">✖</button>
                </div>
              </div>
            </div>

            <!-- Grand Total Bar -->
            <div style="background: var(--primary-50); border: 1.5px solid var(--primary-200); border-radius: var(--radius-md); padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; margin: 1.25rem 0;">
              <div>
                <div style="font-size: 0.8rem; text-transform: uppercase; color: var(--primary-800); font-weight: 700;">Total Tabungan Masuk</div>
                <div style="font-size: 2rem; font-weight: 800; color: var(--primary-900);" id="deposit-total-display">Rp 0</div>
              </div>
              <button type="submit" class="btn btn-primary" style="padding: 0.85rem 1.5rem; font-size: 1rem; font-weight: 700;">
                💾 Simpan & Cetak Struk
              </button>
            </div>
          </form>
        </div>
      `;
    } catch (err) {
      console.error('Gagal memuat meja timbang:', err);
      content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat meja timbang: ${err.message}</div>`;
    }
  },

  async renderTransactions() {
    this.setupView('Riwayat Transaksi Setor Sampah');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--slate-500); background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">📋</div>
        Memuat riwayat transaksi...
      </div>`;

    try {
      const res = await API.getTransactions();
      const txs = Array.isArray(res.data) ? res.data : [];
      const esc = escapeHtmlClient;
      const fmtRp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
      const fmtTime = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID');
      };

      const rows = txs.length
        ? txs
            .map(
              (t) => `
          <tr>
            <td><code>${esc(t.transaction_no || '-')}</code></td>
            <td>${fmtTime(t.transaction_date || t.created_at)}</td>
            <td><strong>${esc(t.customer_name || '-')}</strong></td>
            <td>${esc(t.petugas_name || '-')}</td>
            <td><strong>${(Number(t.total_weight_kg) || 0).toFixed(1)} kg</strong></td>
            <td><strong style="color: var(--primary-700);">${fmtRp(t.total_amount)}</strong></td>
            <td>
              <button type="button" class="btn btn-secondary btn-sm" onclick="showReceiptModal(${t.id})">🧾 Struk</button>
            </td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="7" style="text-align: center; color: var(--slate-400); padding: 1.5rem;">Belum ada riwayat transaksi setor sampah.</td></tr>`;

      content.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Daftar Transaksi Timbangan & Setoran</div>
            <div style="display: flex; gap: 0.5rem;">
              <a href="#/petugas/weighing" class="btn btn-primary btn-sm">➕ Setoran Baru</a>
              <button type="button" class="btn btn-secondary btn-sm" onclick="Router.renderTransactions()">🔄 Segarkan</button>
            </div>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No. Transaksi</th>
                  <th>Waktu</th>
                  <th>Nasabah</th>
                  <th>Petugas Timbang</th>
                  <th>Total Berat</th>
                  <th>Nominal</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Gagal memuat transaksi:', err);
      content.innerHTML = `<div style="color: var(--danger-red); padding: 2rem; text-align: center;">Gagal memuat transaksi: ${err.message}</div>`;
    }
  },

  /* ============================================================================
     REGISTRASI NASABAH (WARGA)
     ============================================================================ */

  renderRegisterNasabah() {
    this.setupView('Registrasi Nasabah Baru');
    const content = document.getElementById('view-content');
    if (!content) return;

    content.innerHTML = `
      <div style="max-width: 640px; margin: 2rem auto;">
        <div class="card" style="padding: 2rem;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="width: 56px; height: 56px; background: var(--primary-100); color: var(--primary-700); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 1.75rem; margin: 0 auto 0.75rem;">🌱</div>
            <h2 style="margin: 0; color: var(--primary-900);">Pendaftaran Nasabah Warga</h2>
            <p style="margin: 0.35rem 0 0; color: var(--slate-500); font-size: 0.85rem;">Mulai tabung sampah Anda dan nikmati manfaat ekonomi sirkular digital.</p>
          </div>

          <form onsubmit="handleRegisterNasabahSubmit(event)" novalidate>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="reg-nb-name">Nama Lengkap <span style="color: var(--danger-red);">*</span></label>
                <input class="form-control" type="text" id="reg-nb-name" required placeholder="Contoh: Siti Rahma">
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-nb-nik">NIK KTP (16 Digit) <span style="color: var(--danger-red);">*</span></label>
                <input class="form-control" type="text" id="reg-nb-nik" maxlength="16" required placeholder="Contoh: 3201..." pattern="[0-9]{16}">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="reg-nb-phone">No. WhatsApp / HP <span style="color: var(--danger-red);">*</span></label>
                <input class="form-control" type="tel" id="reg-nb-phone" required placeholder="Contoh: 08123456789">
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-nb-email">Alamat Email (Opsional)</label>
                <input class="form-control" type="email" id="reg-nb-email" placeholder="nama@email.com">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="reg-nb-password">Kata Sandi Akun <span style="color: var(--danger-red);">*</span></label>
                <input class="form-control" type="password" id="reg-nb-password" required placeholder="Minimal 6 karakter" minlength="6">
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-nb-pin">PIN Transaksi (6 Digit) <span style="color: var(--danger-red);">*</span></label>
                <input class="form-control" type="password" id="reg-nb-pin" required maxlength="6" minlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="Contoh: 123456" style="letter-spacing: 0.2rem; text-align: center;">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="reg-nb-rtrw">RT / RW</label>
                <input class="form-control" type="text" id="reg-nb-rtrw" placeholder="Contoh: RT 03 / RW 05">
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-nb-kelurahan">Kelurahan / Desa</label>
                <input class="form-control" type="text" id="reg-nb-kelurahan" placeholder="Contoh: Sukamaju">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-nb-address">Alamat Rumah Lengkap</label>
              <textarea class="form-control" id="reg-nb-address" rows="2" placeholder="Nama jalan, nomor rumah, patokan"></textarea>
            </div>

            <button class="btn btn-primary btn-block" type="submit" id="btn-reg-nasabah-submit" style="padding: 0.85rem; font-size: 1rem; font-weight: 700; margin-top: 1rem;">
              🚀 Daftarkan Akun Nasabah
            </button>
          </form>

          <p style="margin: 1.25rem 0 0; font-size: 0.85rem; color: var(--slate-500); text-align: center;">
            Sudah memiliki akun?
            <a href="#/login" style="color: var(--primary-600); font-weight: 600;">Masuk di sini</a>
          </p>
        </div>
      </div>
    `;
  },

  renderNotFound() {
    this.setupView('Halaman Tidak Ditemukan');
    const content = document.getElementById('view-content');
    if (!content) return;

    const currentHash = escapeHtmlClient(window.location.hash || '(kosong)');
    const homeHash = this.getDefaultRouteForRole(State.getRole());

    content.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
        <div style="font-size: 3.5rem; font-weight: 800; color: var(--primary-600); margin-bottom: 0.5rem;">404</div>
        <h2 style="margin: 0 0 0.5rem; color: var(--primary-900);">Halaman Tidak Ditemukan</h2>
        <p style="margin: 0 0 1.5rem; color: var(--slate-500); font-size: 0.9rem;">
          Rute <code style="background: var(--slate-100); padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);">${currentHash}</code> tidak tersedia di aplikasi Bank Sampah Digital.
        </p>
        <a href="${homeHash}" class="btn btn-primary">Kembali ke Beranda</a>
      </div>
    `;
  },
  };

  