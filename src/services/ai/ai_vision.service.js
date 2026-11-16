/**
 * AI Vision & Price Recommendation Service
 * Enterprise Provider Abstraction for Computer Vision & Multimodal Waste Recognition
 * 
 * IMPORTANT: No fake/random AI responses. If no real provider is configured,
 * throws AIProviderNotConfiguredError to trigger graceful manual fallback.
 */

const fs = require('fs');
const env = require('../../config/env');
const logger = require('../../config/logger');
const db = require('../../config/database');

class AIProviderNotConfiguredError extends Error {
  constructor(message = 'Layanan AI belum dikonfigurasi pada server (.env).') {
    super(message);
    this.name = 'AIProviderNotConfiguredError';
    this.statusCode = 503;
    this.code = 'AI_NOT_CONFIGURED';
  }
}

/**
 * Base AI Vision Provider Interface
 */
class BaseAiVisionProvider {
  /**
   * @param {Object} options
   * @param {string} options.filePath
   * @param {Buffer} [options.fileBuffer]
   * @param {string} options.mimeType
   * @returns {Promise<{
   *   category: 'Plastic' | 'Paper' | 'Cardboard' | 'Metal' | 'Glass' | 'Other',
   *   confidenceScore: number,
   *   estimatedQuality: string,
   *   explanation: string,
   *   modelVersion: string,
   *   rawResponse: any
   * }>}
   */
  async classifyWasteImage(options) {
    throw new Error('Metode classifyWasteImage() wajib diimplementasikan oleh adapter AI provider.');
  }
}

/**
 * OpenAI Vision Provider (GPT-4o / GPT-4o-mini Vision)
 */
class OpenAiVisionProvider extends BaseAiVisionProvider {
  constructor(apiKey, modelName = 'gpt-4o-mini') {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async classifyWasteImage({ filePath, fileBuffer, mimeType }) {
    if (!this.apiKey) {
      throw new AIProviderNotConfiguredError('OPENAI_API_KEY belum disetel pada konfigurasi environment.');
    }

    const buffer = fileBuffer || fs.readFileSync(filePath);
    const base64Image = buffer.toString('base64');

    const prompt = `Anda adalah sistem Computer Vision Bank Sampah Digital.
Analisis foto sampah ini secara objektif. Tentukan kategori sampah, perkiraan mutu, dan alasan klasifikasi.
PILIHAN KATEGORI HANYA SALAH SATU DARI: ["Plastic", "Paper", "Cardboard", "Metal", "Glass", "Other"].
Kembalikan respon HANYA dalam format JSON valid tanpa markdown formatting:
{
  "category": "Plastic | Paper | Cardboard | Metal | Glass | Other",
  "confidenceScore": 0.95,
  "estimatedQuality": "Grade A" | "Bersih & Kering" | "Campur / Perlu Dipilah",
  "explanation": "Alasan singkat deteksi visual dalam bahasa Indonesia"
}`;

    // Direct fetch call to OpenAI Vision API without heavy external SDK
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[OPENAI_VISION_ERROR] Status: ${response.status}, Body: ${errText}`);
      throw new Error(`OpenAI Vision API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content || '{}');

    return {
      category: parsed.category || 'Other',
      confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.85,
      estimatedQuality: parsed.estimatedQuality || 'Bersih & Kering',
      explanation: parsed.explanation || 'Terdeteksi dari analisis visual model AI.',
      modelVersion: `openai:${this.modelName}`,
      rawResponse: data,
    };
  }
}

/**
 * Google Gemini Multimodal Vision Provider
 */
