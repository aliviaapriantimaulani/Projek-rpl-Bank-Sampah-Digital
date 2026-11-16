const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const db = require('../src/config/database');

let server;
let baseUrl;
let ownerToken;
let buyer;
let catPET;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const ownerRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'owner@banksampah.id', password: 'Owner123!' }),
  });
  ownerToken = (await ownerRes.json()).data.token;

  buyer = await db('buyers').where({ is_active: true }).first();
  catPET = await db('waste_categories').where({ code: 'PLS-PET-01' }).first();

  // Pastikan stok awal cukup untuk pengujian penjualan
  await db('inventory')
    .where({ waste_category_id: catPET.id })
    .update({ current_stock_kg: 50.0 });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('Inventory and Waste Sales Module Tests', async (t) => {
  let createdBuyerId;
  const uniqueSaleIdemp = `SALE-IDEMP-${Date.now()}`;

  await t.test('1. Pengelolaan mitra pengepul (CRUD Buyers)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/buyers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'H. Rusli',
        companyName: 'CV Daur Plastik Sejahtera',
        phone: '081399991111',
        address: 'Sentra Daur Ulang Kaliabang No. 20, Bekasi',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'H. Rusli');
    createdBuyerId = body.data.id;
  });

  await t.test('2. Penolakan penjualan jika berat melebihi stok yang tersedia di gudang', async () => {
    const currentStock = Number(
      (await db('inventory').where({ waste_category_id: catPET.id }).first()).current_stock_kg
    );

    const res = await fetch(`${baseUrl}/api/v1/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        buyerId: createdBuyerId,
        items: [
          {
            wasteCategoryId: catPET.id,
            weightKg: currentStock + 500, // Exceeds available stock
            unitPrice: 6500,
          },
        ],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Stok tidak mencukupi/i);
  });

  await t.test('3. Sukses membuat penjualan sampah, mengurangi stok gudang atomik, & mencatat mutasi SALE', async () => {
    const stockBefore = Number(
      (await db('inventory').where({ waste_category_id: catPET.id }).first()).current_stock_kg
    );

    // Jual 20 kg @ Rp 6.000 = Rp 120.000
    // Harga beli nasabah (acquisition cost) = Rp 4.500 * 20 = Rp 90.000
    // Gross profit margin = Rp 30.000
    const res = await fetch(`${baseUrl}/api/v1/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        buyerId: createdBuyerId,
        idempotencyKey: uniqueSaleIdemp,
        items: [
          {
            wasteCategoryId: catPET.id,
            weightKg: 20.0,
            unitPrice: 6000,
          },
        ],
        notes: 'Penjualan rutin botol PET bersih ke pabrik daur ulang',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.totalWeightKg, 20.0);
    assert.equal(body.data.totalAmount, 120000);
    assert.equal(body.data.grossProfit, 30000);

    // Verifikasi stok gudang berkurang 20 kg
    const stockAfter = Number(
      (await db('inventory').where({ waste_category_id: catPET.id }).first()).current_stock_kg
    );
    assert.equal(stockAfter, stockBefore - 20.0);

    // Verifikasi catatan mutasi SALE
    const mov = await db('inventory_movements')
      .where({ reference_id: body.data.invoiceNo, waste_category_id: catPET.id })
      .first();
    assert.ok(mov);
    assert.equal(mov.movement_type, 'SALE');
    assert.equal(Number(mov.weight_kg), 20.0);
  });

  await t.test('4. Pencegahan duplikasi transaksi penjualan (Idempotency Key)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        buyerId: createdBuyerId,
        idempotencyKey: uniqueSaleIdemp,
        items: [{ wasteCategoryId: catPET.id, weightKg: 10.0, unitPrice: 6000 }],
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.message, /sebelumnya/i);
  });

  await t.test('5. Mengambil ringkasan pendapatan & kalkulasi margin kotor (/sales/summary)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/sales/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.totalRevenue >= 120000);
    assert.ok(body.data.grossProfit >= 30000);
    assert.ok(body.data.marginPercentage > 0);
  });
});
