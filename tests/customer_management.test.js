const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const db = require('../src/config/database');

let server;
let baseUrl;
let adminToken;
let petugasToken;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const adminRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@banksampah.id', password: 'Admin123!' }),
  });
  adminToken = (await adminRes.json()).data.token;

  const petugasRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'petugas@banksampah.id', password: 'Petugas123!' }),
  });
  petugasToken = (await petugasRes.json()).data.token;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('Customer Management Module Tests', async (t) => {
  let registeredCustomerId;
  let registeredQrToken;
  let registeredAccountNo;
  const uniqueNik = `317101${Date.now().toString().slice(-10)}`;

  await t.test('1. Pendaftaran mandiri nasabah melalui web (/auth/register-nasabah)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register-nasabah`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ahmad Fauzi',
        nik: uniqueNik,
        phone: '081234567890',
        password: 'NasabahPassword123!',
        pin: '654321',
        address: 'Jl. Cemara Hijau No. 15',
        rtRw: '02/05',
        kelurahan: 'Sejahtera',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.token);
    assert.equal(body.data.user.role, 'NASABAH');
    assert.ok(body.data.user.customer.accountNo);
    assert.ok(body.data.user.customer.qrCodeToken);

    registeredCustomerId = body.data.user.customer.customerId;
    registeredQrToken = body.data.user.customer.qrCodeToken;
    registeredAccountNo = body.data.user.customer.accountNo;
  });

  await t.test('2. Petugas dapat mengidentifikasi nasabah via QR Code (/customers/lookup)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/lookup?query=${registeredQrToken}`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.account_no, registeredAccountNo);
    assert.equal(body.data.name, 'Ahmad Fauzi');
  });

  await t.test('3. Petugas dapat mengidentifikasi nasabah via Nomor Telepon', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/lookup?query=081234567890`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.nik, uniqueNik);
  });

  await t.test('4. Petugas dapat mengidentifikasi nasabah via Nomor Rekening (Customer ID)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/lookup?query=${registeredAccountNo}`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'Ahmad Fauzi');
  });

  await t.test('5. Mengambil detail profil nasabah lengkap dengan ringkasan saldo & sampah (/customers/:id)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${registeredCustomerId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(Number(body.data.current_balance), 0);
    assert.equal(body.data.levelName, 'Warga Pemula');
    assert.equal(body.data.totalWasteKg, 0);
  });

  await t.test('6. Admin/Owner dapat memperbarui informasi nasabah (/customers/:id)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${registeredCustomerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Ahmad Fauzi M.Kom',
        phone: '081299998888',
        address: 'Jl. Cemara Hijau No. 15A',
        rtRw: '02/06',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'Ahmad Fauzi M.Kom');
    assert.equal(body.data.phone, '081299998888');
  });

  await t.test('7. Admin dapat menonaktifkan status nasabah (/customers/:id/status)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${registeredCustomerId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Verify lookup reflects INACTIVE status
    const checkRes = await fetch(`${baseUrl}/api/v1/customers/${registeredCustomerId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const checkBody = await checkRes.json();
    assert.equal(checkBody.data.status, 'INACTIVE');
  });
});
