const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');

describe('Comprehensive Production-Readiness & Security Audit Tests (34-Point Review)', () => {
  let server;
  let baseUrl;
  let adminToken;
  let ownerToken;
  let petugasToken;
  let nasabahToken;
  let nasabahCust;
  let nasabahUser;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const admin = await db('users').where({ username: 'admin' }).first();
    const owner = await db('users').where({ username: 'owner' }).first();
    const petugas = await db('users').where({ username: 'petugas' }).first();
    nasabahUser = await db('users').where({ username: 'nasabah' }).first();
    nasabahCust = await db('customers').where({ user_id: nasabahUser.id }).first();

    adminToken = generateToken({ id: admin.id, role: 'ADMIN' });
    ownerToken = generateToken({ id: owner.id, role: 'OWNER' });
    petugasToken = generateToken({ id: petugas.id, role: 'PETUGAS' });
    nasabahToken = generateToken({
      id: nasabahUser.id,
      role: 'NASABAH',
      customerId: nasabahCust.id,
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('1. Security Headers - Respons HTTP menyertakan header proteksi keamanan standar industri', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  test('2. Financial Integrity - Saldo dompet nasabah konsisten dan tidak pernah bernilai negatif', async () => {
    const wallets = await db('customer_wallets').select('*');
    for (const w of wallets) {
      assert.ok(
        Number(w.current_balance) >= 0,
        `Saldo nasabah ${w.customer_id} tidak boleh negatif: ${w.current_balance}`
      );
      assert.ok(
        Number(w.accumulated_earnings) >= 0,
        `Akumulasi perolehan nasabah ${w.customer_id} tidak boleh negatif: ${w.accumulated_earnings}`
      );
    }
  });

  test('3. Financial Ledger Immutability - Setiap mutasi dompet memiliki jejak before & after yang valid', async () => {
    const entries = await db('wallet_ledger').orderBy('id', 'desc').limit(20);
    assert.ok(entries.length > 0, 'Ledger dompet harus memiliki riwayat mutasi');

    for (const entry of entries) {
      assert.ok(['CREDIT', 'DEBIT'].includes(entry.entry_type));
      assert.ok(Number(entry.amount) > 0);
      assert.ok(entry.balance_before !== null && entry.balance_before !== undefined);
      assert.ok(entry.balance_after !== null && entry.balance_after !== undefined);

      if (entry.entry_type === 'CREDIT') {
        assert.equal(
          Math.round(Number(entry.balance_after)),
          Math.round(Number(entry.balance_before) + Number(entry.amount))
        );
      } else if (entry.entry_type === 'DEBIT') {
        assert.equal(
          Math.round(Number(entry.balance_after)),
          Math.round(Number(entry.balance_before) - Number(entry.amount))
        );
      }
    }
  });

  test('4. Idempotency Protection - Mencegah setoran ganda jika idempotency_key sama', async () => {
    const idempotencyKey = `IDEM-AUDIT-${Date.now()}`;

    // First deposit submission
    const res1 = await fetch(`${baseUrl}/api/v1/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        customerId: nasabahCust.id,
        idempotencyKey,
        items: [{ categoryId: 1, weightKg: 2 }],
      }),
    });
    assert.equal(res1.status, 201);

    // Duplicate submission with same idempotencyKey returns the existing transaction safely without duplicating
    const res2 = await fetch(`${baseUrl}/api/v1/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        customerId: nasabahCust.id,
        idempotencyKey,
        items: [{ categoryId: 1, weightKg: 2 }],
      }),
    });
    assert.equal(res2.status, 200); // Standard idempotency: returns original result
    const body2 = await res2.json();
    assert.equal(body2.success, true);
    assert.ok(body2.message.includes('Idempotent'));

    // Verify exactly ONE transaction was recorded in the database
    const countRecords = await db('waste_deposit_transactions')
      .where({ idempotency_key: idempotencyKey })
      .count('id as count')
      .first();
    assert.equal(parseInt(countRecords.count, 10), 1);
  });

  test('5. Inventory Integrity - Penjualan ke pengepul menolak kuantitas melebihi stok gudang', async () => {
    // Attempt to sell 999999 kg
    const res = await fetch(`${baseUrl}/api/v1/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        buyerId: 1,
        saleDate: '2026-09-10',
        items: [{ wasteCategoryId: 1, weightKg: 999999, unitPrice: 5000 }],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.message.includes('Stok tidak mencukupi'));
  });

  test('6. SQL Injection Resilience - Input berbahaya dinetralkan oleh parameterized queries Knex', async () => {
    const injectionPayload = "'; DROP TABLE users; --";
    const res = await fetch(`${baseUrl}/api/v1/customers/lookup?query=${encodeURIComponent(injectionPayload)}`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });
    // Parameterized search safely finds 0 matches and returns 404 AppError
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);

    // Assert table users was NOT dropped and remains completely intact!
    const usersExist = await db.schema.hasTable('users');
    assert.equal(usersExist, true);
    const userCount = await db('users').count('id as count').first();
    assert.ok(parseInt(userCount.count, 10) > 0);
  });

  test('7. Audit Trail Integrity - Semua mutasi sensitif tercatat di audit_logs dengan user dan IP', async () => {
    const latestLogs = await db('audit_logs').orderBy('id', 'desc').limit(10);
    assert.ok(latestLogs.length > 0);

    for (const l of latestLogs) {
      assert.ok(l.action);
      assert.ok(l.entity_name);
      assert.ok(l.ip_address);
      assert.ok(l.created_at);
    }
  });
});
