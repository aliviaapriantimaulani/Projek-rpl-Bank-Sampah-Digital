/**
 * Bank Sampah Digital - Global Client State
 */

const State = {
  user: null,
  token: null,
  activeRoute: '',
  activeAiModel: 'gemini', // Default: Google Gemini 1.5 Pro

  // Quick Demo Accounts for Local Testing
  DEMO_ACCOUNTS: [
    {
      role: 'ADMIN',
      title: 'Admin',
      badge: 'role-admin',
      identifier: 'admin@banksampah.id',
      password: 'Admin123!',
      desc: 'Kelola Pengguna, Audit Log, Sistem',
    },
    {
      role: 'OWNER',
      title: 'Owner',
      badge: 'role-owner',
      identifier: 'owner@banksampah.id',
      password: 'Owner123!',
      desc: 'Dasbor Eksekutif, Laporan Finansial, Approval Penarikan',
    },
    {
      role: 'PETUGAS',
      title: 'Petugas / Teller',
      badge: 'role-petugas',
      identifier: 'petugas@banksampah.id',
      password: 'Petugas123!',
      desc: 'Meja Timbang Cepat, Kasir, Registrasi Nasabah',
    },
    {
      role: 'NASABAH',
      title: 'Nasabah / Warga',
      badge: 'role-nasabah',
      identifier: 'nasabah@banksampah.id',
      password: 'Nasabah123!',
      desc: 'Kartu QR Digital, Dompet, Pengajuan Tarik, Dampak CO2',
    },
  ],

  init() {
    this.token = API.getToken();
    this.user = API.getUser();
    this.activeAiModel = this.getAiModel();
  },

  getAiModel() {
    return localStorage.getItem('bs_ai_model') || 'gemini';
  },

  setAiModel(model) {
    this.activeAiModel = model || 'gemini';
    localStorage.setItem('bs_ai_model', this.activeAiModel);
  },

  setAuth(user, token) {
    this.user = user;
    this.token = token;
    API.setUser(user);
    API.setToken(token);
  },

  clearAuth() {
    this.user = null;
    this.token = null;
    API.setUser(null);
    API.setToken(null);
  },

  isAuthenticated() {
    return !!this.token && !!this.user;
  },

  getRole() {
    return this.user ? this.user.role : null;
  },
};
