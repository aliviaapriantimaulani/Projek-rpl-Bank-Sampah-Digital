/**
 * WhatsApp Notification Service
 *
 * Handles multi-channel event notifications (WhatsApp Business Platform +
 * in-app system notifications), delivery tracking, retries, idempotency and
 * per-user opt-in/opt-out preferences.
 *
 * IMPORTANT: When no real WhatsApp gateway is configured, messages are recorded
 * honestly as NOT_CONFIGURED / MOCK_LOGGED and are never reported as delivered.
 */

const env = require('../../config/env');
const db = require('../../config/database');
const logger = require('../../config/logger');
const { createProvider, normalizePhone } = require('./whatsapp_providers');

/** Maps business events to the customer notification preference column. */
const EVENT_PREFERENCE_MAP = {
  DEPOSIT_COMPLETED: 'notification_deposit',
  BALANCE_CHANGED: 'notification_balance',
  WITHDRAWAL_SUBMITTED: 'notification_withdrawal',
  WITHDRAWAL_APPROVED: 'notification_withdrawal',
  WITHDRAWAL_REJECTED: 'notification_withdrawal',
  REWARD_REDEMPTION: 'notification_reward',
  REWARD_STATUS_CHANGED: 'notification_reward',
  ACHIEVEMENT_UNLOCKED: 'notification_achievement',
};

/** Maps admin events to admin notification preference columns (users table). */
const ADMIN_EVENT_PREFERENCE_MAP = {
  ADMIN_NEW_DEPOSIT: 'notification_admin_new_deposit',
  ADMIN_WITHDRAWAL_REQUEST: 'notification_admin_withdrawal',
  ADMIN_REWARD_REQUEST: 'notification_admin_reward',
  ADMIN_ALERT: 'notification_admin_alert',
};

const DELIVERY_STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'NOT_CONFIGURED', 'MOCK_LOGGED', 'SYSTEM_ONLY', 'SKIPPED'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asBool = (value, fallback = true) => {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
};

const formatRupiah = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const formatNumber = (value) => Number(value || 0).toLocaleString('id-ID');

class WhatsAppNotificationService {
  constructor() {
    this.providerType = String(env.WHATSAPP_PROVIDER || 'none').toLowerCase();
    this.provider = createProvider(this.providerType);
    this.queueWorker = null;
  }

  setProvider(providerInstance) {
    this.provider = providerInstance;
  }

  /**
   * Whether a real WhatsApp provider is configured with credentials.
   * 'mock' and 'none' always return false.
   */
  isConfigured() {
    if (['none', 'mock', ''].includes(this.providerType)) return false;
    return Boolean(this.provider && this.provider.configured);
  }

  getProviderLabel() {
    const labels = {
      meta: 'Meta WhatsApp Business Platform (Cloud API)',
      meta_cloud: 'Meta WhatsApp Business Platform (Cloud API)',
      whatsapp_business: 'Meta WhatsApp Business Platform (Cloud API)',
      twilio: 'Twilio WhatsApp API',
      fonnte: 'Fonnte Gateway',
      wablas: 'Wablas Gateway',
      mock: 'Mock Lokal (tidak mengirim pesan)',
      none: 'Belum Dikonfigurasi',
    };
    return labels[this.providerType] || this.providerType;
  }

