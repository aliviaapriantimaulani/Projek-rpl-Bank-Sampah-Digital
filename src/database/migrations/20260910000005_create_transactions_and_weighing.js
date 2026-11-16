/**
 * Migration: Create waste deposit transactions, items, and weighing records
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Waste Deposit Transactions (Header)
  await knex.schema.createTable('waste_deposit_transactions', (table) => {
    table.increments('id').primary();
    table.string('transaction_no', 60).notNullable().unique().index();
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('SET NULL');
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers')
      .onDelete('RESTRICT')
      .index();
    table
      .integer('petugas_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.dateTime('transaction_date').notNullable().index();
    table.decimal('total_weight_kg', 10, 2).notNullable().defaultTo(0);
    table.decimal('total_amount', 14, 2).notNullable().defaultTo(0);
    table.string('status', 30).defaultTo('COMPLETED').index(); // COMPLETED, VOID, PENDING
    table.text('notes').nullable();
    table.timestamps(true, true);
  });

  // Waste Deposit Items (Detail)
  await knex.schema.createTable('waste_deposit_items', (table) => {
    table.increments('id').primary();
    table
      .integer('transaction_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_deposit_transactions')
      .onDelete('CASCADE');
    table
      .integer('waste_category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('RESTRICT');
    table.decimal('weight_kg', 10, 2).notNullable();
    table.decimal('price_per_kg', 12, 2).notNullable();
    table.decimal('subtotal', 14, 2).notNullable();
    table.text('notes').nullable();
    table.timestamps(true, true);
  });

  // Weighing Records (Scale Hardware & Calibration Audit)
  await knex.schema.createTable('weighing_records', (table) => {
    table.increments('id').primary();
    table
      .integer('deposit_item_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('waste_deposit_items')
      .onDelete('SET NULL');
    table.string('scale_identifier', 100).nullable(); // Timbangan Digital Port USB / IoT
    table.decimal('raw_weight', 10, 3).notNullable();
    table.decimal('tare_weight', 10, 3).defaultTo(0);
    table.decimal('net_weight', 10, 3).notNullable();
    table
      .integer('recorded_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('weighing_records');
  await knex.schema.dropTableIfExists('waste_deposit_items');
  await knex.schema.dropTableIfExists('waste_deposit_transactions');
};
