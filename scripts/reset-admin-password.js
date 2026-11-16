/**
 * Skrip Reset Password Admin - Bank Sampah Digital
 * --------------------------------------------------
 * Prosedur reset lokal yang AMAN:
 *   - Password baru dimasukkan TERSEMBUNYI (tidak di-echo, tidak dicatat di log/file).
 *   - Hash dibuat dengan bcryptjs = algoritma yang sama dengan login (src/utils/password.js).
 *   - HANYA kolom `password_hash` akun ADMIN terpilih yang diubah (tidak ada data dihapus).
 *   - Backup database dibuat SEBELUM perubahan (VACUUM INTO, aman walau server menyala).
 *   - Password dan hash TIDAK pernah dicetak ke layar, terminal, maupun log.
 *
 * Pemakaian:
 *   node scripts/reset-admin-password.js          -> jalankan proses reset
 *   node scripts/reset-admin-password.js --list   -> daftar akun ADMIN saja (tanpa ubah apa pun)
 */
'use strict';

require('dotenv').config();
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const knexFile = require('../knexfile.js');

const ROOT = path.resolve(__dirname, '..');
const knex = require('knex')(knexFile[process.env.NODE_ENV || 'development']);

// Input tersembunyi: raw mode tanpa echo (aman untuk password)
function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    if (!stdin.isTTY) {
      process.stdout.write('(stdin bukan terminal - dibatalkan)\n');
      process.exit(1);
    }
    let buf = '';
    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(buf);
          return;
        } else if (ch === '\u0003') {
          cleanup();
          process.stdout.write('\nDibatalkan pengguna (Ctrl+C).\n');
          process.exit(1);
        } else if (ch === '\u007f' || ch === '\b') {
          buf = buf.slice(0, -1);
        } else if (ch >= ' ') {
          buf += ch;
        }
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

function askVisible(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function abort(msg) {
  console.log('DIBATALKAN: ' + msg);
  process.exit(1);
}

async function main() {
  // 1) Daftar akun ADMIN (aman: hanya id/email/username/status)
  const res = await knex.raw(
    `SELECT u.id, u.email, u.username, u.status
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'ADMIN'
     ORDER BY u.id`
  );
  const admins = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : res;

  if (process.argv.includes('--list')) {
    console.log('Akun ADMIN (' + admins.length + '):');
    admins.forEach((a) => console.log('  [' + a.id + '] ' + a.email + ' (username: ' + a.username + ', status: ' + a.status + ')'));
    await knex.destroy();
    return;
  }

  if (!admins.length) {
    abort('tidak ada akun ADMIN di database.');
  }

  console.log('Akun ADMIN yang tersedia:');
  admins.forEach((a) => console.log('  [' + a.id + '] ' + a.email + ' (username: ' + a.username + ', status: ' + a.status + ')'));

  let target = admins[0];
  if (admins.length > 1) {
    const pick = await askVisible('Pilih ID akun yang akan di-reset: ');
    target = admins.find((a) => String(a.id) === pick);
    if (!target) abort('ID tidak ditemukan.');
  }

  // 2) Password baru (input tersembunyi, tanpa echo)
  const pass1 = await askHidden('Password baru untuk ' + target.email + ' (min. 8 karakter): ');
  if (!pass1 || pass1.length < 8) abort('password minimal 8 karakter.');
  const pass2 = await askHidden('Ulangi password baru: ');
  if (pass1 !== pass2) abort('password tidak cocok.');

  // 3) Konfirmasi eksplisit: ketik email akun target
  const confirm = await askVisible('Konfirmasi: ketik email "' + target.email + '" untuk melanjutkan: ');
  if (confirm !== target.email) abort('konfirmasi tidak sesuai.');

  // 4) Backup database SEBELUM perubahan (VACUUM INTO = snapshot konsisten, aman walau server jalan)
  const dbPath = path.resolve(ROOT, process.env.DB_SQLITE_FILENAME || './data/banksampah.sqlite');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const backupPath = dbPath + '.admin-reset-' + stamp + '.sqlite';
  try {
    try {
      await knex.raw('VACUUM INTO ?', [backupPath]);
    } catch (e) {
      await knex.raw("VACUUM INTO '" + backupPath.replace(/'/g, "''") + "'");
    }
    console.log('Backup database dibuat: ' + path.basename(backupPath));
  } catch (e) {
    abort('backup database gagal (' + e.message + ') - tidak ada perubahan yang dilakukan.');
  }

  // 5) Hash baru (bcryptjs, sama seperti login) + update HANYA password_hash baris ini
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
  const newHash = await bcrypt.hash(pass1, rounds);
  const updated = await knex('users').where({ id: target.id }).update({
    password_hash: newHash,
    updated_at: knex.fn.now(),
  });

  // 6) Verifikasi TANPA mencetak password/hash
  const row = await knex('users').where({ id: target.id }).first('password_hash', 'updated_at');
  const match = row ? await bcrypt.compare(pass1, row.password_hash) : false;

  // 7) Uji login sungguhan lewat API (hanya status HTTP, tanpa rahasia)
  let loginTest = 'server tidak merespons';
  try {
    const resp = await fetch('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: target.email, password: pass1 }),
    });
    loginTest = resp.ok ? 'BERHASIL (HTTP ' + resp.status + ')' : 'GAGAL (HTTP ' + resp.status + ')';
  } catch (e) {
    loginTest = 'server tidak merespons - nyalakan server lalu uji login manual';
  }

  console.log('');
  console.log('=== HASIL RESET ===');
  console.log('Akun            : ' + target.email + ' (id=' + target.id + ')');
  console.log('Baris diperbarui: ' + updated);
  console.log('Verifikasi hash : ' + (match ? 'COCOK (bcrypt.compare = true)' : 'TIDAK COCOK - HUBUNGI ADMIN'));
  console.log('Uji login API   : ' + loginTest);
  console.log('Password dan hash TIDAK dicetak maupun disimpan di file/log mana pun.');
  console.log('Data lain (akun, transaksi, saldo) tidak tersentuh.');

  await knex.destroy();
}

main().catch((e) => {
  console.log('GAGAL: ' + e.message);
  process.exit(1);
});
