/**
 * Standard API Response Conventions for Bank Sampah Digital
 */

const success = (res, message = 'Berhasil', data = null, statusCode = 200, meta = null) => {
  const response = {
    success: true,
    message,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

const error = (res, message = 'Terjadi kesalahan pada sistem', statusCode = 500, details = null) => {
  const response = {
    success: false,
    message,
    error: {
      code: statusCode,
      details,
    },
  };

  return res.status(statusCode).json(response);
};

module.exports = {
  success,
  error,
};
