/**
 * Migration: Add notification preferences and WhatsApp settings to users/customers
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Add WhatsApp and notification preference columns to users table
  const hasWaNum = await knex.schema.hasColumn('users', 'whatsapp_number');
  if (!hasWaNum) {
    await knex.schema.alterTable('users', (table) => {
      table.string('whatsapp_number', 30).nullable().comment('Nomor WhatsApp format 628xxx');
      table.boolean('whatsapp_verified').defaultTo(false);
      table.string('whatsapp_verified_at').nullable();
      table.boolean('notification_whatsapp_enabled').defaultTo(true);
      table.boolean('notification_system_enabled').defaultTo(true);
    });
  }

  // Add notification preferences to customers table
  const hasNotifDep = await knex.schema.hasColumn('customers', 'notification_deposit');
  if (!hasNotifDep) {
    await knex.schema.alterTable('customers', (table) => {
      table.boolean('notification_deposit').defaultTo(true);
      table.boolean('notification_withdrawal').defaultTo(true);
      table.boolean('notification_reward').defaultTo(true);
      table.boolean('notification_achievement').defaultTo(true);
      table.boolean('notification_balance').defaultTo(true);
    });
  }

  // Add delivery status tracking to notification_logs
  const hasDelivered = await knex.schema.hasColumn('notification_logs', 'delivered_at');
  if (!hasDelivered) {
    try {
      await knex.schema.alterTable('notification_logs', (table) => {
        table.datetime('delivered_at').nullable();
      });
    } catch (e) { /* column may already exist */ }
  }
  
  const hasRead = await knex.schema.hasColumn('notification_logs', 'read_at');
  if (!hasRead) {
    try {
      await knex.schema.alterTable('notification_logs', (table) => {
        table.datetime('read_at').nullable();
      });
    } catch (e) { /* column may already exist */ }
  }

  // Create WhatsApp template registry table
  const hasTemplates = await knex.schema.hasTable('whatsapp_templates');
  if (!hasTemplates) {
    await knex.schema.createTable('whatsapp_templates', (table) => {
      table.increments('id').primary();
      table.string('name', 100).notNullable().unique().index();
      table.string('category', 30).notNullable(); // MARKETING, UTILITY, AUTHENTICATION
      table.string('language', 10).defaultTo('id');
      table.text('header').nullable(); // Header text/media
      table.text('body').notNullable(); // Body with {{1}}, {{2}} placeholders
      table.text('footer').nullable();
      table.text('buttons').nullable(); // JSON array of buttons
      table.string('provider_template_id', 100).nullable(); // ID from WhatsApp provider
      table.string('status', 30).defaultTo('PENDING').index(); // PENDING, APPROVED, REJECTED
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });
  }

  // Create WhatsApp message queue for async processing
  const hasQueue = await knex.schema.hasTable('whatsapp_queue');
  if (!hasQueue) {
    await knex.schema.createTable('whatsapp_queue', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL').index();
      table.string('phone', 30).notNullable();
      table.string('event', 50).notNullable().index();
      table.string('title', 150).notNullable();
      table.text('message').notNullable();
      table.string('template_name', 100).nullable();
      table.json('template_params').nullable();
      table.integer('priority').defaultTo(5); // 1=highest, 10=lowest
      table.integer('retry_count').defaultTo(0);
      table.integer('max_retries').defaultTo(3);
      table.string('status', 30).defaultTo('PENDING').index(); // PENDING, PROCESSING, SENT, FAILED, CANCELLED
      table.text('error_message').nullable();
      table.timestamp('scheduled_at').defaultTo(knex.fn.now()).index();
      table.timestamp('sent_at').nullable();
      table.timestamp('delivered_at').nullable();
      table.timestamps(true, true);
    });
  }

  // Create index for efficient queue processing
  try {
    const client = String(knex.client.config.client || '').toLowerCase();
    if (client.includes('mysql')) {
      await knex.raw('CREATE INDEX idx_whatsapp_queue_status_scheduled ON whatsapp_queue(status, scheduled_at)');
    } else {
      await knex.raw('CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_scheduled ON whatsapp_queue(status, scheduled_at)');
    }
  } catch (e) { /* index may already exist */ }
};

exports.down = async function (knex) {
  try {
    const client = String(knex.client.config.client || '').toLowerCase();
    if (client.includes('mysql')) {
      await knex.raw('DROP INDEX idx_whatsapp_queue_status_scheduled ON whatsapp_queue');
    } else {
      await knex.raw('DROP INDEX IF EXISTS idx_whatsapp_queue_status_scheduled');
    }
  } catch (e) { /* ignore */ }

  await knex.schema.dropTableIfExists('whatsapp_queue');
  await knex.schema.dropTableIfExists('whatsapp_templates');
  
  await knex.schema.alterTable('notification_logs', (table) => {
    table.dropColumn('channel');
    table.dropColumn('delivery_status');
    table.dropColumn('provider_response');
    table.dropColumn('delivered_at');
    table.dropColumn('read_at');
  });

  await knex.schema.alterTable('customers', (table) => {
    table.dropColumn('notification_deposit');
    table.dropColumn('notification_withdrawal');
    table.dropColumn('notification_reward');
    table.dropColumn('notification_achievement');
    table.dropColumn('notification_balance');
  });

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('whatsapp_number');
    table.dropColumn('whatsapp_verified');
    table.dropColumn('whatsapp_verified_at');
    table.dropColumn('notification_whatsapp_enabled');
    table.dropColumn('notification_system_enabled');
  });
};