const db = require('../../config/database');
const { hashPassword } = require('../../utils/password');
const AppError = require('../../utils/appError');
const { recordAuditLog } = require('../../middlewares/audit.middleware');

class UsersService {
  async getAllUsers(filters = {}) {
    let query = db('users')
      .leftJoin('user_roles', 'users.id', 'user_roles.user_id')
      .leftJoin('roles', 'user_roles.role_id', 'roles.id')
      .leftJoin('branches', 'users.branch_id', 'branches.id')
      .select(
        'users.id',
        'users.name',
        'users.email',
        'users.username',
        'users.phone',
        'users.status',
        'users.created_at',
        'roles.name as role_name',
        'roles.display_name as role_display',
        'branches.name as branch_name'
      )
      .orderBy('users.id', 'desc');

    if (filters.search) {
      const search = `%${filters.search}%`;
      query = query.where((qb) => {
        qb.where('users.name', 'like', search)
          .orWhere('users.email', 'like', search)
          .orWhere('users.username', 'like', search);
      });
    }

    if (filters.role) {
      query = query.where('roles.name', filters.role);
    }

    if (filters.status) {
      query = query.where('users.status', filters.status);
    }

    return query;
  }

  async getUserById(id) {
    const user = await db('users')
      .leftJoin('user_roles', 'users.id', 'user_roles.user_id')
      .leftJoin('roles', 'user_roles.role_id', 'roles.id')
      .where('users.id', id)
      .select(
        'users.id',
        'users.name',
        'users.email',
        'users.username',
        'users.phone',
        'users.status',
        'users.branch_id',
        'users.created_at',
        'roles.id as role_id',
        'roles.name as role_name',
        'roles.display_name as role_display'
      )
      .first();

    if (!user) throw new AppError('Pengguna tidak ditemukan.', 404);
    return user;
  }

  async getAllRoles() {
    return db('roles').select('id', 'name', 'display_name', 'description');
  }

  async createUser(data, adminUserId, req = null) {
    const { name, email, username, phone, password, roleName = 'NASABAH', branchId } = data;

    if (!name || !email || !username || !password) {
      throw new AppError('Nama, email, username, dan password wajib diisi.', 400);
    }

    // Check unique email / username
    const existing = await db('users')
      .where('email', email)
      .orWhere('username', username)
      .first();

    if (existing) {
      throw new AppError('Email atau username sudah terdaftar.', 400);
    }

    const role = await db('roles').where({ name: roleName.toUpperCase() }).first();
    if (!role) throw new AppError(`Peran '${roleName}' tidak valid.`, 400);

    const passwordHash = await hashPassword(password);

    const [userId] = await db('users').insert(
      {
        name,
        email,
        username,
        phone,
        password_hash: passwordHash,
        status: 'ACTIVE',
        branch_id: branchId || 1,
      },
      ['id']
    );

    const realUserId = typeof userId === 'object' ? userId.id : userId;

    await db('user_roles').insert({
      user_id: realUserId,
      role_id: role.id,
    });

    await recordAuditLog({
      userId: adminUserId,
      action: 'USER_CREATED',
      entityName: 'users',
      entityId: realUserId,
      newValues: { name, email, username, roleName },
      req,
    });

    return this.getUserById(realUserId);
  }

  async updateUser(id, data, adminUserId, req = null) {
    const user = await db('users').where({ id }).first();
    if (!user) throw new AppError('Pengguna tidak ditemukan.', 404);

    const { name, phone, status, roleName } = data;
    const updatePayload = { updated_at: new Date() };

    if (name) updatePayload.name = name;
    if (phone !== undefined) updatePayload.phone = phone;
    if (status) updatePayload.status = status;

    await db('users').where({ id }).update(updatePayload);

    // If role changed
    if (roleName) {
      const role = await db('roles').where({ name: roleName.toUpperCase() }).first();
      if (role) {
        await db('user_roles').where({ user_id: id }).delete();
        await db('user_roles').insert({ user_id: id, role_id: role.id });
      }
    }

    await recordAuditLog({
      userId: adminUserId,
      action: 'USER_UPDATED',
      entityName: 'users',
      entityId: id,
      oldValues: { name: user.name, status: user.status },
      newValues: { ...updatePayload, roleName },
      req,
    });

    return this.getUserById(id);
  }

  async deleteUser(id, adminUserId, req = null) {
    const user = await db('users').where({ id }).first();
    if (!user) throw new AppError('Pengguna tidak ditemukan.', 404);

    if (user.id === adminUserId) {
      throw new AppError('Anda tidak dapat menghapus akun Anda sendiri.', 400);
    }

    // Soft-deactivate user to preserve transaction and audit history
    await db('users').where({ id }).update({
      status: 'INACTIVE',
      updated_at: new Date(),
    });

    await recordAuditLog({
      userId: adminUserId,
      action: 'USER_DEACTIVATED',
      entityName: 'users',
      entityId: id,
      req,
    });

    return true;
  }
}

module.exports = new UsersService();
