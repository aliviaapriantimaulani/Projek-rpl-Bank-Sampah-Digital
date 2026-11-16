/**
 * Database Schema Service for AI Assistant
 * Provides structured database metadata to AI without exposing raw SQL or sensitive data.
 *
 * Supports both SQLite (local/zero-config) and MySQL (Laragon/production).
 * Internal migration bookkeeping tables (knex_*) are excluded so the assistant
 * reports the real application schema (currently 38 business tables).
 */

const db = require('../../config/database');
const env = require('../../config/env');

const TABLE_DESCRIPTIONS = {
  branches: 'Cabang bank sampah (multi-branch support)',
  roles: 'Peran pengguna (ADMIN, OWNER, PETUGAS, NASABAH)',
  permissions: 'Izin akses per modul',
  role_permissions: 'Mapping peran ke izin',
  users: 'Pengguna sistem (admin, petugas, owner, nasabah)',
  user_roles: 'Mapping pengguna ke peran',
  customers: 'Nasabah warga yang menabung sampah',
  customer_identifications: 'Identitas nasabah (KTP, SIM, KK)',
  waste_categories: 'Kategori sampah (Plastik, Kertas, Kardus, Logam, Kaca, dll)',
  waste_prices: 'Harga beli/jual sampah per kategori per cabang',
  waste_price_history: 'Riwayat perubahan harga sampah',
  waste_deposit_transactions: 'Transaksi setoran sampah (header)',
  waste_deposit_items: 'Detail item setoran per transaksi',
  weighing_records: 'Catatan timbangan (audit kalibrasi)',
  customer_wallets: 'Dompet tabungan nasabah (saldo real-time)',
  wallet_ledger: 'Buku besar mutasi saldo (immutable audit trail)',
  withdrawal_requests: 'Pengajuan penarikan saldo',
  withdrawal_approvals: 'Persetujuan penarikan oleh admin/owner',
  inventory: 'Stok sampah di gudang per kategori per cabang',
  inventory_movements: 'Riwayat pergerakan stok (masuk/keluar)',
  buyers: 'Pengepul/mitra pembeli sampah daur ulang',
  waste_sales: 'Penjualan sampah ke pengepul (header)',
  waste_sale_items: 'Detail item penjualan',
  customer_levels: 'Level nasabah (Pemula, Peduli, Pejuang, Jawara)',
  points: 'Poin reward hijau nasabah',
  point_transactions: 'Riwayat transaksi poin (EARN, REDEEM, EXPIRE, BONUS)',
  point_rules: 'Aturan perolehan poin gamifikasi yang dapat dikonfigurasi',
  badges: 'Lencana pencapaian',
  customer_badges: 'Lencana yang dimiliki nasabah',
  rewards: 'Katalog hadiah tukar poin',
  reward_redemptions: 'Penukaran hadiah oleh nasabah',
  notification_logs: 'Log notifikasi sistem dan WhatsApp (termasuk status pengiriman)',
  audit_logs: 'Audit trail sistem (login, perubahan data, dll)',
  whatsapp_templates: 'Template pesan WhatsApp Business API',
  whatsapp_queue: 'Antrian/retry pengiriman pesan WhatsApp',
  ai_analysis_records: 'Catatan inferensi AI Vision & konfirmasi petugas (human-in-the-loop)',
  ai_price_recommendations: 'Riwayat rekomendasi harga dari AI',
  otp_codes: 'Kode OTP sekali pakai untuk verifikasi transaksi',
};

class DatabaseSchemaService {
  constructor() {
    this.schemaCache = null;
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheTime = 0;
  }

  /**
   * Get full database schema structure (cached)
   * @returns {Promise<Object>}
   */
  async getFullSchema() {
    if (this.schemaCache && Date.now() - this.lastCacheTime < this.cacheExpiry) {
      return this.schemaCache;
    }

    const schema = await this.buildSchema();
    this.schemaCache = schema;
    this.lastCacheTime = Date.now();
    return schema;
  }

  getDialect() {
    const client =
      (db.client && db.client.config && db.client.config.client) || env.DB_CONNECTION || 'sqlite';
    return String(client).toLowerCase().includes('mysql') ? 'mysql' : 'sqlite';
  }

  normalizeRows(result) {
    // mysql2 returns [rows, fields] through knex.raw
    if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
    return Array.isArray(result) ? result : [];
  }

