/**
 * Migration: WhatsApp delivery tracking, admin preferences and idempotency.
 *
 * Adds:
 *  - users.whatsapp_opt_in_at / whatsapp_opt_out_at (consent audit)
 *  - users.notification_admin_* (admin event preferences)
 *  - notification_logs.idempotency_key / provider_message_id
 *  - whatsapp_queue.notification_log_id / idempotency_key / provider_message_id
 *  - supporting indexes
 *
 * Safe to run on both SQLite and MySQL.
 */

const addColumnIfMissing = async (knex, tableName, columnName, defineColumn) => {
  const exists = await knex.schema.hasColumn(tableName, columnName);
  if (exists) return false;
  await knex.schema.alterTable(tableName, (table) => {
    defineColumn(table);
  });
  return true;
};

const createIndexSafe = async (knex, indexName, tableName, columns, unique = false) => {
  try {
    const client = String(knex.client.config.client || '').toLowerCase();
    const uniqueSql = unique ? 'UNIQUE ' : '';
    if (client.includes('mysql')) {
      await knex.raw(`CREATE ${uniqueSql}INDEX ${indexName} ON ${tableName} (${columns})`);
    } else {
      await knex.raw(
        `CREATE ${uniqueSql}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`
      );
    }
  } catch (err) {
    // Index may already exist — ignore.
  }
};

const dropIndexSafe = async (knex, indexName, tableName) => {
  try {
    const client = String(knex.client.config.client || '').toLowerCase();
    if (client.includes('mysql')) {
      await knex.raw(`DROP INDEX ${indexName} ON ${tableName}`);
    } else {
      await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
    }
  } catch (err) {
    // Ignore when missing.
  }
};

exports.up = async function (knex) {
  // --- users: consent + admin preferences ---
  await addColumnIfMissing(knex, 'users', 'whatsapp_opt_in_at', (table) => {
    table.timestamp('whatsapp_opt_in_at').nullable();
  });
  await addColumnIfMissing(knex, 'users', 'whatsapp_opt_out_at', (table) => {
    table.timestamp('whatsapp_opt_out_at').nullable();
  });
  await addColumnIfMissing(knex, 'users', 'notification_admin_new_deposit', (table) => {
    table.boolean('notification_admin_new_deposit').defaultTo(false);
  });
  await addColumnIfMissing(knex, 'users', 'notification_admin_withdrawal', (table) => {
    table.boolean('notification_admin_withdrawal').defaultTo(true);
  });
  await addColumnIfMissing(knex, 'users', 'notification_admin_reward', (table) => {
    table.boolean('notification_admin_reward').defaultTo(true);
  });
  await addColumnIfMissing(knex, 'users', 'notification_admin_alert', (table) => {
    table.boolean('notification_admin_alert').defaultTo(true);
  });

  // --- notification_logs: idempotency & provider message tracking ---
  await addColumnIfMissing(knex, 'notification_logs', 'idempotency_key', (table) => {
    table.string('idempotency_key', 191).nullable();
  });
  await addColumnIfMissing(knex, 'notification_logs', 'provider_message_id', (table) => {
    table.string('provider_message_id', 191).nullable();
  });

  // --- whatsapp_queue: link to log + idempotency + provider message ---
  await addColumnIfMissing(knex, 'whatsapp_queue', 'notification_log_id', (table) => {
    table.integer('notification_log_id').unsigned().nullable();
  });
  await addColumnIfMissing(knex, 'whatsapp_queue', 'idempotency_key', (table) => {
    table.string('idempotency_key', 191).nullable();
  });
  await addColumnIfMissing(knex, 'whatsapp_queue', 'provider_message_id', (table) => {
    table.string('provider_message_id', 191).nullable();
  });

  await createIndexSafe(
    knex,
    'idx_notification_logs_idempotency',
    'notification_logs',
    'idempotency_key',
    true
  );
  await createIndexSafe(
    knex,
    'idx_notification_logs_provider_message',
    'notification_logs',
    'provider_message_id'
  );
  await createIndexSafe(
    knex,
    'idx_notification_logs_user_created',
    'notification_logs',
    'user_id, created_at'
  );
  await createIndexSafe(
    knex,
    'idx_whatsapp_queue_idempotency',
    'whatsapp_queue',
    'idempotency_key'
  );
  await createIndexSafe(
    knex,
    'idx_whatsapp_queue_provider_message',
    'whatsapp_queue',
    'provider_message_id'
  );
};

exports.down = async function (knex) {
  await dropIndexSafe(knex, 'idx_whatsapp_queue_provider_message', 'whatsapp_queue');
  await dropIndexSafe(knex, 'idx_whatsapp_queue_idempotency', 'whatsapp_queue');
  await dropIndexSafe(knex, 'idx_notification_logs_user_created', 'notification_logs');
  await dropIndexSafe(knex, 'idx_notification_logs_provider_message', 'notification_logs');
  await dropIndexSafe(knex, 'idx_notification_logs_idempotency', 'notification_logs');

  const dropColumnIfExists = async (tableName, columnName) => {
    const exists = await knex.schema.hasColumn(tableName, columnName);
    if (!exists) return;
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn(columnName);
    });
  };

  for (const column of ['notification_log_id', 'idempotency_key', 'provider_message_id']) {
    await dropColumnIfExists('whatsapp_queue', column);
  }
  for (const column of ['idempotency_key', 'provider_message_id']) {
    await dropColumnIfExists('notification_logs', column);
  }
  for (const column of [
    'notification_admin_new_deposit',
    'notification_admin_withdrawal',
    'notification_admin_reward',
    'notification_admin_alert',
    'whatsapp_opt_in_at',
    'whatsapp_opt_out_at',
  ]) {
    await dropColumnIfExists('users', column);
  }
};
