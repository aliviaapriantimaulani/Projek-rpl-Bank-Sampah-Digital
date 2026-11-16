const ownerAnalyticsService = require('./owner_analytics.service');
const aiInsightsService = require('../../services/ai/ai_insights.service');
const apiResponse = require('../../utils/apiResponse');

class OwnerAnalyticsController {
  /**
   * GET /api/v1/owner/analytics/overview
   */
  async getOverview(req, res) {
    try {
      const overview = await ownerAnalyticsService.getOverview();
      return apiResponse.success(res, 'Ringkasan eksekutif dasbor berhasil dimuat', overview);
    } catch (err) {
      return apiResponse.error(res, `Gagal memuat ringkasan eksekutif: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/owner/analytics/charts
   */
  async getChartsData(req, res) {
    try {
      const charts = await ownerAnalyticsService.getChartsData();
      return apiResponse.success(res, 'Data visualisasi tren berhasil dimuat', charts);
    } catch (err) {
      return apiResponse.error(res, `Gagal memuat visualisasi tren: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/owner/analytics/insights
   */
  async getInsights(req, res) {
    try {
      const insights = await aiInsightsService.generateInsights();
      return apiResponse.success(res, 'Wawasan analitik operasional berhasil diproses', insights);
    } catch (err) {
      return apiResponse.error(res, `Gagal memuat wawasan AI: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/owner/reports/:type
   */
  async getReport(req, res) {
    const reportType = req.params.type;
    try {
      const report = await ownerAnalyticsService.generateReport(reportType, req.query);
      return apiResponse.success(res, `Laporan ${reportType} berhasil dibuat`, report);
    } catch (err) {
      return apiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = new OwnerAnalyticsController();
