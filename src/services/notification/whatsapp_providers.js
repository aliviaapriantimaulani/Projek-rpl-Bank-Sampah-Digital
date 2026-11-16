/**
 * WhatsApp provider adapters for Bank Sampah Digital.
 *
 * Supported providers:
 *  - meta    : WhatsApp Business Platform (Meta Cloud API) — official
 *  - twilio  : Twilio WhatsApp API (official BSP integration)
 *  - fonnte  : Indonesian WhatsApp gateway
 *  - wablas  : Indonesian WhatsApp gateway
 *  - none    : intentionally not configured (no message is sent)
 *  - mock    : local testing only (no message is sent)
 *
 * Security rules:
 *  - Credentials only come from environment variables.
 *  - Tokens are never written to logs or provider_response.
 *  - No unofficial WhatsApp Web automation is used.
 */

const env = require('../../config/env');
const logger = require('../../config/logger');

class BaseWhatsAppProvider {
  get name() {
    return this.constructor.name;
  }

  get configured() {
    return false;
  }

  /**
   * @param {string} phone - Normalized phone (e.g. 628123456789)
   * @param {string} message - Plain text message body
   * @param {Object} [options] - { templateName, templateParams, language }
   * @returns {Promise<{success:boolean,deliveryStatus:string,providerResponse:string,messageId?:string}>}
   */
  async sendMessage(phone, message, options = {}) {
    throw new Error('Metode sendMessage() wajib diimplementasikan.');
  }
}

/**
 * Normalize Indonesian phone numbers to international format (62xxxxxxxxxx).
 * Returns null when the number is not a plausible WhatsApp number.
 */
function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  let digits = String(input).replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('620')) digits = '62' + digits.slice(3);
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  if (digits.startsWith('8')) digits = '62' + digits;

  // Indonesian mobile numbers: 62 + 9..12 digits => total 11..14
  if (!/^62\d{8,13}$/.test(digits)) return null;
  return digits;
}

function truncate(value, max = 1000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return { error: { message: `Respons provider tidak valid (HTTP ${response.status})` } };
  }
}

/**
 * Meta WhatsApp Business Platform (Cloud API) — official provider.
 */
class MetaCloudWhatsAppProvider extends BaseWhatsAppProvider {
  constructor({ accessToken, phoneNumberId, apiVersion, requireTemplate }) {
    super();
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.apiVersion = apiVersion || 'v21.0';
    this.requireTemplate = requireTemplate === true || String(requireTemplate) === 'true';
  }

  get configured() {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  async sendMessage(phone, message, options = {}) {
    if (!this.configured) {
      return {
        success: false,
        deliveryStatus: 'NOT_CONFIGURED',
        providerResponse:
          'Meta WhatsApp Cloud API belum dikonfigurasi. Set WHATSAPP_ACCESS_TOKEN dan WHATSAPP_PHONE_NUMBER_ID.',
      };
    }

    const to = normalizePhone(phone);
    if (!to) {
      return { success: false, deliveryStatus: 'FAILED', providerResponse: 'Nomor WhatsApp tidak valid.' };
    }

    const templateName = options.templateName || null;

    if (!templateName && this.requireTemplate) {
      return {
        success: false,
        deliveryStatus: 'FAILED',
        providerResponse:
          'Provider mewajibkan template resmi (WHATSAPP_REQUIRE_TEMPLATE=true), tetapi templateName tidak tersedia untuk event ini.',
      };
    }

    let payload;
    if (templateName) {
      const params = Array.isArray(options.templateParams) ? options.templateParams : [];
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: options.language || 'id' },
          ...(params.length
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: params.map((value) => ({ type: 'text', text: String(value) })),
                  },
                ],
              }
            : {}),
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message },
      };
    }

    try {
      const response = await fetchWithTimeout(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await readJson(response);
      const messageId = data?.messages?.[0]?.id || null;
      const errorMessage =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        (response.ok ? null : `HTTP ${response.status}`);

      return {
        success: response.ok && Boolean(messageId || data?.messages),
        deliveryStatus: response.ok ? 'SENT' : 'FAILED',
        providerResponse: truncate({
          httpStatus: response.status,
          messageId,
          error: errorMessage,
        }),
        messageId: messageId || undefined,
      };
    } catch (err) {
      logger.warn(`[WhatsApp:Meta] Gagal menghubungi Cloud API: ${err.message}`);
      return {
        success: false,
        deliveryStatus: 'FAILED',
        providerResponse: `Koneksi ke Meta Cloud API gagal: ${err.message}`,
      };
    }
  }
}

/**
 * Fonnte WhatsApp Gateway Provider (compatible gateway).
 */
class FonnteWhatsAppProvider extends BaseWhatsAppProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async sendMessage(phone, message) {
    if (!this.apiKey) {
      return {
        success: false,
        deliveryStatus: 'NOT_CONFIGURED',
        providerResponse: 'WHATSAPP_API_KEY (Fonnte) kosong.',
      };
    }

    const target = normalizePhone(phone);
    if (!target) {
      return { success: false, deliveryStatus: 'FAILED', providerResponse: 'Nomor WhatsApp tidak valid.' };
    }

    try {
      const response = await fetchWithTimeout('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target, message }),
      });

      const data = await readJson(response);
      const ok = response.ok && data.status === true;
      return {
        success: ok,
        deliveryStatus: ok ? 'SENT' : 'FAILED',
        providerResponse: truncate(data),
        messageId: data?.id ? String(data.id) : undefined,
      };
    } catch (err) {
      return {
        success: false,
        deliveryStatus: 'FAILED',
        providerResponse: `Koneksi ke Fonnte gagal: ${err.message}`,
      };
    }
  }
}

