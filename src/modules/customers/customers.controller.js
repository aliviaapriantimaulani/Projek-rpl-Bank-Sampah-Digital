const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { hashPassword } = require('../../utils/password');
const { recordAuditLog } = require('../../middlewares/audit.middleware');

class CustomersController {
  async getAllCustomers(req, res, next) {
    try {
      const { search, status, rtRw } = req.query;
      let query = db('customers')
        .join('users', 'customers.user_id', 'users.id')
        .leftJoin('customer_wallets', 'customers.id', 'customer_wallets.customer_id')
        .leftJoin('points', 'customers.id', 'points.customer_id')
        .select(
          'customers.id',
          'customers.account_no',
          'customers.nik',
          'customers.qr_code_token',
          'customers.address',
          'customers.rt_rw',
          'customers.kelurahan',
          'customers.status',
          'customers.join_date',
          'users.name',
          'users.email',
          'users.phone',
          'customer_wallets.current_balance',
          'points.current_points'
        )
        .orderBy('customers.id', 'desc');

      if (search) {
        const s = `%${search}%`;
        query = query.where((qb) => {
          qb.where('users.name', 'like', s)
            .orWhere('customers.account_no', 'like', s)
            .orWhere('customers.nik', 'like', s)
            .orWhere('customers.qr_code_token', 'like', s)
            .orWhere('users.phone', 'like', s);
        });
      }

      if (status) {
        query = query.where('customers.status', status.toUpperCase());
      }

      if (rtRw) {
        query = query.where('customers.rt_rw', rtRw);
      }

      const customers = await query;
      return apiResponse.success(res, 'Data nasabah berhasil dimuat', customers);
    } catch (error) {
      next(error);
    }
  }

  async lookupCustomer(req, res, next) {
    try {
      const { query: searchQuery } = req.query;
      if (!searchQuery) {
        throw new AppError('Kata kunci pencarian nasabah (QR / No Rekening / NIK / Nama / No HP) wajib diisi.', 400);
      }

      const cleanQuery = searchQuery.trim();
      const s = `%${cleanQuery}%`;

      const customer = await db('customers')
        .join('users', 'customers.user_id', 'users.id')
        .leftJoin('customer_wallets', 'customers.id', 'customer_wallets.customer_id')
        .leftJoin('points', 'customers.id', 'points.customer_id')
        .select(
          'customers.id',
          'customers.account_no',
          'customers.nik',
          'customers.qr_code_token',
          'customers.address',
          'customers.rt_rw',
          'customers.kelurahan',
          'customers.status',
          'customers.join_date',
          'users.name',
          'users.email',
          'users.phone',
          'customer_wallets.current_balance',
          'points.current_points'
        )
        .where('customers.qr_code_token', cleanQuery)
        .orWhere('customers.account_no', cleanQuery)
        .orWhere('customers.nik', cleanQuery)
        .orWhere('users.phone', cleanQuery)
        .orWhere('users.name', 'like', s)
        .first();

      if (!customer) {
        throw new AppError('Nasabah tidak ditemukan dengan kata kunci atau QR tersebut.', 404);
      }

      return apiResponse.success(res, 'Data nasabah ditemukan', customer);
    } catch (error) {
      next(error);
    }
  }

  async getCustomerDetail(req, res, next) {
    try {
      const { id } = req.params;

      const customer = await db('customers')
        .join('users', 'customers.user_id', 'users.id')
        .leftJoin('customer_wallets', 'customers.id', 'customer_wallets.customer_id')
        .leftJoin('points', 'customers.id', 'points.customer_id')
        .select(
          'customers.*',
          'users.name',
          'users.email',
          'users.phone',
          'customer_wallets.current_balance',
          'customer_wallets.accumulated_earnings',
          'customer_wallets.accumulated_withdrawals',
          'customer_wallets.last_transaction_at',
          'points.current_points',
          'points.lifetime_points'
        )
        .where('customers.id', id)
        .first();

      if (!customer) throw new AppError('Nasabah tidak ditemukan.', 404);

      // Customer Level calculation
      const currentPts = customer.current_points || 0;
      const level = await db('customer_levels')
        .where('min_points', '<=', currentPts)
        .orderBy('min_points', 'desc')
        .first();

      // Total Waste & Deposit stats
      const txStats = await db('waste_deposit_transactions')
        .where({ customer_id: id, status: 'COMPLETED' })
        .sum('total_weight_kg as total_kg')
        .count('id as total_deposits')
        .first();

      const recentTransactions = await db('waste_deposit_transactions')
        .where({ customer_id: id })
        .orderBy('id', 'desc')
        .limit(5);

      return apiResponse.success(res, 'Detail profil dan ringkasan nasabah berhasil dimuat', {
        ...customer,
        levelName: level?.name || 'Warga Pemula',
        levelIcon: level?.badge_icon || 'seedling',
        totalWasteKg: Number(txStats?.total_kg || 0),
        totalDepositCount: Number(txStats?.total_deposits || 0),
        recentTransactions,
      });
    } catch (error) {
      next(error);
    }
  }

