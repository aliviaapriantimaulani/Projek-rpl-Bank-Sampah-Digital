/**
 * Migration: Create Inventory, Movements, Buyers (Pengepul), and Sales
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Inventory (Current stock per category per branch)
  await knex.schema.createTable('inventory', (table) => {
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
      .onDelete('RESTRICT');
    table.decimal('current_stock_kg', 12, 2).notNullable().defaultTo(0);
    table.timestamp('last_updated_at').defaultTo(knex.fn.now());
    table.unique(['branch_id', 'waste_category_id']);
  });

  // Inventory Movements (Stock in / stock out audit trail)
  await knex.schema.createTable('inventory_movements', (table) => {
    table.increments('id').primary();
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('SET NULL');
    table
      .integer('waste_category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('RESTRICT');
    table.string('movement_type', 30).notNullable().index(); // IN_DEPOSIT, OUT_SALE, ADJUSTMENT_LOSS, ADJUSTMENT_FOUND
    table.decimal('weight_kg', 12, 2).notNullable();
    table.decimal('stock_before_kg', 12, 2).notNullable();
    table.decimal('stock_after_kg', 12, 2).notNullable();
    table.string('reference_id', 100).nullable().index();
    table.text('notes').nullable();
    table
      .integer('created_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  // Buyers / Pengepul / Industrial Off-takers
  await knex.schema.createTable('buyers', (table) => {
    table.increments('id').primary();
    table.string('name', 150).notNullable();
    table.string('company_name', 150).nullable();
    table.string('phone', 30).nullable();
    table.text('address').nullable();
    table.boolean('is_active').defaultTo(true).index();
    table.timestamps(true, true);
  });

  // Waste Sales (Header)
  await knex.schema.createTable('waste_sales', (table) => {
    table.increments('id').primary();
    table.string('invoice_no', 60).notNullable().unique().index();
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('SET NULL');
    table
      .integer('buyer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('buyers')
      .onDelete('RESTRICT')
      .index();
    table.dateTime('sale_date').notNullable().index();
    table.decimal('total_weight_kg', 12, 2).notNullable().defaultTo(0);
    table.decimal('total_amount', 14, 2).notNullable().defaultTo(0);
    table.string('payment_status', 30).defaultTo('PAID').index(); // PAID, PENDING, PARTIAL
    table
      .integer('created_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('notes').nullable();
    table.timestamps(true, true);
  });

  // Waste Sale Items (Detail)
  await knex.schema.createTable('waste_sale_items', (table) => {
    table.increments('id').primary();
    table
      .integer('waste_sale_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_sales')
      .onDelete('CASCADE');
    table
      .integer('waste_category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('RESTRICT');
    table.decimal('weight_kg', 12, 2).notNullable();
    table.decimal('unit_price', 12, 2).notNullable();
    table.decimal('subtotal', 14, 2).notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('waste_sale_items');
  await knex.schema.dropTableIfExists('waste_sales');
  await knex.schema.dropTableIfExists('buyers');
  await knex.schema.dropTableIfExists('inventory_movements');
  await knex.schema.dropTableIfExists('inventory');
};
