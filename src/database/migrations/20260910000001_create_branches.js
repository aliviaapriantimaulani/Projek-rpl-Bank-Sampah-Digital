/**
 * Migration: Create branches table (multi-branch readiness)
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('branches', (table) => {
    table.increments('id').primary();
    table.string('code', 50).notNullable().unique().index();
    table.string('name', 150).notNullable();
    table.text('address').nullable();
    table.string('phone', 30).nullable();
    table.string('status', 20).defaultTo('ACTIVE').index();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('branches');
};
