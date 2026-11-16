const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');
const { createRateLimiter } = require('../../middlewares/rate_limit.middleware');

const notificationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Batas frekuensi notifikasi tercapai. Silakan coba lagi sebentar.',
});

const sendLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Batas pengiriman notifikasi tercapai. Silakan coba lagi sebentar.',
});

/* ---------------------------------------------------------------------------
 * Public webhook endpoints (called by the WhatsApp provider, NOT by users).
 * These MUST be registered before the authenticate middleware.
 * ------------------------------------------------------------------------- */
router.get('/whatsapp/webhook', notificationController.verifyWebhook);
router.post('/whatsapp/webhook', notificationController.webhook);

// All routes below require authentication
router.use(authenticate);

// Provider connection status (safe, no credentials)
router.get('/provider-status', notificationLimiter, notificationController.getProviderStatus);

// Notification preferences
router.get('/preferences', notificationController.getPreferences);
router.put('/preferences', notificationController.updatePreferences);

// Notification history & stats
router.get('/history', notificationLimiter, notificationController.getHistory);
router.get('/stats', notificationLimiter, notificationController.getStats);

// Mark notification as read
router.put('/history/:id/read', notificationController.markAsRead);

// Test notification (self by default; Admin/Owner may specify a phone)
router.post('/test', sendLimiter, notificationController.sendTest);

// WhatsApp specific (authenticated manual send / queue processing)
router.post('/whatsapp/send', sendLimiter, notificationController.sendNotification);
router.post(
  '/whatsapp/process-queue',
  requireRoles('ADMIN', 'OWNER'),
  sendLimiter,
  notificationController.processQueue
);

/* ---------------------------------------------------------------------------
 * API Information & System Status (Admin only)
 * Returns consolidated system status without exposing any credentials.
 * ------------------------------------------------------------------------- */
router.get('/info', requireRoles('ADMIN'), notificationController.getSystemInfo);

module.exports = router;
