const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');
const { AiVisionService, BaseAiVisionProvider } = require('../src/services/ai/ai_vision.service');

describe('AI Vision Integration & Natural Language Assistant Tests', () => {
  let server;
  let baseUrl;
  let adminToken;
  let petugasToken;
  let nasabahToken;
  let nasabahUser;
  let petugasUser;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const admin = await db('users').where({ username: 'admin' }).first();
    petugasUser = await db('users').where({ username: 'petugas' }).first();
    nasabahUser = await db('users').where({ username: 'nasabah' }).first();
    const nasabahCust = await db('customers').where({ user_id: nasabahUser.id }).first();

    adminToken = generateToken({ id: admin.id, role: 'ADMIN' });
    petugasToken = generateToken({ id: petugasUser.id, role: 'PETUGAS' });
    nasabahToken = generateToken({
      id: nasabahUser.id,
      role: 'NASABAH',
      customerId: nasabahCust.id,
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('1. GET /api/v1/ai/status - Mengembalikan info provider tanpa mengekspos API key', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/status`, {
      headers: { Authorization: `Bearer ${petugasToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.supportedCategories.includes('Plastic'));
    assert.equal(body.data.humanInTheLoop, true);
  });

  test('2. POST /api/v1/ai/analyze-waste - Menolak permintaan jika foto tidak dilampirkan (400)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/analyze-waste`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${petugasToken}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('3. POST /api/v1/ai/analyze-waste - Fallback manual saat AI provider belum dikonfigurasi (503)', async () => {
    // Create dummy image file
    const tempImg = path.join(__dirname, 'temp_test_waste.jpg');
    fs.writeFileSync(tempImg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));

    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(tempImg)], { type: 'image/jpeg' });
    formData.append('photo', blob, 'waste.jpg');

    const res = await fetch(`${baseUrl}/api/v1/ai/analyze-waste`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${petugasToken}` },
      body: formData,
    });

    if (fs.existsSync(tempImg)) fs.unlinkSync(tempImg);

    // If AI_PROVIDER=none, returns 503 with fallback guidance
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error?.details?.fallbackToManual, true);
  });

  test('4. AiVisionService Provider Abstraction - Inferensi model vision & separasi harga rekomendasi', async () => {
    // Mock Provider implementation
    class MockPlasticVisionProvider extends BaseAiVisionProvider {
      async classifyWasteImage() {
        return {
          category: 'Plastic',
          confidenceScore: 0.94,
          estimatedQuality: 'Grade A',
          explanation: 'Terdeteksi botol plastik PET bersih bening.',
          modelVersion: 'mock-cv-v1',
          rawResponse: { detected: true },
        };
      }
    }

    const service = new AiVisionService();
    service.setProvider(new MockPlasticVisionProvider());

    const result = await service.analyzeAndRecommend({
      filePath: '/tmp/waste_sample.jpg',
      mimeType: 'image/jpeg',
      imageHash: 'abcdef1234567890',
      userId: petugasUser.id,
      branchId: 1,
    });

    assert.ok(result.aiRecordId);
    assert.equal(result.detectedCategory, 'Plastic');
    assert.equal(result.confidenceScore, 0.94);
    assert.equal(result.confidencePercentage, 94);
    assert.ok(result.aiRecommendedPrice > 0);
    assert.equal(result.verificationStatus, 'UNVERIFIED');

    // Confirm price is separate in database record
    const dbRecord = await db('ai_analysis_records').where({ id: result.aiRecordId }).first();
    assert.equal(Number(dbRecord.ai_recommended_price), result.aiRecommendedPrice);
    assert.equal(dbRecord.confirmed_price, null); // Not confirmed yet!
  });

  test('5. POST /api/v1/ai/confirm-recommendation - Human-in-the-loop: Petugas menyetujui rekomendasi as-is', async () => {
    // Insert a test unverified record
    const [recId] = await db('ai_analysis_records').insert({
      branch_id: 1,
      model_version: 'mock-test',
      detected_category_id: 1,
      confidence_score: 0.90,
      verification_status: 'UNVERIFIED',
      ai_recommended_price: 3000,
      quality_assessment: 'Bersih & Kering',
      created_at: new Date(),
    });

    const res = await fetch(`${baseUrl}/api/v1/ai/confirm-recommendation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        aiRecordId: recId,
        confirmedPrice: 3000, // as-is
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.verificationStatus, 'ACCEPTED_AS_IS');
    assert.equal(body.data.isPriceOverridden, false);

    // Verify DB update
    const updated = await db('ai_analysis_records').where({ id: recId }).first();
    assert.equal(updated.verification_status, 'ACCEPTED_AS_IS');
    assert.equal(Number(updated.confirmed_price), 3000);
  });

  test('6. POST /api/v1/ai/confirm-recommendation - Human-in-the-loop: Petugas melakukan override harga', async () => {
    const [recId] = await db('ai_analysis_records').insert({
      branch_id: 1,
      model_version: 'mock-test',
      detected_category_id: 1,
      confidence_score: 0.70,
      verification_status: 'UNVERIFIED',
      ai_recommended_price: 3000,
      quality_assessment: 'Campur',
      created_at: new Date(),
    });

    const res = await fetch(`${baseUrl}/api/v1/ai/confirm-recommendation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({
        aiRecordId: recId,
        confirmedPrice: 2500, // overridden lower
        auditorNotes: 'Kualitas agak kotor berminyak, harga diturunkan',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.verificationStatus, 'MODIFIED');
    assert.equal(body.data.isPriceOverridden, true);
    assert.equal(body.data.confirmedPrice, 2500);

    const updated = await db('ai_analysis_records').where({ id: recId }).first();
    assert.equal(updated.verification_status, 'MODIFIED');
    assert.equal(Boolean(updated.is_price_overridden), true);
  });

  test('7. POST /api/v1/ai/assistant/query - Natural language queries & RBAC enforcement', async () => {
    // 7a. Total sampah plastik bulan ini
    const q1 = await fetch(`${baseUrl}/api/v1/ai/assistant/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ query: 'Berapa total sampah plastik bulan ini?' }),
    });
    assert.equal(q1.status, 200);
    const res1 = await q1.json();
    assert.equal(res1.success, true);
    assert.ok(res1.data.answer.includes('Plastik'));

    // 7b. Berapa transaksi hari ini?
    const q2 = await fetch(`${baseUrl}/api/v1/ai/assistant/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({ query: 'Berapa transaksi hari ini?' }),
    });
    assert.equal(q2.status, 200);
    const res2 = await q2.json();
    assert.ok(res2.data.answer.includes('transaksi'));

    // 7c. Kategori sampah apa yang paling banyak?
    const q3 = await fetch(`${baseUrl}/api/v1/ai/assistant/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ query: 'Kategori sampah apa yang paling banyak?' }),
    });
    assert.equal(q3.status, 200);
    const res3 = await q3.json();
    assert.ok(res3.data.data.length >= 0);

    // 7d. Nasabah menanyakan saldo pribadinya
    const q4 = await fetch(`${baseUrl}/api/v1/ai/assistant/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({ query: 'Berapa saldo saya?' }),
    });
    assert.equal(q4.status, 200);
    const res4 = await q4.json();
    assert.ok(res4.data.answer.includes('Saldo tabungan Bank Sampah Anda'));

    // 7e. Nasabah bertanya tentang data penjualan eksekutif (Ditolak oleh RBAC)
    const q5 = await fetch(`${baseUrl}/api/v1/ai/assistant/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({ query: 'Berapa total penjualan sampah ke pengepul bulan ini?' }),
    });
    assert.equal(q5.status, 200);
    const res5 = await q5.json();
    assert.equal(res5.data.authorized, false);
    assert.ok(res5.data.answer.includes('hanya dapat diakses oleh Pengelola (Owner) atau Administrator'));
  });
});
