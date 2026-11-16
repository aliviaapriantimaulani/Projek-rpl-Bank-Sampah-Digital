/**
 * Migration: Create waste categories, prices, and price history
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Waste Categories
  await knex.schema.createTable('waste_categories', (table) => {
    table.increments('id').primary();
    table.string('code', 50).notNullable().unique().index();
    table.string('name', 100).notNullable();
    table.string('parent_category', 50).notNullable().index(); // Plastic, Paper, Cardboard, Metal, Glass, Other
    table.text('description').nullable();
    table.string('unit', 20).defaultTo('KG'); // KG, PCS, LITER
    table.string('icon', 50).nullable();
    table.boolean('is_active').defaultTo(true).index();
    table.timestamps(true, true);
  });

  // Current Waste Prices
  await knex.schema.createTable('waste_prices', (table) => {
    table.increments('id').primary();
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('CASCADE');
    table
      .integer('waste_category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('CASCADE');
    table.decimal('buying_price', 12, 2).notNullable(); // Price bought from customer (Harga Beli)
    table.decimal('selling_price', 12, 2).notNullable(); // Price sold to pengepul (Harga Jual)
    table.date('effective_date').notNullable();
    table.boolean('is_active').defaultTo(true).index();
    table.timestamps(true, true);
  });

  // Waste Price History
  await knex.schema.createTable('waste_price_history', (table) => {
    table.increments('id').primary();
    table
      .integer('waste_category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('CASCADE');
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('SET NULL');
    table.decimal('old_buying_price', 12, 2).notNullable();
    table.decimal('new_buying_price', 12, 2).notNullable();
    table.decimal('old_selling_price', 12, 2).notNullable();
    table.decimal('new_selling_price', 12, 2).notNullable();
    table
      .integer('changed_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('reason').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('waste_price_history');
  await knex.schema.dropTableIfExists('waste_prices');
  await knex.schema.dropTableIfExists('waste_categories');
};
