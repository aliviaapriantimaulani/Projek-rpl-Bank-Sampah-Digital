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
    .replace(/'/g, ''');
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
        { label: 'Beranda & Dasbor', hash: '#/admin/dashboard', icon: 'ðŸ“Š' },
        { label: 'Kelola Pengguna', hash: '#/admin/users', icon: 'ðŸ‘¥' },
        { label: 'Direktori Nasabah', hash: '#/customers', icon: 'ðŸ“‡' },
        { label: 'Audit Log Sistem', hash: '#/admin/audit', icon: 'ðŸ›¡' },
        { label: 'Katalog Sampah', hash: '#/waste-catalog', icon: 'ðŸ™»' },
        { label: 'Notifikasi WhatsApp', hash: '#/notifications', icon: 'ðŸ””' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: 'ðŸš™' },
        { label: 'Informasi API', hash: '#/admin/informasi-api', icon: 'ðŸ“¡' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/admin/dashboard', icon: 'ðŸ“Š' },
        { label: 'Pengguna', hash: '#/admin/users', icon: 'ðŸ‘¥' },
        { label: 'Nasabah', hash: '#/customers', icon: 'ðŸ“‡' },
        { label: 'Profil', hash: '#/profile', icon: 'ðŸ‘¤' },
      ];
    } else if (role === 'OWNER') {
      navItems = [
        { label: 'Beranda & Dasbor', hash: '#/owner/dashboard', icon: 'ðŸ“ˆ' },
        { label: '7 Laporan Terpadu', hash: '#/owner/reports', icon: 'ðŸ“Š' },
        { label: 'Approval Penarikan', hash: '#/owner/withdrawals', icon: 'ðŸ’µ' },
        { label: 'Penjualan ke Pengepul', hash: '#/owner/sales', icon: 'ðŸ¤' },
        { label: 'Mitra Pengepul (Buyers)', hash: '#/owner/buyers', icon: 'ðŸ­' },
        { label: 'Stok Gudang', hash: '#/owner/inventory', icon: 'ðŸ“¦' },
        { label: 'Direktori Nasabah', hash: '#/customers', icon: 'ðŸ“‡' },
        { label: 'Katalog & Harga', hash: '#/waste-catalog', icon: 'ðŸ™»' },
        { label: 'Audit Log', hash: '#/admin/audit', icon: 'ðŸ›¡' },
        { label: 'Notifikasi WhatsApp', hash: '#/notifications', icon: 'ðŸ””' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: 'ðŸš™' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/owner/dashboard', icon: 'ðŸ“ˆ' },
        { label: 'Laporan', hash: '#/owner/reports', icon: 'ðŸ“Š' },
        { label: 'Penjualan', hash: '#/owner/sales', icon: 'ðŸ¤' },
        { label: 'Approval', hash: '#/owner/withdrawals', icon: 'ðŸ’µ' },
      ];
    } else if (role === 'PETUGAS') {
      navItems = [
        { label: 'Beranda & Meja Timbang', hash: '#/petugas/weighing', icon: 'ðŸš–' },
        { label: 'Direktori Nasabah', hash: '#/customers', icon: 'ðŸ“‡' },
        { label: 'Riwayat Transaksi', hash: '#/petugas/transactions', icon: 'ðŸ“‹' },
        { label: 'Stok Gudang', hash: '#/owner/inventory', icon: 'ðŸ“¦' },
        { label: 'Katalog Harga', hash: '#/waste-catalog', icon: 'ðŸ™»' },
        { label: 'Notifikasi WhatsApp', hash: '#/notifications', icon: 'ðŸ””' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: 'ðŸš™' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/petugas/weighing', icon: 'ðŸš–' },
        { label: 'Nasabah', hash: '#/customers', icon: 'ðŸ“‡' },
        { label: 'Transaksi', hash: '#/petugas/transactions', icon: 'ðŸ“‹' },
        { label: 'Profil', hash: '#/profile', icon: 'ðŸ‘¤' },
      ];
    } else if (role === 'NASABAH') {
      navItems = [
        { label: 'Beranda & Kartu Saya', hash: '#/nasabah/dashboard', icon: 'ðŸ’³' },
        { label: 'Poin & Hadiah (Gamifikasi)', hash: '#/nasabah/gamification', icon: 'ðŸŽ' },
        { label: 'Buku Tabungan & Ledger', hash: '#/nasabah/wallet', icon: 'ðŸ“–' },
        { label: 'Ajukan Tarik Tunai', hash: '#/nasabah/withdraw', icon: 'ðŸ’¸' },
        { label: 'Katalog Harga Sampah', hash: '#/waste-catalog', icon: 'ðŸ™»' },
        { label: 'Notifikasi Saya', hash: '#/notifications', icon: 'ðŸ””' },
        { label: 'Preferensi Notifikasi', hash: '#/notifications/settings', icon: 'ðŸš™' },
      ];
      bottomItems = [
        { label: 'Beranda', hash: '#/nasabah/dashboard', icon: 'ðŸ’³' },
        { label: 'Hadiah', hash: '#/nasabah/gamification', icon: 'ðŸŽ' },
        { label: 'Tabungan', hash: '#/nasabah/wallet', icon: 'ðŸ“–' },
        { label: 'Tarik', hash: '#/nasabah/withdraw', icon: 'ðŸ’¸' },
      ];
    }

    navItems.push({ label: 'Chatbot AI (Nous)', hash: 'javascript:void(0)', icon: 'ðŸ’¬', onclick: 'toggleChatbot(true)' });
    navItems.push({ label: 'Profil & Keamanan', hash: '#/profile', icon: 'ðŸš™' });

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
  },

  getBerandaChatbotCardHtml() {
    return `
      <!-- Chatbot AI Beranda Card (Powered by Nous Research) -->
      <div class="beranda-chatbot-card">
        <div class="beranda-chatbot-content">
          <div class="beranda-chatbot-icon-wrap" title="Asisten AI Bank Sampah">
            ðŸ’¬
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

  renderAdminInformasiAPI() {
    this.setupView('Informasi API & Sistem');
    const content = document.getElementById('view-content');
    content.innerHTML = `<div style="text-align:center; padding: 2rem;">Memuat informasi sistem...</div>`;

    try {
      // Fetch system info from API
      const token = State.getToken();
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
              <p style="margin: 0.5rem 0 0; color: var(--slate-500); font-size: 0.9rem;">Status Terakhir: ${new Date(info.timestamp).toLocaleIndonesianString()}</p>
            </div>
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
  },

  /* ============================================================================
     VIEWS
     ============================================================================ */

  renderLogin() {