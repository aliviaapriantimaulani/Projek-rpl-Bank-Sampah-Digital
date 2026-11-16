const express = require('express');
const router = express.Router();
const gamificationController = require('./gamification.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

router.use(authenticate);

// Public leaderboard & catalog for all authenticated roles
router.get('/leaderboard', gamificationController.getLeaderboard);
router.get('/badges', gamificationController.getBadges);
router.get('/rewards', gamificationController.getRewards);
router.get('/redemptions/history', gamificationController.getRedemptionsHistory);
router.get('/redemptions/me', gamificationController.getRedemptionsHistory);
router.get(['/profile', '/my-profile'], gamificationController.getProfile);

// Nasabah specific routes
router.get('/my-badges', requireRoles('NASABAH'), gamificationController.getMyBadges);
router.post(['/redeem', '/rewards/redeem'], requireRoles('NASABAH'), gamificationController.redeemReward);

// Staff processing
router.post(
  '/redemptions/:id/process',
  requireRoles('ADMIN', 'OWNER', 'PETUGAS'),
  gamificationController.processRedemption
);

module.exports = router;
