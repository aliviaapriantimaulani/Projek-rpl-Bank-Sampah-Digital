/**
 * In-Memory Sliding Window Rate Limiter Middleware
 * Protects auth, OTP, and AI endpoints against brute force and DDoS attacks
 */
const apiResponse = require('../utils/apiResponse');

const createRateLimiter = ({
  windowMs = 60 * 1000, // 1 minute window
  max = 60, // max requests per window
  message = 'Terlalu banyak permintaan. Silakan tunggu beberapa saat lagi.',
  skipFailedRequests = false,
} = {}) => {
  const hits = new Map();

  // Periodic garbage collection every 5 minutes to prevent memory leak
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now - record.resetTime > windowMs) {
        hits.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  cleanupInterval.unref();

  return (req, res, next) => {
    // In test environment, allow bypassing if explicitly configured
    if (process.env.NODE_ENV === 'test' && process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1';

    const identifier = `${req.baseUrl || ''}${req.path}:${clientIp}`;
    const now = Date.now();

    let record = hits.get(identifier);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      hits.set(identifier, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return apiResponse.error(res, message, 429, {
        retryAfterSeconds: resetSeconds,
      });
    }

    next();
  };
};

module.exports = {
  createRateLimiter,
};
