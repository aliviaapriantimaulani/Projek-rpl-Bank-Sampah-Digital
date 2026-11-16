const express = require('express');
const inventoryController = require('./inventory.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate, requireRoles('ADMIN', 'OWNER', 'PETUGAS'));

router.get('/', (req, res, next) => inventoryController.getInventory(req, res, next));
router.get('/movements', (req, res, next) => inventoryController.getMovements(req, res, next));

module.exports = router;
