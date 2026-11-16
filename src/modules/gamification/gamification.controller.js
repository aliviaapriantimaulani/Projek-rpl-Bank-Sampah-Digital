const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const { PointsEngine } = require('../../services/gamification/points.engine');
const whatsAppNotificationService = require('../../services/notification/whatsapp.service');
const { recordAuditLog } = require('../../middlewares/audit.middleware');

class GamificationController {
  /**
   * GET /api/v1/gamification/leaderboard?sortBy=weight|points|transactions
   * Privacy-preserving leaderboard with masked display names
   */
  async getLeaderboard(req, res) {
    const { sortBy = 'weight', limit = 20 } = req.query;

    try {
      let query = db('customers')
        .join('users', 'customers.user_id', 'users.id')
        .leftJoin('points', 'customers.id', 'points.customer_id')
        .leftJoin('waste_deposit_transactions', 'customers.id', 'waste_deposit_transactions.customer_id')
        .where('customers.status', 'ACTIVE');

      let orderByField = 'total_weight_kg';
      if (sortBy === 'points') {
        orderByField = 'current_points';
      } else if (sortBy === 'transactions') {
        orderByField = 'transaction_count';
      }

      const rows = await query
        .select(
          'customers.id',
          'users.name',
          'customers.account_no',
          db.raw('COALESCE(SUM(waste_deposit_transactions.total_weight_kg), 0) as total_weight_kg'),
          db.raw('COUNT(waste_deposit_transactions.id) as transaction_count'),
          db.raw('COALESCE(points.current_points, 0) as current_points'),
          db.raw('COALESCE(points.lifetime_points, 0) as lifetime_points')
        )
        .groupBy('customers.id', 'users.name', 'customers.account_no', 'points.current_points', 'points.lifetime_points')
        .orderBy(orderByField, 'desc')
        .limit(parseInt(limit, 10) || 20);

      // Privacy Masking Helper: "Ahmad Dahlan" -> "Ahmad D.***"
      const maskName = (name) => {
        if (!name) return 'Warga Peduli';
        const parts = name.trim().split(' ');
        if (parts.length === 1) {
          return parts[0].length > 3 ? parts[0].substring(0, 3) + '***' : parts[0];
        }
        return `${parts[0]} ${parts[1].charAt(0)}.***`;
      };

      // Fetch badge count for each customer
      const customerIds = rows.map((r) => r.id);
      const badgeCounts = customerIds.length > 0
        ? await db('customer_badges')
            .whereIn('customer_id', customerIds)
            .select('customer_id', db.raw('COUNT(badge_id) as badge_count'))
            .groupBy('customer_id')
        : [];

      const badgeCountMap = {};
      badgeCounts.forEach((b) => {
        badgeCountMap[b.customer_id] = parseInt(b.badge_count, 10);
      });

      const leaderboard = rows.map((r, index) => ({
        rank: index + 1,
        displayName: maskName(r.name),
        accountNoMasked: r.account_no ? `${r.account_no.substring(0, 8)}****` : 'NSB-****',
        totalWeightKg: parseFloat(r.total_weight_kg || 0),
        currentPoints: parseInt(r.current_points || 0, 10),
        transactionCount: parseInt(r.transaction_count || 0, 10),
        badgeCount: badgeCountMap[r.id] || 0,
        isCurrentCustomer: req.user?.customer_id === r.id,
      }));

      return apiResponse.success(res, 'Papan peringkat nasabah berhasil dimuat', {
        sortBy,
        leaderboard,
      });
    } catch (err) {
      return apiResponse.error(res, `Gagal memuat papan peringkat: ${err.message}`, 500);
    }
  }

