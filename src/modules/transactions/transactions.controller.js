const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { recordAuditLog } = require('../../middlewares/audit.middleware');
const { PointsEngine } = require('../../services/gamification/points.engine');
const whatsAppNotificationService = require('../../services/notification/whatsapp.service');

class TransactionsController {
  async getAllTransactions(req, res, next) {
    try {
      const userRole = req.user.role;
      let query = db('waste_deposit_transactions')
        .join('customers', 'waste_deposit_transactions.customer_id', 'customers.id')
        .join('users as nasabah_user', 'customers.user_id', 'nasabah_user.id')
        .join('users as petugas_user', 'waste_deposit_transactions.petugas_id', 'petugas_user.id')
        .select(
          'waste_deposit_transactions.id',
          'waste_deposit_transactions.transaction_no',
          'waste_deposit_transactions.transaction_date',
          'waste_deposit_transactions.total_weight_kg',
          'waste_deposit_transactions.total_amount',
          'waste_deposit_transactions.status',
          'waste_deposit_transactions.notes',
          'customers.account_no',
          'customers.nik',
          'nasabah_user.name as customer_name',
          'petugas_user.name as petugas_name'
        )
        .orderBy('waste_deposit_transactions.id', 'desc');

      // If user is NASABAH, filter strictly by customer_id
      if (userRole === 'NASABAH') {
        if (!req.user.customer_id) {
          return apiResponse.success(res, 'Daftar transaksi kosong', []);
        }
        query = query.where('waste_deposit_transactions.customer_id', req.user.customer_id);
      }

      const transactions = await query;
      return apiResponse.success(res, 'Daftar transaksi setor sampah berhasil dimuat', transactions);
    } catch (error) {
      next(error);
    }
  }

