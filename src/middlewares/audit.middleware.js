const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Record an audit log entry in audit_logs table
 */
const recordAuditLog = async ({
  userId = null,
  action,
  entityName,
  entityId = null,
  oldValues = null,
  newValues = null,
  req = null,
  trx = null,
}) => {
  try {
    const ipAddress = req
      ? req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1'
      : '127.0.0.1';
    const userAgent = req ? req.headers['user-agent'] || 'System' : 'System';
    const dbClient = trx || db;

    await dbClient('audit_logs').insert({
      user_id: userId,
      action,
      entity_name: entityName,
      entity_id: entityId ? String(entityId) : null,
      old_values: oldValues ? JSON.stringify(oldValues) : null,
      new_values: newValues ? JSON.stringify(newValues) : null,
      ip_address: typeof ipAddress === 'string' ? ipAddress.substring(0, 45) : '127.0.0.1',
      user_agent: typeof userAgent === 'string' ? userAgent.substring(0, 255) : 'System',
      created_at: new Date(),
    });

    logger.info(`[AUDIT] Action: ${action} on ${entityName}:${entityId || '-'} by User: ${userId || 'GUEST'}`);
  } catch (error) {
    logger.error(`[AUDIT_FAIL] Failed to save audit log: ${error.message}`);
  }
};

module.exports = {
  recordAuditLog,
};
