/**
 * Disaster Recovery & Database Backup Script
 * Supports zero-config SQLite snapshotting with integrity verification,
 * and outputs production mysqldump commands for MySQL / Laragon deployments.
 */

const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const db = require('../src/config/database');

async function performBackup() {
  console.log('===========================================================');
  console.log(' 📦 BANK SAMPAH DIGITAL - DATABASE BACKUP UTILITY');
  console.log('===========================================================');

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (env.DB_CONNECTION === 'sqlite') {
    const sqliteSource = path.resolve(env.DB_SQLITE_FILENAME);
    const backupTarget = path.join(backupDir, `banksampah_backup_${timestamp}.sqlite`);

    console.log(`[SQLITE] Source: ${sqliteSource}`);
    console.log(`[SQLITE] Destination: ${backupTarget}`);

    if (!fs.existsSync(sqliteSource)) {
      console.error(`[ERROR] File database SQLite tidak ditemukan pada: ${sqliteSource}`);
      process.exit(1);
    }

    // Copy file
    fs.copyFileSync(sqliteSource, backupTarget);
    console.log(`[SUCCESS] Snapshot database berhasil disalin (${(fs.statSync(backupTarget).size / 1024).toFixed(1)} KB).`);


    // Run SQLite PRAGMA integrity_check
    try {
      const check = await db.raw('PRAGMA integrity_check;');
      console.log(`[INTEGRITY_CHECK] Status: ${JSON.stringify(check)}`);
    } catch (err) {
      console.warn(`[WARNING] Gagal menjalankan integrity_check: ${err.message}`);
    }

  } else {
    // MySQL Production instructions
    console.log('[MYSQL] Konfigurasi MySQL terdeteksi:');
    console.log(`Host: ${env.DB_HOST}:${env.DB_PORT} | DB: ${env.DB_DATABASE} | User: ${env.DB_USERNAME}`);
    console.log('\nJalankan perintah berikut di terminal Laragon / Server untuk backup penuh:');
    console.log(`mysqldump -h ${env.DB_HOST} -P ${env.DB_PORT} -u ${env.DB_USERNAME} -p ${env.DB_DATABASE} > backups/dump_${timestamp}.sql`);
  }

  console.log('===========================================================');
  console.log(' [DONE] Backup checklist selesai.');
  console.log('===========================================================');
  process.exit(0);
}

performBackup().catch((err) => {
  console.error('[FATAL] Backup gagal:', err);
  process.exit(1);
});