  getMissingConfiguration() {
    if (this.providerType === 'meta' || this.providerType === 'meta_cloud' || this.providerType === 'whatsapp_business') {
      const missing = [];
      if (!(env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_API_KEY)) missing.push('WHATSAPP_ACCESS_TOKEN');
      if (!env.WHATSAPP_PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
      if (!env.WHATSAPP_VERIFY_TOKEN) missing.push('WHATSAPP_VERIFY_TOKEN (webhook)');
      if (env.NODE_ENV === 'production' && !env.WHATSAPP_APP_SECRET) missing.push('WHATSAPP_APP_SECRET (signature webhook)');
      return missing;
    }
    if (this.providerType === 'twilio') {
      const missing = [];
      if (!env.WHATSAPP_TWILIO_ACCOUNT_SID) missing.push('WHATSAPP_TWILIO_ACCOUNT_SID');
      if (!(env.WHATSAPP_TWILIO_AUTH_TOKEN || env.WHATSAPP_API_SECRET)) missing.push('WHATSAPP_TWILIO_AUTH_TOKEN');
      if (!env.WHATSAPP_SENDER_NUMBER) missing.push('WHATSAPP_SENDER_NUMBER');
      return missing;
    }
    if (this.providerType === 'fonnte' || this.providerType === 'wablas') {
      return env.WHATSAPP_API_KEY ? [] : ['WHATSAPP_API_KEY'];
    }
    return ['WHATSAPP_PROVIDER (meta/twilio/fonnte/wablas)'];
  }

  /**
   * Safe provider status for dashboards. Never exposes credentials.
   */
  getProviderInfo() {
    const configured = this.isConfigured();
    return {
      provider: this.providerType,
      providerLabel: this.getProviderLabel(),
      configured,
      connected: configured,
      mode: configured ? 'live' : this.providerType === 'mock' ? 'mock' : 'not_configured',
      message: configured
        ? 'Provider WhatsApp terkonfigurasi. Pengiriman nyata dapat dilakukan.'
        : this.providerType === 'mock'
          ? 'Mode mock lokal aktif: pesan hanya dicatat dan TIDAK dikirim ke WhatsApp.'
          : 'Provider WhatsApp belum dikonfigurasi: pesan hanya tersimpan sebagai notifikasi lokal dan tidak dikirim.',
      missingConfiguration: this.getMissingConfiguration(),
      webhook: {
        verifyTokenConfigured: Boolean(env.WHATSAPP_VERIFY_TOKEN),
        signatureSecretConfigured: Boolean(env.WHATSAPP_APP_SECRET),
        url: `${env.APP_URL || 'http://localhost:3000'}/api/v1/notifications/whatsapp/webhook`,
      },
      templateRequired: String(env.WHATSAPP_REQUIRE_TEMPLATE) === 'true',
      supportedStatuses: DELIVERY_STATUSES,
      timestamp: new Date().toISOString(),
    };
  }

  async getUserContext(userId) {
    if (!userId) return { user: null, customer: null };
    const user = await db('users').where({ id: userId }).first();
    const customer = user ? await db('customers').where({ user_id: user.id }).first() : null;
    return { user, customer };
  }

  /**
   * Best-effort lookup for phone-only notifications so the log can still be
   * linked to a real user when the number belongs to one. Returns null when the
   * number is not registered — the migration allows user_id = NULL for those.
   */
  async findUserByPhone(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    const local = normalized.startsWith('62') ? `0${normalized.slice(2)}` : null;
    const candidates = [String(phone).trim(), normalized, local].filter(Boolean);

    try {
      return await db('users')
        .where(function () {
          this.whereIn('whatsapp_number', candidates).orWhereIn('phone', candidates);
        })
        .first();
    } catch (err) {
      return null;
    }
  }

  resolveRecipient({ user, phone, useProvidedPhone = false }) {
    const provided = normalizePhone(phone);
    const whatsappNumber = normalizePhone(user?.whatsapp_number);
    const profilePhone = normalizePhone(user?.phone);

    if (useProvidedPhone) return provided || whatsappNumber || profilePhone;
    return whatsappNumber || provided || profilePhone;
  }

  async findByIdempotencyKey(key, dbClient = db) {
    if (!key) return null;
    try {
      return await dbClient('notification_logs').where({ idempotency_key: key }).first();
    } catch (err) {
      // Older databases may not have the column yet (migration not applied).
      return null;
    }
  }

  buildMessageBody({ title, message, rawMessage }) {
    if (rawMessage) return message;
    return `*${title}*\n\n${message}\n\n_Bank Sampah Digital_`;
  }

  /**
   * Dispatch a notification across in-app notification_logs and WhatsApp.
   *
   * @param {Object} options
   * @param {number} [options.userId]
   * @param {string} [options.phone]
   * @param {string} options.event
   * @param {string} options.title
   * @param {string} options.message
   * @param {Object} [options.trx] Knex transaction (for log insert only)
   * @param {string} [options.idempotencyKey]
   * @param {string} [options.templateName]
   * @param {Array} [options.templateParams]
   * @param {string} [options.language]
   * @param {boolean} [options.useProvidedPhone]
   * @param {boolean} [options.queueOnFailure]
   */
  async notify({
    userId,
    phone,
    event,
    title,
    message,
    trx = null,
    idempotencyKey = null,
    templateName = null,
    templateParams = null,
    language = 'id',
    useProvidedPhone = false,
    queueOnFailure = true,
  }) {
    const dbClient = trx || db;
    const normalizedEvent = String(event || 'SYSTEM').toUpperCase();

    const existing = await this.findByIdempotencyKey(idempotencyKey, dbClient);
    if (existing) {
      return {
        notificationId: existing.id,
        event: normalizedEvent,
        deliveryStatus: existing.delivery_status,
        channel: existing.channel,
        duplicate: true,
        skipped: true,
        reason: 'DUPLICATE_IDEMPOTENCY_KEY',
      };
    }

    let { user, customer } = await this.getUserContext(userId);

    // Phone-only manual send: link the log to a registered user when possible.
    if (!user && phone) {
      user = await this.findUserByPhone(phone);
      if (user) {
        customer = await db('customers').where({ user_id: user.id }).first();
      }
    }

    if (!user && !phone) {
      throw new Error('Penerima notifikasi tidak diketahui (userId/phone kosong).');
    }

    // Customer-level opt-out by event type.
    const customerPrefKey = EVENT_PREFERENCE_MAP[normalizedEvent];
    if (customer && customerPrefKey && !asBool(customer[customerPrefKey], true)) {
      return {
        notificationId: null,
        event: normalizedEvent,
        deliveryStatus: 'SKIPPED',
        channel: null,
        skipped: true,
        reason: 'CUSTOMER_PREFERENCE_DISABLED',
      };
    }

    // Admin-level opt-out by event type.
    const adminPrefKey = ADMIN_EVENT_PREFERENCE_MAP[normalizedEvent];
    if (user && adminPrefKey && !asBool(user[adminPrefKey], true)) {
      return {
        notificationId: null,
        event: normalizedEvent,
        deliveryStatus: 'SKIPPED',
        channel: null,
        skipped: true,
        reason: 'ADMIN_PREFERENCE_DISABLED',
      };
    }

    const whatsappEnabled = user ? asBool(user.notification_whatsapp_enabled, true) : true;
    const systemEnabled = user ? asBool(user.notification_system_enabled, true) : true;

    if (!whatsappEnabled && !systemEnabled) {
      return {
        notificationId: null,
        event: normalizedEvent,
        deliveryStatus: 'SKIPPED',
        channel: null,
        skipped: true,
        reason: 'ALL_CHANNELS_OPTED_OUT',
      };
    }

    const recipient = whatsappEnabled
      ? this.resolveRecipient({ user, phone, useProvidedPhone })
      : null;

    const channel = recipient ? 'WHATSAPP' : 'SYSTEM';
    let deliveryStatus = 'SYSTEM_ONLY';
    let providerResponse = null;
    let providerMessageId = null;

    let notificationId;
    try {
      const insertResult = await dbClient('notification_logs').insert(
        {
          user_id: userId || user?.id,
          title,
          message,
          type: normalizedEvent,
          is_read: false,
          channel,
          delivery_status: 'PENDING',
          recipient_phone: recipient,
          provider_response: null,
          idempotency_key: idempotencyKey || null,
          created_at: new Date(),
        },
        ['id']
      );
      notificationId = typeof insertResult === 'object' && !Array.isArray(insertResult)
        ? insertResult.id
        : Array.isArray(insertResult)
          ? insertResult[0]?.id || insertResult[0]
          : insertResult;
    } catch (err) {
      // Unique idempotency index race: return the already-stored notification.
      const duplicate = await this.findByIdempotencyKey(idempotencyKey, dbClient);
      if (duplicate) {
        return {
          notificationId: duplicate.id,
          event: normalizedEvent,
          deliveryStatus: duplicate.delivery_status,
          channel: duplicate.channel,
          duplicate: true,
          skipped: true,
          reason: 'DUPLICATE_IDEMPOTENCY_KEY',
        };
      }
      throw err;
    }

    if (recipient) {
      const body = this.buildMessageBody({ title, message });
      let sendResult;

      try {
        sendResult = await this.deliverWithRetry(recipient, body, {
          templateName,
          templateParams,
          language,
        });
      } catch (err) {
        sendResult = {
          success: false,
          deliveryStatus: 'FAILED',
          providerResponse: err.message,
          attempts: 1,
        };
      }

      deliveryStatus = sendResult.deliveryStatus || 'FAILED';
      providerResponse = sendResult.providerResponse || null;
      providerMessageId = sendResult.messageId || null;

      await dbClient('notification_logs').where({ id: notificationId }).update({
        delivery_status: deliveryStatus,
        provider_response: providerResponse,
        provider_message_id: providerMessageId,
        delivered_at: deliveryStatus === 'DELIVERED' || deliveryStatus === 'READ' ? new Date() : null,
        read_at: deliveryStatus === 'READ' ? new Date() : null,
      });

      // Queue a limited retry for transient provider failures only.
      if (
        queueOnFailure &&
        this.isConfigured() &&
        !sendResult.success &&
        deliveryStatus === 'FAILED'
      ) {
        await this.enqueueRetry({
          notificationLogId: notificationId,
          userId: userId || user?.id,
          phone: recipient,
          event: normalizedEvent,
          title,
          message,
          templateName,
          templateParams,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}:retry` : null,
        }).catch((err) => {
          logger.warn(`[WhatsApp] Gagal memasukkan retry queue: ${err.message}`);
        });
      }
    } else {
      await dbClient('notification_logs').where({ id: notificationId }).update({
        delivery_status: deliveryStatus,
        provider_response: whatsappEnabled
          ? 'Nomor WhatsApp tidak tersedia/tidak valid.'
          : 'Pengguna mematikan notifikasi WhatsApp (opt-out).',
      });
    }

    return {
      notificationId,
      event: normalizedEvent,
      deliveryStatus,
      channel,
      recipient: recipient || null,
      provider: this.providerType,
      duplicate: false,
    };
  }

  /**
   * Send with a bounded retry policy (3 attempts) and small exponential backoff.
   */
  async deliverWithRetry(phone, body, options = {}, maxAttempts = 3) {
    let lastResult = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        lastResult = await this.provider.sendMessage(phone, body, options);
      } catch (err) {
        lastResult = {
          success: false,
          deliveryStatus: 'FAILED',
          providerResponse: err.message,
        };
      }

      if (lastResult?.success) return { ...lastResult, attempts: attempt };
      if (['NOT_CONFIGURED', 'MOCK_LOGGED'].includes(lastResult?.deliveryStatus)) {
        return { ...lastResult, attempts: attempt };
      }

      if (attempt < maxAttempts) {
        await sleep(300 * attempt);
      }
    }

    return { ...(lastResult || { deliveryStatus: 'FAILED' }), attempts: maxAttempts };
  }

  async enqueueRetry({
    notificationLogId,
    userId,
    phone,
    event,
    title,
    message,
    templateName = null,
    templateParams = null,
    idempotencyKey = null,
  }) {
    // Prevent duplicate queue rows for the same notification/retry.
    if (idempotencyKey) {
      const existing = await db('whatsapp_queue')
        .where({ idempotency_key: idempotencyKey })
        .whereIn('status', ['PENDING', 'PROCESSING'])
        .first()
        .catch(() => null);
      if (existing) return existing.id;
    }

    const insertPayload = {
      user_id: userId || null,
      phone,
      event,
      title,
      message,
      template_name: templateName || null,
      template_params: templateParams ? JSON.stringify(templateParams) : null,
      priority: 5,
      retry_count: 0,
      max_retries: 3,
      status: 'PENDING',
      scheduled_at: new Date(Date.now() + 60 * 1000),
      created_at: new Date(),
      updated_at: new Date(),
      idempotency_key: idempotencyKey || null,
    };

    // notification_log_id column may not exist on very old databases.
    try {
      const [id] = await db('whatsapp_queue').insert(
        { ...insertPayload, notification_log_id: notificationLogId },
        ['id']
      );
      return typeof id === 'object' ? id.id : id;
    } catch (err) {
      const [id] = await db('whatsapp_queue').insert(insertPayload, ['id']);
      return typeof id === 'object' ? id.id : id;
    }
  }

  async processQueue({ limit = 20 } = {}) {
    if (!this.isConfigured()) {
      return { processed: 0, sent: 0, failed: 0, reason: 'PROVIDER_NOT_CONFIGURED' };
    }

    let rows = [];
    try {
      rows = await db('whatsapp_queue')
        .where({ status: 'PENDING' })
        .where('scheduled_at', '<=', new Date())
        .whereRaw('retry_count < max_retries')
        .orderBy('priority', 'asc')
        .orderBy('id', 'asc')
        .limit(limit);
    } catch (err) {
      logger.warn(`[WhatsApp] Gagal membaca queue: ${err.message}`);
      return { processed: 0, sent: 0, failed: 0, reason: err.message };
    }

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      await db('whatsapp_queue').where({ id: row.id }).update({ status: 'PROCESSING', updated_at: new Date() });

      let params = null;
      if (row.template_params) {
        try {
          params = typeof row.template_params === 'string' ? JSON.parse(row.template_params) : row.template_params;
        } catch (err) {
          params = null;
        }
      }

      const sendResult = await this.deliverWithRetry(row.phone, row.message, {
        templateName: row.template_name,
        templateParams: params,
      });

      if (sendResult.success) {
        sent += 1;
        await db('whatsapp_queue').where({ id: row.id }).update({
          status: 'SENT',
          sent_at: new Date(),
          provider_message_id: sendResult.messageId || null,
          error_message: null,
          updated_at: new Date(),
        });

        if (row.notification_log_id) {
          await db('notification_logs').where({ id: row.notification_log_id }).update({
            delivery_status: 'SENT',
            provider_response: sendResult.providerResponse || null,
            provider_message_id: sendResult.messageId || null,
          });
        } else {
          await db('notification_logs')
            .where({ provider_message_id: sendResult.messageId || '__none__' })
            .update({ delivery_status: 'SENT' });
        }
      } else {
        failed += 1;
        const nextRetry = Number(row.retry_count || 0) + 1;
        const exhausted = nextRetry >= Number(row.max_retries || 3);
        await db('whatsapp_queue').where({ id: row.id }).update({
          status: exhausted ? 'FAILED' : 'PENDING',
          retry_count: nextRetry,
          error_message: String(sendResult.providerResponse || 'Gagal mengirim').slice(0, 1000),
          scheduled_at: exhausted ? row.scheduled_at : new Date(Date.now() + nextRetry * 60 * 1000),
          updated_at: new Date(),
        });

        if (exhausted && row.notification_log_id) {
          await db('notification_logs').where({ id: row.notification_log_id }).update({
            delivery_status: 'FAILED',
            provider_response: String(sendResult.providerResponse || 'Gagal mengirim setelah retry maksimum.'),
          });
        }
      }
    }

    return { processed: rows.length, sent, failed };
  }

  /**
   * Start a background worker that retries failed WhatsApp messages.
   * Only starts when a real provider is configured.
   */
  startQueueWorker({ intervalMs = 60 * 1000 } = {}) {
    if (!this.isConfigured() || this.queueWorker) return this.queueWorker;
    this.queueWorker = setInterval(() => {
      this.processQueue().catch((err) => logger.warn(`[WhatsApp] Queue worker error: ${err.message}`));
    }, intervalMs);
    if (typeof this.queueWorker.unref === 'function') this.queueWorker.unref();
    logger.info(`[WhatsApp] Queue worker aktif (interval ${intervalMs / 1000}s)`);
    return this.queueWorker;
  }

  stopQueueWorker() {
    if (this.queueWorker) {
      clearInterval(this.queueWorker);
      this.queueWorker = null;
    }
  }

  async getQueueStats() {
    try {
      const rows = await db('whatsapp_queue')
        .select('status')
        .count('id as c')
        .groupBy('status');
      const stats = { PENDING: 0, PROCESSING: 0, SENT: 0, FAILED: 0, CANCELLED: 0 };
      rows.forEach((row) => {
        stats[String(row.status || '').toUpperCase()] = parseInt(row.c, 10);
      });
      return stats;
    } catch (err) {
      return { PENDING: 0, PROCESSING: 0, SENT: 0, FAILED: 0, CANCELLED: 0 };
    }
  }

  /**
   * Send an admin-level notification to all authorized staff.
   * Preferences and opt-out are still respected per recipient.
   */
  async notifyAdmins({
    event,
    title,
    message,
    roles = ['ADMIN', 'OWNER'],
    excludeUserId = null,
    idempotencyKey = null,
    templateName = null,
    templateParams = null,
  }) {
    const admins = await db('users')
      .join('user_roles', 'users.id', 'user_roles.user_id')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .whereIn('roles.name', roles)
      .where('users.status', 'ACTIVE')
      .select('users.id', 'users.name')
      .distinct();

    const results = [];
    for (const admin of admins) {
      if (excludeUserId && Number(admin.id) === Number(excludeUserId)) continue;
      try {
        const result = await this.notify({
          userId: admin.id,
          event,
          title,
          message,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}:admin:${admin.id}` : null,
          templateName,
          templateParams,
        });
        results.push(result);
      } catch (err) {
        logger.warn(`[WhatsApp] Gagal mengirim notifikasi admin (user ${admin.id}): ${err.message}`);
      }
    }
    return results;
  }

