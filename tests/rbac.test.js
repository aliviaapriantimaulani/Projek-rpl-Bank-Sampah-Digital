const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const db = require('../src/config/database');

let server;
let baseUrl;

const tokens = {
  ADMIN: '',
  OWNER: '',
  PETUGAS: '',
  NASABAH: '',
};

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Login as all 4 roles to obtain tokens
  const credentials = [
    { role: 'ADMIN', identifier: 'admin@banksampah.id', password: 'Admin123!' },
    { role: 'OWNER', identifier: 'owner@banksampah.id', password: 'Owner123!' },
    { role: 'PETUGAS', identifier: 'petugas@banksampah.id', password: 'Petugas123!' },
    { role: 'NASABAH', identifier: 'nasabah@banksampah.id', password: 'Nasabah123!' },
  ];

  for (const cred of credentials) {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: cred.identifier, password: cred.password }),
    });
    const data = await res.json();
    tokens[cred.role] = data.data.token;
  }
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('RBAC Authorization Rules Tests', async (t) => {
  // 1. ADMIN USER MANAGEMENT ACCESS
  await t.test('1. Admin DAPAT mengakses daftar pengguna (/api/v1/users)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Authorization: `Bearer ${tokens.ADMIN}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  await t.test('2. Owner DITOLAK (403) dari manajemen pengguna (/api/v1/users)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Authorization: `Bearer ${tokens.OWNER}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Akses ditolak/i);
  });

  await t.test('3. Petugas DITOLAK (403) dari manajemen pengguna (/api/v1/users)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Authorization: `Bearer ${tokens.PETUGAS}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test('4. Nasabah DITOLAK (403) dari manajemen pengguna (/api/v1/users)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Authorization: `Bearer ${tokens.NASABAH}` },
    });
    assert.equal(res.status, 403);
  });

  // 2. OWNER FINANCIAL APPROVAL ACCESS
  await t.test('5. Owner DAPAT mengakses ringkasan finansial & persetujuan penarikan', async () => {
    const res = await fetch(`${baseUrl}/api/v1/finance/summary`, {
      headers: { Authorization: `Bearer ${tokens.OWNER}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.totalDepositsPaid !== undefined);
  });

  await t.test('6. Petugas DITOLAK (403) dari ringkasan finansial (/api/v1/finance/summary)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/finance/summary`, {
      headers: { Authorization: `Bearer ${tokens.PETUGAS}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test('7. Nasabah DITOLAK (403) dari ringkasan finansial (/api/v1/finance/summary)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/finance/summary`, {
      headers: { Authorization: `Bearer ${tokens.NASABAH}` },
    });
    assert.equal(res.status, 403);
  });

  // 3. PETUGAS DEPOSIT & CUSTOMER LOOKUP
  await t.test('8. Petugas DAPAT melakukan lookup data nasabah (/api/v1/customers/lookup)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/lookup?query=NSB-2026-0001`, {
      headers: { Authorization: `Bearer ${tokens.PETUGAS}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.account_no, 'NSB-2026-0001');
  });

  await t.test('9. Nasabah DITOLAK (403) dari lookup nasabah lain (/api/v1/customers/lookup)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/lookup?query=NSB-2026-0001`, {
      headers: { Authorization: `Bearer ${tokens.NASABAH}` },
    });
    assert.equal(res.status, 403);
  });

  // 4. NASABAH PORTAL ACCESS
  await t.test('10. Nasabah DAPAT mengakses dasbor portal nasabah miliknya (/api/v1/nasabah/dashboard)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nasabah/dashboard`, {
      headers: { Authorization: `Bearer ${tokens.NASABAH}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.wallet);
    assert.ok(body.data.impact);
    assert.ok(body.data.gamification);
  });

  await t.test('11. Petugas DITOLAK (403) dari endpoint khusus nasabah (/api/v1/nasabah/dashboard)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nasabah/dashboard`, {
      headers: { Authorization: `Bearer ${tokens.PETUGAS}` },
    });
    assert.equal(res.status, 403);
  });

  // 5. AUDIT LOGS PROTECTION
  await t.test('12. Admin dan Owner DAPAT melihat audit logs sistem', async () => {
    const resAdmin = await fetch(`${baseUrl}/api/v1/audit`, {
      headers: { Authorization: `Bearer ${tokens.ADMIN}` },
    });
    assert.equal(resAdmin.status, 200);

    const resOwner = await fetch(`${baseUrl}/api/v1/audit`, {
      headers: { Authorization: `Bearer ${tokens.OWNER}` },
    });
    assert.equal(resOwner.status, 200);
  });

  await t.test('13. Petugas dan Nasabah DITOLAK (403) dari audit logs sistem', async () => {
    const resPetugas = await fetch(`${baseUrl}/api/v1/audit`, {
      headers: { Authorization: `Bearer ${tokens.PETUGAS}` },
    });
    assert.equal(resPetugas.status, 403);

    const resNasabah = await fetch(`${baseUrl}/api/v1/audit`, {
      headers: { Authorization: `Bearer ${tokens.NASABAH}` },
    });
    assert.equal(resNasabah.status, 403);
  });
});