  async getDailyTransactions(req, res, next) {
    try {
      const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

      const transactions = await db('waste_deposit_transactions')
        .join('customers', 'waste_deposit_transactions.customer_id', 'customers.id')
        .join('users as nasabah_user', 'customers.user_id', 'nasabah_user.id')
        .join('users as petugas_user', 'waste_deposit_transactions.petugas_id', 'petugas_user.id')
        .select(
          'waste_deposit_transactions.id',
          'waste_deposit_transactions.transaction_no',
          'waste_deposit_transactions.transaction_date',
          'waste_deposit_transactions.total_weight_kg',
          'waste_deposit_transactions.total_amount',
          'waste_deposit_transactions.status',
          'customers.account_no',
          'nasabah_user.name as customer_name',
          'petugas_user.name as petugas_name'
        )
        .where('waste_deposit_transactions.transaction_date', '>=', startOfDay)
        .where('waste_deposit_transactions.transaction_date', '<=', endOfDay)
        .orderBy('waste_deposit_transactions.id', 'desc');

      let totalWeight = 0;
      let totalAmount = 0;
      transactions.forEach((tx) => {
        totalWeight += Number(tx.total_weight_kg || 0);
        totalAmount += Number(tx.total_amount || 0);
      });

      return apiResponse.success(res, `Daftar transaksi harian tanggal ${dateStr}`, {
        date: dateStr,
        totalTransactions: transactions.length,
        totalWeightKg: totalWeight,
        totalAmount,
        transactions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactionDetail(req, res, next) {
    try {
      const { id } = req.params;
      const tx = await db('waste_deposit_transactions')
        .join('customers', 'waste_deposit_transactions.customer_id', 'customers.id')
        .join('users as nasabah_user', 'customers.user_id', 'nasabah_user.id')
        .join('users as petugas_user', 'waste_deposit_transactions.petugas_id', 'petugas_user.id')
        .select(
          'waste_deposit_transactions.*',
          'customers.account_no',
          'customers.nik',
          'nasabah_user.name as customer_name',
          'nasabah_user.phone as customer_phone',
          'petugas_user.name as petugas_name'
        )
        .where('waste_deposit_transactions.id', id)
        .first();

      if (!tx) throw new AppError('Transaksi tidak ditemukan.', 404);

      // Nasabah can only view own transaction
      if (req.user.role === 'NASABAH' && tx.customer_id !== req.user.customer_id) {
        throw new AppError('Akses ditolak: Anda hanya dapat melihat transaksi Anda sendiri.', 403);
      }

      const items = await db('waste_deposit_items')
        .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
        .select(
          'waste_deposit_items.*',
          'waste_categories.code as category_code',
          'waste_categories.name as category_name',
          'waste_categories.unit'
        )
        .where('waste_deposit_items.transaction_id', id);

      return apiResponse.success(res, 'Detail transaksi berhasil dimuat', {
        ...tx,
        items,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactionReceipt(req, res, next) {
    try {
      const { id } = req.params;
      const tx = await db('waste_deposit_transactions')
        .join('customers', 'waste_deposit_transactions.customer_id', 'customers.id')
        .join('users as nasabah_user', 'customers.user_id', 'nasabah_user.id')
        .join('users as petugas_user', 'waste_deposit_transactions.petugas_id', 'petugas_user.id')
        .leftJoin('branches', 'waste_deposit_transactions.branch_id', 'branches.id')
        .select(
          'waste_deposit_transactions.*',
          'customers.account_no',
          'customers.nik',
          'nasabah_user.name as customer_name',
          'petugas_user.name as petugas_name',
          'branches.name as branch_name',
          'branches.address as branch_address',
          'branches.phone as branch_phone'
        )
        .where('waste_deposit_transactions.id', id)
        .first();

      if (!tx) throw new AppError('Transaksi tidak ditemukan.', 404);

      if (req.user.role === 'NASABAH' && tx.customer_id !== req.user.customer_id) {
        throw new AppError('Akses ditolak: Anda hanya dapat melihat struk transaksi Anda sendiri.', 403);
      }

      const items = await db('waste_deposit_items')
        .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
        .select(
          'waste_deposit_items.*',
          'waste_categories.name as category_name',
          'waste_categories.unit'
        )
        .where('waste_deposit_items.transaction_id', id);

      const wallet = await db('customer_wallets').where({ customer_id: tx.customer_id }).first();

      return apiResponse.success(res, 'Struk transaksi berhasil dicetak', {
        branch: {
          name: tx.branch_name || 'Bank Sampah Digital Pusat Lestari',
          address: tx.branch_address || 'Jl. Pemuda Merdeka No. 45',
          phone: tx.branch_phone || '021-5551234',
        },
        transactionNo: tx.transaction_no,
        date: tx.transaction_date,
        cashier: tx.petugas_name,
        customer: {
          name: tx.customer_name,
          accountNo: tx.account_no,
          nik: tx.nik,
        },
        items: items.map((it) => ({
          name: it.category_name,
          weight: Number(it.weight_kg),
          unit: it.unit,
          pricePerUnit: Number(it.price_per_kg),
          subtotal: Number(it.subtotal),
        })),
        totalWeightKg: Number(tx.total_weight_kg),
        totalAmount: Number(tx.total_amount),
        customerBalanceAfter: wallet ? Number(wallet.current_balance) : null,
      });
    } catch (error) {
      next(error);
    }
  }

  async createDepositTransaction(req, res, next) {
    const trx = await db.transaction();
    try {
      const { customerId, qrCodeToken, items, notes, idempotencyKey } = req.body;

      // Idempotency check: prevent duplicate submissions
      if (idempotencyKey) {
        const existingTx = await trx('waste_deposit_transactions')
          .where({ idempotency_key: idempotencyKey })
          .first();

        if (existingTx) {
          await trx.rollback();
          return apiResponse.success(
            res,
            'Transaksi ini telah berhasil dicatat sebelumnya (Idempotent).',
            existingTx,
            200
          );
        }
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError('Daftar sampah yang disetor tidak boleh kosong.', 400);
      }

      // Find customer (including the related user account for notification purposes)
      const baseCustomerQuery = () =>
        trx('customers')
          .leftJoin('users', 'customers.user_id', 'users.id')
          .select(
            'customers.*',
            'users.name as user_name',
            'users.phone as user_phone',
            'users.whatsapp_number as user_whatsapp_number',
            'users.notification_whatsapp_enabled as user_whatsapp_enabled'
          );

      let customer;
      if (customerId) {
        customer = await baseCustomerQuery().where('customers.id', customerId).first();
      } else if (qrCodeToken) {
        customer = await baseCustomerQuery().where('customers.qr_code_token', qrCodeToken).first();
      }

      if (!customer) {
        throw new AppError('Data nasabah tidak ditemukan. Harap periksa identitas atau QR nasabah.', 404);
      }

      if (customer.status !== 'ACTIVE') {
        throw new AppError('Status nasabah tidak aktif. Tidak dapat menerima setoran sampah.', 400);
      }

      // Customer wallet
      const wallet = await trx('customer_wallets').where({ customer_id: customer.id }).first();
      if (!wallet) throw new AppError('Dompet nasabah tidak ditemukan.', 500);

      // Validate items & calculate totals
      let totalWeight = 0;
      let totalAmount = 0;
      const verifiedItems = [];

      for (const item of items) {
        const weight = parseFloat(item.weightKg);
        if (isNaN(weight) || weight <= 0) {
          throw new AppError(`Berat sampah harus lebih besar dari 0 (Kategori ID: ${item.categoryId})`, 400);
        }

        const category = await trx('waste_categories').where({ id: item.categoryId }).first();
        if (!category) {
          throw new AppError(`Kategori sampah ID ${item.categoryId} tidak ditemukan`, 404);
        }

        const priceRecord = await trx('waste_prices')
          .where({ waste_category_id: category.id, is_active: true })
          .first();

        const pricePerKg = item.customPricePerKg !== undefined
          ? parseFloat(item.customPricePerKg)
          : priceRecord ? Number(priceRecord.buying_price) : 0;

        if (isNaN(pricePerKg) || pricePerKg < 0) {
          throw new AppError(`Harga per satuan tidak boleh negatif untuk kategori ${category.name}`, 400);
        }

        const subtotal = Math.round(weight * pricePerKg);
        totalWeight += weight;
        totalAmount += subtotal;

        verifiedItems.push({
          categoryId: category.id,
          categoryName: category.name,
          categoryCode: category.code,
          weightKg: weight,
          pricePerKg,
          subtotal,
          notes: item.notes || null,
          aiRecordId: item.aiRecordId ? parseInt(item.aiRecordId, 10) : null,
          qualityGrade: item.qualityGrade || null,
        });
      }

      // Check if this is customer's first deposit for bonus evaluation
      const prevDeposits = await trx('waste_deposit_transactions').where({ customer_id: customer.id }).count('id as count').first();
      const isFirstDeposit = parseInt(prevDeposits?.count || 0, 10) === 0;

      // Generate transaction number
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const txRandom = Math.floor(1000 + Math.random() * 9000);
      const transactionNo = `TRX-${dateStr}-${txRandom}`;

      // 1. Insert Transaction Header
      const [txId] = await trx('waste_deposit_transactions').insert(
        {
          transaction_no: transactionNo,
          branch_id: req.user.branch_id || 1,
          customer_id: customer.id,
          petugas_id: req.user.id,
          transaction_date: now,
          total_weight_kg: totalWeight,
          total_amount: totalAmount,
          idempotency_key: idempotencyKey || null,
          status: 'COMPLETED',
          notes: notes || 'Setoran sampah di loket',
        },
        ['id']
      );

      const realTxId = typeof txId === 'object' ? txId.id : txId;

      // 2. Insert Items, Weighing Records, & Update Inventory
      for (const item of verifiedItems) {
        const [itemId] = await trx('waste_deposit_items').insert(
          {
            transaction_id: realTxId,
            waste_category_id: item.categoryId,
            weight_kg: item.weightKg,
            price_per_kg: item.pricePerKg,
            subtotal: item.subtotal,
            notes: item.notes,
            ai_record_id: item.aiRecordId,
            quality_grade: item.qualityGrade,
          },
          ['id']
        );

        const realItemId = typeof itemId === 'object' ? itemId.id : itemId;

        // If item came from AI vision inference, link and confirm it
        if (item.aiRecordId) {
          await trx('ai_analysis_records')
            .where({ id: item.aiRecordId })
            .update({
              confirmed_price: item.pricePerKg,
              verified_category_id: item.categoryId,
              verified_by: req.user.id,
              verified_at: now,
              verification_status: 'ACCEPTED_AS_IS',
            });
        }

        // Weighing Scale record
        await trx('weighing_records').insert({
          deposit_item_id: realItemId,
          scale_identifier: 'TIMBANGAN-LOKET-01',
          raw_weight: item.weightKg,
          tare_weight: 0,
          net_weight: item.weightKg,
          recorded_by: req.user.id,
          created_at: now,
        });

        // Inventory update
        const inv = await trx('inventory')
          .where({
            branch_id: req.user.branch_id || 1,
            waste_category_id: item.categoryId,
          })
          .first();

        const stockBefore = inv ? Number(inv.current_stock_kg) : 0;
        const stockAfter = stockBefore + item.weightKg;

        if (inv) {
          await trx('inventory')
            .where({ id: inv.id })
            .update({
              current_stock_kg: stockAfter,
              last_updated_at: now,
            });
        } else {
          await trx('inventory').insert({
            branch_id: req.user.branch_id || 1,
            waste_category_id: item.categoryId,
            current_stock_kg: stockAfter,
            last_updated_at: now,
          });
        }

        // Inventory Movement Record (type: DEPOSIT)
        await trx('inventory_movements').insert({
          branch_id: req.user.branch_id || 1,
          waste_category_id: item.categoryId,
          movement_type: 'DEPOSIT',
          weight_kg: item.weightKg,
          stock_before_kg: stockBefore,
          stock_after_kg: stockAfter,
          reference_id: transactionNo,
          notes: `Setoran sampah dari nasabah No: ${customer.account_no}`,
          created_by: req.user.id,
          created_at: now,
        });
      }

      // 3. Ledger-based Accounting for Wallet
      const balanceBefore = Number(wallet.current_balance);
      const balanceAfter = balanceBefore + totalAmount;

      await trx('wallet_ledger').insert({
        wallet_id: wallet.id,
        entry_type: 'CREDIT',
        amount: totalAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference_type: 'WASTE_DEPOSIT',
        reference_id: transactionNo,
        description: `Setoran sampah total ${totalWeight.toFixed(1)} kg (${transactionNo})`,
        created_by: req.user.id,
        created_at: now,
      });

      // Update wallet snapshot strictly from ledger credit
      await trx('customer_wallets')
        .where({ id: wallet.id })
        .update({
          current_balance: balanceAfter,
          accumulated_earnings: Number(wallet.accumulated_earnings) + totalAmount,
          last_transaction_at: now,
          updated_at: now,
        });

      // 4. Configurable Gamification Points Engine
      const { totalPoints } = await PointsEngine.calculatePoints({
        items: verifiedItems,
        totalAmount,
        isFirstDeposit,
      });

      const pointsResult = await PointsEngine.awardPoints({
        customerId: customer.id,
        pointsEarned: totalPoints,
        referenceId: transactionNo,
        description: `Poin setoran sampah ${totalWeight.toFixed(1)} kg (#${transactionNo})`,
        trx,
      });

      await trx.commit();

      // Badge notifications are sent only after commit so rollbacks never notify.
      await PointsEngine.notifyNewBadges(customer.id, pointsResult?.newBadges || []);

      // 5. Multi-channel Notification (System In-App & WhatsApp Service)
      // Notification failures must never roll back or fail a committed deposit.
      try {
        await whatsAppNotificationService.onDepositCompleted({
          userId: customer.user_id,
          phone: customer.user_whatsapp_number || customer.user_phone,
          customerName: customer.user_name,
          invoiceNo: transactionNo,
          totalWeightKg: totalWeight,
          totalAmount,
          currentBalance: balanceAfter,
          status: 'Berhasil',
          items: verifiedItems.map((item) => ({
            name: item.categoryName,
            weightKg: item.weightKg,
          })),
        });
      } catch (notifErr) {
        console.warn('[TransactionsController] Notifikasi setoran gagal dikirim:', notifErr.message);
      }

      // Admin notification is optional (default off to avoid notification fatigue).
      try {
        await whatsAppNotificationService.onAdminNewDeposit({
          invoiceNo: transactionNo,
          customerName: customer.user_name,
          totalWeightKg: totalWeight,
          totalAmount,
        });
      } catch (notifErr) {
        console.warn('[TransactionsController] Notifikasi admin setoran gagal dikirim:', notifErr.message);
      }

      await recordAuditLog({
        userId: req.user.id,
        action: 'TRANSACTION_DEPOSIT_CREATED',
        entityName: 'waste_deposit_transactions',
        entityId: realTxId,
        newValues: { transactionNo, customerId: customer.id, totalWeight, totalAmount },
        req,
      });

      return apiResponse.success(
        res,
        'Transaksi setor sampah berhasil dicatat!',
        {
          transactionId: realTxId,
          transactionNo,
          totalWeightKg: totalWeight,
          totalAmount,
          customerBalanceAfter: balanceAfter,
          earnedPoints: totalPoints,
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
}

module.exports = new TransactionsController();
