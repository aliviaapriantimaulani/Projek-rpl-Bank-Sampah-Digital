/**
 * Bank Sampah Digital - API Client
 */

const API = {
  BASE_URL: '/api/v1',

  getToken() {
    return localStorage.getItem('bs_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('bs_token', token);
    } else {
      localStorage.removeItem('bs_token');
    }
  },

  getUser() {
    const raw = localStorage.getItem('bs_user');
    return raw ? JSON.parse(raw) : null;
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('bs_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('bs_user');
    }
  },

  async request(endpoint, options = {}) {
    const { timeout = 30000, signal: externalSignal, ...fetchOptions } = options;
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    const headers = { ...fetchOptions.headers };
    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...fetchOptions,
      headers,
    };

    if (!isFormData && config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    // Add timeout to fetch (default 30 seconds, caller may override)
    const controller = new AbortController();
    const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
    config.signal = externalSignal || controller.signal;

    try {
      const response = await fetch(`${this.BASE_URL}${endpoint}`, config);
      if (timeoutId) clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        // If unauthorized/token expired
        if (response.status === 401 && !endpoint.includes('/auth/login')) {
          this.setToken(null);
          this.setUser(null);
          window.location.hash = '#/login';
        }
        throw new Error(data.message || 'Terjadi kesalahan pada server');
      }

      return data;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Permintaan timeout. Server terlalu lama merespons.');
      }
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  // Auth endpoints
  login(identifier, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
  },

  getMe() {
    return this.request('/auth/me');
  },

  changePassword(currentPassword, newPassword) {
    return this.request('/auth/password', {
      method: 'PUT',
      body: { currentPassword, newPassword },
    });
  },

  // Users (Admin)
  getUsers(query = '') {
    return this.request(`/users${query ? '?' + query : ''}`);
  },

  createUser(userData) {
    return this.request('/users', {
      method: 'POST',
      body: userData,
    });
  },

  updateUser(id, userData) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: userData,
    });
  },

  deleteUser(id) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  },

  // Customers
  getCustomers(query = '') {
    return this.request(`/customers${query ? '?' + query : ''}`);
  },

  lookupCustomer(search) {
    return this.request(`/customers/lookup?query=${encodeURIComponent(search)}`);
  },

  registerCustomer(customerData) {
    return this.request('/customers', {
      method: 'POST',
      body: customerData,
    });
  },

  // Waste & Pricing
  getWasteCategories() {
    return this.request('/waste/categories');
  },

  updateWastePrice(id, priceData) {
    return this.request(`/waste/categories/${id}/price`, {
      method: 'PUT',
      body: priceData,
    });
  },

  // Transactions
  getTransactions() {
    return this.request('/transactions');
  },

  createDeposit(depositData) {
    return this.request('/transactions/deposit', {
      method: 'POST',
      body: depositData,
    });
  },

  // Finance & Ledger
  getFinancialSummary() {
    return this.request('/finance/summary');
  },

  getPendingWithdrawals() {
    return this.request('/finance/withdrawals/pending');
  },

  approveWithdrawal(id, notes) {
    return this.request(`/finance/withdrawals/${id}/approve`, {
      method: 'POST',
      body: { notes },
    });
  },

  rejectWithdrawal(id, rejectionReason) {
    return this.request(`/finance/withdrawals/${id}/reject`, {
      method: 'POST',
      body: { rejectionReason },
    });
  },

  getWalletLedger(customerId) {
    const ep = customerId ? `/finance/wallet/${customerId}` : '/finance/wallet';
    return this.request(ep);
  },

  requestWithdrawal(amount, method, accountInfo) {
    return this.request('/finance/withdrawals/request', {
      method: 'POST',
      body: { amount, method, accountInfo },
    });
  },

  // Inventory
  getInventory() {
    return this.request('/inventory');
  },

  getInventoryMovements() {
    return this.request('/inventory/movements');
  },

  // Audit Logs
  getAuditLogs() {
    return this.request('/audit');
  },

  // Nasabah Self-Registration
  registerNasabah(payload) {
    return this.request('/auth/register-nasabah', {
      method: 'POST',
      body: payload,
    });
  },

  getCustomerDetail(id) {
    return this.request(`/customers/${id}`);
  },

  updateCustomer(id, data) {
    return this.request(`/customers/${id}`, {
      method: 'PUT',
      body: data,
    });
  },

  updateCustomerStatus(id, status) {
    return this.request(`/customers/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },

  // Transactions & Daily
  getDailyTransactions(date = '') {
    return this.request(`/transactions/daily${date ? '?date=' + encodeURIComponent(date) : ''}`);
  },

  getTransactionReceipt(id) {
    return this.request(`/transactions/${id}/receipt`);
  },

  // PIN & OTP Security
  setupPin(pin) {
    return this.request('/finance/wallet/pin', {
      method: 'POST',
      body: { pin },
    });
  },

  requestOtp() {
    return this.request('/finance/wallet/request-otp', {
      method: 'POST',
      body: {},
    });
  },

  requestWithdrawalWithOtpPin(payload) {
    return this.request('/finance/withdrawals/request', {
      method: 'POST',
      body: payload,
    });
  },

  // Buyers (Pengepul) CRUD
  getBuyers() {
    return this.request('/buyers');
  },

  createBuyer(data) {
    return this.request('/buyers', {
      method: 'POST',
      body: data,
    });
  },

  updateBuyer(id, data) {
    return this.request(`/buyers/${id}`, {
      method: 'PUT',
      body: data,
    });
  },

  deleteBuyer(id) {
    return this.request(`/buyers/${id}`, {
      method: 'DELETE',
    });
  },

  // Waste Sales (Off-taker)
  getSales() {
    return this.request('/sales');
  },

  getSalesSummary() {
    return this.request('/sales/summary');
  },

  createSale(saleData) {
    return this.request('/sales', {
      method: 'POST',
      body: saleData,
    });
  },

  // Nasabah Portal
  getNasabahDashboard() {
    return this.request('/nasabah/dashboard');
  },

  // AI Vision & Price Recommendation
  analyzeWasteImage(formData) {
    return this.request('/ai/analyze', {
      method: 'POST',
      body: formData,
    });
  },

  confirmAiAnalysis(recordId, confirmData) {
    return this.request('/ai/confirm', {
      method: 'POST',
      body: { recordId, ...confirmData },
    });
  },

  getAiAuditLogs(query = '') {
    return this.request(`/ai/audit${query ? '?' + query : ''}`);
  },

  // AI Natural Language Assistant
  askAiAssistant(question, history = [], options = {}) {
    const model = (typeof State !== 'undefined' && State.getAiModel)
      ? State.getAiModel()
      : (localStorage.getItem('bs_ai_model') || 'gpt-4o');
    const user = (typeof State !== 'undefined' && State.user)
      ? State.user
      : this.getUser();
    const userPayload = options.userContext || options.user || {
      id_user: user?.id || user?.id_user || null,
      id: user?.id || user?.id_user || null,
      name: user?.name || '',
      role: user?.role || '',
      email: user?.email || '',
    };
    return this.request('/ai/assistant', {
      method: 'POST',
      body: {
        question,
        message: question,
        query: question,
        history: Array.isArray(history) ? history : [],
        model,
        user: userPayload,
        userContext: userPayload,
      },
      timeout: options.timeout || 45000,
      signal: options.signal,
    });
  },

  // Nous Research AI Chatbot
  sendChatMessage(message, history = [], options = {}) {
    const model = (typeof State !== 'undefined' && State.getAiModel)
      ? State.getAiModel()
      : (localStorage.getItem('bs_ai_model') || 'gpt-4o');
    const user = (typeof State !== 'undefined' && State.user)
      ? State.user
      : this.getUser();
    const userPayload = options.userContext || options.user || {
      id_user: user?.id || user?.id_user || null,
      id: user?.id || user?.id_user || null,
      name: user?.name || '',
      role: user?.role || '',
      email: user?.email || '',
    };
    return this.request('/chatbot/message', {
      method: 'POST',
      body: {
        message,
        question: message,
        query: message,
        history: Array.isArray(history) ? history : [],
        model,
        user: userPayload,
        userContext: userPayload,
      },
      timeout: options.timeout || 45000,
      signal: options.signal,
    });
  },

  getChatbotStatus() {
    return this.request('/chatbot/status');
  },

  getChatbotSuggestions(role = '') {
    return this.request(`/chatbot/suggestions${role ? '?role=' + encodeURIComponent(role) : ''}`);
  },

  // Owner Analytics & Reports
  getExecutiveOverview() {
    return this.request('/owner/analytics/overview');
  },

  getOwnerAnalyticsOverview() {
    return this.getExecutiveOverview();
  },

  getTrendCharts() {
    return this.request('/owner/analytics/charts');
  },

  getOwnerAnalyticsCharts() {
    return this.getTrendCharts();
  },

  getAiInsights() {
    return this.request('/owner/analytics/insights');
  },

  getOwnerAnalyticsInsights() {
    return this.getAiInsights();
  },

  getOwnerReport(reportType, query = '') {
    return this.request(`/owner/reports/${reportType}${query ? '?' + query : ''}`);
  },

  // Gamification & Rewards
  getGamificationProfile(customerId = '') {
    const ep = customerId ? `/gamification/profile?customerId=${customerId}` : '/gamification/profile';
    return this.request(ep);
  },

  getGamificationLeaderboard() {
    return this.request('/gamification/leaderboard');
  },

  getRewardsCatalog() {
    return this.request('/gamification/rewards');
  },

  redeemReward(rewardId) {
    return this.request('/gamification/redeem', {
      method: 'POST',
      body: { rewardId },
    });
  },

  getMyRedemptions() {
    return this.request('/gamification/redemptions/me');
  },

  getPointRules() {
    return this.request('/gamification/rules');
  },

  // Notifications & WhatsApp
  getNotificationHistory(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/notifications/history${query ? '?' + query : ''}`);
  },

  getNotificationStats() {
    return this.request('/notifications/stats');
  },

  getNotificationPreferences() {
    return this.request('/notifications/preferences');
  },

  updateNotificationPreferences(data) {
    return this.request('/notifications/preferences', {
      method: 'PUT',
      body: data
    });
  },

  sendTestNotification(phone = null) {
    return this.request('/notifications/test', {
      method: 'POST',
      body: { phone }
    });
  },

  sendWhatsAppNotification(data) {
    return this.request('/notifications/whatsapp/send', {
      method: 'POST',
      body: data
    });
  },

  getNotificationProviderStatus() {
    return this.request('/notifications/provider-status');
  },

  processNotificationQueue() {
    return this.request('/notifications/whatsapp/process-queue', {
      method: 'POST',
      body: {},
    });
  },

  markNotificationRead(id) {
    return this.request(`/notifications/history/${id}/read`, {
      method: 'PUT',
    });
  },

  // AI Configuration & Models Management
  getAiConfig() {
    return this.request('/ai/config');
  },

  updateAiConfig(payload) {
    return this.request('/ai/config', {
      method: 'PUT',
      body: payload,
    });
  },

  testAiModel(payload) {
    return this.request('/ai/config/test', {
      method: 'POST',
      body: payload,
    });
  },

  resetAiConfigToEnv() {
    return this.request('/ai/config/reset-env', {
      method: 'POST',
      body: {},
    });
  },

  // WhatsApp Gateway & Device Management
  getWhatsAppDevices() {
    return this.request('/notifications/devices');
  },

  saveWhatsAppDevice(payload) {
    return this.request('/notifications/devices', {
      method: 'POST',
      body: payload,
    });
  },

  checkWhatsAppDevice(id) {
    return this.request(`/notifications/devices/${id}/check`, {
      method: 'POST',
      body: {},
    });
  },

  activateWhatsAppDevice(id) {
    return this.request(`/notifications/devices/${id}/activate`, {
      method: 'POST',
      body: {},
    });
  },

  deleteWhatsAppDevice(id) {
    return this.request(`/notifications/devices/${id}`, {
      method: 'DELETE',
    });
  }
};