  /**
   * Update delivery status from a provider webhook.
   * Supports Meta Cloud API statuses and generic gateway payloads.
   */
  async updateDeliveryStatus({ messageId, status, timestamp = new Date(), errorMessage = null }) {
    const normalized = String(status || '').toUpperCase();
    const statusMap = {
      SENT: 'SENT',
      DELIVERED: 'DELIVERED',
      READ: 'READ',
      FAILED: 'FAILED',
      UNDELIVERED: 'FAILED',
    };
    const deliveryStatus = statusMap[normalized];
    if (!deliveryStatus) return { updated: 0, ignoredStatus: normalized };

    const when = timestamp instanceof Date ? timestamp : new Date(timestamp);

    let updatedLogs = 0;
    let updatedQueue = 0;

    try {
      if (messageId) {
        const statusPayload = {
          delivery_status: deliveryStatus,
          ...(deliveryStatus === 'DELIVERED' ? { delivered_at: when } : {}),
          ...(deliveryStatus === 'READ' ? { read_at: when, delivered_at: when } : {}),
          ...(deliveryStatus === 'FAILED'
            ? { provider_response: errorMessage || 'Provider melaporkan kegagalan pengiriman.' }
            : {}),
        };

        // Always match the provider's message id first. Some gateways use
        // purely numeric ids, which must NOT be mistaken for notification_logs.id.
        updatedLogs = await db('notification_logs')
          .where({ provider_message_id: String(messageId) })
          .update(statusPayload);

        // Backward-compatible fallback for webhooks that send our internal log id.
        if (!updatedLogs && /^\d+$/.test(String(messageId))) {
          updatedLogs = await db('notification_logs')
            .where({ id: messageId })
            .update(statusPayload);
        }
      }

      if (messageId) {
        updatedQueue = await db('whatsapp_queue')
          .where({ provider_message_id: String(messageId) })
          .update({
            status: deliveryStatus === 'FAILED' ? 'FAILED' : 'SENT',
            ...(deliveryStatus === 'DELIVERED' ? { delivered_at: when } : {}),
            ...(deliveryStatus === 'FAILED' ? { error_message: errorMessage || 'Provider gagal mengirim.' } : {}),
          });
      }
    } catch (err) {
      logger.warn(`[WhatsApp] Gagal memperbarui status delivery: ${err.message}`);
    }

    return { updated: updatedLogs, queueUpdated: updatedQueue, status: deliveryStatus };
  }