  isSafeIdentifier(name) {
    return typeof name === 'string' && /^[a-zA-Z0-9_]+$/.test(name);
  }

  /**
   * Build schema from database
   */
  async buildSchema() {
    const tables = await this.getTableList();
    const schema = {
      tables: {},
      relationships: [],
      summary: {
        totalTables: tables.length,
        databaseType: this.getDialect() === 'mysql' ? 'MySQL' : 'SQLite',
      },
    };

    for (const tableName of tables) {
      schema.tables[tableName] = await this.getTableSchema(tableName);
    }

    schema.relationships = await this.getRelationships(tables);
    return schema;
  }

  /**
   * Get list of all business tables (excludes internal migration tables)
   */
  async getTableList() {
    try {
      if (this.getDialect() === 'mysql') {
        const result = await db.raw(
          `SELECT table_name AS name
             FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name NOT LIKE 'knex_%'
              AND table_name NOT LIKE 'sqlite_%'
            ORDER BY table_name`
        );
        return this.normalizeRows(result).map((r) => r.name || r.NAME);
      }

      const result = await db.raw(`
        SELECT name FROM sqlite_master
        WHERE type='table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE 'knex_%'
        ORDER BY name
      `);
      return this.normalizeRows(result).map((r) => r.name);
    } catch (err) {
      console.error('[DatabaseSchemaService] Error getting table list:', err.message);
      return [];
    }
  }

  /**
   * Get detailed schema for a single table
   */
  async getTableSchema(tableName) {
    if (!this.isSafeIdentifier(tableName)) {
      return { name: tableName, columns: [], indexes: [], foreignKeys: [], description: '' };
    }

    try {
      if (this.getDialect() === 'mysql') {
        const columnsResult = await db.raw(
          `SELECT column_name AS name, column_type AS type, is_nullable AS is_nullable,
                  column_key AS column_key, column_default AS dflt_value, extra AS extra
             FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = ?
            ORDER BY ordinal_position`,
          [tableName]
        );

        const indexResult = await db.raw(
          `SELECT index_name AS name, non_unique AS non_unique
             FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = ?
            GROUP BY index_name, non_unique`,
          [tableName]
        );

        const fkResult = await db.raw(
          `SELECT column_name AS from_column, referenced_table_name AS to_table,
                  referenced_column_name AS to_column
             FROM information_schema.key_column_usage
            WHERE table_schema = DATABASE()
              AND table_name = ?
              AND referenced_table_name IS NOT NULL`,
          [tableName]
        );

        return {
          name: tableName,
          columns: this.normalizeRows(columnsResult).map((col) => ({
            name: col.name,
            type: col.type,
            notNull: String(col.is_nullable).toUpperCase() === 'NO',
            primaryKey: col.column_key === 'PRI',
            defaultValue: col.dflt_value,
          })),
          indexes: this.normalizeRows(indexResult).map((idx) => ({
            name: idx.name,
            unique: Number(idx.non_unique) === 0,
          })),
          foreignKeys: this.normalizeRows(fkResult).map((fk) => ({
            from: fk.from_column,
            to: fk.to_table,
            toColumn: fk.to_column,
          })),
          description: this.getTableDescription(tableName),
        };
      }

      const columns = await db.raw(`PRAGMA table_info(${tableName})`);
      const indexes = await db.raw(`PRAGMA index_list(${tableName})`);
      const foreignKeys = await db.raw(`PRAGMA foreign_key_list(${tableName})`);

      return {
        name: tableName,
        columns: this.normalizeRows(columns).map((col) => ({
          name: col.name,
          type: col.type,
          notNull: col.notnull === 1,
          primaryKey: col.pk === 1,
          defaultValue: col.dflt_value,
        })),
        indexes: this.normalizeRows(indexes).map((idx) => ({
          name: idx.name,
          unique: idx.unique === 1,
        })),
        foreignKeys: this.normalizeRows(foreignKeys).map((fk) => ({
          from: fk.from,
          to: fk.table,
          toColumn: fk.to,
        })),
        description: this.getTableDescription(tableName),
      };
    } catch (err) {
      console.error(`[DatabaseSchemaService] Error getting schema for ${tableName}:`, err.message);
      return { name: tableName, columns: [], indexes: [], foreignKeys: [], description: '' };
    }
  }

