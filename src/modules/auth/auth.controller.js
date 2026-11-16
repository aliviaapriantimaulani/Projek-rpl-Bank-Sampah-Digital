const authService = require('./auth.service');
const apiResponse = require('../../utils/apiResponse');

class AuthController {
  async login(req, res, next) {
    try {
      const { identifier, password } = req.body;
      const result = await authService.login(identifier, password, req);
      return apiResponse.success(res, 'Login berhasil. Selamat datang di Bank Sampah Digital!', result);
    } catch (error) {
      next(error);
    }
  }

  async registerNasabah(req, res, next) {
    try {
      const result = await authService.registerNasabah(req.body, req);
      return apiResponse.success(res, 'Pendaftaran nasabah mandiri berhasil! Selamat bergabung.', result, 201);
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      // In stateless JWT, client deletes token; server records event
      return apiResponse.success(res, 'Logout berhasil. Sesi Anda telah diakhiri.');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      const profile = await authService.getProfile(req.user.id);
      return apiResponse.success(res, 'Informasi akun berhasil dimuat', profile);
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const { name, phone } = req.body;
      const updated = await authService.updateProfile(req.user.id, { name, phone }, req);
      return apiResponse.success(res, 'Profil berhasil diperbarui', updated);
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword, req);
      return apiResponse.success(res, 'Kata sandi berhasil diubah.');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
