const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');
const nousChatbotService = require('../src/services/ai/nous_chatbot.service');

describe('Nous Research AI Chatbot Integration Tests', () => {
  let server;
  let baseUrl;
  let nasabahToken;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const nasabahUser = await db('users').where({ username: 'nasabah' }).first();
    if (nasabahUser) {
      const cust = await db('customers').where({ user_id: nasabahUser.id }).first();
      nasabahToken = generateToken({
        id: nasabahUser.id,
        role: 'NASABAH',
        customerId: cust ? cust.id : null,
      });
    }
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('1. GET /api/v1/chatbot/status - Memverifikasi provider Nous Research dan masking Key ID', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/status`);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.provider, 'Nous Research');
    assert.strictEqual(json.data.hasApiKey, true);
    assert.strictEqual(json.data.hasKeyId, true);
    assert.match(json.data.keyIdPreview, /^980c8d71/);
    assert.strictEqual(json.data.apiKey, undefined, 'API Key rahasia tidak boleh bocor ke client');
  });

  test('2. GET /api/v1/chatbot/suggestions - Menghasilkan daftar pertanyaan pemantik', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/suggestions`);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length >= 3);
  });

  test('3. POST /api/v1/chatbot/message - Validasi input kosong (400)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    assert.strictEqual(res.status, 400);

    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.match(json.message, /tidak boleh kosong/i);
  });

  test('4. POST /api/v1/chatbot/message - Berhasil menjawab pertanyaan via Nous Research AI', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(nasabahToken ? { 'Authorization': `Bearer ${nasabahToken}` } : {}),
      },
      body: JSON.stringify({
        message: 'Berapa harga sampah botol plastik saat ini?',
        history: [],
      }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.reply, 'Harus memiliki balasan dari EcoBot');
    assert.ok(json.data.provider.includes('Nous Research'));
    assert.ok(typeof json.data.reply === 'string' && json.data.reply.length > 20);
  });
});
