const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');

describe('Owner Dashboard, Operational Analytics & Reporting Tests', () => {
  let server;
  let baseUrl;
  let ownerToken;
  let petugasToken;
  let nasabahToken;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const owner = await db('users').where({ username: 'owner' }).first();
    const petugas = await db('users').where({ username: 'petugas' }).first();
    const nasabah = await db('users').where({ username: 'nasabah' }).first();

    ownerToken = generateToken({ id: owner.id, role: 'OWNER' });
    petugasToken = generateToken({ id: petugas.id, role: 'PETUGAS' });
    nasabahToken = generateToken({ id: nasabah.id, role: 'NASABAH' });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('1. GET /api/v1/owner/analytics/overview - Mengembalikan 8 KPI eksekutif', async () => {
    const res = await fetch(`${baseUrl}/api/v1/owner/analytics/overview`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const d = body.data;
    assert.ok('totalCustomers' in d);
    assert.ok('activeCustomers' in d);
    assert.ok('totalTransactions' in d);
    assert.ok('totalWasteWeightKg' in d);
    assert.ok('customerWalletLiabilities' in d);
    assert.ok('totalInventoryStockKg' in d);
    assert.ok('revenue' in d);
    assert.ok('grossProfit' in d);
    assert.ok('marginPercentage' in d);
  });

  test('2. GET /api/v1/owner/analytics/charts - Mengembalikan 5 dataset visualisasi grafik tren', async () => {
    const res = await fetch(`${baseUrl}/api/v1/owner/analytics/charts`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const d = body.data;
    assert.ok(Array.isArray(d.transactionTrend));
    assert.ok(Array.isArray(d.categoryVolume));
    assert.ok(Array.isArray(d.customerGrowth));
    assert.ok(Array.isArray(d.revenueTrend));
    assert.ok(Array.isArray(d.inventoryTrend));
  });

  test('3. GET /api/v1/owner/analytics/insights - Menghasilkan AI Insights operasional berbasis data riil', async () => {
    const res = await fetch(`${baseUrl}/api/v1/owner/analytics/insights`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const d = body.data;
    assert.ok(d.summary);
    assert.ok(Array.isArray(d.insights));
    assert.ok(Array.isArray(d.anomalies));
  });

  test('4. GET /api/v1/owner/reports/:type - Menghasilkan seluruh 7 jenis laporan dengan filter dinamis', async () => {
    const reports = [
      'operational',
      'financial',
      'inventory',
      'customer_activity',
      'waste_category',
      'sales',
      'withdrawal',
    ];

    for (const rep of reports) {
      const res = await fetch(`${baseUrl}/api/v1/owner/reports/${rep}?filter=this_month`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      assert.equal(res.status, 200, `Gagal memuat laporan ${rep}`);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.reportType, rep);
    }
  });

  test('5. RBAC Protection - Petugas dan Nasabah ditolak dari analitik dan laporan eksekutif (403)', async () => {
    const resPetugas = await fetch(`${baseUrl}/api/v1/owner/analytics/overview`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });
    assert.equal(resPetugas.status, 403);

    const resNasabah = await fetch(`${baseUrl}/api/v1/owner/reports/financial`, {
      headers: { Authorization: `Bearer ${nasabahToken}` },
    });
    assert.equal(resNasabah.status, 403);
  });
});
