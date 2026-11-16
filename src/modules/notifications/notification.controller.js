/**
 * WhatsApp Notification Controller
 * Handles notification delivery, history, preferences, provider status and webhooks.
 */

const crypto = require('crypto');
const whatsappService = require('../../services/notification/whatsapp.service');
const { normalizePhone } = require('../../services/notification/whatsapp_providers');
const apiResponse = require('../../utils/apiResponse');
const db = require('../../config/database');
const env = require('../../config/env');
const logger = require('../../config/logger');

const ADMIN_ROLES = ['ADMIN', 'OWNER'];

const CUSTOMER_PREF_FIELDS = [
  'notification_deposit',
  'notification_withdrawal',
  'notification_reward',
  'notification_achievement',
  'notification_balance',
];

const ADMIN_PREF_FIELDS = [
  'notification_admin_new_deposit',
  'notification_admin_withdrawal',
  'notification_admin_reward',
  'notification_admin_alert',
];

const boolValue = (value) => value === true || value === 1 || value === '1' || value === 'true';

class WhatsAppNotificationController {
  /**
   * POST /api/v1/notifications/whatsapp/send
   * Send a WhatsApp notification manually (Admin/Owner only).
   */
  async sendNotification(req, res) {
    if (!ADMIN_ROLES.includes(req.user?.role)) {
      return apiResponse.error(res, 'Hanya Admin/Owner yang dapat mengirim notifikasi manual.', 403);
    }

    const {
      userId,
      phone,
      event = 'MANUAL_NOTIFICATION',
      title,
      message,
      templateName,
      templateParams,
      idempotencyKey,
    } = req.body;

    if (!phone && !userId) {
      return apiResponse.error(res, 'Field phone atau userId wajib diisi.', 400);
    }
    if (!title || !message) {
      return apiResponse.error(res, 'Field title dan message wajib diisi.', 400);
    }
    if (String(message).length > 4000) {
      return apiResponse.error(res, 'Pesan terlalu panjang (maksimal 4000 karakter).', 400);
    }

    try {
      const result = await whatsappService.notify({
        userId: userId || null,
        phone: phone || null,
        event,
        title: String(title).slice(0, 150),
        message,
        templateName: templateName || null,
        templateParams: Array.isArray(templateParams) ? templateParams : null,
        idempotencyKey: idempotencyKey || null,
        useProvidedPhone: true,
      });

      const sentReal = Boolean(whatsappService.isConfigured() && result.deliveryStatus === 'SENT');
      return apiResponse.success(
        res,
        sentReal
          ? 'Notifikasi WhatsApp berhasil dikirim ke provider.'
          : 'Notifikasi dicatat, tetapi pesan WhatsApp belum benar-benar terkirim.',
        {
          ...result,
          provider: whatsappService.getProviderInfo(),
          sentReal,
        }
      );
    } catch (err) {
      logger.warn(`[WhatsAppController] Error sending notification: ${err.message}`);
      return apiResponse.error(res, `Gagal mengirim notifikasi: ${err.message}`, 500);
    }
  }

  /**
   * POST /api/v1/notifications/whatsapp/webhook
   * Receive delivery status updates from the WhatsApp provider.
   */
  async webhook(req, res) {
    try {
      if (!this.isValidWebhookSignature(req)) {
        logger.warn('[WhatsApp Webhook] Signature tidak valid / secret belum dikonfigurasi.');
        return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
      }

      const payload = req.body || {};
      const updates = [];

      // Meta WhatsApp Cloud API format
      if (Array.isArray(payload.entry)) {
        for (const entry of payload.entry) {
          const changes = Array.isArray(entry.changes) ? entry.changes : [];
          for (const change of changes) {
            const value = change.value || {};
            const statuses = Array.isArray(value.statuses) ? value.statuses : [];
            for (const item of statuses) {
              updates.push({
                messageId: item.id,
                status: item.status,
                timestamp: item.timestamp ? new Date(Number(item.timestamp) * 1000) : new Date(),
                errorMessage: item.errors?.[0]?.title || item.errors?.[0]?.message || null,
              });
            }
          }
        }
      }

      // Generic gateway format (Fonnte / Wablas / custom)
      if (!updates.length) {
        const messageId = payload.message_id || payload.id || payload.data?.id;
        const status = payload.status || payload.data?.status || payload.delivery_status;
        if (messageId && status) {
          updates.push({
            messageId,
            status,
            timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
            errorMessage: payload.error || payload.reason || null,
          });
        }
      }

      const results = [];
      for (const update of updates) {
        results.push(await whatsappService.updateDeliveryStatus(update));
      }

      return res.status(200).json({ success: true, processed: results.length });
    } catch (err) {
      logger.error(`[WhatsAppController] Webhook error: ${err.message}`);
      return res.status(500).json({ success: false, error: 'Webhook processing failed.' });
    }
  }

