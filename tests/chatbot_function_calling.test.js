const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');
const databaseToolsService = require('../src/services/ai/database_tools.service');

describe('AI Chatbot Function Calling & Role-Based Access Control', () => {
  let server;
  let baseUrl;
  let adminToken;
  let nasabahToken;

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

    adminToken = generateToken({ id: admin.id, role: 'ADMIN' });
    nasabahToken = generateToken({ id: nasabahUser.id, role: 'NASABAH' });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('1. RBAC Check: databaseToolsService.isAdmin memvalidasi peran Admin', () => {
    assert.equal(databaseToolsService.isAdmin({ role: 'ADMIN' }), true);
    assert.equal(databaseToolsService.isAdmin({ role: 'admin' }), true);
    assert.equal(databaseToolsService.isAdmin({ role: 'NASABAH' }), false);
    assert.equal(databaseToolsService.isAdmin({ role: 'PETUGAS' }), false);
    assert.equal(databaseToolsService.isAdmin(null), false);
  });

  test('2. RBAC Enforcement: databaseToolsService.executeTool menolak eksekusi jika bukan Admin', async () => {
    const denied = await databaseToolsService.executeTool('get_users_statistics', {}, { role: 'NASABAH' });
    assert.equal(denied.authorized, false);
    assert.equal(denied.error, 'ACCESS_DENIED');
    assert.match(denied.message, /HANYA dapat diakses oleh pengguna dengan peran Administrator/i);

    const allowed = await databaseToolsService.executeTool('get_users_statistics', {}, { role: 'ADMIN' });
    assert.equal(allowed.authorized, true);
    assert.equal(allowed.success, true);
    assert.ok(allowed.data.totalUsers >= 1);
  });

  test('3. Admin Query Data Internal: Mengaktifkan Function Calling & Database Tool', async () => {
    const { res, json, answer } = await ask('Ada berapa user yang terdaftar?', adminToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'DATABASE_TOOL');
    assert.ok(json.data.functionCall, 'Harus menyertakan metadata Function Calling');
    assert.equal(json.data.roleAccess, 'ADMIN_FULL_ACCESS');
    assert.match(answer, /Total Pengguna Sistem|Total pengguna/i);
  });

  test('4. Admin Pertanyaan Umum: Dijawab langsung dengan General Knowledge (Tanpa DB Tool)', async () => {
    const { res, json, answer } = await ask('Bagaimana cara memilah sampah plastik dan botol di rumah?', adminToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'GENERAL_KNOWLEDGE');
    assert.equal(json.data.functionCall, null, 'Pertanyaan umum tidak boleh memanggil database tool');
    assert.match(answer, /Pilah|daur ulang|plastik/i);
  });

  test('5. Non-Admin (Nasabah) Pertanyaan Umum: Dijawab informatif tanpa akses DB', async () => {
    const { res, json, answer } = await ask('Apa tips membuat kompos dari sampah organik dapur?', nasabahToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'GENERAL_KNOWLEDGE');
    assert.equal(json.data.functionCall, null);
    assert.match(answer, /Kompos|organik/i);
  });

  test('6. Non-Admin (Nasabah) Query Data Internal: Akses ditolak dan dibatasi', async () => {
    const { res, json, answer } = await ask('Berapa stok gudang persediaan sampah saat ini?', nasabahToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, false);
    assert.equal(json.data.source, 'ACCESS_RESTRICTED');
    assert.equal(json.data.functionCall, null);
    assert.match(answer, /hanya dapat diakses|Petugas|Admin/i);
  });

  test('7. Guest (Belum Login) Query Data Internal: Diminta Login terlebih dahulu', async () => {
    const { res, json, answer } = await ask('Ada berapa total user sistem?');
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, false);
    assert.match(answer, /masuk \(login\)/i);
  });

  test('8. Siapa Saya (Admin): Menjawab identitas dan peran Administrator secara dinamis', async () => {
    const { res, json, answer } = await ask('Siapa saya?', adminToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'DATABASE_TOOL');
    assert.ok(json.data.functionCall);
    assert.equal(json.data.functionCall.tool, 'get_user_profile');
    assert.match(answer, /Administrator \(Admin\)/i);
    assert.doesNotMatch(answer, /Terima kasih atas pertanyaannya/i);
  });

  test('9. Siapa Saya (Nasabah): Menjawab identitas nasabah secara kontekstual', async () => {
    const { res, json, answer } = await ask('Siapa saya?', nasabahToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'PERSONAL_DATA');
    assert.match(answer, /Nasabah/i);
    assert.doesNotMatch(answer, /Terima kasih atas pertanyaannya/i);
  });

  test('10. Siapa Saya (Tamu / Belum Login): Mengarahkan untuk masuk (login)', async () => {
    const { res, answer } = await ask('Siapa saya?');
    assert.equal(res.status, 200);
    assert.match(answer, /Tamu|masuk \(login\)/i);
    assert.doesNotMatch(answer, /Terima kasih atas pertanyaannya/i);
  });

  test('11. Admin Query "Total Transaksi": Mengaktifkan Function Calling real-time', async () => {
    const { res, json, answer } = await ask('Berapa total transaksi sistem?', adminToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'DATABASE_TOOL');
    assert.ok(json.data.functionCall);
    assert.doesNotMatch(answer, /Terima kasih atas pertanyaannya/i);
  });

  test('12. Tidak ada jawaban yang membalas template statis "Terima kasih atas pertanyaannya!"', async () => {
    const queries = ['Halo selamat sore', 'Bagaimana cara daur ulang', 'Apa itu eco bot', 'Berapa saldo nasabah?'];
    for (const q of queries) {
      const { answer } = await ask(q, adminToken);
      assert.doesNotMatch(answer, /Terima kasih atas pertanyaannya! 😊/i);
    }
  });

  test('13. Kalkulator Harga Sampah: Menghitung nilai 5 kg kardus secara real-time', async () => {
    const { res, json, answer } = await ask('menyetorkan 5 kg kardus, berapa harganya', nasabahToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'DATABASE_TOOL');
    assert.ok(json.data.functionCall);
    assert.equal(json.data.functionCall.tool, 'calculate_waste_price');
    assert.match(answer, /2\.200/);
    assert.match(answer, /11\.000/);
    assert.match(answer, /5\s*KG/i);
  });

  test('14. Kalkulator Harga Sampah: Menghitung nilai 10 kg botol plastik secara akurat', async () => {
    const { res, json, answer } = await ask('kalau saya bawa 10 kg botol plastik dapat berapa uang?', nasabahToken);
    assert.equal(res.status, 200);
    assert.equal(json.data.authorized, true);
    assert.equal(json.data.source, 'DATABASE_TOOL');
    assert.ok(json.data.functionCall);
    assert.equal(json.data.functionCall.tool, 'calculate_waste_price');
    assert.match(answer, /4\.500/);
    assert.match(answer, /45\.000/);
  });

  test('15. Kalkulator Harga Sampah to the point (tanpa basa-basi sambutan berlebihan)', async () => {
    const { res, answer } = await ask('berapa harga 3.5 kg besi?');
    assert.equal(res.status, 200);
    assert.match(answer, /Besi/i);
    assert.match(answer, /14\.000/);
    assert.doesNotMatch(answer, /Halo Pengguna! 👋 Terkait pertanyaan Anda/i);
  });
});