  /* ==========================================================================
     Pre-configured Event Dispatchers (customer)
     ========================================================================== */

  async onDepositCompleted({
    userId,
    phone,
    customerName = null,
    invoiceNo,
    totalWeightKg,
    totalAmount,
    currentBalance = null,
    status = 'Berhasil',
    idempotencyKey = null,
    items = [],
  }) {
    const itemLines = Array.isArray(items) && items.length
      ? `\nRincian: ${items.map((it) => `${it.name || 'Sampah'} ${formatNumber(it.weightKg)} kg`).join(', ')}`
      : '';

    return this.notify({
      userId,
      phone,
      event: 'DEPOSIT_COMPLETED',
      title: 'Setoran Sampah Berhasil Dicatat 🌿',
      message:
        `${customerName ? `Halo, ${customerName}!\n\n` : ''}` +
        `Setoran sampah Anda berhasil dicatat.\n\n` +
        `ID Transaksi: ${invoiceNo}\n` +
        `Berat Sampah: ${formatNumber(totalWeightKg)} kg${itemLines}\n` +
        `Total Nilai: ${formatRupiah(totalAmount)}\n` +
        `Status: ${status}\n` +
        (currentBalance !== null ? `Saldo Tabungan Sekarang: ${formatRupiah(currentBalance)}\n` : '') +
        `\nTerima kasih sudah berkontribusi menjaga lingkungan! ♻️`,
      idempotencyKey: idempotencyKey || `DEPOSIT_COMPLETED:${invoiceNo}`,
      templateName: null,
    });
  }

