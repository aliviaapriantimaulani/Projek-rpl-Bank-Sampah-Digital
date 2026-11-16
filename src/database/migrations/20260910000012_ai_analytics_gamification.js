/**
 * Migration 12: AI Analysis Records Enhancement, Notification Channels, Gamification Rules & Security Indexes
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Enhance ai_analysis_records with price recommendations and human-in-the-loop overrides
  const hasAiRecords = await knex.schema.hasTable('ai_analysis_records');
  if (hasAiRecords) {
    await knex.schema.alterTable('ai_analysis_records', (table) => {
      table.decimal('ai_recommended_price', 12, 2).nullable();
      table.decimal('confirmed_price', 12, 2).nullable();
      table.string('quality_assessment', 50).nullable(); // 'Grade A', 'Bersih & Kering', 'Campur/Kotor'
      table.text('explanation').nullable(); // AI explanation/reasoning
      table.string('image_path', 255).nullable();
      table.boolean('is_price_overridden').defaultTo(false).index();
    });
  }

  // 2. Enhance notification_logs for WhatsApp provider tracking and delivery status
  const hasNotifications = await knex.schema.hasTable('notification_logs');
  if (hasNotifications) {
    await knex.schema.alterTable('notification_logs', (table) => {
      table.string('channel', 30).defaultTo('SYSTEM').index(); // 'SYSTEM', 'WHATSAPP', 'EMAIL'
      table.string('delivery_status', 30).defaultTo('SENT').index(); // 'SENT', 'FAILED', 'NOT_CONFIGURED', 'MOCK_LOGGED'
      table.string('recipient_phone', 30).nullable();
      table.text('provider_response').nullable();
    });
  }

  // 3. Enhance reward_redemptions for staff processing & rejection audit
  const hasRedemptions = await knex.schema.hasTable('reward_redemptions');
  if (hasRedemptions) {
    await knex.schema.alterTable('reward_redemptions', (table) => {
      table
        .integer('processed_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.timestamp('processed_at').nullable();
      table.text('rejection_reason').nullable();
    });
  }

  // 4. Enhance waste_deposit_items to link back to AI vision records
  const hasDepositItems = await knex.schema.hasTable('waste_deposit_items');
  if (hasDepositItems) {
    await knex.schema.alterTable('waste_deposit_items', (table) => {
      table
        .integer('ai_record_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('ai_analysis_records')
        .onDelete('SET NULL');
      table.string('quality_grade', 50).nullable();
    });
  }

  // 5. Create configurable point_rules table for gamification engine
  const hasPointRules = await knex.schema.hasTable('point_rules');
  if (!hasPointRules) {
    await knex.schema.createTable('point_rules', (table) => {
      table.increments('id').primary();
      table.string('category_code', 50).notNullable().index(); // e.g. 'PLASTIC', 'PAPER', 'METAL', 'ALL'
      table.string('rule_type', 30).notNullable().index(); // 'PER_KG', 'PER_VALUE', 'FIXED_BONUS'
      table.integer('points_value').notNullable(); // e.g. 10 points per kg or 1 point per 1000 IDR
      table.decimal('multiplier', 5, 2).defaultTo(1.0);
      table.boolean('is_active').defaultTo(true).index();
      table.string('description', 255).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // Insert default initial point rules
    await knex('point_rules').insert([
      { category_code: 'ALL', rule_type: 'PER_KG', points_value: 10, multiplier: 1.0, is_active: true, description: '10 Poin per 1 kg sampah disetor' },
      { category_code: 'PLASTIC', rule_type: 'PER_KG', points_value: 15, multiplier: 1.0, is_active: true, description: 'Bonus 15 Poin per 1 kg sampah plastik' },
      { category_code: 'METAL', rule_type: 'PER_KG', points_value: 20, multiplier: 1.0, is_active: true, description: 'Bonus 20 Poin per 1 kg sampah logam/besi' },
      { category_code: 'FIRST_DEPOSIT_BONUS', rule_type: 'FIXED_BONUS', points_value: 50, multiplier: 1.0, is_active: true, description: 'Bonus 50 Poin untuk setoran pertama kali' },
    ]);
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('point_rules');

  const hasDepositItems = await knex.schema.hasTable('waste_deposit_items');
  if (hasDepositItems) {
    await knex.schema.alterTable('waste_deposit_items', (table) => {
      table.dropColumn('quality_grade');
      table.dropColumn('ai_record_id');
    });
  }

  const hasRedemptions = await knex.schema.hasTable('reward_redemptions');
  if (hasRedemptions) {
    await knex.schema.alterTable('reward_redemptions', (table) => {
      table.dropColumn('rejection_reason');
      table.dropColumn('processed_at');
      table.dropColumn('processed_by');
    });
  }

  const hasNotifications = await knex.schema.hasTable('notification_logs');
  if (hasNotifications) {
    await knex.schema.alterTable('notification_logs', (table) => {
      table.dropColumn('provider_response');
      table.dropColumn('recipient_phone');
      table.dropColumn('delivery_status');
      table.dropColumn('channel');
    });
  }

  const hasAiRecords = await knex.schema.hasTable('ai_analysis_records');
  if (hasAiRecords) {
    await knex.schema.alterTable('ai_analysis_records', (table) => {
      table.dropColumn('is_price_overridden');
      table.dropColumn('image_path');
      table.dropColumn('explanation');
      table.dropColumn('quality_assessment');
      table.dropColumn('confirmed_price');
      table.dropColumn('ai_recommended_price');
    });
  }
};
