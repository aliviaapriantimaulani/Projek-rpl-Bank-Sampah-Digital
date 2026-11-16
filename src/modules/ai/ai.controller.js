const { AiVisionService } = require('../../services/ai/ai_vision.service');
const aiAssistantService = require('../../services/ai/ai_assistant.service');
const apiResponse = require('../../utils/apiResponse');
const { recordAuditLog } = require('../../middlewares/audit.middleware');
const { cleanupTempFile } = require('../../middlewares/upload.middleware');

const aiVisionService = new AiVisionService();

class AiController {
  /**
   * GET /api/v1/ai/status
   * Safe status endpoint: tells frontend if AI is active without exposing secret keys
   */
  async getStatus(req, res) {
    try {
      const info = aiVisionService.getProviderInfo();
      return apiResponse.success(res, 'Status integrasi AI berhasil dimuat', info);
    } catch (err) {
      return apiResponse.error(res, err.message, 500);
    }
  }

  /**
   * POST /api/v1/ai/analyze-waste
   * Uploads photo, validates file, executes AI Vision inference,
   * generates category, quality, confidence, and recommended price.
   */
  async analyzeWaste(req, res) {
    const file = req.file;
    if (!file) {
      return apiResponse.error(res, 'Foto sampah wajib disertakan dalam permintaan.', 400);
    }

    try {
      const result = await aiVisionService.analyzeAndRecommend({
        filePath: file.path,
        mimeType: file.mimetype,
        imageHash: file.sha256,
        userId: req.user.id,
        branchId: req.user.branch_id || 1,
      });

      await recordAuditLog({
        userId: req.user.id,
        action: 'AI_VISION_INFERENCE',
        entityName: 'ai_analysis_records',
        entityId: result.aiRecordId,
        newValues: {
          category: result.detectedCategory,
          confidence: result.confidenceScore,
          recommendedPrice: result.aiRecommendedPrice,
        },
        req,
      });

      return apiResponse.success(res, 'Analisis AI foto sampah berhasil dilakukan', result, 201);
    } catch (err) {
      // If AI is not configured, send clear 503 so UI can fallback to manual entry
      if (err.name === 'AIProviderNotConfiguredError' || err.code === 'AI_NOT_CONFIGURED') {
        cleanupTempFile(file.path);
        return apiResponse.error(
          res,
          err.message,
          503,
          { fallbackToManual: true, providerConfigured: false }
        );
      }

      cleanupTempFile(file.path);
      return apiResponse.error(res, `Gagal memproses analisis AI: ${err.message}`, 500);
    }
  }

  /**
   * POST /api/v1/ai/confirm-recommendation
   * Human-in-the-loop: Staff reviews and confirms or overrides AI recommendation.
   */
  async confirmRecommendation(req, res) {
    const { aiRecordId, verifiedCategoryId, confirmedPrice, auditorNotes } = req.body;

    if (!aiRecordId) {
      return apiResponse.error(res, 'ID catatan AI (aiRecordId) wajib disertakan.', 400);
    }

    try {
      const confirmation = await aiVisionService.confirmRecommendation({
        aiRecordId: parseInt(aiRecordId, 10),
        verifiedCategoryId: verifiedCategoryId ? parseInt(verifiedCategoryId, 10) : null,
        confirmedPrice: confirmedPrice !== undefined ? parseFloat(confirmedPrice) : null,
        auditorNotes,
        userId: req.user.id,
      });

      await recordAuditLog({
        userId: req.user.id,
        action: confirmation.isPriceOverridden || confirmation.isCategoryModified
          ? 'AI_RECOMMENDATION_MODIFIED'
          : 'AI_RECOMMENDATION_ACCEPTED',
        entityName: 'ai_analysis_records',
        entityId: aiRecordId,
        newValues: confirmation,
        req,
      });

      return apiResponse.success(res, 'Konfirmasi keputusan petugas berhasil dicatat', confirmation);
    } catch (err) {
      return apiResponse.error(res, err.message, 400);
    }
  }

  /**
   * POST /api/v1/ai/assistant/query
   * Natural Language Assistant Query Layer
   */
  async askAssistant(req, res) {
    const rawQuery = req.body.query || req.body.question || req.body.message;
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return apiResponse.error(res, 'Bidang pertanyaan (query) tidak boleh kosong.', 400);
    }

    // Resolusi user context dari token JWT (req.user) dan session client (req.body)
    const clientUser = req.body.userContext || req.body.user || {};
    const rawRole = req.user?.role || clientUser?.role || (req.user ? 'USER' : 'GUEST');
    const userRole = String(rawRole).toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const effectiveUser = {
      ...(clientUser || {}),
      ...(req.user || {}),
      id: req.user?.id || clientUser?.id || clientUser?.id_user || null,
      id_user: req.user?.id || clientUser?.id_user || clientUser?.id || null,
      name: req.user?.name || clientUser?.name || 'Pengguna',
      role: userRole,
      isAdmin: isAdmin,
      email: req.user?.email || clientUser?.email || '',
    };

    try {
      const cleanQuery = rawQuery.trim();
      const response = await aiAssistantService.processQuery({
        query: cleanQuery,
        user: effectiveUser,
        history: req.body.history || [],
      });

      return apiResponse.success(res, 'Jawaban asisten AI berhasil diproses', {
        ...response,
        source: response.source || (response.intent === 'GENERAL_KNOWLEDGE' ? 'GENERAL_KNOWLEDGE' : 'DATABASE_TOOL'),
        functionCall: response.functionCall || null,
        roleAccess: effectiveUser.role === 'ADMIN' ? 'ADMIN_FULL_ACCESS' : (effectiveUser.role !== 'GUEST' ? 'AUTHENTICATED_RESTRICTED' : 'GUEST'),
        user: effectiveUser.role !== 'GUEST' ? { id: effectiveUser.id, name: effectiveUser.name, role: effectiveUser.role } : null,
      });
    } catch (err) {
      return apiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = new AiController();