  async onBalanceChanged({ userId, phone, changeType, amount, currentBalance, referenceId = null }) {
    return this.notify({
      userId,
      phone,
      event: 'BALANCE_CHANGED',
      title: 'Perubahan Saldo Tabungan 💳',
      message:
        `Mutasi ${changeType}: ${formatRupiah(amount)}.\n` +
        `Saldo aktif Anda saat ini: ${formatRupiah(currentBalance)}.` +
        (referenceId ? `\nReferensi: ${referenceId}` : ''),
      idempotencyKey: referenceId ? `BALANCE_CHANGED:${referenceId}` : null,
    });
  }

  async onWithdrawalSubmitted({ userId, phone, ticketNo, amount }) {
    return this.notify({
      userId,
      phone,
      event: 'WITHDRAWAL_SUBMITTED',
      title: 'Pengajuan Penarikan Diterima ⏳',
      message:
        `Pengajuan penarikan ${ticketNo} sebesar ${formatRupiah(amount)} sedang menunggu persetujuan pengelola.\n` +
        `Anda akan menerima notifikasi berikutnya setelah status berubah.`,
      idempotencyKey: `WITHDRAWAL_SUBMITTED:${ticketNo}`,
    });
  }

  async onWithdrawalApproved({ userId, phone, ticketNo, amount, method, currentBalance = null }) {
    return this.notify({
      userId,
      phone,
      event: 'WITHDRAWAL_APPROVED',
      title: 'Penarikan Saldo Disetujui & Cair ✅',
      message:
        `Penarikan saldo ${ticketNo} sebesar ${formatRupiah(amount)} (${method || 'sesuai metode'}) telah disetujui dan dicairkan.` +
        (currentBalance !== null ? `\nSaldo tabungan tersisa: ${formatRupiah(currentBalance)}.` : ''),
      idempotencyKey: `WITHDRAWAL_APPROVED:${ticketNo}`,
    });
  }

