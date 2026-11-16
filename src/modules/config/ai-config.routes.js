const express = require('express');
const router = express.Router();
const aiConfigController = require('./ai-config.controller'); // sesuaikan path controller Anda
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

router.use(authenticate);

// Izinkan PUSTAKAWAN dan Admin untuk mengakses GET & PUT config AI
router.get('/config', requireRoles('PUSTAKAWAN', 'Admin', 'ADMINISTRATOR'), aiConfigController.getConfig);
router.put('/config', requireRoles('PUSTAKAWAN', 'Admin', 'ADMINISTRATOR'), aiConfigController.updateConfig);

module.exports = router;

