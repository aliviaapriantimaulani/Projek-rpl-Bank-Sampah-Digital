/**
 * Migration: allow phone-only notification logs.
 *
 * Manual/test WhatsApp notifications may target a phone number that is not
 * linked to a users row. notification_logs.user_id was NOT NULL, which made
 * those sends fail. The column is now nullable; user_id stays populated for all
 * account-based notifications.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('notification_logs');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('notification_logs', 'user_id');
  if (!hasColumn) return;

  await knex.schema.alterTable('notification_logs', (table) => {
    table.integer('user_id').unsigned().nullable().alter();
  });
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable('notification_logs');
  if (!hasTable) return;

  // Existing NULL rows cannot satisfy the old NOT NULL constraint; attach them
  // to the lowest user id so rollback remains possible.
  const fallback = await knex('users').select('id').orderBy('id', 'asc').first();
  if (fallback) {
    await knex('notification_logs').whereNull('user_id').update({ user_id: fallback.id });
  }

  await knex.schema.alterTable('notification_logs', (table) => {
    table.integer('user_id').unsigned().notNullable().alter();
  });
};