  async onWithdrawalRejected({ userId, phone, ticketNo, reason }) {
    return this.notify({
      userId,
      phone,
      event: 'WITHDRAWAL_REJECTED',
      title: 'Penarikan Saldo Ditolak ⚠️',
      message:
        `Pengajuan ${ticketNo} ditolak dengan alasan: "${reason}".\n` +
        `Saldo tabungan Anda tetap aman dan tidak berkurang.`,
      idempotencyKey: `WITHDRAWAL_REJECTED:${ticketNo}`,
    });
  }

  async onRewardRedeemed({ userId, phone, rewardTitle, pointsSpent, redemptionNo }) {
    return this.notify({
      userId,
      phone,
      event: 'REWARD_REDEMPTION',
      title: 'Penukaran Hadiah Berhasil 🎉',
      message:
        `Penukaran ${redemptionNo} untuk "${rewardTitle}" (${formatNumber(pointsSpent)} Poin) berhasil diajukan.\n` +
        `Silakan ambil hadiah di loket Bank Sampah dengan menunjukkan nomor tiket tersebut.`,
      idempotencyKey: `REWARD_REDEMPTION:${redemptionNo}`,
    });
  }

  async onRewardStatusChanged({ userId, phone, rewardTitle, redemptionNo, status, reason = null }) {
    const isCollected = String(status).toUpperCase() === 'COLLECTED';
    return this.notify({
      userId,
      phone,
      event: 'REWARD_STATUS_CHANGED',
      title: isCollected ? 'Hadiah Telah Diserahkan 🎁' : 'Penukaran Hadiah Dibatalkan ℹ️',
      message: isCollected
        ? `Hadiah "${rewardTitle}" untuk tiket ${redemptionNo} telah diserahkan. Terima kasih telah menabung sampah!`
        : `Penukaran ${redemptionNo} untuk "${rewardTitle}" dibatalkan${reason ? `: ${reason}` : '.'}\nPoin Anda telah dikembalikan.`,
      idempotencyKey: `REWARD_STATUS:${redemptionNo}:${String(status).toUpperCase()}`,
    });
  }

