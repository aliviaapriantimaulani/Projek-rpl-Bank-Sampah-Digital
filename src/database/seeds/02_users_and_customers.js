const bcrypt = require('bcryptjs');

/**
 * Seeder 02: Default Users for each role and sample Customers (Nasabah)
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Clear tables in reverse dependency order
  await knex('customer_identifications').del();
  await knex('customer_badges').del();
  await knex('point_transactions').del();
  await knex('points').del();
  await knex('wallet_ledger').del();
  await knex('customer_wallets').del();
  await knex('customers').del();
  await knex('user_roles').del();
  await knex('users').del();

  const branch = await knex('branches').where({ code: 'BS-PUSAT-01' }).first();
  const branchId = branch ? branch.id : null;

  const roles = await knex('roles').select('id', 'name');
  const roleMap = {};
  roles.forEach((r) => {
    roleMap[r.name] = r.id;
  });

  // Hashed Passwords
  const adminHash = bcrypt.hashSync('Admin123!', 10);
  const ownerHash = bcrypt.hashSync('Owner123!', 10);
  const petugasHash = bcrypt.hashSync('Petugas123!', 10);
  const nasabahHash = bcrypt.hashSync('Nasabah123!', 10);

  // 1. Insert Users
  const usersToInsert = [
    {
      branch_id: branchId,
      name: 'Raden Arya (Admin Sistem)',
      email: 'admin@banksampah.id',
      username: 'admin',
      phone: '08129990001',
      password_hash: adminHash,
      status: 'ACTIVE',
    },
    {
      branch_id: branchId,
      name: 'H. Mulyono (Ketua / Owner)',
      email: 'owner@banksampah.id',
      username: 'owner',
      phone: '08129990002',
      password_hash: ownerHash,
      status: 'ACTIVE',
    },
    {
      branch_id: branchId,
      name: 'Dewi Sartika (Petugas Kasir & Timbang)',
      email: 'petugas@banksampah.id',
      username: 'petugas',
      phone: '08129990003',
      password_hash: petugasHash,
      status: 'ACTIVE',
    },
    {
      branch_id: branchId,
      name: 'Budi Santoso (Warga RT 03)',
      email: 'nasabah@banksampah.id',
      username: 'nasabah',
      phone: '08129990004',
      password_hash: nasabahHash,
      status: 'ACTIVE',
    },
    {
      branch_id: branchId,
      name: 'Siti Aminah (Warga RT 04)',
      email: 'siti@banksampah.id',
      username: 'siti_aminah',
      phone: '08129990005',
      password_hash: nasabahHash,
      status: 'ACTIVE',
    },
  ];

  await knex('users').insert(usersToInsert);

  // Fetch created users
  const adminUser = await knex('users').where({ username: 'admin' }).first();
  const ownerUser = await knex('users').where({ username: 'owner' }).first();
  const petugasUser = await knex('users').where({ username: 'petugas' }).first();
  const nasabahUser1 = await knex('users').where({ username: 'nasabah' }).first();
  const nasabahUser2 = await knex('users').where({ username: 'siti_aminah' }).first();

  // 2. Assign User Roles
  await knex('user_roles').insert([
    { user_id: adminUser.id, role_id: roleMap['ADMIN'] },
    { user_id: ownerUser.id, role_id: roleMap['OWNER'] },
    { user_id: petugasUser.id, role_id: roleMap['PETUGAS'] },
    { user_id: nasabahUser1.id, role_id: roleMap['NASABAH'] },
    { user_id: nasabahUser2.id, role_id: roleMap['NASABAH'] },
  ]);

  // 3. Create Customers Profiles for Nasabah
  const customers = [
    {
      user_id: nasabahUser1.id,
      branch_id: branchId,
      nik: '3171012304850001',
      account_no: 'NSB-2026-0001',
      address: 'Jl. Melati No. 12, RT 03 / RW 04',
      rt_rw: '03/04',
      kelurahan: 'Sejahtera',
      kecamatan: 'Kemakmuran',
      qr_code_token: 'QR-NSB-3171012304850001-X7K',
      join_date: '2026-01-15',
      status: 'ACTIVE',
    },
    {
      user_id: nasabahUser2.id,
      branch_id: branchId,
      nik: '3171012304900002',
      account_no: 'NSB-2026-0002',
      address: 'Jl. Kenanga No. 05, RT 04 / RW 04',
      rt_rw: '04/04',
      kelurahan: 'Sejahtera',
      kecamatan: 'Kemakmuran',
      qr_code_token: 'QR-NSB-3171012304900002-Y9M',
      join_date: '2026-02-01',
      status: 'ACTIVE',
    },
  ];

  await knex('customers').insert(customers);

  const c1 = await knex('customers').where({ account_no: 'NSB-2026-0001' }).first();
  const c2 = await knex('customers').where({ account_no: 'NSB-2026-0002' }).first();

  // 4. Customer Identifications
  await knex('customer_identifications').insert([
    {
      customer_id: c1.id,
      id_type: 'KTP',
      id_number: '3171012304850001',
    },
    {
      customer_id: c2.id,
      id_type: 'KTP',
      id_number: '3171012304900002',
    },
  ]);
};