  /**
   * GET /api/v1/gamification/profile
   */
  async getProfile(req, res) {
    try {
      let customerId = req.query.customerId;
      if (!customerId && req.user?.customer_id) {
        customerId = req.user.customer_id;
      }
      if (!customerId && ['OWNER', 'ADMIN'].includes(req.user?.role)) {
        const firstCust = await db('customers').where('status', 'ACTIVE').first();
        if (firstCust) customerId = firstCust.id;
      }

      if (!customerId) {
        return apiResponse.success(res, 'Profil gamifikasi', {
          points: 0,
          levelName: 'Warga Lestari',
          badges: [],
        });
      }

      const cust = await db('customers')
        .join('users', 'customers.user_id', 'users.id')
        .leftJoin('points', 'customers.id', 'points.customer_id')
        .where('customers.id', customerId)
        .select(
          'customers.*',
          'users.name',
          'points.current_points',
          'points.lifetime_points'
        )
        .first();

      const lifetime = parseInt(cust?.lifetime_points || 0, 10);
      const currentLevel = await PointsEngine.evaluateCustomerLevel(customerId, lifetime);

      const allBadges = await db('badges').select('*').orderBy('id', 'asc');
      const earnedBadges = await db('customer_badges').where('customer_id', customerId);
      const earnedSet = new Set(earnedBadges.map((b) => b.badge_id));

      const badges = allBadges.map((b) => ({
        ...b,
        isUnlocked: earnedSet.has(b.id),
      }));

      return apiResponse.success(res, 'Profil gamifikasi nasabah', {
        customerId,
        name: cust?.name,
        accountNo: cust?.account_no,
        points: parseInt(cust?.current_points || 0, 10),
        lifetimePoints: lifetime,
        levelName: currentLevel?.name || 'Warga Pemula',
        badges,
      });
    } catch (err) {
      return apiResponse.error(res, err.message, 500);
    }
  }

  /**
   * GET /api/v1/gamification/badges
   */
  async getBadges(req, res) {
    try {
      const badges = await db('badges').select('*').orderBy('id', 'asc');
      return apiResponse.success(res, 'Daftar lencana prestasi berhasil dimuat', badges);
    } catch (err) {
      return apiResponse.error(res, err.message, 500);
    }
  }

  /**
   * GET /api/v1/gamification/my-badges
   */
  async getMyBadges(req, res) {
    const customerId = req.user.customer_id;
    if (!customerId) {
      return apiResponse.error(res, 'Profil nasabah tidak ditemukan untuk akun ini.', 400);
    }

    try {
      const earned = await db('customer_badges')
        .join('badges', 'customer_badges.badge_id', 'badges.id')
        .where('customer_badges.customer_id', customerId)
        .select('badges.*', 'customer_badges.awarded_at')
        .orderBy('customer_badges.awarded_at', 'desc');

      return apiResponse.success(res, 'Lencana yang telah diraih berhasil dimuat', earned);
    } catch (err) {
      return apiResponse.error(res, err.message, 500);
    }
  }

  /**
   * GET /api/v1/gamification/rewards
   */
  async getRewards(req, res) {
    try {
      const rewards = await db('rewards')
        .where({ is_active: true })
        .orderBy('point_cost', 'asc');
      return apiResponse.success(res, 'Katalog hadiah penukaran poin berhasil dimuat', rewards);
    } catch (err) {
      return apiResponse.error(res, err.message, 500);
    }
  }

