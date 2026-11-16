const express = require('express');
const router = express.Router();
const chatbotController = require('./chatbot.controller');
const { optionalAuth } = require('../../middlewares/optional_auth.middleware');
const { createRateLimiter } = require('../../middlewares/rate_limit.middleware');

const chatbotLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 40, // max 40 chatbot queries per minute per IP
  message: 'Batas frekuensi chat AI tercapai. Silakan coba lagi dalam 1 menit.',
});

// All routes support optional authentication (public visitors + logged-in users)
router.use(optionalAuth);

// Status route
router.get('/status', chatbotController.getStatus);

// Suggestions route
router.get('/suggestions', chatbotController.getSuggestions);

// Send message
router.post(
  ['/message', '/chat', '/query'],
  chatbotLimiter,
  chatbotController.sendMessage
);

module.exports = router;
