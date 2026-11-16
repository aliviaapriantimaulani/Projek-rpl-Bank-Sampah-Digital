const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Force honest mock mode for this test process only. No real message is sent.
process.env.WHATSAPP_PROVIDER = 'mock';

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');
const whatsappService = require('../src/services/notification/whatsapp.service');

describe('WhatsApp Notification Flows (mock mode)', () => {
  let server;
  let baseUrl;
  let adminToken;
  let nasabahUser;
  let nasabahCust;
  let originalDepositPref;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const admin = await db('users').where({ username: 'admin' }).first();
    nasabahUser = await db('users').where({ username: 'nasabah' }).first();
    nasabahCust = await db('customers').where({ user_id: nasabahUser.id }).first();
    adminToken = generateToken({ id: admin.id, role: 'ADMIN' });
    originalDepositPref = nasabahCust.notification_deposit;
  });

  after(async () => {
    await db('customers')
      .where({ id: nasabahCust.id })
      .update({ notification_deposit: originalDepositPref });
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('1. Mode mock mencatat pesan tanpa mengaku terkirim', async () => {
    const result = await whatsappService.onDepositCompleted({
      userId: nasabahUser.id,
      phone: nasabahUser.phone || '081234567890',
      invoiceNo: `TRX-MOCK-${Date.now()}`,
      totalWeightKg: 2,
      totalAmount: 5000,
      currentBalance: 10000,
    });

    assert.ok(result.notificationId);
    assert.equal(result.channel, 'WHATSAPP');
    assert.equal(result.deliveryStatus, 'MOCK_LOGGED');

    const log = await db('notification_logs').where({ id: result.notificationId }).first();
    assert.equal(log.delivery_status, 'MOCK_LOGGED');
    assert.match(String(log.provider_response), /TIDAK dikirim/i);
  });

  test('2. Idempotency mencegah pesan ganda', async () => {
    const key = `IDEMPOTENT-${Date.now()}`;
    const payload = {
      userId: nasabahUser.id,
      event: 'DEPOSIT_COMPLETED',
      title: 'Uji Idempotency',
      message: 'Pesan uji idempotency',
      idempotencyKey: key,
    };

    const first = await whatsappService.notify(payload);
    const second = await whatsappService.notify(payload);

    assert.ok(first.notificationId);
    assert.equal(second.duplicate, true);
    assert.equal(second.notificationId, first.notificationId);

    const count = await db('notification_logs')
      .where({ idempotency_key: key })
      .count('id as c')
      .first();
    assert.equal(Number(count.c), 1);
  });

  test('3. Preferensi nasabah yang opt-out menghasilkan SKIPPED tanpa log', async () => {
    await db('customers').where({ id: nasabahCust.id }).update({ notification_deposit: false });

    const before = await db('notification_logs').count('id as c').first();
    const result = await whatsappService.onDepositCompleted({
      userId: nasabahUser.id,
      phone: nasabahUser.phone,
      invoiceNo: `TRX-OPTOUT-${Date.now()}`,
      totalWeightKg: 1,
      totalAmount: 1000,
    });
    const after = await db('notification_logs').count('id as c').first();

    assert.equal(result.deliveryStatus, 'SKIPPED');
    assert.equal(result.reason, 'CUSTOMER_PREFERENCE_DISABLED');
    assert.equal(Number(before.c), Number(after.c));
  });

  test('4. Pengiriman manual ke nomor tanpa akun tetap tercatat (user_id NULL)', async () => {
    const phone = '6281299988877';
    const result = await whatsappService.notify({
      phone,
      event: 'MANUAL_NOTIFICATION',
      title: 'Uji Nomor Tanpa Akun',
      message: 'Pesan untuk nomor yang belum terdaftar.',
      useProvidedPhone: true,
      idempotencyKey: `PHONE-ONLY-${Date.now()}`,
    });

    assert.ok(result.notificationId);
    const log = await db('notification_logs').where({ id: result.notificationId }).first();
    assert.equal(log.user_id, null);
    assert.equal(log.recipient_phone, phone);
  });

  test('5. Endpoint kirim manual (ADMIN) jujur saat provider mock', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notifications/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        phone: '6281277766655',
        title: 'Uji Manual Admin',
        message: 'Pesan uji manual dari admin.',
      }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.sentReal, false);
    assert.match(json.message, /belum benar-benar terkirim/i);
    assert.equal(json.data.provider.mode, 'mock');
  });

  test('6. Webhook memakai provider_message_id numerik, bukan id log internal', async () => {
    const providerId = String(900000 + Math.floor(Math.random() * 99999));

    const inserted = await db('notification_logs').insert(
      {
        user_id: nasabahUser.id,
        title: 'Webhook Test',
        message: 'Uji webhook',
        type: 'DEPOSIT_COMPLETED',
        channel: 'WHATSAPP',
        delivery_status: 'SENT',
        provider_message_id: providerId,
        created_at: new Date(),
      },
      ['id']
    );
    const logId = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0];

    const result = await whatsappService.updateDeliveryStatus({
      messageId: providerId,
      status: 'DELIVERED',
    });

    assert.ok(result.updated >= 1);
    const updated = await db('notification_logs').where({ id: logId }).first();
    assert.equal(updated.delivery_status, 'DELIVERED');
    assert.ok(updated.delivered_at);
  });

  test('7. Antrean retry tidak membuat duplikat untuk idempotency key yang sama', async () => {
    const key = `QUEUE-IDEMPOTENT-${Date.now()}`;
    const payload = {
      notificationLogId: null,
      userId: nasabahUser.id,
      phone: nasabahUser.phone || '081234567890',
      event: 'TEST_NOTIFICATION',
      title: 'Queue Test',
      message: 'Pesan antrean',
      idempotencyKey: key,
    };

    const firstId = await whatsappService.enqueueRetry(payload);
    const secondId = await whatsappService.enqueueRetry(payload);

    assert.equal(String(firstId), String(secondId));
    const count = await db('whatsapp_queue')
      .where({ idempotency_key: key })
      .count('id as c')
      .first();
    assert.equal(Number(count.c), 1);
  });

  test('8. Provider status melaporkan mode mock dan tidak membocorkan kredensial', async () => {
    const info = whatsappService.getProviderInfo();
    assert.equal(info.mode, 'mock');
    assert.equal(info.configured, false);
    assert.match(info.message, /TIDAK dikirim/i);
    assert.equal(info.accessToken, undefined);
    assert.equal(info.apiKey, undefined);
  });
});