class GeminiVisionProvider extends BaseAiVisionProvider {
  constructor(apiKey, modelName = 'gemini-1.5-flash') {
    super();
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async classifyWasteImage({ filePath, fileBuffer, mimeType }) {
    if (!this.apiKey) {
      throw new AIProviderNotConfiguredError('GEMINI_API_KEY belum disetel pada konfigurasi environment.');
    }

    const buffer = fileBuffer || fs.readFileSync(filePath);
    const base64Image = buffer.toString('base64');

    const prompt = `Anda adalah Computer Vision Bank Sampah Digital. Klasifikasikan foto sampah ini.
Pilih satu kategori dari: ["Plastic", "Paper", "Cardboard", "Metal", "Glass", "Other"].
Balas HANYA dengan JSON valid:
{
  "category": "Plastic | Paper | Cardboard | Metal | Glass | Other",
  "confidenceScore": 0.92,
  "estimatedQuality": "Grade A" | "Bersih & Kering" | "Campur / Perlu Dipilah",
  "explanation": "Alasan singkat visual"
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[GEMINI_VISION_ERROR] Status: ${response.status}, Body: ${errText}`);
      throw new Error(`Gemini Vision API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(textResult || '{}');

    return {
      category: parsed.category || 'Other',
      confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.88,
      estimatedQuality: parsed.estimatedQuality || 'Bersih & Kering',
      explanation: parsed.explanation || 'Dianalisis melalui Gemini Multimodal API.',
      modelVersion: `gemini:${this.modelName}`,
      rawResponse: data,
    };
  }
}

/**
 * Custom On-Premise Computer Vision Provider (e.g. YOLO/PyTorch FastAPI endpoint)
 */
class CustomVisionProvider extends BaseAiVisionProvider {
  constructor(endpointUrl, apiKey = '') {
    super();
    this.endpointUrl = endpointUrl;
    this.apiKey = apiKey;
  }

  async classifyWasteImage({ filePath, fileBuffer, mimeType }) {
    if (!this.endpointUrl) {
      throw new AIProviderNotConfiguredError('CUSTOM_AI_ENDPOINT belum disetel pada konfigurasi environment.');
    }

    const buffer = fileBuffer || fs.readFileSync(filePath);
    const base64Image = buffer.toString('base64');

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_base64: base64Image,
        mime_type: mimeType || 'image/jpeg',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Custom AI Endpoint error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
      category: data.category || 'Other',
      confidenceScore: data.confidence || data.confidenceScore || 0.80,
      estimatedQuality: data.quality || data.estimatedQuality || 'Campur',
      explanation: data.explanation || 'Prediksi model Computer Vision On-Premise.',
      modelVersion: data.model_version || 'custom-cv-v1',
      rawResponse: data,
    };
  }
}

/**
 * Unconfigured Provider - Follows Null Object Pattern and strictly informs caller
 */
class UnconfiguredProvider extends BaseAiVisionProvider {
  async classifyWasteImage() {
    throw new AIProviderNotConfiguredError(
      'Penyedia model AI Vision belum diaktifkan atau belum dikonfigurasi. ' +
      'Silakan setel variabel lingkungan AI_PROVIDER ("openai", "gemini", atau "custom") ' +
      'dan sertakan API key di berkas .env untuk mengaktifkan Computer Vision otomatis.'
    );
  }
}

/**
 * AiVisionService: Coordinates AI Provider, Database Categories & Price Recommendations
 */
class AiVisionService {
  constructor() {
    this.provider = this.resolveProvider();
  }

  resolveProvider() {
    const providerType = (env.AI_PROVIDER || 'none').toLowerCase();
    switch (providerType) {
      case 'openai':
        return new OpenAiVisionProvider(env.OPENAI_API_KEY, env.OPENAI_VISION_MODEL);
      case 'gemini':
        return new GeminiVisionProvider(env.GEMINI_API_KEY, env.GEMINI_VISION_MODEL);
      case 'custom':
        return new CustomVisionProvider(env.CUSTOM_AI_ENDPOINT, env.CUSTOM_AI_API_KEY);
      default:
        return new UnconfiguredProvider();
    }
  }

  /**
   * Override provider dynamically (useful for unit tests or runtime provider switching)
   */
  setProvider(providerInstance) {
    this.provider = providerInstance;
  }

  /**
   * Check whether AI provider is actively configured
   */
  isConfigured() {
    const providerType = (env.AI_PROVIDER || 'none').toLowerCase();
    if (providerType === 'openai' && env.OPENAI_API_KEY) return true;
    if (providerType === 'gemini' && env.GEMINI_API_KEY) return true;
    if (providerType === 'custom' && env.CUSTOM_AI_ENDPOINT) return true;
    return false;
  }

  getProviderInfo() {
    return {
      isConfigured: this.isConfigured(),
      provider: env.AI_PROVIDER || 'none',
      supportedCategories: ['Plastic', 'Paper', 'Cardboard', 'Metal', 'Glass', 'Other'],
      humanInTheLoop: true,
      requiresPetugasConfirmation: true,
    };
  }

  /**
   * Main analysis method:
   * 1. Classifies image via active provider
   * 2. Maps category to database waste_categories record
   * 3. Computes recommended price based on catalog + quality multiplier
   * 4. Saves record in ai_analysis_records with UNVERIFIED status
   */
  async analyzeAndRecommend({ filePath, fileBuffer, mimeType, imageHash, userId, branchId }) {
    // Run AI classification
    const aiResult = await this.provider.classifyWasteImage({ filePath, fileBuffer, mimeType });

    // Map detected category to database record
    const categoryMapping = {
      plastic: 'PLAS',
      paper: 'KERT',
      cardboard: 'KARD',
      metal: 'LOGA',
      glass: 'KACA',
      other: 'LAIN',
    };

    const detectedKey = (aiResult.category || 'other').toLowerCase();
    const categoryCode = categoryMapping[detectedKey] || 'LAIN';

    // Fetch category and active buying price from DB
    const wasteCat = await db('waste_categories')
      .where('code', 'like', `%${categoryCode}%`)
      .first();

    let basePricePerKg = 2000; // fallback base price
    let categoryId = null;

    if (wasteCat) {
      categoryId = wasteCat.id;
      const currentPrice = await db('waste_prices')
        .where({ waste_category_id: wasteCat.id })
        .orderBy('effective_date', 'desc')
        .first();

      if (currentPrice) {
        basePricePerKg = parseFloat(currentPrice.buying_price);
      }
    }

    // Quality multiplier
    let qualityMultiplier = 1.0;
    const quality = (aiResult.estimatedQuality || '').toLowerCase();
    if (quality.includes('grade a') || quality.includes('bersih')) {
      qualityMultiplier = 1.1; // +10% premium for clean/dry sorted waste
    } else if (quality.includes('campur') || quality.includes('kotor')) {
      qualityMultiplier = 0.85; // -15% for unsorted/dirty waste
    }

    const recommendedPricePerKg = Math.round(basePricePerKg * qualityMultiplier);

    // Save AI analysis audit record (Human-in-the-loop: status is UNVERIFIED)
    const [insertedId] = await db('ai_analysis_records').insert({
      branch_id: branchId || 1,
      model_version: aiResult.modelVersion || 'unknown',
      image_hash: imageHash || null,
      detected_category_id: categoryId,
      confidence_score: aiResult.confidenceScore,
      raw_payload: JSON.stringify(aiResult.rawResponse || {}),
      verification_status: 'UNVERIFIED',
      verified_category_id: null,
      verified_by: null,
      verified_at: null,
      ai_recommended_price: recommendedPricePerKg,
      confirmed_price: null,
      quality_assessment: aiResult.estimatedQuality,
      explanation: aiResult.explanation,
      image_path: filePath || null,
      is_price_overridden: false,
      created_at: new Date(),
    });

    return {
      aiRecordId: insertedId,
      detectedCategory: aiResult.category,
      detectedCategoryId: categoryId,
      categoryName: wasteCat ? wasteCat.name : aiResult.category,
      confidenceScore: aiResult.confidenceScore,
      confidencePercentage: Math.round(aiResult.confidenceScore * 100),
      estimatedQuality: aiResult.estimatedQuality,
      aiRecommendedPrice: recommendedPricePerKg,
      baseCatalogPrice: basePricePerKg,
      explanation: aiResult.explanation,
      modelVersion: aiResult.modelVersion,
      verificationStatus: 'UNVERIFIED',
    };
  }

  /**
   * Human-in-the-loop Confirmation:
   * Petugas accepts as-is or overrides category, quality, and price.
   */
  async confirmRecommendation({ aiRecordId, verifiedCategoryId, confirmedPrice, auditorNotes, userId }) {
    const record = await db('ai_analysis_records').where({ id: aiRecordId }).first();
    if (!record) {
      throw new Error('Catatan analisis AI tidak ditemukan.');
    }

    const finalCatId = verifiedCategoryId || record.detected_category_id;
    const finalPrice = confirmedPrice !== undefined && confirmedPrice !== null
      ? parseFloat(confirmedPrice)
      : parseFloat(record.ai_recommended_price);

    const isCategoryModified = finalCatId !== record.detected_category_id;
    const isPriceModified = Math.abs(finalPrice - parseFloat(record.ai_recommended_price)) > 0.01;
    const isModified = isCategoryModified || isPriceModified;

    const verificationStatus = isModified ? 'MODIFIED' : 'ACCEPTED_AS_IS';

    await db('ai_analysis_records')
      .where({ id: aiRecordId })
      .update({
        verification_status: verificationStatus,
        verified_category_id: finalCatId,
        verified_by: userId,
        verified_at: new Date(),
        confirmed_price: finalPrice,
        is_price_overridden: isPriceModified,
        auditor_notes: auditorNotes || (isModified ? 'Petugas mengubah rekomendasi AI' : 'Dikonfirmasi sesuai rekomendasi AI'),
      });

    return {
      aiRecordId,
      verificationStatus,
      finalCategoryId: finalCatId,
      confirmedPrice: finalPrice,
      isPriceOverridden: isPriceModified,
      isCategoryModified,
      verifiedBy: userId,
      verifiedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  AiVisionService,
  BaseAiVisionProvider,
  OpenAiVisionProvider,
  GeminiVisionProvider,
  CustomVisionProvider,
  UnconfiguredProvider,
  AIProviderNotConfiguredError,
};
