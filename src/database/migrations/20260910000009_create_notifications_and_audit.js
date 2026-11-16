/**
 * Migration: Create Notification Logs and Audit Logs
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Notification Logs
  await knex.schema.createTable('notification_logs', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .index();
    table.string('title', 150).notNullable();
    table.text('message').notNullable();
    table.string('type', 30).defaultTo('SYSTEM').index(); // TRANSACTION, WITHDRAWAL, SYSTEM, REWARD
    table.boolean('is_read').defaultTo(false).index();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  // Audit Logs (System-wide audit trail for compliance, auth events, and security)
  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
      .index();
    table.string('action', 100).notNullable().index(); // LOGIN_SUCCESS, LOGIN_FAIL, USER_CREATE, WITHDRAWAL_APPROVE, etc.
    table.string('entity_name', 100).notNullable().index(); // users, customer_wallets, withdrawal_requests, etc.
    table.string('entity_id', 100).nullable().index();
    table.text('old_values').nullable(); // JSON string
    table.text('new_values').nullable(); // JSON string
    table.string('ip_address', 45).nullable();
    table.string('user_agent', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('notification_logs');
};
