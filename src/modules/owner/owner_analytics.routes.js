const express = require('express');
const router = express.Router();
const ownerAnalyticsController = require('./owner_analytics.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

// All Owner Analytics routes require authentication and ADMIN or OWNER role
router.use(authenticate);
router.use(requireRoles('ADMIN', 'OWNER'));

router.get('/overview', ownerAnalyticsController.getOverview);
router.get('/charts', ownerAnalyticsController.getChartsData);
router.get('/insights', ownerAnalyticsController.getInsights);
router.get('/reports/:type', ownerAnalyticsController.getReport);

module.exports = router;