  async registerCustomer(req, res, next) {
    try {
      const {
        name,
        email,
        phone,
        nik,
        address,
        rtRw,
        kelurahan,
        initialPassword = 'Nasabah123!',
        pin = '123456',
      } = req.body;

      if (!name || !nik) {
        throw new AppError('Nama lengkap dan NIK wajib diisi.', 400);
      }

      if (pin && !/^\d{6}$/.test(String(pin))) {
        throw new AppError('PIN Transaksi harus berupa 6 digit angka.', 400);
      }

      // Check existing NIK
      const cleanNik = String(nik).trim();
      const existingNik = await db('customers').where({ nik: cleanNik }).first();
      if (existingNik) throw new AppError('NIK sudah terdaftar pada sistem.', 400);

      const generatedUsername = 'warga_' + cleanNik.slice(-6);
      const generatedEmail = email ? email.trim() : `${generatedUsername}@banksampah.local`;

      const existingUser = await db('users')
        .where('username', generatedUsername)
        .orWhere('email', generatedEmail)
        .first();

      if (existingUser) {
        throw new AppError('Username / Email otomatis sudah terdaftar.', 400);
      }

      const nasabahRole = await db('roles').where({ name: 'NASABAH' }).first();
      const passwordHash = await hashPassword(initialPassword);
      const pinHash = await hashPassword(String(pin));

      const trx = await db.transaction();
      try {
        // 1. Create User
        const [userId] = await trx('users').insert(
          {
            branch_id: req.user.branch_id || 1,
            name,
            email: generatedEmail,
            username: generatedUsername,
            phone: phone || null,
            password_hash: passwordHash,
            status: 'ACTIVE',
          },
          ['id']
        );

        const realUserId = typeof userId === 'object' ? userId.id : userId;

        await trx('user_roles').insert({
          user_id: realUserId,
          role_id: nasabahRole.id,
        });

        // 2. Generate Account No & QR Code Token
        const count = await trx('customers').count('id as c').first();
        const seq = String(Number(count.c) + 1).padStart(4, '0');
        const accountNo = `NSB-${new Date().getFullYear()}-${seq}`;
        const qrToken = `QR-NSB-${cleanNik}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        // 3. Create Customer Profile
        const [customerId] = await trx('customers').insert(
          {
            user_id: realUserId,
            branch_id: req.user.branch_id || 1,
            nik: cleanNik,
            account_no: accountNo,
            address: address || null,
            rt_rw: rtRw || null,
            kelurahan: kelurahan || 'Sejahtera',
            qr_code_token: qrToken,
            pin_hash: pinHash,
            join_date: new Date().toISOString().split('T')[0],
            status: 'ACTIVE',
          },
          ['id']
        );

        const realCustomerId = typeof customerId === 'object' ? customerId.id : customerId;

        // 4. Initialize Wallet
        await trx('customer_wallets').insert({
          customer_id: realCustomerId,
          current_balance: 0,
          accumulated_earnings: 0,
          accumulated_withdrawals: 0,
        });

        // 5. Initialize Points
        await trx('points').insert({
          customer_id: realCustomerId,
          current_points: 0,
          lifetime_points: 0,
        });

        await trx.commit();

        await recordAuditLog({
          userId: req.user.id,
          action: 'CUSTOMER_REGISTERED',
          entityName: 'customers',
          entityId: realCustomerId,
          newValues: { name, nik: cleanNik, accountNo, phone, registeredBy: req.user.name },
          req,
        });

        return apiResponse.success(
          res,
          'Nasabah baru berhasil didaftarkan!',
          {
            customerId: realCustomerId,
            userId: realUserId,
            name,
            accountNo,
            nik: cleanNik,
            qrCodeToken: qrToken,
            username: generatedUsername,
            initialPassword,
          },
          201
        );
      } catch (err) {
        await trx.rollback();
        throw err;
      }
    } catch (error) {
      next(error);
    }
  }

  async updateCustomer(req, res, next) {
    try {
      const { id } = req.params;
      const { name, phone, address, rtRw, kelurahan } = req.body;

      const customer = await db('customers').where({ id }).first();
      if (!customer) throw new AppError('Nasabah tidak ditemukan.', 404);

      const user = await db('users').where({ id: customer.user_id }).first();

      const customerUpdate = { updated_at: new Date() };
      if (address !== undefined) customerUpdate.address = address;
      if (rtRw !== undefined) customerUpdate.rt_rw = rtRw;
      if (kelurahan !== undefined) customerUpdate.kelurahan = kelurahan;

      const userUpdate = { updated_at: new Date() };
      if (name) userUpdate.name = name;
      if (phone !== undefined) userUpdate.phone = phone;

      await db('customers').where({ id }).update(customerUpdate);
      await db('users').where({ id: customer.user_id }).update(userUpdate);

      await recordAuditLog({
        userId: req.user.id,
        action: 'CUSTOMER_UPDATED',
        entityName: 'customers',
        entityId: id,
        oldValues: { name: user.name, phone: user.phone, address: customer.address },
        newValues: { name, phone, address, rtRw },
        req,
      });

      return this.getCustomerDetail(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  async updateCustomerStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['ACTIVE', 'INACTIVE', 'BLACKLISTED'].includes(status.toUpperCase())) {
        throw new AppError('Status harus bernilai ACTIVE, INACTIVE, atau BLACKLISTED.', 400);
      }

      const customer = await db('customers').where({ id }).first();
      if (!customer) throw new AppError('Nasabah tidak ditemukan.', 404);

      const newStatus = status.toUpperCase();
      await db('customers').where({ id }).update({
        status: newStatus,
        updated_at: new Date(),
      });

      // Also update linked user status
      await db('users').where({ id: customer.user_id }).update({
        status: newStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        updated_at: new Date(),
      });

      await recordAuditLog({
        userId: req.user.id,
        action: 'CUSTOMER_STATUS_CHANGED',
        entityName: 'customers',
        entityId: id,
        oldValues: { status: customer.status },
        newValues: { status: newStatus },
        req,
      });

      return apiResponse.success(res, `Status nasabah berhasil diubah menjadi ${newStatus}.`);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CustomersController();
