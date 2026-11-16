const express = require('express');
const router = express.Router();
const aiController = require('./ai.controller');
const aiConfigController = require('../../ai-config/ai-config.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { optionalAuth } = require('../../middlewares/optional_auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');
const { uploadWasteImage } = require('../../middlewares/upload.middleware');
const { createRateLimiter } = require('../../middlewares/rate_limit.middleware');

const aiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30, // max 30 AI inferences per minute
  message: 'Batas frekuensi analisis AI tercapai. Silakan coba lagi sebentar.',
});

// Routes that require authentication (Vision, Confirmation)
const authRouter = express.Router();
authRouter.use(authenticate);

// Routes that support optional authentication (AI Assistant - works for guests too)
const optionalAuthRouter = express.Router();
optionalAuthRouter.use(optionalAuth);

// Public check of AI status (no secrets exposed)
optionalAuthRouter.get('/status', aiController.getStatus);

// Vision Inference (Petugas, Owner, Admin only)
authRouter.post(
  ['/analyze', '/analyze-waste'],
  requireRoles('ADMIN', 'OWNER', 'PETUGAS'),
  aiLimiter,
  uploadWasteImage,
  aiController.analyzeWaste
);

// Human-in-the-loop confirmation
authRouter.post(
  ['/confirm', '/confirm-recommendation'],
  requireRoles('ADMIN', 'OWNER', 'PETUGAS'),
  aiController.confirmRecommendation
);

// Natural Language AI Assistant Query (All roles + guests, data filtered by RBAC)
optionalAuthRouter.post(
  ['/assistant', '/assistant/query'],
  aiLimiter,
  aiController.askAssistant
);

// AI Config Management (Admin & Pustakawan - untuk mengatur API key & model)
optionalAuthRouter.get(
  '/config',
  requireRoles('ADMIN', 'PUSTAKAWAN', 'OWNER'),
  aiConfigController.getConfig
);
optionalAuthRouter.put(
  '/config',
  requireRoles('ADMIN', 'PUSTAKAWAN', 'OWNER'),
  aiConfigController.updateConfig
);
optionalAuthRouter.post(
  '/config/test',
  requireRoles('ADMIN', 'PUSTAKAWAN', 'OWNER'),
  aiConfigController.testModel
);
optionalAuthRouter.post(
  '/config/reset-env',
  requireRoles('ADMIN', 'PUSTAKAWAN', 'OWNER'),
  aiConfigController.resetToEnv
);

// Mount routers
router.use('/', optionalAuthRouter);
router.use('/', authRouter);

module.exports = router;
