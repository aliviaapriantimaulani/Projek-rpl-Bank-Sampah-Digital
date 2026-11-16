/**
 * Configurable Gamification Points Engine
 * Evaluates points dynamically based on waste categories, weight, transaction values,
 * and handles atomic deduction for rewards without allowing negative balances.
 */

const db = require('../../config/database');
const badgeEngine = require('./badge.engine');
const logger = require('../../config/logger');

class InsufficientPointsError extends Error {
  constructor(message = 'Poin Anda tidak mencukupi untuk penukaran ini.') {
    super(message);
    this.name = 'InsufficientPointsError';
    this.statusCode = 400;
  }
}

class PointsEngine {
  /**
   * Calculates points earned from deposit items based on configurable point_rules
   * @param {Array<{ categoryCode: string, weightKg: number }>} items
   * @param {number} totalAmount
   * @param {boolean} isFirstDeposit
   * @returns {Promise<{ totalPoints: number, breakdown: Array }>}
   */
  async calculatePoints({ items = [], totalAmount = 0, isFirstDeposit = false }) {
    const rules = await db('point_rules').where({ is_active: true });

    let totalPoints = 0;
    const breakdown = [];

    // Map rules by category_code
    const ruleMap = {};
    rules.forEach((r) => {
      ruleMap[r.category_code] = r;
    });

    const defaultRule = ruleMap['ALL'] || { points_value: 10, multiplier: 1.0 };

    for (const item of items) {
      const code = (item.categoryCode || '').toUpperCase();
      let matchedRule = ruleMap[code] || defaultRule;

      let itemPoints = 0;
      if (matchedRule.rule_type === 'PER_KG') {
        itemPoints = Math.round(item.weightKg * matchedRule.points_value * parseFloat(matchedRule.multiplier || 1));
      } else if (matchedRule.rule_type === 'PER_VALUE') {
        itemPoints = Math.round((totalAmount / 1000) * matchedRule.points_value);
      }

      totalPoints += itemPoints;
      breakdown.push({
        category: code,
        weightKg: item.weightKg,
        points: itemPoints,
        rule: matchedRule.description || 'Aturan standar poin',
      });
    }

    // First deposit bonus rule
    if (isFirstDeposit && ruleMap['FIRST_DEPOSIT_BONUS']) {
      const bonus = ruleMap['FIRST_DEPOSIT_BONUS'].points_value;
      totalPoints += bonus;
      breakdown.push({
        category: 'BONUS',
        points: bonus,
        rule: ruleMap['FIRST_DEPOSIT_BONUS'].description,
      });
    }

    return { totalPoints: Math.max(1, totalPoints), breakdown };
  }

  /**
   * Awards points to a customer atomically inside a database transaction
   */
  async awardPoints({ customerId, pointsEarned, referenceId, description, trx = null }) {
    const dbClient = trx || db;

    if (pointsEarned <= 0) return { newBalance: 0, level: null };

    // Record point transaction
    await dbClient('point_transactions').insert({
      customer_id: customerId,
      points: pointsEarned,
      type: 'EARN',
      reference_id: referenceId || null,
      description: description || `Perolehan ${pointsEarned} poin hijau`,
      created_at: new Date(),
    });

    // Update customer points balance
    const existing = await dbClient('points').where({ customer_id: customerId }).first();
    let newBalance = pointsEarned;
    let lifetime = pointsEarned;

    if (existing) {
      newBalance = existing.current_points + pointsEarned;
      lifetime = existing.lifetime_points + pointsEarned;
      await dbClient('points')
        .where({ customer_id: customerId })
        .update({
          current_points: newBalance,
          lifetime_points: lifetime,
          updated_at: new Date(),
        });
    } else {
      await dbClient('points').insert({
        customer_id: customerId,
        current_points: newBalance,
        lifetime_points: lifetime,
        updated_at: new Date(),
      });
    }

    // Update customer level
    const currentLevel = await this.evaluateCustomerLevel(customerId, lifetime, dbClient);

    // Evaluate badges, but do NOT send WhatsApp here: this method runs inside
    // the deposit/reward transaction. Callers notify after commit via
    // notifyNewBadges() so a rolled-back transaction never messages anyone.
    const newBadges = await badgeEngine.evaluateBadges(customerId, dbClient);

    return {
      newBalance,
      lifetimePoints: lifetime,
      level: currentLevel,
      newBadges,
    };
  }

  /**
   * Send achievement notifications after the surrounding transaction commits.
   * Never throws: notification failures must not fail the business operation.
   */
  async notifyNewBadges(customerId, newBadges = []) {
    if (!Array.isArray(newBadges) || newBadges.length === 0) return;

    try {
      const customer = await db('customers').where({ id: customerId }).first();
      if (!customer) return;
      const user = await db('users').where({ id: customer.user_id }).first();
      if (!user) return;
      await badgeEngine.sendBadgeNotifications(customerId, newBadges, user);
    } catch (err) {
      logger.warn(`[BADGE_NOTIFICATION] Gagal mengirim notifikasi lencana: ${err.message}`);
    }
  }

  /**
   * Deducts points from customer for reward redemption atomically
   * Strictly prevents negative points balance
   */
  async deductPoints({ customerId, pointsToDeduct, referenceId, description, trx = null }) {
    const dbClient = trx || db;

    if (pointsToDeduct <= 0) {
      throw new Error('Nominal poin yang ditukarkan harus lebih dari 0.');
    }

    const record = await dbClient('points').where({ customer_id: customerId }).first();
    const currentBalance = record ? record.current_points : 0;

    if (currentBalance < pointsToDeduct) {
      throw new InsufficientPointsError(
        `Poin Anda tidak mencukupi (Tersedia: ${currentBalance} Poin, Diperlukan: ${pointsToDeduct} Poin).`
      );
    }

    const newBalance = currentBalance - pointsToDeduct;

    // Record point transaction (negative points)
    await dbClient('point_transactions').insert({
      customer_id: customerId,
      points: -pointsToDeduct,
      type: 'REDEEM',
      reference_id: referenceId || null,
      description: description || `Penukaran reward (${pointsToDeduct} Poin)`,
      created_at: new Date(),
    });

    // Update points table
    await dbClient('points')
      .where({ customer_id: customerId })
      .update({
        current_points: newBalance,
        updated_at: new Date(),
      });

    return { newBalance, deducted: pointsToDeduct };
  }

  /**
   * Checks customer points and assigns level based on customer_levels table
   */
  async evaluateCustomerLevel(customerId, lifetimePoints, dbClient = db) {
    const levels = await dbClient('customer_levels').orderBy('min_points', 'asc');
    let matchedLevel = levels[0] || null;

    for (const lvl of levels) {
      if (lifetimePoints >= lvl.min_points) {
        matchedLevel = lvl;
      }
    }

    return matchedLevel;
  }
}

module.exports = {
  PointsEngine: new PointsEngine(),
  InsufficientPointsError,
};
