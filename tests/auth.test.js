const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const db = require('../src/config/database');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('Auth API Tests', async (t) => {
  let adminToken = '';
  let nasabahToken = '';

  await t.test('1. POST /api/v1/auth/login - Sukses login dengan kredensial Admin yang benar', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@banksampah.id', password: 'Admin123!' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.token);
    assert.equal(body.data.user.role, 'ADMIN');
    adminToken = body.data.token;
  });

  await t.test('2. POST /api/v1/auth/login - Sukses login dengan kredensial Nasabah', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nasabah@banksampah.id', password: 'Nasabah123!' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.token);
    assert.equal(body.data.user.role, 'NASABAH');
    assert.ok(body.data.user.customer);
    assert.equal(body.data.user.customer.accountNo, 'NSB-2026-0001');
    nasabahToken = body.data.token;
  });

  await t.test('3. POST /api/v1/auth/login - Gagal login jika password salah', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@banksampah.id', password: 'SalahPassword123' }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /salah/i);
  });

  await t.test('4. POST /api/v1/auth/login - Gagal login jika user tidak ditemukan', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'tidak_ada@banksampah.id', password: 'AnyPassword' }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('5. GET /api/v1/auth/me - Sukses memuat profil jika token Bearer disertakan', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.email, 'admin@banksampah.id');
    assert.equal(body.data.role, 'ADMIN');
  });

  await t.test('6. GET /api/v1/auth/me - Ditolak (401) jika token tidak disertakan', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('7. GET /api/v1/auth/me - Ditolak (401) jika token palsu / dimanipulasi', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer token_palsu_random_xyz` },
    });
    assert.equal(res.status, 401);
  });
});
