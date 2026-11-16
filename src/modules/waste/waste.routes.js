const express = require('express');
const wasteController = require('./waste.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

// All users can view the waste catalog & prices
router.get('/categories', (req, res, next) => wasteController.getAllCategories(req, res, next));

// Only Admin and Owner can change prices
router.put('/categories/:id/price', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  wasteController.updatePrice(req, res, next)
);

module.exports = router;