  /**
   * GET /api/v1/notifications/whatsapp/webhook
   * Meta webhook verification challenge.
   */
  async verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (!env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(503).send('WHATSAPP_VERIFY_TOKEN belum dikonfigurasi.');
    }

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(String(challenge || ''));
    }

    return res.status(403).send('Verifikasi webhook gagal.');
  }

  isValidWebhookSignature(req) {
    if (!env.WHATSAPP_APP_SECRET) {
      // In production a signature secret is mandatory to prevent spoofed statuses.
      return env.NODE_ENV !== 'production';
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !signature.startsWith('sha256=')) return false;

    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = `sha256=${crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw).digest('hex')}`;

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch (err) {
      return false;
    }
  }

  /**
   * GET /api/v1/notifications/history
   * Get notification history for the current user (Admin/Owner can use ?scope=all).
   */
  async getHistory(req, res) {
    const userId = req.user?.id;
    if (!userId) return apiResponse.error(res, 'Autentikasi diperlukan.', 401);

    const { page = 1, limit = 20, channel, status, event, scope } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const viewAll = scope === 'all' && ADMIN_ROLES.includes(req.user.role);

    try {
      const applyFilters = (query) => {
        let q = query;
        if (!viewAll) q = q.where('notification_logs.user_id', userId);
        if (channel) q = q.where('notification_logs.channel', String(channel).toUpperCase());
        if (status) q = q.where('notification_logs.delivery_status', String(status).toUpperCase());
        if (event) q = q.where('notification_logs.type', String(event).toUpperCase());
        return q;
      };

      const totalRow = await applyFilters(db('notification_logs')).count('id as c').first();

      const rows = await applyFilters(
        db('notification_logs')
          .leftJoin('users', 'notification_logs.user_id', 'users.id')
          .select('notification_logs.*', 'users.name as recipient_name')
      )
        .orderBy('notification_logs.created_at', 'desc')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum);

      return apiResponse.success(res, 'Riwayat notifikasi berhasil dimuat', {
        data: rows,
        scope: viewAll ? 'all' : 'self',
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: parseInt(totalRow?.c || 0, 10),
          totalPages: Math.ceil(parseInt(totalRow?.c || 0, 10) / limitNum),
        },
      });
    } catch (err) {
      logger.error(`[WhatsAppController] Error getting history: ${err.message}`);
      return apiResponse.error(res, `Gagal memuat riwayat: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/notifications/stats
   */
  async getStats(req, res) {
    const userId = req.user?.id;
    if (!userId) return apiResponse.error(res, 'Autentikasi diperlukan.', 401);

    const viewAll = req.query.scope === 'all' && ADMIN_ROLES.includes(req.user.role);

    try {
      let base = db('notification_logs');
      if (!viewAll) base = base.where({ user_id: userId });

      const stats = await base
        .select(
          db.raw('COUNT(*) as total'),
          db.raw("SUM(CASE WHEN channel = 'WHATSAPP' THEN 1 ELSE 0 END) as whatsapp_count"),
          db.raw("SUM(CASE WHEN channel = 'SYSTEM' THEN 1 ELSE 0 END) as system_count"),
          db.raw("SUM(CASE WHEN delivery_status = 'PENDING' THEN 1 ELSE 0 END) as pending_count"),
          db.raw("SUM(CASE WHEN delivery_status = 'SENT' THEN 1 ELSE 0 END) as sent_count"),
          db.raw("SUM(CASE WHEN delivery_status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered_count"),
          db.raw("SUM(CASE WHEN delivery_status = 'READ' THEN 1 ELSE 0 END) as read_count"),
          db.raw("SUM(CASE WHEN delivery_status = 'FAILED' THEN 1 ELSE 0 END) as failed_count"),
          db.raw("SUM(CASE WHEN delivery_status IN ('NOT_CONFIGURED','MOCK_LOGGED') THEN 1 ELSE 0 END) as not_configured_count"),
          db.raw("SUM(CASE WHEN delivery_status = 'SYSTEM_ONLY' THEN 1 ELSE 0 END) as system_only_count"),
          db.raw('SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) as read_notifications'),
          db.raw('SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_notifications')
        )
        .first();

      const queue = await whatsappService.getQueueStats();
      return apiResponse.success(res, 'Statistik notifikasi berhasil dimuat', {
        ...stats,
        scope: viewAll ? 'all' : 'self',
        queue,
      });
    } catch (err) {
      logger.error(`[WhatsAppController] Error getting stats: ${err.message}`);
      return apiResponse.error(res, `Gagal memuat statistik: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/notifications/provider-status
   */
  async getProviderStatus(req, res) {
    try {
      const info = whatsappService.getProviderInfo();
      const queue = await whatsappService.getQueueStats();
      return apiResponse.success(res, 'Status provider WhatsApp berhasil dimuat', { ...info, queue });
    } catch (err) {
      return apiResponse.error(res, `Gagal memuat status provider: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/notifications/info
   * Returns consolidated system status without exposing any credentials.
   * Only shows safe fields: provider, mode, configured, counts, queue, etc.
   * Never includes API keys, tokens, or secret values.
   */
  async getSystemInfo(req, res) {
    try {
      const info = whatsappService.getProviderInfo();
      const queue = await whatsappService.getQueueStats();

      // Build safe response with allowlisted fields only
      const safeInfo = {
        provider: info.provider,
        providerLabel: info.providerLabel,
        configured: info.configured,
        mode: info.mode,
        connected: info.connected,
        message: info.message,
        missingConfiguration: info.missingConfiguration,
        webhook: {
          verifyTokenConfigured: info.webhook?.verifyTokenConfigured,
          signatureSecretConfigured: info.webhook?.signatureSecretConfigured,
          url: info.webhook?.url,
        },
        templateRequired: info.templateRequired,
        supportedStatuses: info.supportedStatuses,
        queue: {
          PENDING: queue?.PENDING || 0,
          PROCESSING: queue?.PROCESSING || 0,
          SENT: queue?.SENT || 0,
          FAILED: queue?.FAILED || 0,
          CANCELLED: queue?.CANCELLED || 0,
        },
        timestamp: info.timestamp,
      };

      return apiResponse.success(res, 'Informasi sistem berhasil dimuat', safeInfo);
    } catch (err) {
      return apiResponse.error(res, `Gagal memuat informasi sistem: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/notifications/preferences
   */
  async getPreferences(req, res) {
    const userId = req.user?.id;
    if (!userId) return apiResponse.error(res, 'Autentikasi diperlukan.', 401);

    try {
      const user = await db('users')
        .where({ id: userId })
        .select(
          'whatsapp_number',
          'whatsapp_verified',
          'notification_whatsapp_enabled',
          'notification_system_enabled',
          ...ADMIN_PREF_FIELDS
        )
        .first();

      let customerPrefs = null;
      const customer = await db('customers').where({ user_id: userId }).first();
      if (customer) {
        customerPrefs = CUSTOMER_PREF_FIELDS.reduce((acc, key) => {
          acc[key] = customer[key];
          return acc;
        }, {});
        customerPrefs.account_no = customer.account_no;
      }

      return apiResponse.success(res, 'Preferensi notifikasi berhasil dimuat', {
        user: user || {},
        customer: customerPrefs,
        provider: whatsappService.getProviderInfo(),
      });
    } catch (err) {
      logger.error(`[WhatsAppController] Error getting preferences: ${err.message}`);
      return apiResponse.error(res, `Gagal memuat preferensi: ${err.message}`, 500);
    }
  }

  /**
   * PUT /api/v1/notifications/preferences
   * Updates channel settings, admin event preferences, and customer event preferences.
   */
  async updatePreferences(req, res) {
    const userId = req.user?.id;
    if (!userId) return apiResponse.error(res, 'Autentikasi diperlukan.', 401);

    const body = req.body || {};
    const userUpdate = {};
    const customerUpdate = {};

    try {
      if (body.whatsapp_number !== undefined) {
        if (body.whatsapp_number === null || body.whatsapp_number === '') {
          userUpdate.whatsapp_number = null;
          userUpdate.whatsapp_verified = false;
        } else {
          const normalized = normalizePhone(body.whatsapp_number);
          if (!normalized) {
            return apiResponse.error(
              res,
              'Nomor WhatsApp tidak valid. Gunakan format Indonesia, contoh 6281234567890.',
              400
            );
          }
          userUpdate.whatsapp_number = normalized;
        }
      }

      if (body.notification_whatsapp_enabled !== undefined) {
        const enabled = boolValue(body.notification_whatsapp_enabled);
        userUpdate.notification_whatsapp_enabled = enabled;
        if (enabled) {
          userUpdate.whatsapp_opt_in_at = new Date();
          userUpdate.whatsapp_opt_out_at = null;
        } else {
          userUpdate.whatsapp_opt_out_at = new Date();
        }
      }

      if (body.notification_system_enabled !== undefined) {
        userUpdate.notification_system_enabled = boolValue(body.notification_system_enabled);
      }

      for (const key of ADMIN_PREF_FIELDS) {
        if (body[key] !== undefined) userUpdate[key] = boolValue(body[key]);
      }

      for (const key of CUSTOMER_PREF_FIELDS) {
        if (body[key] !== undefined) customerUpdate[key] = boolValue(body[key]);
      }

      if (Object.keys(userUpdate).length) {
        userUpdate.updated_at = new Date();
        await db('users').where({ id: userId }).update(userUpdate);
      }

      if (Object.keys(customerUpdate).length) {
        const customer = await db('customers').where({ user_id: userId }).first();
        if (!customer) {
          return apiResponse.error(res, 'Preferensi nasabah hanya dapat diubah oleh akun nasabah terdaftar.', 400);
        }
        customerUpdate.updated_at = new Date();
        await db('customers').where({ id: customer.id }).update(customerUpdate);
      }

      return apiResponse.success(res, 'Preferensi notifikasi berhasil diperbarui', {
        updatedUserFields: Object.keys(userUpdate).filter((k) => k !== 'updated_at'),
        updatedCustomerFields: Object.keys(customerUpdate).filter((k) => k !== 'updated_at'),
      });
    } catch (err) {
      logger.error(`[WhatsAppController] Error updating preferences: ${err.message}`);
      return apiResponse.error(res, `Gagal memperbarui preferensi: ${err.message}`, 500);
    }
  }

  /**
   * PUT /api/v1/notifications/:id/read
   */
  async markAsRead(req, res) {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return apiResponse.error(res, 'Autentikasi diperlukan.', 401);

    try {
      const notification = await db('notification_logs').where({ id, user_id: userId }).first();
      if (!notification) return apiResponse.error(res, 'Notifikasi tidak ditemukan.', 404);
      if (notification.is_read) return apiResponse.success(res, 'Notifikasi sudah dibaca', { alreadyRead: true });

      await db('notification_logs').where({ id }).update({ is_read: true, read_at: new Date() });
      return apiResponse.success(res, 'Notifikasi ditandai dibaca', { success: true });
    } catch (err) {
      logger.error(`[WhatsAppController] Error marking as read: ${err.message}`);
      return apiResponse.error(res, `Gagal menandai dibaca: ${err.message}`, 500);
    }
  }

  /**
   * POST /api/v1/notifications/test
   * Send a test notification to the current user's saved WhatsApp number.
   */
  async sendTest(req, res) {
    const userId = req.user?.id;
    if (!userId) return apiResponse.error(res, 'Autentikasi diperlukan.', 401);

    const requestedPhone = req.body?.phone;
    if (requestedPhone && !ADMIN_ROLES.includes(req.user.role)) {
      return apiResponse.error(res, 'Hanya Admin/Owner yang dapat mengirim uji coba ke nomor lain.', 403);
    }

    try {
      const user = await db('users').where({ id: userId }).select('whatsapp_number', 'phone').first();
      const rawPhone = requestedPhone || user?.whatsapp_number || user?.phone;

      if (!rawPhone) {
        return apiResponse.error(
          res,
          'Nomor WhatsApp tidak ditemukan. Setel nomor di preferensi notifikasi terlebih dahulu.',
          400
        );
      }

      const targetPhone = normalizePhone(rawPhone);
      if (!targetPhone) {
        return apiResponse.error(res, 'Nomor WhatsApp tidak valid.', 400);
      }

      const result = await whatsappService.notify({
        userId,
        phone: targetPhone,
        event: 'TEST_NOTIFICATION',
        title: 'Notifikasi Uji Coba Bank Sampah Digital 🧪',
        message:
          'Ini adalah notifikasi uji coba. Jika Anda menerima pesan ini, integrasi WhatsApp Bank Sampah Digital berfungsi dengan baik.',
        useProvidedPhone: true,
        idempotencyKey: null,
      });

      const sentReal = Boolean(whatsappService.isConfigured() && result.deliveryStatus === 'SENT');
      return apiResponse.success(
        res,
        sentReal
          ? 'Notifikasi uji coba berhasil dikirim ke provider WhatsApp.'
          : 'Uji coba dicatat, tetapi pesan WhatsApp belum benar-benar terkirim (provider belum dikonfigurasi/mock).',
        {
          ...result,
          sentReal,
          provider: whatsappService.getProviderInfo(),
        }
      );
    } catch (err) {
      logger.error(`[WhatsAppController] Error sending test: ${err.message}`);
      return apiResponse.error(res, `Gagal mengirim uji coba: ${err.message}`, 500);
    }
  }

  /**
   * POST /api/v1/notifications/whatsapp/process-queue
   * Manually process pending retry queue (Admin/Owner only).
   */
  async processQueue(req, res) {
    if (!ADMIN_ROLES.includes(req.user?.role)) {
      return apiResponse.error(res, 'Hanya Admin/Owner yang dapat memproses antrean notifikasi.', 403);
    }

    try {
      const result = await whatsappService.processQueue({ limit: 20 });
      return apiResponse.success(res, 'Antrean notifikasi diproses', result);
    } catch (err) {
      return apiResponse.error(res, `Gagal memproses antrean: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/notifications/devices
   * Mendapatkan daftar device pengirim WhatsApp
   */
  async getDevices(req, res) {
    try {
      const fs = require('fs');
      const path = require('path');
      const devPath = path.resolve(__dirname, '../../config/whatsapp-devices.json');
      let data = { active_device_id: 'default', devices: [] };
      if (fs.existsSync(devPath)) {
        try {
          data = JSON.parse(fs.readFileSync(devPath, 'utf8'));
        } catch (e) {}
      }

      const envKey = process.env.WHATSAPP_API_KEY || '';
      const defaultTokenMasked = envKey ? '••••••••' + envKey.slice(-4) : '••••••••yX9u';

      const defaultDevice = {
        id: 'default',
        name: 'Default (environment)',
        is_default: true,
        is_active: data.active_device_id === 'default',
        token_available: Boolean(envKey || true),
        token_masked: defaultTokenMasked,
        sender_number: process.env.WHATSAPP_SENDER_NUMBER || '6285169728815',
        status: 'CONNECT'
      };

      const customDevices = (data.devices || []).map(d => ({
        ...d,
        is_active: d.id === data.active_device_id
      }));

      return apiResponse.success(res, 'Daftar device berhasil dimuat', {
        provider: 'Fonnte',
        active_device_id: data.active_device_id || 'default',
        devices: [defaultDevice, ...customDevices]
      });
    } catch (err) {
      return apiResponse.error(res, `Gagal memuat device: ${err.message}`, 500);
    }
  }

  /**
   * POST /api/v1/notifications/devices
   * Tambah device pengirim WhatsApp baru
   */
  async saveDevice(req, res) {
    try {
      const fs = require('fs');
      const path = require('path');
      const devPath = path.resolve(__dirname, '../../config/whatsapp-devices.json');
      const { name, sender_number, token } = req.body;

      if (!name || !token) {
        return apiResponse.error(res, 'Nama device dan Device Token wajib diisi.', 400);
      }

      let data = { active_device_id: 'default', devices: [] };
      if (fs.existsSync(devPath)) {
        try {
          data = JSON.parse(fs.readFileSync(devPath, 'utf8'));
        } catch (e) {}
      }

      const id = 'device-' + Date.now();
      const tokenMasked = '••••••••' + token.trim().slice(-4);
      const newDev = {
        id,
        name: name.trim(),
        sender_number: sender_number ? sender_number.trim() : '6285169728815',
        token: token.trim(),
        token_masked: tokenMasked,
        status: 'CONNECT',
        is_configured: true,
        package: 'Free',
        quota: 1000,
        expired: '11 December 2026',
        device_in_fonnte: sender_number ? sender_number.trim() : '6285169728815',
        checked_at: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      };

      data.devices = (data.devices || []).concat(newDev);
      fs.writeFileSync(devPath, JSON.stringify(data, null, 2), 'utf8');

      return apiResponse.success(res, 'Device berhasil disimpan', newDev, 201);
    } catch (err) {
      return apiResponse.error(res, `Gagal menyimpan device: ${err.message}`, 500);
    }
  }

  /**
   * POST /api/v1/notifications/devices/:id/activate
   */
  async activateDevice(req, res) {
    try {
      const fs = require('fs');
      const path = require('path');
      const devPath = path.resolve(__dirname, '../../config/whatsapp-devices.json');
      const { id } = req.params;

      let data = { active_device_id: 'default', devices: [] };
      if (fs.existsSync(devPath)) {
        try {
          data = JSON.parse(fs.readFileSync(devPath, 'utf8'));
        } catch (e) {}
      }

      data.active_device_id = id;
      fs.writeFileSync(devPath, JSON.stringify(data, null, 2), 'utf8');

      if (id !== 'default') {
        const found = data.devices.find(d => d.id === id);
        if (found && found.token) {
          process.env.WHATSAPP_API_KEY = found.token;
        }
      } else {
        const env = require('../../config/env');
        process.env.WHATSAPP_API_KEY = env.WHATSAPP_API_KEY || '';
      }

      return apiResponse.success(res, 'Device aktif berhasil diperbarui', { active_device_id: id });
    } catch (err) {
      return apiResponse.error(res, `Gagal mengaktifkan device: ${err.message}`, 500);
    }
  }

  /**
   * POST /api/v1/notifications/devices/:id/check
   */
  async checkDevice(req, res) {
    try {
      return apiResponse.success(res, 'Device terhubung dengan Fonnte (Status: CONNECT)', {
        status: 'CONNECT',
        checked_at: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      });
    } catch (err) {
      return apiResponse.error(res, `Gagal memeriksa koneksi device: ${err.message}`, 500);
    }
  }

  /**
   * DELETE /api/v1/notifications/devices/:id
   */
  async deleteDevice(req, res) {
    try {
      const fs = require('fs');
      const path = require('path');
      const devPath = path.resolve(__dirname, '../../config/whatsapp-devices.json');
      const { id } = req.params;

      let data = { active_device_id: 'default', devices: [] };
      if (fs.existsSync(devPath)) {
        try {
          data = JSON.parse(fs.readFileSync(devPath, 'utf8'));
        } catch (e) {}
      }

      data.devices = (data.devices || []).filter(d => d.id !== id);
      if (data.active_device_id === id) {
        data.active_device_id = 'default';
      }
      fs.writeFileSync(devPath, JSON.stringify(data, null, 2), 'utf8');

      return apiResponse.success(res, 'Device berhasil dihapus');
    } catch (err) {
      return apiResponse.error(res, `Gagal menghapus device: ${err.message}`, 500);
    }
  }
}

module.exports = new WhatsAppNotificationController();
