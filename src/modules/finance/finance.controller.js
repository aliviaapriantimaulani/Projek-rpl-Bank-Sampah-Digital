const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { hashPassword, comparePassword } = require('../../utils/password');
const { recordAuditLog } = require('../../middlewares/audit.middleware');
const paymentService = require('../../services/payment/payment.service');
const whatsAppNotificationService = require('../../services/notification/whatsapp.service');

class FinanceController {
  async getFinancialSummary(req, res, next) {
    try {
      // 1. Total deposits paid to nasabah
      const depositStats = await db('waste_deposit_transactions')
        .where({ status: 'COMPLETED' })
        .sum('total_amount as total_deposits')
        .sum('total_weight_kg as total_waste_kg')
        .count('id as total_count')
        .first();

      // 2. Total sales to pengepul
      const salesStats = await db('waste_sales')
        .where({ payment_status: 'PAID' })
        .sum('total_amount as total_sales')
        .sum('total_weight_kg as total_sales_kg')
        .first();

      // 3. Outstanding wallet liability (Total saldo tersimpan milik nasabah)
      const walletLiability = await db('customer_wallets')
        .sum('current_balance as total_liability')
        .sum('accumulated_withdrawals as total_withdrawn')
        .first();

      // 4. Pending withdrawal requests count & sum
      const pendingWithdrawals = await db('withdrawal_requests')
        .where({ status: 'PENDING' })
        .count('id as pending_count')
        .sum('amount as pending_amount')
        .first();

      return apiResponse.success(res, 'Ringkasan finansial dan buku kas berhasil dimuat', {
        totalDepositsPaid: Number(depositStats?.total_deposits || 0),
        totalWasteProcessedKg: Number(depositStats?.total_waste_kg || 0),
        totalDepositTransactions: Number(depositStats?.total_count || 0),
        totalSalesIncome: Number(salesStats?.total_sales || 0),
        totalSalesKg: Number(salesStats?.total_sales_kg || 0),
        totalWalletLiability: Number(walletLiability?.total_liability || 0),
        totalWithdrawnDisbursed: Number(walletLiability?.total_withdrawn || 0),
        pendingWithdrawalsCount: Number(pendingWithdrawals?.pending_count || 0),
        pendingWithdrawalsAmount: Number(pendingWithdrawals?.pending_amount || 0),
      });
    } catch (error) {
      next(error);
    }
  }

  async getPendingWithdrawals(req, res, next) {
    try {
      const requests = await db('withdrawal_requests')
        .join('customers', 'withdrawal_requests.customer_id', 'customers.id')
        .join('users', 'customers.user_id', 'users.id')
        .join('customer_wallets', 'customers.id', 'customer_wallets.customer_id')
        .select(
          'withdrawal_requests.*',
          'customers.account_no',
          'customers.nik',
          'users.name as customer_name',
          'users.phone as customer_phone',
          'customer_wallets.current_balance as customer_balance'
        )
        .whereIn('withdrawal_requests.status', ['PENDING', 'PROCESSING'])
        .orderBy('withdrawal_requests.id', 'asc');

      return apiResponse.success(res, 'Daftar pengajuan penarikan pending berhasil dimuat', requests);
    } catch (error) {
      next(error);
    }
  }

  async setupPin(req, res, next) {
    try {
      if (req.user.role !== 'NASABAH' || !req.user.customer_id) {
        throw new AppError('Hanya nasabah yang dapat mengatur PIN transaksi.', 403);
      }

      const { pin } = req.body;
      if (!pin || !/^\d{6}$/.test(String(pin))) {
        throw new AppError('PIN transaksi harus berupa 6 digit angka.', 400);
      }

      const pinHash = await hashPassword(String(pin));

      await db('customers')
        .where({ id: req.user.customer_id })
        .update({
          pin_hash: pinHash,
          updated_at: new Date(),
        });

      await recordAuditLog({
        userId: req.user.id,
        action: 'TRANSACTION_PIN_UPDATED',
        entityName: 'customers',
        entityId: req.user.customer_id,
        req,
      });

      return apiResponse.success(res, 'PIN transaksi 6 digit berhasil diperbarui.');
    } catch (error) {
      next(error);
    }
  }