/**
 * Wablas WhatsApp Gateway Provider (compatible gateway).
 */
class WablasWhatsAppProvider extends BaseWhatsAppProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async sendMessage(phone, message) {
    if (!this.apiKey) {
      return {
        success: false,
        deliveryStatus: 'NOT_CONFIGURED',
        providerResponse: 'WHATSAPP_API_KEY (Wablas) kosong.',
      };
    }

    const target = normalizePhone(phone);
    if (!target) {
      return { success: false, deliveryStatus: 'FAILED', providerResponse: 'Nomor WhatsApp tidak valid.' };
    }

    try {
      const response = await fetchWithTimeout('https://wablas.com/api/send-message', {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: target, message }),
      });

      const data = await readJson(response);
      return {
        success: response.ok,
        deliveryStatus: response.ok ? 'SENT' : 'FAILED',
        providerResponse: truncate(data),
        messageId: data?.id ? String(data.id) : undefined,
      };
    } catch (err) {
      return {
        success: false,
        deliveryStatus: 'FAILED',
        providerResponse: `Koneksi ke Wablas gagal: ${err.message}`,
      };
    }
  }
}

/**
 * Twilio WhatsApp Provider (official API, not a placeholder).
 */
class TwilioWhatsAppProvider extends BaseWhatsAppProvider {
  constructor({ accountSid, authToken, senderNumber }) {
    super();
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.senderNumber = senderNumber;
  }

  get configured() {
    return Boolean(this.accountSid && this.authToken && this.senderNumber);
  }

  async sendMessage(phone, message) {
    if (!this.configured) {
      return {
        success: false,
        deliveryStatus: 'NOT_CONFIGURED',
        providerResponse:
          'Twilio WhatsApp belum dikonfigurasi. Set WHATSAPP_TWILIO_ACCOUNT_SID, WHATSAPP_TWILIO_AUTH_TOKEN, dan WHATSAPP_SENDER_NUMBER.',
      };
    }

    const to = normalizePhone(phone);
    if (!to) {
      return { success: false, deliveryStatus: 'FAILED', providerResponse: 'Nomor WhatsApp tidak valid.' };
    }

    const from = normalizePhone(this.senderNumber);
    if (!from) {
      return { success: false, deliveryStatus: 'FAILED', providerResponse: 'WHATSAPP_SENDER_NUMBER tidak valid.' };
    }

    try {
      const body = new URLSearchParams({
        To: `whatsapp:+${to}`,
        From: `whatsapp:+${from}`,
        Body: message,
      });

      const response = await fetchWithTimeout(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        }
      );

      const data = await readJson(response);
      const ok = response.ok && Boolean(data.sid);
      return {
        success: ok,
        deliveryStatus: ok ? 'SENT' : 'FAILED',
        providerResponse: truncate({
          httpStatus: response.status,
          sid: data.sid,
          status: data.status,
          error: data.message,
        }),
        messageId: data?.sid || undefined,
      };
    } catch (err) {
      return {
        success: false,
        deliveryStatus: 'FAILED',
        providerResponse: `Koneksi ke Twilio gagal: ${err.message}`,
      };
    }
  }
}

/**
 * Unconfigured / mock provider. Follows the strict honesty rule:
 * never reports a real delivery when no gateway is configured.
 */
class MockLogWhatsAppProvider extends BaseWhatsAppProvider {
  constructor(mode = 'none') {
    super();
    this.mode = mode === 'mock' ? 'mock' : 'none';
  }

  get configured() {
    return false;
  }

  async sendMessage(phone, message) {
    const status = this.mode === 'mock' ? 'MOCK_LOGGED' : 'NOT_CONFIGURED';
    logger.info(
      `[WHATSAPP_${status}] target=${phone ? `${String(phone).slice(0, 6)}***` : 'n/a'} chars=${String(message || '').length}`
    );
    return {
      success: false,
      deliveryStatus: status,
      providerResponse:
        this.mode === 'mock'
          ? 'Mode mock lokal: pesan hanya dicatat, TIDAK dikirim ke WhatsApp.'
          : 'WhatsApp provider belum dikonfigurasi. Pesan hanya disimpan sebagai notifikasi lokal dan tidak dikirim.',
    };
  }
}

function createProvider(type = 'none') {
  const providerType = String(type || 'none').toLowerCase();
  switch (providerType) {
    case 'meta':
    case 'meta_cloud':
    case 'whatsapp_business':
      return new MetaCloudWhatsAppProvider({
        accessToken: env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_API_KEY,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        apiVersion: env.WHATSAPP_API_VERSION,
        requireTemplate: env.WHATSAPP_REQUIRE_TEMPLATE,
      });
    case 'twilio':
      return new TwilioWhatsAppProvider({
        accountSid: env.WHATSAPP_TWILIO_ACCOUNT_SID,
        authToken: env.WHATSAPP_TWILIO_AUTH_TOKEN || env.WHATSAPP_API_SECRET,
        senderNumber: env.WHATSAPP_SENDER_NUMBER,
      });
    case 'fonnte':
      return new FonnteWhatsAppProvider(env.WHATSAPP_API_KEY);
    case 'wablas':
      return new WablasWhatsAppProvider(env.WHATSAPP_API_KEY);
    case 'mock':
      return new MockLogWhatsAppProvider('mock');
    default:
      return new MockLogWhatsAppProvider('none');
  }
}

module.exports = {
  BaseWhatsAppProvider,
  MetaCloudWhatsAppProvider,
  FonnteWhatsAppProvider,
  WablasWhatsAppProvider,
  TwilioWhatsAppProvider,
  MockLogWhatsAppProvider,
  createProvider,
  normalizePhone,
};
