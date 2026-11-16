/**
 * Bank Sampah Digital - Payment Processing Service Abstraction
 * Supports Cash disbursement, Bank Transfer, and pluggable Gateway Adapters
 */

class PaymentAdapter {
  async disburse(payoutData) {
    throw new Error('Method disburse() must be implemented by adapter');
  }
}

class CashPaymentAdapter extends PaymentAdapter {
  async disburse({ withdrawalId, requestNo, amount, customerName }) {
    return {
      success: true,
      status: 'COMPLETED',
      paymentReference: `CASH-${requestNo}-${Date.now().toString(36).toUpperCase()}`,
      channel: 'CASH_LOKET',
      message: `Pencairan tunai di loket sebesar Rp ${Number(amount).toLocaleString('id-ID')} berhasil diselesaikan.`,
      disbursedAt: new Date(),
    };
  }
}

class BankTransferPaymentAdapter extends PaymentAdapter {
  async disburse({ withdrawalId, requestNo, amount, bankName, accountNumber, accountHolder }) {
    // Simulated bank transfer payout gateway (e.g. Midtrans Iris / Flip / Xendit abstraction)
    const reference = `TRF-${bankName || 'BANK'}-${requestNo}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    return {
      success: true,
      status: 'COMPLETED',
      paymentReference: reference,
      channel: `BANK_TRANSFER_${bankName || 'MANDIRI'}`,
      bankName,
      accountNumber,
      accountHolder,
      message: `Transfer bank ke ${bankName} [${accountNumber} a.n ${accountHolder}] sebesar Rp ${Number(amount).toLocaleString('id-ID')} berhasil diproses.`,
      disbursedAt: new Date(),
    };
  }
}

class PaymentService {
  constructor() {
    this.adapters = {
      CASH: new CashPaymentAdapter(),
      BANK_TRANSFER: new BankTransferPaymentAdapter(),
      EWALLET: new BankTransferPaymentAdapter(), // Default to digital transfer adapter
    };
  }

  registerAdapter(method, adapter) {
    this.adapters[method.toUpperCase()] = adapter;
  }

  async processDisbursement(withdrawalRequest) {
    const method = (withdrawalRequest.method || 'CASH').toUpperCase();
    const adapter = this.adapters[method];

    if (!adapter) {
      throw new Error(`Metode pembayaran '${method}' tidak didukung oleh gateway pembayaran.`);
    }

    const payload = {
      withdrawalId: withdrawalRequest.id,
      requestNo: withdrawalRequest.request_no,
      amount: withdrawalRequest.amount,
      customerName: withdrawalRequest.customer_name || 'Nasabah',
      bankName: withdrawalRequest.bank_name || 'BANK',
      accountNumber: withdrawalRequest.bank_account_number || withdrawalRequest.account_info,
      accountHolder: withdrawalRequest.bank_account_holder || withdrawalRequest.customer_name,
    };

    return adapter.disburse(payload);
  }
}

module.exports = new PaymentService();
