/**
 * Migration: Create Rewards, Points, Badges, and Gamification
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Customer Levels
  await knex.schema.createTable('customer_levels', (table) => {
    table.increments('id').primary();
    table.string('name', 50).notNullable().unique(); // Pemula, Peduli, Pejuang Lingkungan, Jawara Sirkular
    table.integer('min_points').notNullable().defaultTo(0);
    table.string('badge_icon', 50).nullable();
    table.text('benefits').nullable();
    table.timestamps(true, true);
  });

  // Points (Current balance and lifetime stats)
  await knex.schema.createTable('points', (table) => {
    table.increments('id').primary();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('customers')
      .onDelete('CASCADE')
      .index();
    table.integer('current_points').notNullable().defaultTo(0);
    table.integer('lifetime_points').notNullable().defaultTo(0);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Point Transactions
  await knex.schema.createTable('point_transactions', (table) => {
    table.increments('id').primary();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers')
      .onDelete('CASCADE')
      .index();
    table.integer('points').notNullable(); // Positive for EARN, negative for REDEEM
    table.string('type', 20).notNullable().index(); // EARN, REDEEM, EXPIRE, BONUS
    table.string('reference_id', 100).nullable();
    table.string('description', 255).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Badges
  await knex.schema.createTable('badges', (table) => {
    table.increments('id').primary();
    table.string('code', 50).notNullable().unique().index();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.string('icon_url', 255).nullable();
    table.text('criteria').nullable();
    table.timestamps(true, true);
  });

  // Customer Badges
  await knex.schema.createTable('customer_badges', (table) => {
    table.increments('id').primary();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers')
      .onDelete('CASCADE');
    table
      .integer('badge_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('badges')
      .onDelete('CASCADE');
    table.timestamp('awarded_at').defaultTo(knex.fn.now());
    table.unique(['customer_id', 'badge_id']);
  });

  // Rewards catalog
  await knex.schema.createTable('rewards', (table) => {
    table.increments('id').primary();
    table.string('title', 150).notNullable();
    table.text('description').nullable();
    table.integer('point_cost').notNullable();
    table.integer('stock').notNullable().defaultTo(0);
    table.boolean('is_active').defaultTo(true).index();
    table.date('valid_until').nullable();
    table.timestamps(true, true);
  });

  // Reward Redemptions
  await knex.schema.createTable('reward_redemptions', (table) => {
    table.increments('id').primary();
    table.string('redemption_no', 60).notNullable().unique().index();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers')
      .onDelete('RESTRICT')
      .index();
    table
      .integer('reward_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('rewards')
      .onDelete('RESTRICT');
    table.integer('points_spent').notNullable();
    table.string('status', 30).defaultTo('REQUESTED').index(); // REQUESTED, APPROVED, COLLECTED, CANCELLED
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('collected_at').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('reward_redemptions');
  await knex.schema.dropTableIfExists('rewards');
  await knex.schema.dropTableIfExists('customer_badges');
  await knex.schema.dropTableIfExists('badges');
  await knex.schema.dropTableIfExists('point_transactions');
  await knex.schema.dropTableIfExists('points');
  await knex.schema.dropTableIfExists('customer_levels');
};
