const express = require('express');
const nasabahController = require('./nasabah.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate, requireRoles('NASABAH'));

router.get('/dashboard', (req, res, next) => nasabahController.getDashboardData(req, res, next));
router.put('/notifications/:id/read', (req, res, next) =>
  nasabahController.markNotificationRead(req, res, next)
);

module.exports = router;
