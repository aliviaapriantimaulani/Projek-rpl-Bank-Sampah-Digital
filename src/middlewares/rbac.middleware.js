const apiResponse = require('../utils/apiResponse');

/**
 * Require specific roles middleware
 * @param  {...string} allowedRoles (e.g. 'ADMIN', 'OWNER', 'PETUGAS', 'NASABAH')
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return apiResponse.error(res, 'Akses tidak sah. Silakan login terlebih dahulu.', 401);
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return apiResponse.error(
        res,
        `Akses ditolak. Peran '${userRole}' (${req.user.role_display || userRole}) tidak memiliki izin untuk mengakses fungsi ini.`,
        403
      );
    }

    next();
  };
};

module.exports = {
  requireRoles,
};
