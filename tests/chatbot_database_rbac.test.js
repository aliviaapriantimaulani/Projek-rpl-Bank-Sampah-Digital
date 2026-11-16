const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');

/**
 * Verifies the DB-aware chatbot path (/chatbot/message) answers operational
 * questions from SQLite and enforces role-based access for NASABAH/guests.
 */
describe('Chatbot Database Answers & RBAC', () => {
  let server;
  let baseUrl;
  let adminToken;
  let nasabahToken;
  let nasabahCust;

  const ask = async (message, token = null) => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, history: [] }),
    });
    const json = await res.json();
    return { res, json, answer: String(json?.data?.answer || json?.data?.reply || '') };
  };

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const admin = await db('users').where({ username: 'admin' }).first();
    const nasabahUser = await db('users').where({ username: 'nasabah' }).first();
    nasabahCust = await db('customers').where({ user_id: nasabahUser.id }).first();

    adminToken = generateToken({ id: admin.id, role: 'ADMIN' });
    nasabahToken = generateToken({ id: nasabahUser.id, role: 'NASABAH' });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('1. Identitas asisten dijawab tanpa data database', async () => {
    const { res, answer } = await ask('Siapa anda?');
    assert.equal(res.status, 200);
    assert.match(answer, /Asisten AI Cerdas Bank Sampah/i);
    assert.doesNotMatch(answer, /\*\*/);
  });

  test('2. ADMIN mendapat total pengguna & nasabah dari database', async () => {
    const { res, answer, json } = await ask('Berapa total pengguna terdaftar?', adminToken);
    assert.equal(res.status, 200);
    assert.match(answer, /Total Pengguna Sistem/i);
    assert.match(answer, /Total Nasabah Terdaftar/i);
    assert.equal(json.data.authorized, true);
    assert.ok(json.data.provider.includes('Nous Research'));
  });

  test('3. ADMIN mendapat transaksi terbaru dari database', async () => {
    const { res, answer } = await ask('Tampilkan transaksi terbaru', adminToken);
    assert.equal(res.status, 200);
    assert.ok(
      /Transaksi Setoran Terbaru|Belum ada transaksi setoran/i.test(answer),
      'Harus menampilkan daftar transaksi atau pesan kosong yang jelas'
    );
  });

  test('4. Harga besi dijawab spesifik, bukan seluruh katalog', async () => {
    const { res, answer } = await ask('Berapa harga besi?', adminToken);
    assert.equal(res.status, 200);
    assert.match(answer, /Besi/i);
    assert.match(answer, /Rp\s?[\d.]+/);
    assert.match(answer, /Harga resmi Bank Sampah Digital/i);
  });

  test('5. Struktur database menyebut tabel asli dan tidak membocorkan SQL mentah', async () => {
    const { res, answer } = await ask('Jelaskan struktur database', adminToken);
    assert.equal(res.status, 200);
    assert.match(answer, /Struktur Database Bank Sampah Digital/i);
    assert.match(answer, /customer_wallets/);
    assert.match(answer, /ai_analysis_records/);
    assert.doesNotMatch(answer, /DROP TABLE|ALTER TABLE|SELECT \* FROM/i);
  });

  test('6. Total saldo seluruh nasabah hanya untuk ADMIN/OWNER', async () => {
    const admin = await ask('Berapa total saldo nasabah?', adminToken);
    assert.equal(admin.res.status, 200);
    assert.match(admin.answer, /Total saldo tabungan seluruh nasabah/i);

    const nasabah = await ask('Berapa total saldo nasabah?', nasabahToken);
    assert.equal(nasabah.res.status, 200);
    assert.match(nasabah.answer, /hanya dapat diakses/i);
    assert.equal(nasabah.json.data.authorized, false);
  });

  test('7. NASABAH tidak menerima statistik pengguna/organisasi', async () => {
    const { res, answer } = await ask('Berapa total pengguna terdaftar?', nasabahToken);
    assert.equal(res.status, 200);
    assert.doesNotMatch(answer, /Total Pengguna Sistem/i);
    assert.match(answer, /Ringkasan Akun Anda|hanya dapat diakses/i);
  });

  test('8. NASABAH hanya melihat transaksi miliknya sendiri', async () => {
    const { res, json } = await ask('Tampilkan transaksi terbaru', nasabahToken);
    assert.equal(res.status, 200);
    const rows = Array.isArray(json.data.data) ? json.data.data : [];

    for (const row of rows) {
      const tx = await db('waste_deposit_transactions')
        .where({ transaction_no: row.transaction_no })
        .first();
      assert.ok(tx, 'Transaksi harus ada di database');
      assert.equal(Number(tx.customer_id), Number(nasabahCust.id));
    }
  });

  test('9. Pencarian nasabah oleh NASABAH tidak membocorkan nasabah lain', async () => {
    const { res, answer } = await ask('Cari nasabah admin', nasabahToken);
    assert.equal(res.status, 200);
    assert.doesNotMatch(answer, /Administrator/i);
  });

  test('10. Data gudang ditolak untuk NASABAH', async () => {
    const { res, answer, json } = await ask('Berapa stok gudang?', nasabahToken);
    assert.equal(res.status, 200);
    assert.match(answer, /hanya dapat diakses oleh Petugas/i);
    assert.equal(json.data.authorized, false);
  });

  test('11. Tamu diminta login untuk data operasional', async () => {
    const { res, answer } = await ask('Berapa total pengguna terdaftar?');
    assert.equal(res.status, 200);
    assert.match(answer, /masuk \(login\)/i);
  });

  test('12. Permintaan kode pemrograman tetap ditolak', async () => {
    const { res, answer, json } = await ask('Buatkan kode python untuk CRUD', adminToken);
    assert.equal(res.status, 200);
    assert.match(answer, /tidak dapat membuat kode pemrograman/i);
    assert.equal(json.data.intent, 'CODE_REQUEST');
  });
});
