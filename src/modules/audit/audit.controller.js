const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');

class AuditController {
  async getAuditLogs(req, res, next) {
    try {
      const logs = await db('audit_logs')
        .leftJoin('users', 'audit_logs.user_id', 'users.id')
        .leftJoin('user_roles', 'users.id', 'user_roles.user_id')
        .leftJoin('roles', 'user_roles.role_id', 'roles.id')
        .select(
          'audit_logs.id',
          'audit_logs.action',
          'audit_logs.entity_name',
          'audit_logs.entity_id',
          'audit_logs.old_values',
          'audit_logs.new_values',
          'audit_logs.ip_address',
          'audit_logs.user_agent',
          'audit_logs.created_at',
          'users.name as user_name',
          'users.username',
          'roles.name as role_name'
        )
        .orderBy('audit_logs.id', 'desc')
        .limit(100);

      return apiResponse.success(res, 'Daftar audit logs berhasil dimuat', logs);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuditController();
