const db = require('../../config/database');
const { hashPassword, comparePassword } = require('../../utils/password');
const { generateToken } = require('../../utils/token');
const AppError = require('../../utils/appError');
const { recordAuditLog } = require('../../middlewares/audit.middleware');

class AuthService {
  async login(identifier, password, req = null) {
    if (!identifier || !password) {
      throw new AppError('Email/Username dan Kata Sandi wajib diisi.', 400);
    }

    // Find user by email or username
    const user = await db('users')
      .where('email', identifier)
      .orWhere('username', identifier)
      .first();

    if (!user) {
      await recordAuditLog({
        userId: null,
        action: 'LOGIN_FAILED_NOT_FOUND',
        entityName: 'users',
        newValues: { identifier },
        req,
      });
      throw new AppError('Email/Username atau Kata Sandi salah.', 401);
    }

    // Check password
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      await recordAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILED_WRONG_PASSWORD',
        entityName: 'users',
        entityId: user.id,
        newValues: { identifier },
        req,
      });
      throw new AppError('Email/Username atau Kata Sandi salah.', 401);
    }

    // Check user status
    if (user.status !== 'ACTIVE') {
      await recordAuditLog({
        userId: user.id,
        action: 'LOGIN_BLOCKED_STATUS',
        entityName: 'users',
        entityId: user.id,
        newValues: { status: user.status },
        req,
      });
      throw new AppError(`Akun Anda tidak aktif (${user.status}). Hubungi administrator.`, 403);
    }

    // Fetch primary role
    const roleRecord = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .select('roles.id as role_id', 'roles.name as role_name', 'roles.display_name as role_display')
      .first();

    const roleName = roleRecord ? roleRecord.role_name : 'NASABAH';
    const roleDisplay = roleRecord ? roleRecord.role_display : 'Nasabah';

    // Fetch customer details if role is NASABAH
    let customerData = null;
    if (roleName === 'NASABAH') {
      const customer = await db('customers').where({ user_id: user.id }).first();
      if (customer) {
        const wallet = await db('customer_wallets').where({ customer_id: customer.id }).first();
        customerData = {
          customerId: customer.id,
          accountNo: customer.account_no,
          nik: customer.nik,
          qrCodeToken: customer.qr_code_token,
          balance: wallet ? Number(wallet.current_balance) : 0,
        };
      }
    }

    // Generate JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: roleName,
    });

    // Record login success audit log
    await recordAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityName: 'users',
      entityId: user.id,
      newValues: { role: roleName },
      req,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        phone: user.phone,
        role: roleName,
        roleDisplay,
        branchId: user.branch_id,
        customer: customerData,
      },
    };
  }

  async getProfile(userId) {
    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 404);
    }

    const roleRecord = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .select('roles.name as role_name', 'roles.display_name as role_display')
      .first();

    const roleName = roleRecord ? roleRecord.role_name : 'NASABAH';
    let customerData = null;

    if (roleName === 'NASABAH') {
      const customer = await db('customers').where({ user_id: user.id }).first();
      if (customer) {
        const wallet = await db('customer_wallets').where({ customer_id: customer.id }).first();
        const points = await db('points').where({ customer_id: customer.id }).first();
        customerData = {
          customerId: customer.id,
          accountNo: customer.account_no,
          nik: customer.nik,
          address: customer.address,
          rtRw: customer.rt_rw,
          qrCodeToken: customer.qr_code_token,
          joinDate: customer.join_date,
          balance: wallet ? Number(wallet.current_balance) : 0,
          accumulatedEarnings: wallet ? Number(wallet.accumulated_earnings) : 0,
          points: points ? points.current_points : 0,
        };
      }
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      phone: user.phone,
      status: user.status,
      role: roleName,
      roleDisplay: roleRecord ? roleRecord.role_display : 'Nasabah',
      branchId: user.branch_id,
      customer: customerData,
    };
  }

  async updateProfile(userId, { name, phone }, req = null) {
    const user = await db('users').where({ id: userId }).first();
    if (!user) throw new AppError('Pengguna tidak ditemukan.', 404);

    const oldValues = { name: user.name, phone: user.phone };
    const updatePayload = {};
    if (name) updatePayload.name = name;
    if (phone !== undefined) updatePayload.phone = phone;
    updatePayload.updated_at = new Date();

    await db('users').where({ id: userId }).update(updatePayload);

    await recordAuditLog({
      userId,
      action: 'PROFILE_UPDATED',
      entityName: 'users',
      entityId: userId,
      oldValues,
      newValues: updatePayload,
      req,
    });

    return this.getProfile(userId);
  }

  async changePassword(userId, currentPassword, newPassword, req = null) {
    if (!currentPassword || !newPassword) {
      throw new AppError('Kata sandi saat ini dan kata sandi baru harus diisi.', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('Kata sandi baru minimal 6 karakter.', 400);
    }

    const user = await db('users').where({ id: userId }).first();
    if (!user) throw new AppError('Pengguna tidak ditemukan.', 404);

    const isMatch = await comparePassword(currentPassword, user.password_hash);
    if (!isMatch) {
      await recordAuditLog({
        userId,
        action: 'PASSWORD_CHANGE_FAILED',
        entityName: 'users',
        entityId: userId,
        req,
      });
      throw new AppError('Kata sandi saat ini salah.', 400);
    }

    const newHash = await hashPassword(newPassword);
    await db('users').where({ id: userId }).update({
      password_hash: newHash,
      updated_at: new Date(),
    });

    await recordAuditLog({
      userId,
      action: 'PASSWORD_CHANGED_SUCCESS',
      entityName: 'users',
      entityId: userId,
      req,
    });

    return true;
  }

  async registerNasabah(data, req = null) {
    const { name, nik, phone, email, password, pin = '123456', address, rtRw, kelurahan } = data;

    if (!name || !nik || !password) {
      throw new AppError('Nama lengkap, NIK, dan Kata Sandi wajib diisi.', 400);
    }

    if (pin && !/^\d{6}$/.test(String(pin))) {
      throw new AppError('PIN Transaksi harus berupa 6 digit angka.', 400);
    }

    // Check unique NIK
    const existingNik = await db('customers').where({ nik }).first();
    if (existingNik) {
      throw new AppError('NIK ini sudah terdaftar sebagai nasabah.', 400);
    }

    const cleanNik = String(nik).trim();
    const generatedUsername = 'warga_' + cleanNik.slice(-6);
    const userEmail = email ? email.trim() : `${generatedUsername}@banksampah.local`;

    const existingUser = await db('users')
      .where('username', generatedUsername)
      .orWhere('email', userEmail)
      .first();

    if (existingUser) {
      throw new AppError('Username atau email sudah digunakan oleh pengguna lain.', 400);
    }

    const nasabahRole = await db('roles').where({ name: 'NASABAH' }).first();
    const passwordHash = await hashPassword(password);
    const pinHash = await hashPassword(String(pin));

    const trx = await db.transaction();
    try {
      // 1. Insert User
      const [userId] = await trx('users').insert(
        {
          branch_id: 1,
          name,
          email: userEmail,
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

      // 2. Generate Account No & QR Code
      const count = await trx('customers').count('id as c').first();
      const seq = String(Number(count.c) + 1).padStart(4, '0');
      const accountNo = `NSB-${new Date().getFullYear()}-${seq}`;
      const qrToken = `QR-NSB-${cleanNik}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // 3. Insert Customer Profile
      const [customerId] = await trx('customers').insert(
        {
          user_id: realUserId,
          branch_id: 1,
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
      const [walletId] = await trx('customer_wallets').insert(
        {
          customer_id: realCustomerId,
          current_balance: 0,
          accumulated_earnings: 0,
          accumulated_withdrawals: 0,
        },
        ['id']
      );

      const realWalletId = typeof walletId === 'object' ? walletId.id : walletId;

      // 5. Initialize Points
      await trx('points').insert({
        customer_id: realCustomerId,
        current_points: 0,
        lifetime_points: 0,
      });

      await trx.commit();

      // Record Audit
      await recordAuditLog({
        userId: realUserId,
        action: 'NASABAH_SELF_REGISTERED',
        entityName: 'customers',
        entityId: realCustomerId,
        newValues: { name, nik: cleanNik, accountNo, username: generatedUsername },
        req,
      });

      // Generate token for instant login
      const token = generateToken({
        id: realUserId,
        email: userEmail,
        username: generatedUsername,
        role: 'NASABAH',
      });

      return {
        token,
        user: {
          id: realUserId,
          name,
          email: userEmail,
          username: generatedUsername,
          phone,
          role: 'NASABAH',
          roleDisplay: 'Nasabah',
          branchId: 1,
          customer: {
            customerId: realCustomerId,
            accountNo,
            nik: cleanNik,
            qrCodeToken: qrToken,
            balance: 0,
          },
        },
      };
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }
}

module.exports = new AuthService();
