const { verifyToken } = require('../utils/token');
const db = require('../config/database');

/**
 * Optional Authentication Middleware
 * If valid Bearer token provided, populates req.user.
 * If not provided or invalid, proceeds gracefully with req.user = null.
 */
const optionalAuth = async (req, res, next) => {
  req.user = null;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);
    const user = await db('users').where({ id: decoded.id }).first();

    if (!user || user.status !== 'ACTIVE') {
      return next();
    }

    const roleRecord = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .select('roles.name as role_name', 'roles.display_name as role_display')
      .first();

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
  } catch (err) {
    // Silently continue as guest if token is expired/invalid
    req.user = null;
  }

  next();
};

module.exports = {
  optionalAuth,
};
