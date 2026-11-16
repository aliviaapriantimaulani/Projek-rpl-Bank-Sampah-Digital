const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/token');
const whatsAppNotificationService = require('../src/services/notification/whatsapp.service');

describe('Customer Engagement (Gamification) & WhatsApp Notification Tests', () => {
  let server;
  let baseUrl;
  let adminToken;
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
    const petugas = await db('users').where({ username: 'petugas' }).first();
    nasabahUser = await db('users').where({ username: 'nasabah' }).first();
    nasabahCust = await db('customers').where({ user_id: nasabahUser.id }).first();

    adminToken = generateToken({ id: admin.id, role: 'ADMIN' });
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

  test('1. GET /api/v1/gamification/leaderboard - Menampilkan peringkat warga dengan sensor privasi nama', async () => {
    const res = await fetch(`${baseUrl}/api/v1/gamification/leaderboard?sortBy=weight`, {
      headers: { Authorization: `Bearer ${nasabahToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.leaderboard));

    if (body.data.leaderboard.length > 0) {
      const top = body.data.leaderboard[0];
      assert.ok(top.rank >= 1);
      assert.ok(top.displayName.includes('***')); // Verified masked name for privacy!
      assert.ok(top.accountNoMasked.includes('****'));
      assert.ok('totalWeightKg' in top);
      assert.ok('currentPoints' in top);
    }
  });

  test('2. GET /api/v1/gamification/badges & /my-badges - Katalog lencana dan lencana milik nasabah', async () => {
    const resAll = await fetch(`${baseUrl}/api/v1/gamification/badges`, {
      headers: { Authorization: `Bearer ${nasabahToken}` },
    });
    assert.equal(resAll.status, 200);
    const bodyAll = await resAll.json();
    assert.ok(bodyAll.data.length >= 3);

    const resMy = await fetch(`${baseUrl}/api/v1/gamification/my-badges`, {
      headers: { Authorization: `Bearer ${nasabahToken}` },
    });
    assert.equal(resMy.status, 200);
    const bodyMy = await resMy.json();
    assert.ok(Array.isArray(bodyMy.data));
  });

  test('3. GET /api/v1/gamification/rewards - Katalog hadiah yang aktif', async () => {
    const res = await fetch(`${baseUrl}/api/v1/gamification/rewards`, {
      headers: { Authorization: `Bearer ${nasabahToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.length > 0);
    assert.ok(body.data[0].point_cost > 0);
  });

  test('4. POST /api/v1/gamification/rewards/redeem - Penolakan jika poin tidak mencukupi (Anti-Poin Negatif)', async () => {
    // Reward with very high point cost
    const [expensiveRewardId] = await db('rewards').insert({
      title: 'Sepeda Gunung Ramah Lingkungan',
      description: 'Sepeda ramah lingkungan',
      point_cost: 999999, // Impossible amount
      stock: 5,
      is_active: true,
      created_at: new Date(),
    });

    const res = await fetch(`${baseUrl}/api/v1/gamification/rewards/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({ rewardId: expensiveRewardId }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.message.includes('Poin Anda tidak mencukupi'));
  });

  test('5. POST /api/v1/gamification/rewards/redeem - Sukses penukaran reward secara atomik', async () => {
    // Ensure customer has enough points
    await db('points')
      .where({ customer_id: nasabahCust.id })
      .update({ current_points: 500 });

    const [rewardId] = await db('rewards').insert({
      title: 'Kupon Sembako Rp 10.000',
      description: 'Voucher sembako',
      point_cost: 100,
      stock: 10,
      is_active: true,
      created_at: new Date(),
    });

    const res = await fetch(`${baseUrl}/api/v1/gamification/rewards/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nasabahToken}`,
      },
      body: JSON.stringify({ rewardId }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.redemptionNo.startsWith('RDM-'));

    // Verify points deducted
    const updatedPoints = await db('points').where({ customer_id: nasabahCust.id }).first();
    assert.equal(updatedPoints.current_points, 400);

    // Verify stock decremented
    const updatedReward = await db('rewards').where({ id: rewardId }).first();
    assert.equal(updatedReward.stock, 9);
  });

  test('6. POST /api/v1/gamification/redemptions/:id/process - Staf memproses penyerahan reward (APPROVE_COLLECT)', async () => {
    const redemption = await db('reward_redemptions')
      .where({ customer_id: nasabahCust.id, status: 'REQUESTED' })
      .orderBy('id', 'desc')
      .first();

    assert.ok(redemption);

    const res = await fetch(`${baseUrl}/api/v1/gamification/redemptions/${redemption.id}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`,
      },
      body: JSON.stringify({ action: 'APPROVE_COLLECT' }),
    });

    assert.equal(res.status, 200);

    const check = await db('reward_redemptions').where({ id: redemption.id }).first();
    assert.equal(check.status, 'COLLECTED');
    assert.ok(check.collected_at);
  });

  test('7. WhatsApp Notification Service Abstraction - Kejujuran status pengiriman saat unconfigured', async () => {
    const notifyResult = await whatsAppNotificationService.onDepositCompleted({
      userId: nasabahUser.id,
      phone: '081234567890',
      invoiceNo: 'TRX-TEST-001',
      totalWeightKg: 10,
      totalAmount: 25000,
    });

    assert.ok(notifyResult.notificationId);
    assert.equal(notifyResult.event, 'DEPOSIT_COMPLETED');
    assert.equal(notifyResult.channel, 'WHATSAPP');

    // Because WHATSAPP_PROVIDER is 'none' by default, delivery status is honestly NOT_CONFIGURED
    const log = await db('notification_logs').where({ id: notifyResult.notificationId }).first();
    assert.ok(['NOT_CONFIGURED', 'MOCK_LOGGED'].includes(log.delivery_status));
  });
});
