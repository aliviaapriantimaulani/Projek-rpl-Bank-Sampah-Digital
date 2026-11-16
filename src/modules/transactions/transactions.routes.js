const express = require('express');
const transactionsController = require('./transactions.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

// Daily summary for Petugas & Owner
router.get('/daily', requireRoles('ADMIN', 'OWNER', 'PETUGAS'), (req, res, next) =>
  transactionsController.getDailyTransactions(req, res, next)
);

// Transaction receipt
router.get('/:id/receipt', (req, res, next) =>
  transactionsController.getTransactionReceipt(req, res, next)
);

// List transactions
router.get('/', (req, res, next) => transactionsController.getAllTransactions(req, res, next));
router.get('/:id', (req, res, next) => transactionsController.getTransactionDetail(req, res, next));

// Create deposit & weighing (Petugas and Admin)
router.post('/deposit', requireRoles('ADMIN', 'PETUGAS'), (req, res, next) =>
  transactionsController.createDepositTransaction(req, res, next)
);

module.exports = router;
