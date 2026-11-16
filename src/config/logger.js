const env = require('./env');

const LOG_LEVELS = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const currentLevel = LOG_LEVELS[env.LOG_LEVEL] || LOG_LEVELS.info;

const formatLog = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
};

const logger = {
  debug: (message, meta) => {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.debug(formatLog('debug', message, meta));
    }
  },
  info: (message, meta) => {
    if (currentLevel <= LOG_LEVELS.info) {
      console.info(formatLog('info', message, meta));
    }
  },
  warn: (message, meta) => {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.warn(formatLog('warn', message, meta));
    }
  },
  error: (message, meta) => {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(formatLog('error', message, meta));
    }
  },
};

module.exports = logger;