  async onAchievementUnlocked({ userId, phone, badgeName, badgeDescription }) {
    return this.notify({
      userId,
      phone,
      event: 'ACHIEVEMENT_UNLOCKED',
      title: 'Lencana Baru Terbuka! 🏆',
      message: `Selamat! Anda meraih lencana "${badgeName}": ${badgeDescription || 'Pencapaian baru'}.\nTeruskan kontribusi hijau Anda!`,
      idempotencyKey: `ACHIEVEMENT_UNLOCKED:${userId}:${badgeName}`,
    });
  }

  /* ==========================================================================
     Pre-configured Event Dispatchers (admin)
     ========================================================================== */

  async onAdminNewDeposit({ invoiceNo, customerName, totalWeightKg, totalAmount, branchName = null }) {
    return this.notifyAdmins({
      event: 'ADMIN_NEW_DEPOSIT',
      title: 'Transaksi Setoran Baru Tercatat 📥',
      message:
        `Setoran baru telah dicatat.\n\n` +
        `ID Transaksi: ${invoiceNo}\n` +
        `Nasabah: ${customerName || '-'}\n` +
        `Berat: ${formatNumber(totalWeightKg)} kg\n` +
        `Nilai: ${formatRupiah(totalAmount)}` +
        (branchName ? `\nCabang: ${branchName}` : ''),
      idempotencyKey: `ADMIN_NEW_DEPOSIT:${invoiceNo}`,
    });
  }

