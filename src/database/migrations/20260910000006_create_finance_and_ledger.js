/**
 * Migration: Create Finance, Ledger-Based Wallets, and Withdrawal Approvals
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Customer Wallets (Balance snapshot tied strictly to ledger balance)
  await knex.schema.createTable('customer_wallets', (table) => {
    table.increments('id').primary();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('customers')
      .onDelete('RESTRICT')
      .index();
    table.decimal('current_balance', 14, 2).notNullable().defaultTo(0);
    table.decimal('accumulated_earnings', 14, 2).notNullable().defaultTo(0);
    table.decimal('accumulated_withdrawals', 14, 2).notNullable().defaultTo(0);
    table.timestamp('last_transaction_at').nullable();
    table.timestamps(true, true);
  });

  // Wallet Ledger (Immutable audit-trail of all debit and credit movements)
  await knex.schema.createTable('wallet_ledger', (table) => {
    table.increments('id').primary();
    table
      .integer('wallet_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customer_wallets')
      .onDelete('RESTRICT')
      .index();
    table.string('entry_type', 10).notNullable(); // CREDIT (+), DEBIT (-)
    table.decimal('amount', 14, 2).notNullable();
    table.decimal('balance_before', 14, 2).notNullable();
    table.decimal('balance_after', 14, 2).notNullable();
    table.string('reference_type', 50).notNullable().index(); // WASTE_DEPOSIT, WITHDRAWAL, BONUS, ADJUSTMENT
    table.string('reference_id', 100).nullable().index();
    table.text('description').notNullable();
    table
      .integer('created_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  // Withdrawal Requests
  await knex.schema.createTable('withdrawal_requests', (table) => {
    table.increments('id').primary();
    table.string('request_no', 60).notNullable().unique().index();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers')
      .onDelete('RESTRICT')
      .index();
    table.decimal('amount', 14, 2).notNullable();
    table.string('method', 30).notNullable().defaultTo('CASH'); // CASH, BANK_TRANSFER, EWALLET
    table.text('account_info').nullable(); // E.g. "BCA 1234567890 a.n Budi" or "Tunai di Loket"
    table.string('status', 30).defaultTo('PENDING').index(); // PENDING, APPROVED, REJECTED, DISBURSED, CANCELLED
    table.text('notes').nullable();
    table.timestamps(true, true);
  });

  // Withdrawal Approvals (Audit trail for approvals by Owner/Admin)
  await knex.schema.createTable('withdrawal_approvals', (table) => {
    table.increments('id').primary();
    table
      .integer('withdrawal_request_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('withdrawal_requests')
      .onDelete('CASCADE')
      .index();
    table
      .integer('reviewed_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.string('status', 30).notNullable(); // APPROVED, REJECTED
    table.text('rejection_reason').nullable();
    table.text('notes').nullable();
    table.timestamp('processed_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('withdrawal_approvals');
  await knex.schema.dropTableIfExists('withdrawal_requests');
  await knex.schema.dropTableIfExists('wallet_ledger');
  await knex.schema.dropTableIfExists('customer_wallets');
};
