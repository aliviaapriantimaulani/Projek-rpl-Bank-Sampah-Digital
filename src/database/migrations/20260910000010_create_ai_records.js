/**
 * Migration: Create AI Analysis Records and AI Price Recommendations
 * (Auditable structure for future AI integration without fake AI logic)
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // AI Analysis Records (Audit trail for vision/weighing classification models)
  await knex.schema.createTable('ai_analysis_records', (table) => {
    table.increments('id').primary();
    table
      .integer('branch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('branches')
      .onDelete('SET NULL');
    table.string('model_version', 50).notNullable();
    table.string('image_hash', 128).nullable().index();
    table
      .integer('detected_category_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('SET NULL');
    table.decimal('confidence_score', 5, 4).nullable(); // E.g. 0.9850
    table.text('raw_payload').nullable(); // JSON payload from AI vision inference
    table.string('verification_status', 30).defaultTo('UNVERIFIED').index(); // UNVERIFIED, VERIFIED_CORRECT, CORRECTED, REJECTED
    table
      .integer('verified_category_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('SET NULL');
    table
      .integer('verified_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('auditor_notes').nullable();
    table.timestamp('verified_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  // AI Price Recommendations (Audit trail for automated circular economy market price predictions)
  await knex.schema.createTable('ai_price_recommendations', (table) => {
    table.increments('id').primary();
    table
      .integer('waste_category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('waste_categories')
      .onDelete('CASCADE');
    table.decimal('recommended_buying_price', 12, 2).notNullable();
    table.decimal('recommended_selling_price', 12, 2).notNullable();
    table.text('market_trend_summary').nullable();
    table.decimal('confidence_interval', 5, 2).nullable();
    table.boolean('is_applied').defaultTo(false).index();
    table
      .integer('applied_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('applied_at').nullable();
    table.timestamp('generated_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('ai_price_recommendations');
  await knex.schema.dropTableIfExists('ai_analysis_records');
};
