const usersService = require('./users.service');
const apiResponse = require('../../utils/apiResponse');

class UsersController {
  async getAllUsers(req, res, next) {
    try {
      const users = await usersService.getAllUsers(req.query);
      return apiResponse.success(res, 'Daftar pengguna berhasil dimuat', users);
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req, res, next) {
    try {
      const user = await usersService.getUserById(req.params.id);
      return apiResponse.success(res, 'Detail pengguna berhasil dimuat', user);
    } catch (error) {
      next(error);
    }
  }

  async getAllRoles(req, res, next) {
    try {
      const roles = await usersService.getAllRoles();
      return apiResponse.success(res, 'Daftar peran berhasil dimuat', roles);
    } catch (error) {
      next(error);
    }
  }

  async createUser(req, res, next) {
    try {
      const user = await usersService.createUser(req.body, req.user.id, req);
      return apiResponse.success(res, 'Pengguna baru berhasil ditambahkan', user, 201);
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req, res, next) {
    try {
      const user = await usersService.updateUser(req.params.id, req.body, req.user.id, req);
      return apiResponse.success(res, 'Data pengguna berhasil diperbarui', user);
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req, res, next) {
    try {
      await usersService.deleteUser(req.params.id, req.user.id, req);
      return apiResponse.success(res, 'Pengguna berhasil dinonaktifkan');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UsersController();
