const fs = require('fs');
const path = require('path');

const aiConfigPath = path.resolve(__dirname, '../config/ai-config.json');

/**
 * GET /api/v1/ai/config
 * Get current AI configuration (API key model settings)
 * Only accessible by PUSTAKAWAN role
 */
async function getConfig(req, res) {
  try {
    if (fs.existsSync(aiConfigPath)) {
      const config = JSON.parse(fs.readFileSync(aiConfigPath, 'utf8'));
      const fileStat = fs.statSync(aiConfigPath);
      return res.json({
        success: true,
        data: {
          api_key: config.api_key ? '[Set]' : 'not set',
          model: config.model || 'meituan/longcat-2.5-preview:free',
          base_url: config.base_url || 'https://inference-api.nousresearch.com/v1',
          key_id: config.key_id ? '[Set]' : 'not set',
          timeout_ms: config.timeout_ms || 20000,
          fallback_models: config.fallback_models || [],
          last_updated: fileStat ? new Date(fileStat.mtime).toISOString() : null
        },
        message: 'Konfigurasi AI berhasil dimuat'
      });
    }

    // No config file, return .env defaults
    const env = require('../../config/env');
      return res.json({
        success: true,
        data: {
          api_key: env.NOUS_API_KEY ? '[Set]' : 'not set',
          model: env.NOUS_MODEL || 'meituan/longcat-2.5-preview:free',
          base_url: env.NOUS_API_BASE_URL || 'https://inference-api.nousresearch.com/v1',
          key_id: env.NOUS_KEY_ID ? '[Set]' : 'not set',
          timeout_ms: Number(env.NOUS_TIMEOUT_MS || 20000),
          fallback_models: [
            'meituan/longcat-2.5-preview:free',
            'poolside/laguna-s-2.1:free',
            'stepfun/step-3.7-flash:free'
          ],
          last_updated: null,
          source: 'defaults (.env)'
        },
        message: 'Menggunakan konfigurasi default dari .env'
      });
  } catch (err) {
    console.error('[AiConfig] Error reading config:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal membaca konfigurasi AI',
      error: err.message
    });
  }
}

/**
 * PUT /api/v1/ai/config
 * Update AI configuration (API key, model, etc.)
 * Only accessible by PUSTAKAWAN role
 * Body parameters: api_key, model, base_url, key_id, timeout_ms, fallback_models
 */
async function updateConfig(req, res) {
  try {
    const { api_key, model, base_url, key_id, timeout_ms, fallback_models } = req.body;

    // Validate required fields
    if (!api_key || api_key.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'API key wajib diisi'
      });
    }

    if (!model || model.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Model AI wajib diisi'
      });
    }

    // Read existing config
    let config = {};
    if (fs.existsSync(aiConfigPath)) {
      config = JSON.parse(fs.readFileSync(aiConfigPath, 'utf8'));
    }

    // Update config values
    config.api_key = api_key;
    config.model = model;
    if (base_url && base_url.trim().length > 0) {
      config.base_url = base_url;
    }
    if (key_id && key_id.trim().length > 0) {
      config.key_id = key_id;
    }
    if (timeout_ms && Number(timeout_ms) > 0) {
      config.timeout_ms = Number(timeout_ms);
    }
    if (fallback_models && Array.isArray(fallback_models)) {
      config.fallback_models = fallback_models;
    }

    // Write config file
    fs.writeFileSync(aiConfigPath, JSON.stringify(config, null, 2), 'utf8');

    // Update environment variables so the service picks up changes immediately
    process.env.NOUS_API_KEY = api_key;
    process.env.NOUS_MODEL = model;
    if (base_url && base_url.trim().length > 0) {
      process.env.NOUS_API_BASE_URL = base_url;
    }
    if (key_id && key_id.trim().length > 0) {
      process.env.NOUS_KEY_ID = key_id;
    }
    if (timeout_ms && Number(timeout_ms) > 0) {
      process.env.NOUS_TIMEOUT_MS = String(timeout_ms);
    }

    console.log('[AiConfig] Config updated by pustakawan role');

    return res.json({
      success: true,
      data: {
        api_key: '[Set]',
        model: config.model,
        base_url: config.base_url || 'https://inference-api.nousresearch.com/v1',
        key_id: config.key_id ? '[Set]' : 'not set',
        timeout_ms: config.timeout_ms || 20000,
        fallback_models: config.fallback_models || [],
        message: 'Konfigurasi AI berhasil diperbarui'
      },
      message: 'Konfigurasi AI berhasil diperbarui. Layanan AI akan membaca konfigurasi baru pada request berikutnya.'
    });
  } catch (err) {
    console.error('[AiConfig] Error updating config:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui konfigurasi AI',
      error: err.message
    });
  }
}

module.exports = {
  getConfig,
  updateConfig
};