  async onAdminWithdrawalRequest({ ticketNo, customerName, amount, method = 'CASH' }) {
    return this.notifyAdmins({
      event: 'ADMIN_WITHDRAWAL_REQUEST',
      title: 'Pengajuan Penarikan Baru Menunggu Persetujuan ⏳',
      message:
        `Nasabah ${customerName || '-'} mengajukan penarikan saldo.\n\n` +
        `No. Pengajuan: ${ticketNo}\n` +
        `Jumlah: ${formatRupiah(amount)}\n` +
        `Metode: ${method}\n\n` +
        `Silakan buka menu Penarikan untuk meninjau dan menyetujui.`,
      idempotencyKey: `ADMIN_WITHDRAWAL_REQUEST:${ticketNo}`,
    });
  }

  async onAdminRewardRequest({ redemptionNo, customerName, rewardTitle, pointsSpent }) {
    return this.notifyAdmins({
      event: 'ADMIN_REWARD_REQUEST',
      title: 'Pengajuan Penukaran Reward Baru 🎁',
      message:
        `Nasabah ${customerName || '-'} mengajukan penukaran reward.\n\n` +
        `No. Tiket: ${redemptionNo}\n` +
        `Hadiah: ${rewardTitle}\n` +
        `Poin: ${formatNumber(pointsSpent)}\n\n` +
        `Silakan siapkan hadiah dan proses penyerahan di menu Gamifikasi.`,
      roles: ['ADMIN', 'OWNER', 'PETUGAS'],
      idempotencyKey: `ADMIN_REWARD_REQUEST:${redemptionNo}`,
    });
  }

  async onAdminAlert({ reference, message, severity = 'WARNING' }) {
    return this.notifyAdmins({
      event: 'ADMIN_ALERT',
      title: `Peringatan Sistem (${severity}) ⚠️`,
      message: message || 'Terjadi aktivitas sistem yang membutuhkan perhatian admin.',
      idempotencyKey: reference ? `ADMIN_ALERT:${reference}` : null,
    });
  }
}

module.exports = new WhatsAppNotificationService();
