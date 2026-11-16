/**
 * Seeder 05: Customer Levels, Badges, Rewards, Points, and Initial Audit Logs
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  await knex('reward_redemptions').del();
  await knex('rewards').del();
  await knex('notification_logs').del();
  await knex('audit_logs').del();
  await knex('customer_levels').del();
  await knex('badges').del();

  const c1 = await knex('customers').where({ account_no: 'NSB-2026-0001' }).first();
  const c2 = await knex('customers').where({ account_no: 'NSB-2026-0002' }).first();
  const admin = await knex('users').where({ username: 'admin' }).first();

  // 1. Customer Levels
  await knex('customer_levels').insert([
    {
      name: 'Warga Pemula',
      min_points: 0,
      badge_icon: 'seedling',
      benefits: 'Buku tabungan digital, akses katalog harga sampah terkini',
    },
    {
      name: 'Warga Peduli',
      min_points: 100,
      badge_icon: 'recycle',
      benefits: 'Bonus poin 5% setiap setoran, kupon diskon sembako',
    },
    {
      name: 'Pejuang Lingkungan',
      min_points: 500,
      badge_icon: 'leaf',
      benefits: 'Bonus poin 10%, layanan jemput sampah prioritas RT',
    },
    {
      name: 'Jawara Sirkular',
      min_points: 1500,
      badge_icon: 'award',
      benefits: 'Bonus poin 15%, merchandise ramah lingkungan eksklusif',
    },
  ]);

  // 2. Badges
  await knex('badges').insert([
    {
      code: 'FIRST_DEPOSIT',
      name: 'Langkah Pertama Hijau',
      description: 'Berhasil melakukan setoran sampah terpilah pertama kali',
      icon_url: 'badge-first.svg',
      criteria: 'Minimal 1 transaksi setor',
    },
    {
      code: 'PLASTIC_HERO_10KG',
      name: 'Pahlawan Bebas Plastik',
      description: 'Menyetor lebih dari 10 kg sampah botol plastik',
      icon_url: 'badge-plastic.svg',
      criteria: 'Total setor plastik >= 10kg',
    },
    {
      code: 'CONSISTENT_WARGA',
      name: 'Warga Teladan Lingkungan',
      description: 'Rutin menyetor sampah setiap bulan',
      icon_url: 'badge-star.svg',
      criteria: 'Aktif menyetor minimal 3 bulan beruntun',
    },
  ]);

  const badgeFirst = await knex('badges').where({ code: 'FIRST_DEPOSIT' }).first();

  // 3. Award Badge to c1
  await knex('customer_badges').insert([
    {
      customer_id: c1.id,
      badge_id: badgeFirst.id,
      awarded_at: new Date('2026-03-01T09:35:00Z'),
    },
  ]);

  // 4. Points
  await knex('points').insert([
    {
      customer_id: c1.id,
      current_points: 150,
      lifetime_points: 150,
      updated_at: new Date(),
    },
    {
      customer_id: c2.id,
      current_points: 80,
      lifetime_points: 80,
      updated_at: new Date(),
    },
  ]);

  await knex('point_transactions').insert([
    {
      customer_id: c1.id,
      points: 150,
      type: 'EARN',
      reference_id: 'TRX-20260301-0001',
      description: 'Poin setoran sampah 15 kg',
      created_at: new Date('2026-03-01T09:30:00Z'),
    },
    {
      customer_id: c2.id,
      points: 80,
      type: 'EARN',
      reference_id: 'TRX-20260305-0002',
      description: 'Poin setoran sampah kertas 14 kg',
      created_at: new Date('2026-03-05T10:15:00Z'),
    },
  ]);

  // 5. Rewards Catalog
  await knex('rewards').insert([
    {
      title: 'Minyak Goreng Kemasan 1 Liter',
      description: 'Minyak goreng kelapa sawit higienis untuk kebutuhan dapur rumah tangga',
      point_cost: 300,
      stock: 45,
      is_active: true,
      valid_until: '2026-12-31',
    },
    {
      title: 'Voucher Listrik PLN Rp 20.000',
      description: 'Token listrik prabayar PLN 20 ribu rupiah',
      point_cost: 250,
      stock: 100,
      is_active: true,
      valid_until: '2026-12-31',
    },
    {
      title: 'Tas Belanja Ramah Lingkungan (Tote Bag)',
      description: 'Tas kain kanvas daur ulang pengganti kresek sekali pakai',
      point_cost: 120,
      stock: 80,
      is_active: true,
      valid_until: '2026-12-31',
    },
  ]);

  // 6. Notification Logs for c1
  const u1 = await knex('users').where({ username: 'nasabah' }).first();
  await knex('notification_logs').insert([
    {
      user_id: u1.id,
      title: 'Setoran Sampah Berhasil Diterima',
      message: 'Setoran Anda TRX-20260301-0001 sebesar Rp 44.500 telah berhasil dibukukan ke dompet Anda.',
      type: 'TRANSACTION',
      is_read: false,
      created_at: new Date('2026-03-01T09:32:00Z'),
    },
    {
      user_id: u1.id,
      title: 'Pengajuan Penarikan Sedang Ditinjau',
      message: 'Pengajuan penarikan saldo tunai Rp 20.000 sedang menunggu persetujuan pengelola.',
      type: 'WITHDRAWAL',
      is_read: false,
      created_at: new Date('2026-03-08T14:00:00Z'),
    },
  ]);

  // 7. Initial Audit Log
  await knex('audit_logs').insert([
    {
      user_id: admin.id,
      action: 'SYSTEM_INITIALIZATION',
      entity_name: 'system',
      entity_id: '0',
      new_values: JSON.stringify({ version: '1.0.0', platform: 'Bank Sampah Digital' }),
      ip_address: '127.0.0.1',
      user_agent: 'Antigravity Seed Runner',
      created_at: new Date(),
    },
  ]);
};
