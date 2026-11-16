const express = require('express');
const buyersController = require('./buyers.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

// List and detail buyers (Owner, Petugas, Admin)
router.get('/', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  buyersController.getAllBuyers(req, res, next)
);
router.get('/:id', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  buyersController.getBuyerById(req, res, next)
);

// Manage buyers (Owner and Admin)
router.post('/', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  buyersController.createBuyer(req, res, next)
);
router.put('/:id', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  buyersController.updateBuyer(req, res, next)
);
router.delete('/:id', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  buyersController.deleteBuyer(req, res, next)
);

module.exports = router;
