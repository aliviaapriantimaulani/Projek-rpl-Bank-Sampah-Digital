/**
 * Migration: Create customers (nasabah) and identification
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Customers table
  await knex.schema.createTable('customers', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('SET NULL');
    table.string('nik', 30).notNullable().unique().index();
    table.string('account_no', 50).notNullable().unique().index();
    table.text('address').nullable();
    table.string('rt_rw', 20).nullable();
    table.string('kelurahan', 100).nullable();
    table.string('kecamatan', 100).nullable();
    table.string('qr_code_token', 100).notNullable().unique().index();
    table.date('join_date').notNullable();
    table.string('status', 20).defaultTo('ACTIVE').index(); // ACTIVE, INACTIVE, BLACKLISTED
    table.timestamps(true, true);
  });

  // Customer Identifications (KTP, SIM, KK)
  await knex.schema.createTable('customer_identifications', (table) => {
    table.increments('id').primary();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('customers')
      .onDelete('CASCADE');
    table.string('id_type', 30).notNullable(); // KTP, SIM, KK
    table.string('id_number', 50).notNullable();
    table.string('photo_url', 255).nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('customer_identifications');
  await knex.schema.dropTableIfExists('customers');
};
