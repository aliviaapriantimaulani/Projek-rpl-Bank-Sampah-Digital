const express = require('express');
const salesController = require('./sales.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

// Revenue summary (Owner, Admin)
router.get('/summary', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  salesController.getRevenueSummary(req, res, next)
);

// List and view sales (Owner, Petugas, Admin)
router.get('/', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  salesController.getAllSales(req, res, next)
);
router.get('/:id', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  salesController.getSaleDetail(req, res, next)
);

// Create waste sale (Owner, Petugas, Admin)
router.post('/', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  salesController.createSale(req, res, next)
);

module.exports = router;
