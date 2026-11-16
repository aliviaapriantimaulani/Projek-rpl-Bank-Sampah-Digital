const express = require('express');
const authController = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Public routes
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/register-nasabah', (req, res, next) => authController.registerNasabah(req, res, next));
router.post('/logout', (req, res, next) => authController.logout(req, res, next));

// Protected routes (requires valid token)
router.get('/me', authenticate, (req, res, next) => authController.getMe(req, res, next));
router.put('/profile', authenticate, (req, res, next) => authController.updateProfile(req, res, next));
router.put('/password', authenticate, (req, res, next) => authController.changePassword(req, res, next));

module.exports = router;
