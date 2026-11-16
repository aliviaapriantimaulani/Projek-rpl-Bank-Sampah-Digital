/**
 * Chatbot Controller - Handles client queries with the DB-aware AI assistant.
 *
 * The assistant layer answers operational questions from the database with
 * strict RBAC and falls back to the general-knowledge model only when no
 * deterministic intent matches. Keeping one pipeline avoids divergent answers
 * between `/chatbot/message` and `/ai/assistant`.
 */

const nousChatbotService = require('../../services/ai/nous_chatbot.service');
const aiAssistantService = require('../../services/ai/ai_assistant.service');

class ChatbotController {
  /**
   * POST /api/v1/chatbot/message
   * Send question and receive intelligent reply from Nous Research AI
   */
  async sendMessage(req, res) {
    const rawMessage = req.body.message || req.body.query || req.body.question;
    const history = req.body.history || [];

    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
      return apiResponse.error(res, 'Pesan pertanyaan tidak boleh kosong.', 400);
    }

    // Resolusi user context dari token JWT (req.user) dan session client (req.body)
    const clientUser = req.body.userContext || req.body.user || {};
    const rawRole = req.user?.role || clientUser?.role || (req.user ? 'USER' : 'GUEST');
    const userRole = String(rawRole).toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    // Validasi model AI: hanya admin yang boleh menentukan model custom
    const requestedModel = req.body.model || req.body.aiModel || null;
    const effectiveModel = isAdmin ? requestedModel : null; // Non-admin forced to default

    const effectiveUser = (req.user || clientUser?.id || clientUser?.id_user || clientUser?.name)
      ? {
          ...(clientUser || {}),
          ...(req.user || {}),
          id: req.user?.id || clientUser?.id || clientUser?.id_user || null,
          id_user: req.user?.id || clientUser?.id_user || clientUser?.id || null,
          name: req.user?.name || clientUser?.name || 'Pengguna',
          role: userRole,
          isAdmin: isAdmin,
          email: req.user?.email || clientUser?.email || '',
        }
      : null;

    try {
      const result = await nousChatbotService.chat({
        message: rawMessage.trim(),
        history: Array.isArray(history) ? history : [],
        user: effectiveUser,
      });

      const answer = String(result.reply || '').trim();
      if (!answer) {
        throw new Error('Asisten AI tidak menghasilkan jawaban.');
      }

      // Map Nous chat response to controller response format
      const source = result.source === 'DATABASE_TOOL' ? 'DATABASE_TOOL' : 'GENERAL_KNOWLEDGE';
      const functionCall = result.functionCall ? {
        tool: result.functionCall.tool,
        arguments: result.functionCall.arguments,
        data: result.functionCall.data,
      } : null;

      return apiResponse.success(res, 'Pesan berhasil diproses oleh Asisten AI', {
        answer,
        reply: answer,
        // Provider identity is kept for compatibility with existing clients/tests.
        provider: result.provider || 'Nous Research',
        model: result.model || 'nous-general-knowledge',
        authorized: result.authorized !== false,
        source: source,
        functionCall: functionCall,
        roleAccess: effectiveUser?.role === 'ADMIN' ? 'ADMIN_FULL_ACCESS' : (effectiveUser ? 'AUTHENTICATED_RESTRICTED' : 'GUEST'),
        user: effectiveUser ? { id: effectiveUser.id, name: effectiveUser.name, role: effectiveUser.role } : null,
        // Model enforcement: non-admin cannot override model
        modelEnforced: !isAdmin && requestedModel ? true : false,
      });
    } catch (err) {
      console.error('[ChatbotController] Error handling message:', err);
      return apiResponse.error(res, `Gagal memproses pesan: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/chatbot/status
   * Safe status check
   */
  async getStatus(req, res) {
    try {
      const status = nousChatbotService.getStatus();
      return apiResponse.success(res, 'Status integrasi Nous Research AI berhasil dimuat', status);
    } catch (err) {
      return apiResponse.error(res, err.message, 500);
    }
  }

  /**
   * GET /api/v1/chatbot/suggestions
   * Context-sensitive prompt chips
   */
  async getSuggestions(req, res) {
    const userRole = (req.user?.role || req.query.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const isOwner = userRole === 'OWNER';
    const isPetugas = userRole === 'PETUGAS';
    const isNasabah = userRole === 'NASABAH';

    let suggestions = [
      'Halo! Siapa kamu dan apa yang bisa kamu bantu?',
      'Berapa harga sampah botol plastik saat ini?',
      'Bagaimana cara menabung sampah di Bank Sampah Digital?',
      'Kategori sampah apa yang paling mahal harganya?',
      'Tips memilah sampah plastik di rumah agar layak setor'
    ];

    if (isAdmin) {
      suggestions = [
        'Siapa saya dan apa peran saya?',
        'Ada berapa user dan nasabah terdaftar di database?',
        'Berapa total transaksi setoran sampah saat ini?',
        'Berapa stok persediaan sampah di gudang?',
        'Tampilkan ringkasan statistik sistem Bank Sampah Digital'
      ];
    } else if (isNasabah) {
      suggestions = [
        'Siapa saya dan apa peran saya?',
        'Berapa saldo tabungan dan poin saya saat ini?',
        'Berapa harga sampah botol plastik & kardus?',
        'Bagaimana cara menukarkan poin reward hijau?',
        'Apa saja syarat penarikan saldo (tarik tunai)?'
      ];
    } else if (isOwner) {
      suggestions = [
        'Berapa harga beli vs jual sampah ke mitra pengepul?',
        'Kategori sampah apa yang memiliki margin keuntungan terbesar?',
        'Bagaimana cara meningkatkan partisipasi nasabah warga?',
        'Berapa estimasi reduksi emisi karbon per kg sampah?'
      ];
    } else if (isPetugas) {
      suggestions = [
        'Kriteria kualitas botol plastik PET bersih yang siap timbang',
        'Berapa harga per kg untuk kardus bekas dan kertas HVS?',
        'Tips verifikasi kebersihan sampah dari nasabah',
        'Bagaimana alur pencatatan setoran sampah'
      ];
    }

    return apiResponse.success(res, 'Daftar saran pertanyaan AI berhasil dimuat', suggestions);
  }
}

module.exports = new ChatbotController();