  async requestOtp(req, res, next) {
    try {
      if (req.user.role !== 'NASABAH') {
        throw new AppError('Hanya nasabah yang dapat meminta OTP penarikan.', 403);
      }

      const now = new Date();
      // Rate limiting: check recent active OTPs in the last 2 minutes
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      const recentOtpCount = await db('otp_codes')
        .where('user_id', req.user.id)
        .where('created_at', '>=', twoMinutesAgo)
        .count('id as c')
        .first();

      const maxAllowed = process.env.NODE_ENV === 'production' ? 5 : 100;
      if (Number(recentOtpCount?.c || 0) >= maxAllowed) {
        throw new AppError('Terlalu banyak permintaan OTP. Silakan tunggu beberapa saat.', 429);
      }

      // Generate 6-digit numeric OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeHash = await hashPassword(otpCode);
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes expiry

      await db('otp_codes').insert({
        user_id: req.user.id,
        code_hash: codeHash,
        action: 'WITHDRAWAL',
        expires_at: expiresAt,
        attempts: 0,
        is_used: false,
        created_at: now,
      });

      // Audit log
      await recordAuditLog({
        userId: req.user.id,
        action: 'OTP_REQUESTED',
        entityName: 'otp_codes',
        req,
      });

      return apiResponse.success(res, 'Kode OTP penarikan telah dikirim (berlaku 5 menit).', {
        expiresInSeconds: 300,
        // In local development / testing environment, include code for immediate testing
        previewCode: process.env.NODE_ENV === 'production' ? undefined : otpCode,
      });
    } catch (error) {
      next(error);
    }
  }

