/**
 * Gamification Badge & Achievement Engine
 * Evaluates milestones (first deposit, milestone weight, transaction count)
 * and awards digital badges automatically.
 */

const db = require('../../config/database');
const logger = require('../../config/logger');
const whatsAppNotificationService = require('../../services/notification/whatsapp.service');

class BadgeEngine {
  /**
   * Evaluates all achievement rules for a customer after a deposit
   * @param {number} customerId
   * @param {Object} [trx]
   */
  async evaluateBadges(customerId, trx = null) {
    const dbClient = trx || db;

    try {
      const customer = await dbClient('customers').where({ id: customerId }).first();
      if (!customer) return [];

      const awardedBadges = [];

      // Fetch existing badges already awarded
      const existingBadgeIds = await dbClient('customer_badges')
        .where({ customer_id: customerId })
        .pluck('badge_id');

      // 1. Rule: FIRST_DEPOSIT
      const firstDepositBadge = await dbClient('badges').where({ code: 'FIRST_DEPOSIT' }).first();
      if (firstDepositBadge && !existingBadgeIds.includes(firstDepositBadge.id)) {
        const depositCount = await dbClient('waste_deposit_transactions')
          .where({ customer_id: customerId })
          .count('id as count')
          .first();

        if (parseInt(depositCount?.count || 0, 10) >= 1) {
          await dbClient('customer_badges').insert({
            customer_id: customerId,
            badge_id: firstDepositBadge.id,
            awarded_at: new Date(),
          });
          awardedBadges.push(firstDepositBadge);
        }
      }

      // 2. Rule: PLASTIC_HERO_10KG
      const plasticBadge = await dbClient('badges').where({ code: 'PLASTIC_HERO_10KG' }).first();
      if (plasticBadge && !existingBadgeIds.includes(plasticBadge.id)) {
        const plasticDeposited = await dbClient('waste_deposit_items')
          .join('waste_deposit_transactions', 'waste_deposit_items.transaction_id', 'waste_deposit_transactions.id')
          .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
          .where('waste_deposit_transactions.customer_id', customerId)
          .where('waste_categories.code', 'like', '%PLAS%')
          .sum('waste_deposit_items.weight_kg as total_kg')
          .first();

        const plasticKg = parseFloat(plasticDeposited?.total_kg || 0);
        if (plasticKg >= 10) {
          await dbClient('customer_badges').insert({
            customer_id: customerId,
            badge_id: plasticBadge.id,
            awarded_at: new Date(),
          });
          awardedBadges.push(plasticBadge);
        }
      }

      // 3. Rule: CONSISTENT_WARGA (Active in multiple distinct months)
      const starBadge = await dbClient('badges').where({ code: 'CONSISTENT_WARGA' }).first();
      if (starBadge && !existingBadgeIds.includes(starBadge.id)) {
        const depositCount = await dbClient('waste_deposit_transactions')
          .where({ customer_id: customerId })
          .count('id as count')
          .first();

        if (parseInt(depositCount?.count || 0, 10) >= 3) {
          await dbClient('customer_badges').insert({
            customer_id: customerId,
            badge_id: starBadge.id,
            awarded_at: new Date(),
          });
          awardedBadges.push(starBadge);
        }
      }

      return awardedBadges;
    } catch (err) {
      logger.error(`[BADGE_EVAL_ERROR] Failed to evaluate badges for customer ${customerId}: ${err.message}`);
      return [];
    }
  }

  /**
   * Send WhatsApp notifications for newly awarded badges
   * @param {number} customerId
   * @param {Array} awardedBadges
   * @param {Object} user - User object with id, phone
   */
  async sendBadgeNotifications(customerId, awardedBadges, user) {
    if (!awardedBadges.length || !user) return;

    for (const badge of awardedBadges) {
      try {
        await whatsAppNotificationService.onAchievementUnlocked({
          userId: user.id,
          phone: user.phone,
          badgeName: badge.name,
          badgeDescription: badge.description
        });
      } catch (err) {
        logger.warn(`[BADGE_NOTIFICATION] Failed to send WhatsApp for badge ${badge.code}: ${err.message}`);
      }
    }
  }
}

module.exports = new BadgeEngine();
