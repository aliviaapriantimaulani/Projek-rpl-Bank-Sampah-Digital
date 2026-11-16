const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const db = require('../src/config/database');

let server;
let baseUrl;
let petugasToken;
let customer;
let catPET;
let catBox;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const petugasRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'petugas@banksampah.id', password: 'Petugas123!' }),
  });
  petugasToken = (await petugasRes.json()).data.token;

  customer = await db('customers').where({ account_no: 'NSB-2026-0001' }).first();
  catPET = await db('waste_categories').where({ code: 'PLS-PET-01' }).first();
  catBox = await db('waste_categories').where({ code: 'CRD-BOX-01' }).first();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('Waste Deposit Transaction Module Tests', async (t) => {
  let createdTxId;
  const uniqueIdempotency = `IDEMP-${Date.now()}`;

  await t.test('1. Mencatat transaksi setor multi-item & kalkulasi subtotal otomatis', async () => {
    // PET: 4 kg @ Rp 4.500 = 18.000
    // Box: 5 kg @ Rp 2.200 = 11.000
    // Total = Rp 29.000, Total berat = 9.0 kg
    const initialWallet = await db('customer_wallets').where({ customer_id: customer.id }).first();
    const initialPetStock = await db('inventory').where({ waste_category_id: catPET.id }).first();

    const res = await fetch(`${baseUrl}/api/v1/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        idempotencyKey: uniqueIdempotency,
        items: [
          { categoryId: catPET.id, weightKg: 4.0 },
          { categoryId: catBox.id, weightKg: 5.0 },
        ],
        notes: 'Uji coba transaksi setor multi-item',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.totalWeightKg, 9.0);
    assert.equal(body.data.totalAmount, 29000);
    createdTxId = body.data.transactionId;

    // 2. Verifikasi update dompet strictly lewat wallet_ledger
    const updatedWallet = await db('customer_wallets').where({ customer_id: customer.id }).first();
    const expectedBalance = Number(initialWallet.current_balance) + 29000;
    assert.equal(Number(updatedWallet.current_balance), expectedBalance);

    const ledgerEntry = await db('wallet_ledger')
      .where({ reference_id: body.data.transactionNo })
      .first();
    assert.ok(ledgerEntry);
    assert.equal(ledgerEntry.entry_type, 'CREDIT');
    assert.equal(Number(ledgerEntry.amount), 29000);
    assert.equal(Number(ledgerEntry.balance_after), expectedBalance);

    // 3. Verifikasi penambahan stok gudang & mutasi stok DEPOSIT
    const updatedPetStock = await db('inventory').where({ waste_category_id: catPET.id }).first();
    assert.equal(
      Number(updatedPetStock.current_stock_kg),
      Number(initialPetStock.current_stock_kg) + 4.0
    );

    const movement = await db('inventory_movements')
      .where({ reference_id: body.data.transactionNo, waste_category_id: catPET.id })
      .first();
    assert.ok(movement);
    assert.equal(movement.movement_type, 'DEPOSIT');
    assert.equal(Number(movement.weight_kg), 4.0);
  });

  await t.test('2. Pencegahan transaksi ganda (Idempotency Key)', async () => {
    // Submit ulang dengan idempotency_key yang sama
    const res = await fetch(`${baseUrl}/api/v1/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        idempotencyKey: uniqueIdempotency,
        items: [{ categoryId: catPET.id, weightKg: 10.0 }],
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.message, /sebelumnya/i);
  });

  await t.test('3. Validasi berat sampah harus lebih besar dari 0', async () => {
    const res = await fetch(`${baseUrl}/api/v1/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ categoryId: catPET.id, weightKg: -2.5 }],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /lebih besar dari 0/i);
  });

  await t.test('4. Atomic rollback jika terdapat item yang tidak valid', async () => {
    const balanceBefore = (
      await db('customer_wallets').where({ customer_id: customer.id }).first()
    ).current_balance;

    const res = await fetch(`${baseUrl}/api/v1/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [
          { categoryId: catPET.id, weightKg: 5.0 },
          { categoryId: 999999, weightKg: 3.0 }, // Non-existent category
        ],
      }),
    });

    assert.equal(res.status, 404);
    // Verifikasi saldo dompet tidak berubah (Rollback atomik)
    const balanceAfter = (
      await db('customer_wallets').where({ customer_id: customer.id }).first()
    ).current_balance;
    assert.equal(balanceBefore, balanceAfter);
  });

  await t.test('5. Mengambil struk transaksi digital (/transactions/:id/receipt)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/transactions/${createdTxId}/receipt`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.transactionNo);
    assert.ok(body.data.customer);
    assert.equal(body.data.items.length, 2);
    assert.equal(body.data.totalAmount, 29000);
  });

  await t.test('6. Mengambil daftar transaksi harian (/transactions/daily)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${baseUrl}/api/v1/transactions/daily?date=${today}`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.totalTransactions >= 1);
    assert.ok(body.data.totalWeightKg > 0);
  });
});
