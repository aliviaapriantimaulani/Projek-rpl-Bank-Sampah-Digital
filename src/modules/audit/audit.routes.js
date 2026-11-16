const express = require('express');
const auditController = require('./audit.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate, requireRoles('ADMIN', 'OWNER'));

router.get('/', (req, res, next) => auditController.getAuditLogs(req, res, next));

module.exports = router;
