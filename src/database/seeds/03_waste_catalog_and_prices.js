/**
 * Seeder 03: Waste Categories, Pricing, Inventory Init, and Buyers (Pengepul)
 * Categories: Plastic, Paper, Cardboard, Metal, Glass, Other
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  await knex('inventory_movements').del();
  await knex('inventory').del();
  await knex('waste_price_history').del();
  await knex('waste_prices').del();
  await knex('waste_categories').del();
  await knex('buyers').del();

  const branch = await knex('branches').where({ code: 'BS-PUSAT-01' }).first();
  const branchId = branch ? branch.id : null;

  // 1. Waste Categories (Parent: Plastic, Paper, Cardboard, Metal, Glass, Other)
  const categories = [
    // PLASTIC
    {
      code: 'PLS-PET-01',
      name: 'Plastik Botol PET Bersih (Air Mineral)',
      parent_category: 'Plastic',
      description: 'Botol bening bersih tanpa label & tutup',
      unit: 'KG',
      icon: 'bottle-water',
      is_active: true,
    },
    {
      code: 'PLS-HDPE-02',
      name: 'Plastik HDPE / Tutup & Jerigen',
      parent_category: 'Plastic',
      description: 'Tutup botol, botol shampoo, jerigen minyak',
      unit: 'KG',
      icon: 'spray-can',
      is_active: true,
    },
    // PAPER
    {
      code: 'PPR-HVS-01',
      name: 'Kertas HVS / Buku / Dokumen Bekas',
      parent_category: 'Paper',
      description: 'Kertas putih kantor, buku tulis tanpa sampul plastik',
      unit: 'KG',
      icon: 'file-text',
      is_active: true,
    },
    {
      code: 'PPR-KOR-02',
      name: 'Koran Bekas & Majalah',
      parent_category: 'Paper',
      description: 'Kertas koran dan tabloid bekas',
      unit: 'KG',
      icon: 'newspaper',
      is_active: true,
    },
    // CARDBOARD
    {
      code: 'CRD-BOX-01',
      name: 'Kardus Box Cokelat Tebal',
      parent_category: 'Cardboard',
      description: 'Kardus mie instan, kardus kemasan logistik dalam kondisi kering',
      unit: 'KG',
      icon: 'box',
      is_active: true,
    },
    // METAL
    {
      code: 'MTL-BSI-01',
      name: 'Besi Padat & Pipa Bekas',
      parent_category: 'Metal',
      description: 'Paku, kawat, besi siku, potongan pagar besi',
      unit: 'KG',
      icon: 'hammer',
      is_active: true,
    },
    {
      code: 'MTL-ALU-02',
      name: 'Kaleng Minuman Aluminium',
      parent_category: 'Metal',
      description: 'Kaleng minuman soda aluminium pipih / bulat',
      unit: 'KG',
      icon: 'cookie',
      is_active: true,
    },
    // GLASS
    {
      code: 'GLS-BNG-01',
      name: 'Botol Kaca Bening Utuh',
      parent_category: 'Glass',
      description: 'Botol sirup atau kecap kaca bening tanpa sumbat',
      unit: 'KG',
      icon: 'wine-bottle',
      is_active: true,
    },
    // OTHER
    {
      code: 'OTH-JLT-01',
      name: 'Minyak Jelantah Rumah Tangga',
      parent_category: 'Other',
      description: 'Minyak goreng sisa pakai yang telah disaring kotorannya',
      unit: 'LITER',
      icon: 'droplet',
      is_active: true,
    },
    {
      code: 'OTH-ELK-02',
      name: 'Limbah Elektronik (E-Waste PCB/HP)',
      parent_category: 'Other',
      description: 'Papan PCB elektronik bekas, charger rusak, handphone mati',
      unit: 'KG',
      icon: 'cpu',
      is_active: true,
    },
  ];

  await knex('waste_categories').insert(categories);

  // 2. Insert Pricing & Initial Inventory
  const insertedCats = await knex('waste_categories').select('id', 'code');
  const catMap = {};
  insertedCats.forEach((c) => {
    catMap[c.code] = c.id;
  });

  const priceData = [
    // [code, buying_price, selling_price, initial_stock]
    ['PLS-PET-01', 4500, 6000, 120.5],
    ['PLS-HDPE-02', 3800, 5200, 85.0],
    ['PPR-HVS-01', 2500, 3500, 240.0],
    ['PPR-KOR-02', 1800, 2600, 95.0],
    ['CRD-BOX-01', 2200, 3200, 350.0],
    ['MTL-BSI-01', 4000, 5500, 420.0],
    ['MTL-ALU-02', 13000, 16500, 45.0],
    ['GLS-BNG-01', 1200, 2000, 180.0],
    ['OTH-JLT-01', 6500, 8500, 60.0],
    ['OTH-ELK-02', 15000, 22000, 25.0],
  ];

  const now = new Date();
  const pricesToInsert = [];
  const inventoryToInsert = [];

  for (const [code, buying, selling, stock] of priceData) {
    const catId = catMap[code];
    pricesToInsert.push({
      branch_id: branchId,
      waste_category_id: catId,
      buying_price: buying,
      selling_price: selling,
      effective_date: '2026-01-01',
      is_active: true,
    });

    inventoryToInsert.push({
      branch_id: branchId,
      waste_category_id: catId,
      current_stock_kg: stock,
      last_updated_at: now,
    });
  }

  await knex('waste_prices').insert(pricesToInsert);
  await knex('inventory').insert(inventoryToInsert);

  // 3. Buyers (Pengepul / Off-taker Daur Ulang)
  await knex('buyers').insert([
    {
      name: 'H. Sudirman (Pengepul Logam & Plastik)',
      company_name: 'UD Logam Makmur Abadi',
      phone: '08138887771',
      address: 'Kawasan Industri Pulogadung Kav 18, Jakarta Timur',
      is_active: true,
    },
    {
      name: 'Ibu Ratna Handayani',
      company_name: 'PT Daur Kertas Lestari',
      phone: '08138887772',
      address: 'Sentra Daur Ulang Cikarang Barat No. 88, Bekasi',
      is_active: true,
    },
  ]);
};
