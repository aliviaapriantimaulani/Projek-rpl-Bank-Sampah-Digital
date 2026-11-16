const express = require('express');
const customersController = require('./customers.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

// Fast Lookup
router.get('/lookup', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  customersController.lookupCustomer(req, res, next)
);

// List all customers
router.get('/', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  customersController.getAllCustomers(req, res, next)
);

// Customer detail
router.get('/:id', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  customersController.getCustomerDetail(req, res, next)
);

// Register new customer by Petugas / Admin
router.post('/', requireRoles('ADMIN', 'PETUGAS'), (req, res, next) =>
  customersController.registerCustomer(req, res, next)
);

// Update customer details
router.put('/:id', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  customersController.updateCustomer(req, res, next)
);

// Change customer status (Active / Inactive / Blacklisted) - Admin & Owner only
router.patch('/:id/status', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  customersController.updateCustomerStatus(req, res, next)
);

module.exports = router;