  /**
   * POST /api/v1/gamification/rewards/redeem
   * Atomic Reward Redemption with Anti-Negative Balance & Stock Reservation
   */
  async redeemReward(req, res) {
    const { rewardId } = req.body;
    const customerId = req.user.customer_id;

    if (!customerId) {
      return apiResponse.error(res, 'Hanya nasabah terdaftar yang dapat menukarkan poin hadiah.', 403);
    }

    if (!rewardId) {
      return apiResponse.error(res, 'ID Hadiah (rewardId) wajib disertakan.', 400);
    }

    const trx = await db.transaction();

    try {
      const reward = await trx('rewards')
        .where({ id: rewardId, is_active: true })
        .forUpdate()
        .first();

      if (!reward) {
        await trx.rollback();
        return apiResponse.error(res, 'Hadiah tidak ditemukan atau sudah tidak aktif.', 404);
      }

      if (reward.stock <= 0) {
        await trx.rollback();
        return apiResponse.error(res, `Stok hadiah "${reward.title}" telah habis.`, 400);
      }

      // Generate Redemption Number (RDM-YYYYMMDD-XXXX)
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countResult = await trx('reward_redemptions')
        .where('created_at', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
        .count('id as count')
        .first();
      const seq = String(parseInt(countResult?.count || 0, 10) + 1).padStart(4, '0');
      const redemptionNo = `RDM-${todayStr}-${seq}`;

      // Deduct Points via PointsEngine (Strictly prevents negative balance)
      await PointsEngine.deductPoints({
        customerId,
        pointsToDeduct: reward.point_cost,
        referenceId: redemptionNo,
        description: `Penukaran hadiah: ${reward.title}`,
        trx,
      });

      // Deduct Reward Stock
      await trx('rewards')
        .where({ id: rewardId })
        .decrement('stock', 1);

      // Create Redemption Record
      const [redemptionId] = await trx('reward_redemptions').insert({
        redemption_no: redemptionNo,
        customer_id: customerId,
        reward_id: rewardId,
        points_spent: reward.point_cost,
        status: 'REQUESTED',
        created_at: new Date(),
      });

      await trx.commit();

      // Dispatch notifications asynchronously; failures must not fail the redemption.
      try {
        const customer = await db('customers').where({ id: customerId }).first();
        await whatsAppNotificationService.onRewardRedeemed({
          userId: req.user.id,
          phone: customer?.phone || req.user.phone,
          rewardTitle: reward.title,
          pointsSpent: reward.point_cost,
          redemptionNo,
        });

        await whatsAppNotificationService.onAdminRewardRequest({
          redemptionNo,
          customerName: req.user.name,
          rewardTitle: reward.title,
          pointsSpent: reward.point_cost,
        });
      } catch (notifErr) {
        console.warn('[GamificationController] Notifikasi penukaran reward gagal:', notifErr.message);
      }

      await recordAuditLog({
        userId: req.user.id,
        action: 'REWARD_REDEEMED',
        entityName: 'reward_redemptions',
        entityId: redemptionId,
        newValues: { redemptionNo, rewardTitle: reward.title, pointsSpent: reward.point_cost },
        req,
      });

      return apiResponse.success(
        res,
        `Penukaran hadiah "${reward.title}" berhasil diajukan. Tunjukkan nomor tiket ke petugas untuk pengambilan.`,
        {
          redemptionId,
          redemptionNo,
          rewardTitle: reward.title,
          pointsSpent: reward.point_cost,
          status: 'REQUESTED',
        },
        201
      );
    } catch (err) {
      if (!trx.isCompleted()) await trx.rollback();
      return apiResponse.error(res, err.message, err.statusCode || 400);
    }
  }

  /**
   * POST /api/v1/gamification/redemptions/:id/process
   * Staff processes reward: marks as COMPLETED or CANCELLED (with point refund & stock restore)
   */
  async processRedemption(req, res) {
    const redemptionId = parseInt(req.params.id, 10);
    const { action, rejectionReason } = req.body; // 'APPROVE_COLLECT' or 'CANCEL'

    if (!['APPROVE_COLLECT', 'CANCEL'].includes(action)) {
      return apiResponse.error(res, 'Aksi tidak valid. Pilihan: APPROVE_COLLECT atau CANCEL.', 400);
    }

    const trx = await db.transaction();

    try {
      const redemption = await trx('reward_redemptions')
        .where({ id: redemptionId })
        .forUpdate()
        .first();

      if (!redemption) {
        await trx.rollback();
        return apiResponse.error(res, 'Tiket penukaran hadiah tidak ditemukan.', 404);
      }

      if (redemption.status !== 'REQUESTED') {
        await trx.rollback();
        return apiResponse.error(res, `Tiket penukaran ini sudah berstatus ${redemption.status}.`, 400);
      }

      if (action === 'APPROVE_COLLECT') {
        await trx('reward_redemptions')
          .where({ id: redemptionId })
          .update({
            status: 'COLLECTED',
            processed_by: req.user.id,
            processed_at: new Date(),
            collected_at: new Date(),
          });

        await trx.commit();

        try {
          const info = await db('reward_redemptions')
            .join('customers', 'reward_redemptions.customer_id', 'customers.id')
            .join('users', 'customers.user_id', 'users.id')
            .join('rewards', 'reward_redemptions.reward_id', 'rewards.id')
            .where('reward_redemptions.id', redemptionId)
            .select(
              'users.id as user_id',
              'users.phone as user_phone',
              'users.whatsapp_number as user_whatsapp_number',
              'rewards.title as reward_title',
              'reward_redemptions.redemption_no'
            )
            .first();

          if (info) {
            await whatsAppNotificationService.onRewardStatusChanged({
              userId: info.user_id,
              phone: info.user_whatsapp_number || info.user_phone,
              rewardTitle: info.reward_title,
              redemptionNo: info.redemption_no,
              status: 'COLLECTED',
            });
          }
        } catch (notifErr) {
          console.warn('[GamificationController] Notifikasi hadiah diambil gagal:', notifErr.message);
        }

        await recordAuditLog({
          userId: req.user.id,
          action: 'REWARD_COLLECTED',
          entityName: 'reward_redemptions',
          entityId: redemptionId,
          newValues: { status: 'COLLECTED', processedBy: req.user.id },
          req,
        });

        return apiResponse.success(res, 'Hadiah berhasil diserahkan kepada nasabah.');
      } else {
        // CANCEL: Refund points and restore stock
        await trx('reward_redemptions')
          .where({ id: redemptionId })
          .update({
            status: 'CANCELLED',
            processed_by: req.user.id,
            processed_at: new Date(),
            rejection_reason: rejectionReason || 'Dibatalkan oleh staf/petugas',
          });

        // Restore stock
        await trx('rewards').where({ id: redemption.reward_id }).increment('stock', 1);

        // Refund points
        const refundResult = await PointsEngine.awardPoints({
          customerId: redemption.customer_id,
          pointsEarned: redemption.points_spent,
          referenceId: redemption.redemption_no,
          description: `Pengembalian poin: Pembatalan penukaran ${redemption.redemption_no}`,
          trx,
        });

        await trx.commit();

        await PointsEngine.notifyNewBadges(
          redemption.customer_id,
          refundResult?.newBadges || []
        );

        try {
          const info = await db('reward_redemptions')
            .join('customers', 'reward_redemptions.customer_id', 'customers.id')
            .join('users', 'customers.user_id', 'users.id')
            .join('rewards', 'reward_redemptions.reward_id', 'rewards.id')
            .where('reward_redemptions.id', redemptionId)
            .select(
              'users.id as user_id',
              'users.phone as user_phone',
              'users.whatsapp_number as user_whatsapp_number',
              'rewards.title as reward_title',
              'reward_redemptions.redemption_no'
            )
            .first();

          if (info) {
            await whatsAppNotificationService.onRewardStatusChanged({
              userId: info.user_id,
              phone: info.user_whatsapp_number || info.user_phone,
              rewardTitle: info.reward_title,
              redemptionNo: info.redemption_no,
              status: 'CANCELLED',
              reason: rejectionReason || 'Dibatalkan oleh staf/petugas',
            });
          }
        } catch (notifErr) {
          console.warn('[GamificationController] Notifikasi pembatalan hadiah gagal:', notifErr.message);
        }

        await recordAuditLog({
          userId: req.user.id,
          action: 'REWARD_CANCELLED',
          entityName: 'reward_redemptions',
          entityId: redemptionId,
          newValues: { status: 'CANCELLED', reason: rejectionReason },
          req,
        });

        return apiResponse.success(res, 'Penukaran hadiah berhasil dibatalkan dan poin telah dikembalikan ke nasabah.');
      }
    } catch (err) {
      if (!trx.isCompleted()) await trx.rollback();
      return apiResponse.error(res, err.message, 500);
    }
  }

  /**
   * GET /api/v1/gamification/redemptions/history
   */
  async getRedemptionsHistory(req, res) {
    try {
      let q = db('reward_redemptions')
        .join('rewards', 'reward_redemptions.reward_id', 'rewards.id')
        .join('customers', 'reward_redemptions.customer_id', 'customers.id')
        .select(
          'reward_redemptions.id',
          'reward_redemptions.redemption_no',
          'reward_redemptions.points_spent',
          'reward_redemptions.status',
          'reward_redemptions.created_at',
          'reward_redemptions.collected_at',
          'reward_redemptions.rejection_reason',
          'rewards.title as reward_title',
          'customers.name as customer_name',
          'customers.account_no'
        );

      if (req.user.role === 'NASABAH' && req.user.customer_id) {
        q = q.where('reward_redemptions.customer_id', req.user.customer_id);
      }

      const list = await q.orderBy('reward_redemptions.created_at', 'desc').limit(50);
      return apiResponse.success(res, 'Riwayat penukaran reward berhasil dimuat', list);
    } catch (err) {
      return apiResponse.error(res, err.message, 500);
    }
  }
}

module.exports = new GamificationController();
