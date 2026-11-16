const logger = require('../config/logger');
const apiResponse = require('../utils/apiResponse');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Terjadi kesalahan internal pada server.';

  // Log error details
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, {
    stack: err.stack,
    statusCode: err.statusCode,
    details: err.details,
  });

  // Handle specific known error types
  if (err.name === 'JsonWebTokenError') {
    return apiResponse.error(res, 'Sesi tidak valid / token salah. Silakan login kembali.', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return apiResponse.error(res, 'Sesi telah berakhir. Silakan login kembali.', 401);
  }

  if (err.code === 'SQLITE_CONSTRAINT' || err.code === 'ER_DUP_ENTRY') {
    return apiResponse.error(res, 'Data duplikat terdeteksi atau melanggar batasan data.', 400, err.message);
  }

  // Operational or general response
  return apiResponse.error(
    res,
    err.message,
    err.statusCode,
    process.env.NODE_ENV === 'development' ? err.details || err.stack : err.details
  );
};

const notFoundHandler = (req, res) => {
  return apiResponse.error(res, `Endpoint ${req.originalUrl} tidak ditemukan di sistem Bank Sampah Digital`, 404);
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
