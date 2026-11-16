/**
 * Seeder 04: Wallets, Ledger Movements, Transactions, and Sample Withdrawal
 * Demonstrates ledger-based accounting without destructive manipulation.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  await knex('withdrawal_approvals').del();
  await knex('withdrawal_requests').del();
  await knex('weighing_records').del();
  await knex('waste_deposit_items').del();
  await knex('waste_deposit_transactions').del();
  await knex('wallet_ledger').del();
  await knex('customer_wallets').del();

  const branch = await knex('branches').where({ code: 'BS-PUSAT-01' }).first();
  const branchId = branch ? branch.id : null;

  const petugas = await knex('users').where({ username: 'petugas' }).first();
  const owner = await knex('users').where({ username: 'owner' }).first();

  const c1 = await knex('customers').where({ account_no: 'NSB-2026-0001' }).first();
  const c2 = await knex('customers').where({ account_no: 'NSB-2026-0002' }).first();

  const catPET = await knex('waste_categories').where({ code: 'PLS-PET-01' }).first();
  const catBox = await knex('waste_categories').where({ code: 'CRD-BOX-01' }).first();
  const catHVS = await knex('waste_categories').where({ code: 'PPR-HVS-01' }).first();

  // 1. Create Initial Wallets for Nasabah 1 & 2
  await knex('customer_wallets').insert([
    {
      customer_id: c1.id,
      current_balance: 0,
      accumulated_earnings: 0,
      accumulated_withdrawals: 0,
      last_transaction_at: null,
    },
    {
      customer_id: c2.id,
      current_balance: 0,
      accumulated_earnings: 0,
      accumulated_withdrawals: 0,
      last_transaction_at: null,
    },
  ]);

  const wallet1 = await knex('customer_wallets').where({ customer_id: c1.id }).first();
  const wallet2 = await knex('customer_wallets').where({ customer_id: c2.id }).first();

  // 2. Create Sample Waste Deposit Transaction for Nasabah 1 (Budi Santoso)
  // Deposit: 5 kg PET @ Rp 4.500 = Rp 22.500; 10 kg Kardus @ Rp 2.200 = Rp 22.000. Total = Rp 44.500
  const txDate = new Date('2026-03-01T09:30:00Z');
  const [txId] = await knex('waste_deposit_transactions').insert(
    {
      transaction_no: 'TRX-20260301-0001',
      branch_id: branchId,
      customer_id: c1.id,
      petugas_id: petugas.id,
      transaction_date: txDate,
      total_weight_kg: 15.0,
      total_amount: 44500.0,
      status: 'COMPLETED',
      notes: 'Setoran rutin sampah rumah tangga terpilah',
    },
    ['id']
  );

  const realTxId = typeof txId === 'object' ? txId.id : txId;

  // Insert Deposit Items
  const [item1Id] = await knex('waste_deposit_items').insert(
    {
      transaction_id: realTxId,
      waste_category_id: catPET.id,
      weight_kg: 5.0,
      price_per_kg: 4500.0,
      subtotal: 22500.0,
      notes: 'Botol air mineral bersih terpisah tutup',
    },
    ['id']
  );

  const [item2Id] = await knex('waste_deposit_items').insert(
    {
      transaction_id: realTxId,
      waste_category_id: catBox.id,
      weight_kg: 10.0,
      price_per_kg: 2200.0,
      subtotal: 22000.0,
      notes: 'Kardus kering diikat rapi',
    },
    ['id']
  );

  // Weighing records (Scale audit)
  const realItem1Id = typeof item1Id === 'object' ? item1Id.id : item1Id;
  await knex('weighing_records').insert({
    deposit_item_id: realItem1Id,
    scale_identifier: 'TIMBANGAN-MEJA-DIGITAL-01',
    raw_weight: 5.2,
    tare_weight: 0.2,
    net_weight: 5.0,
    recorded_by: petugas.id,
    created_at: txDate,
  });

  // 3. Post Transaction into Wallet Ledger (Ledger-based Double Entry)
  // Nasabah 1 receives CREDIT of Rp 44.500
  await knex('wallet_ledger').insert({
    wallet_id: wallet1.id,
    entry_type: 'CREDIT',
    amount: 44500.0,
    balance_before: 0.0,
    balance_after: 44500.0,
    reference_type: 'WASTE_DEPOSIT',
    reference_id: 'TRX-20260301-0001',
    description: 'Setoran sampah terpilah (5kg PET, 10kg Kardus)',
    created_by: petugas.id,
    created_at: txDate,
  });

  // Update Wallet snapshot from ledger
  await knex('customer_wallets')
    .where({ id: wallet1.id })
    .update({
      current_balance: 44500.0,
      accumulated_earnings: 44500.0,
      last_transaction_at: txDate,
    });

  // 4. Sample Transaction 2 for Nasabah 2 (Siti Aminah) - Rp 35.000 (14 kg HVS)
  const txDate2 = new Date('2026-03-05T10:15:00Z');
  const [tx2Id] = await knex('waste_deposit_transactions').insert(
    {
      transaction_no: 'TRX-20260305-0002',
      branch_id: branchId,
      customer_id: c2.id,
      petugas_id: petugas.id,
      transaction_date: txDate2,
      total_weight_kg: 14.0,
      total_amount: 35000.0,
      status: 'COMPLETED',
      notes: 'Buku pelajaran dan dokumen arsip bekas',
    },
    ['id']
  );

  const realTx2Id = typeof tx2Id === 'object' ? tx2Id.id : tx2Id;

  await knex('waste_deposit_items').insert({
    transaction_id: realTx2Id,
    waste_category_id: catHVS.id,
    weight_kg: 14.0,
    price_per_kg: 2500.0,
    subtotal: 35000.0,
    notes: 'Kertas HVS kering',
  });

  await knex('wallet_ledger').insert({
    wallet_id: wallet2.id,
    entry_type: 'CREDIT',
    amount: 35000.0,
    balance_before: 0.0,
    balance_after: 35000.0,
    reference_type: 'WASTE_DEPOSIT',
    reference_id: 'TRX-20260305-0002',
    description: 'Setoran sampah kertas HVS 14kg',
    created_by: petugas.id,
    created_at: txDate2,
  });

  await knex('customer_wallets')
    .where({ id: wallet2.id })
    .update({
      current_balance: 35000.0,
      accumulated_earnings: 35000.0,
      last_transaction_at: txDate2,
    });

  // 5. Sample Withdrawal Request by Nasabah 1 (Budi) - Rp 20.000 (Status: PENDING approval by Owner)
  await knex('withdrawal_requests').insert({
    request_no: 'WD-20260308-0001',
    customer_id: c1.id,
    amount: 20000.0,
    method: 'CASH',
    account_info: 'Ambil Tunai di Loket Bank Sampah',
    status: 'PENDING',
    notes: 'Penarikan hasil tabungan sampah untuk belanja dapur',
  });
};