  /**
   * Get all foreign key relationships
   * @param {Array<string>} [tableList]
   */
  async getRelationships(tableList = null) {
    const relationships = [];
    const tables = tableList || (await this.getTableList());

    for (const tableName of tables) {
      if (!this.isSafeIdentifier(tableName)) continue;
      try {
        const fks =
          this.getDialect() === 'mysql'
            ? await db.raw(
                `SELECT column_name AS from_column, referenced_table_name AS to_table,
                        referenced_column_name AS to_column
                   FROM information_schema.key_column_usage
                  WHERE table_schema = DATABASE()
                    AND table_name = ?
                    AND referenced_table_name IS NOT NULL`,
                [tableName]
              )
            : await db.raw(`PRAGMA foreign_key_list(${tableName})`);

        for (const fk of this.normalizeRows(fks)) {
          relationships.push({
            fromTable: tableName,
            fromColumn: fk.from || fk.from_column || fk.fromColumn,
            toTable: fk.table || fk.to_table || fk.toTable,
            toColumn: fk.to || fk.to_column || fk.toColumn,
            onUpdate: fk.on_update,
            onDelete: fk.on_delete,
          });
        }
      } catch (err) {
        // Ignore errors for individual tables
      }
    }

    return relationships;
  }

  /**
   * Get human-readable table descriptions
   */
  getTableDescription(tableName) {
    return TABLE_DESCRIPTIONS[tableName] || 'Tabel sistem';
  }

  /**
   * Get allowed fields per role (RBAC)
   */
  getAllowedFields(role, tableName) {
    const sensitiveFields = ['password_hash', 'qr_code_token', 'nik', 'id_number', 'photo_url', 'pin_hash', 'code_hash'];
    const financialFields = ['buying_price', 'selling_price', 'current_balance', 'accumulated_earnings', 'accumulated_withdrawals', 'total_amount', 'unit_price', 'subtotal', 'amount', 'ai_recommended_price', 'confirmed_price'];
    const piiFields = ['email', 'phone', 'address', 'rt_rw', 'kelurahan', 'kecamatan', 'whatsapp_number'];

    // Admin/Owner can see all except passwords
    if (['ADMIN', 'OWNER'].includes(role)) {
      return { allowAll: true, exclude: ['password_hash', 'pin_hash', 'code_hash'] };
    }

    // Petugas can see operational data but not all financial fields
    if (role === 'PETUGAS') {
      return {
        allowAll: false,
        exclude: [...sensitiveFields, ...financialFields.filter((f) => !['buying_price'].includes(f))],
      };
    }

    // Nasabah can only see their own data (handled by endpoint-level RBAC)
    if (role === 'NASABAH') {
      return {
        allowAll: false,
        exclude: [...sensitiveFields, ...financialFields, ...piiFields, 'status'],
      };
    }

    // Guest - minimal
    return {
      allowAll: false,
      exclude: [...sensitiveFields, ...financialFields, ...piiFields, 'status', 'name', 'username', 'email', 'phone'],
    };
  }

  /**
   * Get schema summary for AI context
   * Include column details and ensure critical operational columns (e.g. is_active)
   * are visible to appropriate roles while excluding PII/financial data.
   */
  async getSchemaSummaryForAI(role = 'GUEST') {
    const schema = await this.getFullSchema();

    return {
      summary: schema.summary,
      tables: Object.entries(schema.tables).map(([name, table]) => ({
        name,
        description: table.description,
        columns: table.columns
          .map((c) => ({
            name: c.name,
            type: c.type,
            primaryKey: c.primaryKey,
            notNull: c.notNull,
            // Ensure 'is_active' column for categories/tables is always visible
            // when the table name suggests status tracking (e.g. waste_categories).
            isAlwaysVisible: c.name === 'is_active' && name === 'waste_categories' ? true : false,
          }))
          .filter((c) => {
            const allowed = this.getAllowedFields(role, name);
            // Allow is_active for waste_categories regardless of role exclusion lists,
            // so the AI can always query active/inactive status of waste types.
            if (c.name === 'is_active' && name === 'waste_categories') {
              return true;
            }
            return !allowed.exclude?.includes(c.name);
          }),
        rowCount: null,
      })),
      relationships: schema.relationships,
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.schemaCache = null;
    this.lastCacheTime = 0;
  }
}

module.exports = new DatabaseSchemaService();
