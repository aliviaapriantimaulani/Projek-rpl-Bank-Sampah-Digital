const { verifyToken } = require('../utils/token');
const apiResponse = require('../utils/apiResponse');
const db = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse.error(res, 'Akses ditolak. Token otorisasi tidak ditemukan.', 401);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return apiResponse.error(res, 'Token otorisasi kosong.', 401);
    }

    const decoded = verifyToken(token);

    // Retrieve active user from database
    const user = await db('users')
      .where({ id: decoded.id })
      .first();

    if (!user) {
      return apiResponse.error(res, 'Pengguna yang terkait dengan token ini tidak lagi ditemukan.', 401);
    }

    if (user.status !== 'ACTIVE') {
      return apiResponse.error(res, `Akun Anda sedang ${user.status.toLowerCase()}. Silakan hubungi admin.`, 403);
    }

    // Retrieve user's role
    const roleRecord = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .select('roles.name as role_name', 'roles.display_name as role_display')
      .first();

    // If user is a customer, retrieve customer_id and wallet_id
    let customer = null;
    let wallet = null;
    if (roleRecord?.role_name === 'NASABAH') {
      customer = await db('customers').where({ user_id: user.id }).first();
      if (customer) {
        wallet = await db('customer_wallets').where({ customer_id: customer.id }).first();
      }
    }

    req.user = {
      id: user.id,
      branch_id: user.branch_id,
      name: user.name,
      email: user.email,
      username: user.username,
      phone: user.phone,
      role: roleRecord ? roleRecord.role_name : 'NASABAH',
      role_display: roleRecord ? roleRecord.role_display : 'Nasabah',
      customer_id: customer ? customer.id : null,
      wallet_id: wallet ? wallet.id : null,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(error);
    }
    return apiResponse.error(res, 'Otorisasi gagal: ' + error.message, 401);
  }
};

module.exports = {
  authenticate,
};
