/**
 * Seeder 01: Initial Branch and 4 Roles with Core Permissions
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Clear existing role permissions and roles
  await knex('role_permissions').del();
  await knex('permissions').del();
  await knex('roles').del();
  await knex('branches').del();

  // 1. Initial Central Branch
  const [branchId] = await knex('branches').insert(
    {
      code: 'BS-PUSAT-01',
      name: 'Bank Sampah Digital Pusat Lestari',
      address: 'Jl. Pemuda Merdeka No. 45, RT 03/RW 04, Kelurahan Sejahtera, Jakarta',
      phone: '021-5551234',
      status: 'ACTIVE',
    },
    ['id']
  );

  // 2. The 4 System Roles
  const roles = [
    {
      name: 'ADMIN',
      display_name: 'Administrator Sistem',
      description: 'Akses penuh ke seluruh konfigurasi sistem, audit log, dan manajemen pengguna.',
    },
    {
      name: 'OWNER',
      display_name: 'Owner / Pengelola Bank Sampah',
      description: 'Akses ke dasbor operasional, approval penarikan saldo, laporan keuangan, stok gudang, dan penjualan.',
    },
    {
      name: 'PETUGAS',
      display_name: 'Petugas Timbang / Teller',
      description: 'Akses ke pencatatan timbangan sampah, transaksi nasabah, kasir penarikan tunai, dan registrasi nasabah.',
    },
    {
      name: 'NASABAH',
      display_name: 'Nasabah / Warga',
      description: 'Akses ke kartu anggota digital & QR, buku tabungan/dompet sampah, riwayat setor, reward, dan pengajuan penarikan.',
    },
  ];

  await knex('roles').insert(roles);

  // 3. System Permissions
  const permissions = [
    // Users & Roles
    { name: 'users:manage', module: 'users', description: 'Membuat, mengubah, dan menghapus pengguna' },
    { name: 'users:view', module: 'users', description: 'Melihat daftar pengguna' },
    // Customers
    { name: 'customers:manage', module: 'customers', description: 'Registrasi dan edit data nasabah' },
    { name: 'customers:view', module: 'customers', description: 'Melihat data dan kartu nasabah' },
    // Transactions & Weighing
    { name: 'deposits:create', module: 'deposits', description: 'Mencatat timbangan dan transaksi setor sampah' },
    { name: 'deposits:view', module: 'deposits', description: 'Melihat riwayat transaksi setor' },
    // Finance & Wallets
    { name: 'withdrawals:request', module: 'finance', description: 'Mengajukan penarikan saldo dompet' },
    { name: 'withdrawals:approve', module: 'finance', description: 'Menyetujui atau menolak penarikan saldo' },
    { name: 'withdrawals:process', module: 'finance', description: 'Memproses pembayaran pencairan kasir' },
    { name: 'finance:reports', module: 'finance', description: 'Melihat laporan buku kas dan perputaran uang' },
    // Inventory & Sales
    { name: 'inventory:manage', module: 'inventory', description: 'Kelola stok dan pergerakan sampah gudang' },
    { name: 'sales:manage', module: 'sales', description: 'Mencatat penjualan sampah ke pengepul / pabrik' },
    // Audit & System
    { name: 'audit:view', module: 'audit', description: 'Melihat riwayat audit log aktivitas sistem' },
  ];

  await knex('permissions').insert(permissions);
};
