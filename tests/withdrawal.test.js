const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const db = require('../src/config/database');

let server;
let baseUrl;
let nasabahToken;
let ownerToken;
let customer;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const nasabahRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'nasabah@banksampah.id', password: 'Nasabah123!' }),
  });
  nasabahToken = (await nasabahRes.json()).data.token;

  const ownerRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'owner@banksampah.id', password: 'Owner123!' }),
  });
  ownerToken = (await ownerRes.json()).data.token;

  customer = await db('customers').where({ account_no: 'NSB-2026-0001' }).first();
  // Clear any existing pending requests for clean test environment
  await db('withdrawal_requests').where({ customer_id: customer.id, status: 'PENDING' }).del();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('Customer Wallet and Withdrawal Module Tests', async (t) => {
  let pendingRequestId = null;

  const getFreshOtp = async () => {
    const res = await fetch(`${baseUrl}/api/v1/finance/wallet/request-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
    });
    return (await res.json()).data.previewCode;
  };

  await t.test('1. Mengatur PIN Transaksi 6-Digit (/wallet/pin)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/finance/wallet/pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({ pin: '123456' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  await t.test('2. Meminta kode OTP untuk penarikan saldo (/wallet/request-otp)', async () => {
    const otp = await getFreshOtp();
    assert.ok(otp);
    assert.equal(otp.length, 6);
  });

  await t.test('3. Penolakan penarikan jika saldo tabungan tidak mencukupi', async () => {
    const otp = await getFreshOtp();
    const res = await fetch(`${baseUrl}/api/v1/finance/withdrawals/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({
        amount: 99999999, // Exceeds balance
        method: 'CASH',
        pin: '123456',
        otp,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Saldo tabungan tidak mencukupi/i);
  });

  await t.test('4. Penolakan penarikan jika PIN transaksi salah', async () => {
    const otp = await getFreshOtp();
    const res = await fetch(`${baseUrl}/api/v1/finance/withdrawals/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({
        amount: 15000,
        method: 'CASH',
        pin: '999999', // Wrong PIN
        otp,
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /PIN Transaksi/i);
  });

  await t.test('5. Penolakan penarikan jika kode OTP salah', async () => {
    const res = await fetch(`${baseUrl}/api/v1/finance/withdrawals/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({
        amount: 15000,
        method: 'CASH',
        pin: '123456',
        otp: '000000', // Wrong OTP
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Kode OTP/i);
  });

  await t.test('6. Berhasil mengajukan penarikan (Transfer Bank) dengan OTP dan PIN valid', async () => {
    const otp = await getFreshOtp();
    const res = await fetch(`${baseUrl}/api/v1/finance/withdrawals/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({
        amount: 15000,
        method: 'BANK_TRANSFER',
        bankName: 'BCA',
        bankAccountNumber: '8881234567',
        bankAccountHolder: 'Budi Santoso',
        pin: '123456',
        otp,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'PENDING');
    pendingRequestId = body.data.requestId;
  });

  await t.test('7. Pencegahan pengajuan ganda / race condition saat ada tiket pending', async () => {
    const newOtp = await getFreshOtp();

    // Try to submit another request while one is pending
    const res = await fetch(`${baseUrl}/api/v1/finance/withdrawals/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({
        amount: 10000,
        method: 'CASH',
        pin: '123456',
        otp: newOtp,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /menunggu persetujuan/i);
  });

  await t.test('8. Persetujuan Owner (Approve) & Pemrosesan Pembayaran via Payment Service', async () => {
    const walletBefore = await db('customer_wallets').where({ customer_id: customer.id }).first();

    const res = await fetch(`${baseUrl}/api/v1/finance/withdrawals/${pendingRequestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ notes: 'Disetujui dan ditransfer via payment service' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'COMPLETED');
    assert.ok(body.data.paymentReference);

    // Verifikasi saldo dompet nasabah berkurang strictly via wallet_ledger DEBIT
    const walletAfter = await db('customer_wallets').where({ customer_id: customer.id }).first();
    assert.equal(
      Number(walletAfter.current_balance),
      Number(walletBefore.current_balance) - 15000
    );

    const ledger = await db('wallet_ledger')
      .where({ reference_id: body.data.requestNo })
      .first();
    assert.ok(ledger);
    assert.equal(ledger.entry_type, 'DEBIT');
    assert.equal(Number(ledger.amount), 15000);
  });

  await t.test('9. Penolakan Owner (Reject) dengan alasan penolakan wajib', async () => {
    const newOtp = await getFreshOtp();

    const reqRes = await fetch(`${baseUrl}/api/v1/finance/withdrawals/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({
        amount: 10000,
        method: 'CASH',
        pin: '123456',
        otp: newOtp,
      }),
    });
    const reqBody = await reqRes.json();
    const requestIdToReject = reqBody.data.requestId;

    const balanceBeforeReject = (
      await db('customer_wallets').where({ customer_id: customer.id }).first()
    ).current_balance;

    // Reject without reason should fail
    const failRes = await fetch(
      `${baseUrl}/api/v1/finance/withdrawals/${requestIdToReject}/reject`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ rejectionReason: '' }),
      }
    );
    assert.equal(failRes.status, 400);

    // Reject with valid reason
    const okRes = await fetch(
      `${baseUrl}/api/v1/finance/withdrawals/${requestIdToReject}/reject`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ rejectionReason: 'Loket sedang kehabisan dana tunai, gunakan transfer bank' }),
      }
    );
    assert.equal(okRes.status, 200);

    // Saldo nasabah tidak boleh berkurang
    const balanceAfterReject = (
      await db('customer_wallets').where({ customer_id: customer.id }).first()
    ).current_balance;
    assert.equal(balanceBeforeReject, balanceAfterReject);
  });
});
