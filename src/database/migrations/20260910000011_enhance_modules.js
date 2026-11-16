/**
 * Migration: Enhance modules with PIN hash, idempotency, withdrawal details, OTP codes, and sales acquisition cost
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Add pin_hash to customers table for transaction PIN verification
  const hasPinHash = await knex.schema.hasColumn('customers', 'pin_hash');
  if (!hasPinHash) {
    await knex.schema.alterTable('customers', (table) => {
      table.string('pin_hash', 255).nullable();
    });
  }

  // 2. Add idempotency_key to waste_deposit_transactions to prevent duplicate submissions
  const hasIdempotency = await knex.schema.hasColumn('waste_deposit_transactions', 'idempotency_key');
  if (!hasIdempotency) {
    await knex.schema.alterTable('waste_deposit_transactions', (table) => {
      table.string('idempotency_key', 100).nullable().unique().index();
    });
  }

  // 3. Add bank details and payment reference to withdrawal_requests
  const hasBankName = await knex.schema.hasColumn('withdrawal_requests', 'bank_name');
  if (!hasBankName) {
    await knex.schema.alterTable('withdrawal_requests', (table) => {
      table.string('bank_name', 50).nullable();
      table.string('bank_account_number', 50).nullable();
      table.string('bank_account_holder', 100).nullable();
      table.string('payment_reference', 100).nullable();
      table.timestamp('disbursed_at').nullable();
    });
  }

  // 4. Create otp_codes table for withdrawal security
  const hasOtpTable = await knex.schema.hasTable('otp_codes');
  if (!hasOtpTable) {
    await knex.schema.createTable('otp_codes', (table) => {
      table.increments('id').primary();
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .index();
      table.string('code_hash', 255).notNullable();
      table.string('action', 50).defaultTo('WITHDRAWAL').index();
      table.timestamp('expires_at').notNullable().index();
      table.integer('attempts').defaultTo(0);
      table.boolean('is_used').defaultTo(false).index();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // 5. Add cost_price_per_kg to waste_sale_items for margin calculation
  const hasCostPrice = await knex.schema.hasColumn('waste_sale_items', 'cost_price_per_kg');
  if (!hasCostPrice) {
    await knex.schema.alterTable('waste_sale_items', (table) => {
      table.decimal('cost_price_per_kg', 12, 2).nullable().defaultTo(0);
    });
  }

  // 6. Add idempotency_key to waste_sales
  const hasSaleIdempotency = await knex.schema.hasColumn('waste_sales', 'idempotency_key');
  if (!hasSaleIdempotency) {
    await knex.schema.alterTable('waste_sales', (table) => {
      table.string('idempotency_key', 100).nullable().unique().index();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('otp_codes');
  // SQLite alter table drops are selective, safe fallback
};
