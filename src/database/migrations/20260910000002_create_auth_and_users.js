/**
 * Migration: Create Auth, Roles, Permissions, and Users
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Roles table
  await knex.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('name', 50).notNullable().unique().index(); // ADMIN, OWNER, PETUGAS, NASABAH
    table.string('display_name', 100).notNullable();
    table.text('description').nullable();
    table.timestamps(true, true);
  });

  // Permissions table
  await knex.schema.createTable('permissions', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique().index();
    table.string('module', 50).notNullable().index();
    table.text('description').nullable();
    table.timestamps(true, true);
  });

  // Role Permissions mapping
  await knex.schema.createTable('role_permissions', (table) => {
    table.increments('id').primary();
    table
      .integer('role_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');
    table
      .integer('permission_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('permissions')
      .onDelete('CASCADE');
    table.unique(['role_id', 'permission_id']);
  });

  // Users table
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('SET NULL');
    table.string('name', 150).notNullable();
    table.string('email', 150).notNullable().unique().index();
    table.string('username', 100).notNullable().unique().index();
    table.string('phone', 30).nullable();
    table.string('password_hash', 255).notNullable();
    table.string('status', 20).defaultTo('ACTIVE').index(); // ACTIVE, INACTIVE, SUSPENDED
    table.timestamps(true, true);
  });

  // User Roles mapping
  await knex.schema.createTable('user_roles', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('role_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');
    table.unique(['user_id', 'role_id']);
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
};
