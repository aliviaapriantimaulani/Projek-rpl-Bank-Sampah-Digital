const express = require('express');
const financeController = require('./finance.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

// Financial summary (Owner and Admin)
router.get('/summary', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  financeController.getFinancialSummary(req, res, next)
);

// Pending withdrawals for approval (Owner and Admin)
router.get('/withdrawals/pending', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  financeController.getPendingWithdrawals(req, res, next)
);

// Approve & Reject withdrawals (Owner and Admin)
router.post('/withdrawals/:id/approve', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  financeController.approveWithdrawal(req, res, next)
);
router.post('/withdrawals/:id/reject', requireRoles('ADMIN', 'OWNER'), (req, res, next) =>
  financeController.rejectWithdrawal(req, res, next)
);

// Ledger & wallet balance (All authenticated roles; Nasabah gets own, staff can inspect)
router.get('/wallet', (req, res, next) =>
  financeController.getCustomerWalletLedger(req, res, next)
);
router.get('/wallet/:customerId', (req, res, next) =>
  financeController.getCustomerWalletLedger(req, res, next)
);

// Request withdrawal, PIN, and OTP (Nasabah only)
router.post('/wallet/pin', requireRoles('NASABAH'), (req, res, next) =>
  financeController.setupPin(req, res, next)
);
router.post('/wallet/request-otp', requireRoles('NASABAH'), (req, res, next) =>
  financeController.requestOtp(req, res, next)
);
router.post('/withdrawals/request', requireRoles('NASABAH'), (req, res, next) =>
  financeController.requestWithdrawal(req, res, next)
);

module.exports = router;
