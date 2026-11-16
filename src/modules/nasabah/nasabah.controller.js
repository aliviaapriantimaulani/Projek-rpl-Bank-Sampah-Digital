const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');

class NasabahController {
  async getDashboardData(req, res, next) {
    try {
      const customerId = req.user.customer_id;
      if (!customerId) throw new AppError('Data profil nasabah belum terhubung dengan akun ini.', 404);

      const customer = await db('customers')
        .join('users', 'customers.user_id', 'users.id')
        .leftJoin('branches', 'customers.branch_id', 'branches.id')
        .select(
          'customers.*',
          'users.name',
          'users.email',
          'users.phone',
          'branches.name as branch_name'
        )
        .where('customers.id', customerId)
        .first();

      // Wallet
      const wallet = await db('customer_wallets').where({ customer_id: customerId }).first();

      // Points & Level
      const points = await db('points').where({ customer_id: customerId }).first();
      const currentPts = points ? points.current_points : 0;

      const level = await db('customer_levels')
        .where('min_points', '<=', currentPts)
        .orderBy('min_points', 'desc')
        .first();

      // Environmental impact
      const txStats = await db('waste_deposit_transactions')
        .where({ customer_id: customerId, status: 'COMPLETED' })
        .sum('total_weight_kg as total_kg')
        .count('id as total_deposits')
        .first();

      const totalKg = Number(txStats?.total_kg || 0);
      // Rough ecological formula: 1 kg diverted waste saves approx ~1.4 kg CO2e
      const co2ReductionKg = +(totalKg * 1.4).toFixed(1);
      const treesEquivalent = +(totalKg * 0.05).toFixed(2); // tree planting equivalent

      // Recent 5 transactions
      const recentTransactions = await db('waste_deposit_transactions')
        .where({ customer_id: customerId })
        .orderBy('id', 'desc')
        .limit(5);

      // Recent notifications
      const notifications = await db('notification_logs')
        .where({ user_id: req.user.id })
        .orderBy('id', 'desc')
        .limit(10);

      // Badges
      const badges = await db('customer_badges')
        .join('badges', 'customer_badges.badge_id', 'badges.id')
        .select('badges.*', 'customer_badges.awarded_at')
        .where('customer_badges.customer_id', customerId);

      return apiResponse.success(res, 'Dasbor nasabah berhasil dimuat', {
        profile: customer,
        wallet: {
          currentBalance: Number(wallet?.current_balance || 0),
          accumulatedEarnings: Number(wallet?.accumulated_earnings || 0),
          accumulatedWithdrawals: Number(wallet?.accumulated_withdrawals || 0),
          lastTransactionAt: wallet?.last_transaction_at,
        },
        gamification: {
          points: currentPts,
          lifetimePoints: points ? points.lifetime_points : 0,
          levelName: level?.name || 'Warga Pemula',
          levelIcon: level?.badge_icon || 'seedling',
          levelBenefits: level?.benefits,
          badges,
        },
        impact: {
          totalKgDiverted: totalKg,
          co2ReductionKg,
          treesEquivalent,
          totalDeposits: Number(txStats?.total_deposits || 0),
        },
        recentTransactions,
        notifications,
      });
    } catch (error) {
      next(error);
    }
  }

  async markNotificationRead(req, res, next) {
    try {
      const { id } = req.params;
      await db('notification_logs')
        .where({ id, user_id: req.user.id })
        .update({ is_read: true });

      return apiResponse.success(res, 'Notifikasi telah ditandai sudah dibaca.');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NasabahController();