  async requestWithdrawal(req, res, next) {
    const trx = await db.transaction();
    try {
      if (req.user.role !== 'NASABAH' || !req.user.customer_id) {
        throw new AppError('Hanya nasabah terdaftar yang dapat mengajukan penarikan saldo.', 403);
      }

      const {
        amount,
        method = 'CASH',
        pin,
        otp,
        bankName,
        bankAccountNumber,
        bankAccountHolder,
        accountInfo,
      } = req.body;

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 10000) {
        throw new AppError('Minimal penarikan saldo adalah Rp 10.000.', 400);
      }

      // 1. Check customer profile and PIN
      const customer = await trx('customers').where({ id: req.user.customer_id }).first();
      if (!customer) throw new AppError('Profil nasabah tidak ditemukan.', 404);

      if (!pin) {
        throw new AppError('PIN Transaksi 6 digit wajib disertakan.', 400);
      }

      if (!customer.pin_hash) {
        throw new AppError('Anda belum mengatur PIN Transaksi. Silakan atur PIN terlebih dahulu.', 400);
      }

      const isPinValid = await comparePassword(String(pin), customer.pin_hash);
      if (!isPinValid) {
        await trx.rollback();
        await recordAuditLog({
          userId: req.user.id,
          action: 'WITHDRAWAL_PIN_FAILED',
          entityName: 'customers',
          entityId: customer.id,
          req,
        });
        throw new AppError('PIN Transaksi yang Anda masukkan salah.', 401);
      }

      // 2. Validate OTP
      if (!otp) {
        throw new AppError('Kode OTP verifikasi wajib disertakan.', 400);
      }

      const now = new Date();
      const latestOtp = await trx('otp_codes')
        .where({
          user_id: req.user.id,
          action: 'WITHDRAWAL',
          is_used: false,
        })
        .where('expires_at', '>', now)
        .orderBy('id', 'desc')
        .first();

      if (!latestOtp) {
        throw new AppError('Kode OTP tidak ditemukan atau telah kedaluwarsa. Silakan minta kode OTP baru.', 400);
      }

      if (latestOtp.attempts >= 3) {
        throw new AppError('Kode OTP telah diblokir karena terlalu banyak percobaan salah. Minta OTP baru.', 400);
      }

      const isOtpValid = await comparePassword(String(otp), latestOtp.code_hash);
      if (!isOtpValid) {
        await trx('otp_codes')
          .where({ id: latestOtp.id })
          .increment('attempts', 1);

        await trx.commit();

        await recordAuditLog({
          userId: req.user.id,
          action: 'WITHDRAWAL_OTP_FAILED',
          entityName: 'otp_codes',
          entityId: latestOtp.id,
          req,
        });
        throw new AppError('Kode OTP yang Anda masukkan salah.', 401);
      }

      // Mark OTP as used
      await trx('otp_codes').where({ id: latestOtp.id }).update({ is_used: true });

      // 3. Prevent Concurrent Duplicate / Race Condition
      // Check if customer already has a pending withdrawal request
      const existingPending = await trx('withdrawal_requests')
        .where({ customer_id: customer.id, status: 'PENDING' })
        .first();

      if (existingPending) {
        throw new AppError(
          `Anda masih memiliki pengajuan penarikan ${existingPending.request_no} yang sedang menunggu persetujuan.`,
          400
        );
      }

      // 4. Validate Balance (No negative balance allowed)
      const wallet = await trx('customer_wallets').where({ customer_id: customer.id }).first();
      if (!wallet || Number(wallet.current_balance) < numAmount) {
        throw new AppError(
          `Saldo tabungan tidak mencukupi (Saldo: Rp ${Number(wallet?.current_balance || 0).toLocaleString(
            'id-ID'
          )}, Diajukan: Rp ${numAmount.toLocaleString('id-ID')})`,
          400
        );
      }

      // 5. Validate Bank Details if BANK_TRANSFER
      const chosenMethod = method.toUpperCase();
      if (chosenMethod === 'BANK_TRANSFER') {
        if (!bankName || !bankAccountNumber || !bankAccountHolder) {
          throw new AppError(
            'Untuk transfer bank, Nama Bank, Nomor Rekening, dan Nama Pemilik Rekening wajib diisi.',
            400
          );
        }
      }

      // 6. Generate request number
      const count = await trx('withdrawal_requests').count('id as c').first();
      const seq = String(Number(count.c) + 1).padStart(4, '0');
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const requestNo = `WD-${dateStr}-${seq}`;

      const [requestId] = await trx('withdrawal_requests').insert(
        {
          request_no: requestNo,
          customer_id: customer.id,
          amount: numAmount,
          method: chosenMethod,
          bank_name: chosenMethod === 'BANK_TRANSFER' ? bankName : null,
          bank_account_number: chosenMethod === 'BANK_TRANSFER' ? bankAccountNumber : null,
          bank_account_holder: chosenMethod === 'BANK_TRANSFER' ? bankAccountHolder : null,
          account_info:
            accountInfo ||
            (chosenMethod === 'BANK_TRANSFER'
              ? `${bankName} - ${bankAccountNumber} a.n ${bankAccountHolder}`
              : 'Penarikan Tunai di Loket Bank Sampah'),
          status: 'PENDING',
          created_at: now,
        },
        ['id']
      );

      const realRequestId = typeof requestId === 'object' ? requestId.id : requestId;

      await trx.commit();

      try {
        await whatsAppNotificationService.onWithdrawalSubmitted({
          userId: customer.user_id,
          phone: customer.phone,
          ticketNo: requestNo,
          amount: numAmount,
        });
      } catch (notifErr) {
        console.warn('[FinanceController] Notifikasi pengajuan penarikan gagal:', notifErr.message);
      }

      try {
        await whatsAppNotificationService.onAdminWithdrawalRequest({
          ticketNo: requestNo,
          customerName: req.user.name,
          amount: numAmount,
          method: chosenMethod,
        });
      } catch (notifErr) {
        console.warn('[FinanceController] Notifikasi admin penarikan gagal:', notifErr.message);
      }

      await recordAuditLog({
        userId: req.user.id,
        action: 'WITHDRAWAL_REQUESTED',
        entityName: 'withdrawal_requests',
        entityId: realRequestId,
        newValues: { requestNo, amount: numAmount, method: chosenMethod },
        req,
      });

      return apiResponse.success(
        res,
        'Pengajuan penarikan berhasil diverifikasi dan dikirim ke pengelola untuk persetujuan.',
        {
          requestId: realRequestId,
          requestNo,
          amount: numAmount,
          method: chosenMethod,
          status: 'PENDING',
        },
        201
      );
    } catch (error) {
      if (!trx.isCompleted()) {
        await trx.rollback();
      }
      next(error);
    }
  }

  async approveWithdrawal(req, res, next) {
    const trx = await db.transaction();
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const request = await trx('withdrawal_requests')
        .join('customers', 'withdrawal_requests.customer_id', 'customers.id')
        .join('users', 'customers.user_id', 'users.id')
        .select(
          'withdrawal_requests.*',
          'users.name as customer_name',
          'users.phone as customer_phone',
          'users.id as user_id'
        )
        .where('withdrawal_requests.id', id)
        .first();

      if (!request) throw new AppError('Pengajuan penarikan tidak ditemukan.', 404);

      if (request.status !== 'PENDING') {
        throw new AppError(`Pengajuan ini sudah berstatus ${request.status} dan tidak dapat disetujui lagi.`, 400);
      }

      // Check customer wallet balance
      const wallet = await trx('customer_wallets').where({ customer_id: request.customer_id }).first();
      if (!wallet) throw new AppError('Dompet nasabah tidak ditemukan.', 404);

      const amountToWithdraw = Number(request.amount);
      const balanceBefore = Number(wallet.current_balance);

      if (balanceBefore < amountToWithdraw) {
        throw new AppError(
          `Saldo nasabah tidak mencukupi (Saldo: Rp ${balanceBefore.toLocaleString(
            'id-ID'
          )}, Penarikan: Rp ${amountToWithdraw.toLocaleString('id-ID')})`,
          400
        );
      }

      // Mark request as PROCESSING
      await trx('withdrawal_requests').where({ id: request.id }).update({
        status: 'PROCESSING',
        updated_at: new Date(),
      });

      // Execute payout via Payment Service Abstraction
      const payoutResult = await paymentService.processDisbursement(request);
      if (!payoutResult.success) {
        try {
          await whatsAppNotificationService.onAdminAlert({
            reference: request.request_no,
            severity: 'HIGH',
            message:
              `Pencairan penarikan ${request.request_no} sebesar Rp ${amountToWithdraw.toLocaleString('id-ID')} ` +
              `GAGAL diproses: ${payoutResult.message || 'provider pembayaran menolak'}. ` +
              'Transaksi perlu diverifikasi ulang oleh admin.',
          });
        } catch (notifErr) {
          console.warn('[FinanceController] Notifikasi admin kegagalan payout gagal:', notifErr.message);
        }
        throw new AppError(`Pemrosesan pembayaran gagal: ${payoutResult.message}`, 502);
      }

      const balanceAfter = balanceBefore - amountToWithdraw;
      const now = new Date();

      // 1. Post DEBIT entry to immutable wallet ledger
      await trx('wallet_ledger').insert({
        wallet_id: wallet.id,
        entry_type: 'DEBIT',
        amount: amountToWithdraw,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference_type: 'WITHDRAWAL',
        reference_id: request.request_no,
        description: `Pencairan tabungan sampah (${request.request_no}) via ${request.method} [Ref: ${payoutResult.paymentReference}]`,
        created_by: req.user.id,
        created_at: now,
      });

      // 2. Update wallet balance snapshot strictly based on ledger debit
      await trx('customer_wallets')
        .where({ id: wallet.id })
        .update({
          current_balance: balanceAfter,
          accumulated_withdrawals: Number(wallet.accumulated_withdrawals) + amountToWithdraw,
          last_transaction_at: now,
          updated_at: now,
        });

      // 3. Record Approval Audit
      await trx('withdrawal_approvals').insert({
        withdrawal_request_id: request.id,
        reviewed_by: req.user.id,
        status: 'APPROVED',
        notes: notes || payoutResult.message,
        processed_at: now,
      });

      // 4. Update request status to COMPLETED
      await trx('withdrawal_requests').where({ id: request.id }).update({
        status: 'COMPLETED',
        payment_reference: payoutResult.paymentReference,
        disbursed_at: payoutResult.disbursedAt || now,
        updated_at: now,
      });

      await trx.commit();

      // Notification failures must not invalidate a completed disbursement.
      try {
        await whatsAppNotificationService.onWithdrawalApproved({
          userId: request.user_id,
          phone: request.phone || request.customer_phone,
          ticketNo: request.request_no,
          amount: amountToWithdraw,
          method: payoutResult.channel,
          currentBalance: balanceAfter,
        });
      } catch (notifErr) {
        console.warn('[FinanceController] Notifikasi penarikan disetujui gagal:', notifErr.message);
      }

      await recordAuditLog({
        userId: req.user.id,
        action: 'WITHDRAWAL_APPROVED_AND_DISBURSED',
        entityName: 'withdrawal_requests',
        entityId: request.id,
        newValues: {
          requestNo: request.request_no,
          amount: amountToWithdraw,
          balanceAfter,
          paymentReference: payoutResult.paymentReference,
        },
        req,
      });

      return apiResponse.success(res, `Penarikan ${request.request_no} berhasil disetujui & dicairkan!`, {
        requestNo: request.request_no,
        amount: amountToWithdraw,
        paymentReference: payoutResult.paymentReference,
        status: 'COMPLETED',
      });
    } catch (error) {
      if (!trx.isCompleted()) {
        await trx.rollback();
      }
      next(error);
    }
  }

  async rejectWithdrawal(req, res, next) {
    const trx = await db.transaction();
    try {
      const { id } = req.params;
      const { rejectionReason } = req.body;

      if (!rejectionReason || !rejectionReason.trim()) {
        throw new AppError('Alasan penolakan penarikan wajib diisi.', 400);
      }

      const request = await trx('withdrawal_requests')
        .join('customers', 'withdrawal_requests.customer_id', 'customers.id')
        .join('users', 'customers.user_id', 'users.id')
        .select('withdrawal_requests.*', 'users.id as user_id')
        .where('withdrawal_requests.id', id)
        .first();

      if (!request) throw new AppError('Pengajuan penarikan tidak ditemukan.', 404);

      if (request.status !== 'PENDING') {
        throw new AppError(`Pengajuan ini sudah berstatus ${request.status}.`, 400);
      }

      const now = new Date();

      await trx('withdrawal_approvals').insert({
        withdrawal_request_id: request.id,
        reviewed_by: req.user.id,
        status: 'REJECTED',
        rejection_reason: rejectionReason,
        processed_at: now,
      });

      await trx('withdrawal_requests').where({ id: request.id }).update({
        status: 'REJECTED',
        notes: rejectionReason,
        updated_at: now,
      });

      await trx.commit();

      try {
        await whatsAppNotificationService.onWithdrawalRejected({
          userId: request.user_id,
          phone: request.phone || request.customer_phone,
          ticketNo: request.request_no,
          reason: rejectionReason,
        });
      } catch (notifErr) {
        console.warn('[FinanceController] Notifikasi penarikan ditolak gagal:', notifErr.message);
      }

      await recordAuditLog({
        userId: req.user.id,
        action: 'WITHDRAWAL_REJECTED',
        entityName: 'withdrawal_requests',
        entityId: request.id,
        newValues: { requestNo: request.request_no, rejectionReason },
        req,
      });

      return apiResponse.success(res, `Pengajuan penarikan ${request.request_no} telah ditolak.`);
    } catch (error) {
      if (!trx.isCompleted()) {
        await trx.rollback();
      }
      next(error);
    }
  }

  async getCustomerWalletLedger(req, res, next) {
    try {
      let customerId;
      if (req.user.role === 'NASABAH') {
        customerId = req.user.customer_id;
      } else {
        customerId = req.params.customerId;
      }

      if (!customerId) throw new AppError('Customer ID tidak valid.', 400);

      const wallet = await db('customer_wallets').where({ customer_id: customerId }).first();
      if (!wallet) throw new AppError('Dompet nasabah belum dibuat.', 404);

      const customer = await db('customers').where({ id: customerId }).first();

      const ledger = await db('wallet_ledger')
        .leftJoin('users', 'wallet_ledger.created_by', 'users.id')
        .select('wallet_ledger.*', 'users.name as creator_name')
        .where({ wallet_id: wallet.id })
        .orderBy('wallet_ledger.id', 'desc');

      return apiResponse.success(res, 'Buku kas & mutasi dompet berhasil dimuat', {
        wallet: {
          currentBalance: Number(wallet.current_balance),
          accumulatedEarnings: Number(wallet.accumulated_earnings),
          accumulatedWithdrawals: Number(wallet.accumulated_withdrawals),
          lastTransactionAt: wallet.last_transaction_at,
          hasPin: !!customer?.pin_hash,
        },
        ledger,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FinanceController();
