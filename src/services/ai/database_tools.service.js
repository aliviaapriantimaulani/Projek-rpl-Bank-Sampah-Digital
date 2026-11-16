/**
 * Database Tools Service for AI Chatbot Function Calling
 *
 * Provides structured tool definitions (OpenAI / Nous compatible format)
 * and secure backend callback handlers for executing real-time database queries.
 *
 * RBAC POLICY:
 * Internal database statistics and operational metrics are strictly restricted
 * to authenticated users with the "ADMIN" role.
 */

const db = require('../../config/database');

class DatabaseToolsService {
  /**
   * OpenAI / Nous Function Calling Tool Declarations
   */
  getToolDeclarations() {
    return [
      {
        type: 'function',
        function: {
          name: 'get_users_statistics',
          description:
            'Mengambil statistik jumlah pengguna (users) terdaftar dan perincian peran (Admin, Petugas, Owner, Nasabah) secara real-time dari database. HANYA dipanggil jika pengguna berstatus Admin.',
          parameters: {
            type: 'object',
            properties: {
              includeRolesBreakdown: {
                type: 'boolean',
                description: 'Sertakan perincian jumlah pengguna per peran sistem (default: true)',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_customers_statistics',
          description:
            'Mengambil data jumlah nasabah warga terdaftar, nasabah aktif, dan total tonase sampah yang disetor ke bank sampah secara real-time dari database. HANYA dipanggil jika pengguna berstatus Admin.',
          parameters: {
            type: 'object',
            properties: {
              onlyActive: {
                type: 'boolean',
                description: 'Hanya hitung nasabah yang berstatus aktif (default: false)',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_transactions_statistics',
          description:
            'Mengambil data ringkasan transaksi setoran sampah (total transaksi, perputaran rupiah, dan transaksi hari ini) secara real-time dari database. HANYA dipanggil jika pengguna berstatus Admin.',
          parameters: {
            type: 'object',
            properties: {
              period: {
                type: 'string',
                enum: ['all_time', 'today', 'this_month'],
                description: 'Filter rentang waktu transaksi: all_time, today, atau this_month',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_inventory_statistics',
          description:
            'Mengambil data stok persediaan sampah yang tersimpan di gudang penyimpanan bank sampah dari database secara real-time. HANYA dipanggil jika pengguna berstatus Admin.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_system_overview',
          description:
            'Mengambil ringkasan eksekutif menyeluruh dari database (total users, total nasabah, total transaksi, saldo nasabah, dan stok gudang) secara real-time. HANYA dipanggil jika pengguna berstatus Admin.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'calculate_waste_price',
          description:
            'Kalkulator Harga Sampah: Menghitung estimasi total nilai rupiah dari berat (kg) tertentu suatu jenis sampah berdasarkan harga resmi di database.',
          parameters: {
            type: 'object',
            required: ['waste_type', 'weight_kg'],
            properties: {
              waste_type: {
                type: 'string',
                description: 'Jenis sampah yang dihitung (misalnya: "kardus", "botol plastik", "besi", "kertas hvs", "kaleng aluminium", "jelantah").',
              },
              weight_kg: {
                type: 'number',
                description: 'Berat atau volume sampah dalam satuan kilogram (kg).',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_waste_category_status',
          description:
            'Cek status aktif (is_active) dan detail kategori sampah dari database berdasarkan kode atau nama. HANYA digunakan untuk menjawab pertanyaan seperti "apakah kardus cokelat tebal aktif?" atau "status sampah jenis X".',
          parameters: {
            type: 'object',
            properties: {
              waste_type: {
                type: 'string',
                description: 'Kode atau nama jenis sampah (misalnya: "CRD-BOX-01", "kardus", "karton", "botol plastik", "PLS-PET-01"). Jika tidak diberikan, akan dilakukan pencocokan berdasarkan nama.',
              },
            },
            required: [],
          },
        },
      },
    ];
  }

  /**
   * Check if a user has Admin role
   */
  isAdmin(user) {
    if (!user) return false;
    const role = String(user.role || '').toUpperCase();
    return role === 'ADMIN';
  }

  /**
   * Central Tool Execution Dispatcher with RBAC enforcement
   */
  async executeTool(toolName, args = {}, user = null) {
    // 1. Fitur Publik (Dapat diakses oleh siapa saja: Tamu, Nasabah, Petugas, Owner, Admin)
    if (toolName === 'calculate_waste_price') {
      console.log('[DatabaseTools] calculate_waste_price called with args:', args);
      return await this.calculateWastePrice(args);
    }

    // 2. Role-Based Access Gate (Khusus Data Internal Admin)
    if (!this.isAdmin(user)) {
      console.log('[DatabaseTools] ACCESS_DENIED for tool:', toolName, 'user role:', user?.role);
      return {
        success: false,
        authorized: false,
        error: 'ACCESS_DENIED',
        message:
          'Akses ditolak: Fitur query data internal database HANYA dapat diakses oleh pengguna dengan peran Administrator (Admin).',
      };
    }
    console.log('[DatabaseTools] Executing tool:', toolName, 'for user role:', user?.role);

    try {
      switch (toolName) {
        case 'get_users_statistics':
          return await this.getUsersStatistics(args);

        case 'get_customers_statistics':
          return await this.getCustomersStatistics(args);

        case 'get_transactions_statistics':
          return await this.getTransactionsStatistics(args);

        case 'get_inventory_statistics':
          return await this.getInventoryStatistics(args);

        case 'get_system_overview':
          return await this.getSystemOverview(args);

        case 'get_waste_category_status':
          return await this.getWasteCategoryStatus(args);

        default:
          return {
            success: false,
            authorized: true,
            error: 'UNKNOWN_TOOL',
            message: `Tool "${toolName}" tidak dikenali.`,
          };
      }
    } catch (err) {
      console.error(`[DatabaseToolsService] Gagal menjalankan tool ${toolName}:`, err);
      return {
        success: false,
        authorized: true,
        error: 'EXECUTION_ERROR',
        message: `Terjadi kesalahan saat menjalankan query database: ${err.message}`,
      };
    }
  }

  /**
   * 1. Query Users Statistics
   */
  async getUsersStatistics(args = {}) {
    const totalUsersRow = await db('users').count('id as count').first();
    const activeUsersRow = await db('users').where({ status: 'ACTIVE' }).count('id as count').first();

    const totalUsers = parseInt(totalUsersRow?.count || 0, 10);
    const activeUsers = parseInt(activeUsersRow?.count || 0, 10);

    // Roles breakdown
    let rolesBreakdown = [];
    try {
      const rolesData = await db('roles')
        .leftJoin('user_roles', 'roles.id', 'user_roles.role_id')
        .select('roles.name as role_name', 'roles.display_name')
        .count('user_roles.user_id as user_count')
        .groupBy('roles.id', 'roles.name', 'roles.display_name');

      rolesBreakdown = rolesData.map((r) => ({
        role: r.role_name,
        displayName: r.display_name || r.role_name,
        count: parseInt(r.user_count || 0, 10),
      }));
    } catch (e) {
      // Fallback if user_roles join fails
      rolesBreakdown = [];
    }

    return {
      success: true,
      authorized: true,
      tool: 'get_users_statistics',
      data: {
        totalUsers,
        activeUsers,
        rolesBreakdown,
        timestamp: new Date().toISOString(),
      },
      summary:
        `Total pengguna sistem saat ini berjumlah **${totalUsers} orang** ` +
        `(**${activeUsers} berstatus aktif**).` +
        (rolesBreakdown.length
          ? `\n\nPerincian per peran:\n` +
            rolesBreakdown.map((r) => `- **${r.displayName} (${r.role})**: ${r.count} orang`).join('\n')
          : ''),
    };
  }

  /**
   * 2. Query Customers Statistics
   */
  async getCustomersStatistics(args = {}) {
    const totalCustRow = await db('customers').count('id as count').first();
    const activeCustRow = await db('customers').where({ status: 'ACTIVE' }).count('id as count').first();
    const totalWasteRow = await db('customers').sum('total_waste_deposited_kg as total_kg').first();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newCustMonthRow = await db('customers')
      .where('created_at', '>=', startOfMonth)
      .count('id as count')
      .first();

    const totalCustomers = parseInt(totalCustRow?.count || 0, 10);
    const activeCustomers = parseInt(activeCustRow?.count || 0, 10);
    const totalDepositedKg = parseFloat(totalWasteRow?.total_kg || 0);
    const newCustomersThisMonth = parseInt(newCustMonthRow?.count || 0, 10);

    return {
      success: true,
      authorized: true,
      tool: 'get_customers_statistics',
      data: {
        totalCustomers,
        activeCustomers,
        totalDepositedKg,
        newCustomersThisMonth,
        timestamp: new Date().toISOString(),
      },
      summary:
        `Saat ini terdapat total **${totalCustomers} nasabah warga** terdaftar di Bank Sampah Digital, ` +
        `dengan **${activeCustomers} nasabah berstatus aktif**.\n` +
        `- Total sampah disetorkan oleh nasabah: **${totalDepositedKg.toLocaleString('id-ID')} kg**\n` +
        `- Nasabah baru mendaftar bulan ini: **${newCustomersThisMonth} orang**`,
    };
  }

  /**
   * 3. Query Transactions Statistics
   */
  async getTransactionsStatistics(args = {}) {
    const period = args.period || 'all_time';
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalRow, todayRow, monthRow] = await Promise.all([
      db('waste_deposit_transactions')
        .select(
          db.raw('COUNT(id) as count'),
          db.raw('SUM(total_amount) as total_amount'),
          db.raw('SUM(total_weight_kg) as total_weight')
        )
        .first(),
      db('waste_deposit_transactions')
        .where('transaction_date', '>=', startOfDay)
        .select(
          db.raw('COUNT(id) as count'),
          db.raw('SUM(total_amount) as total_amount'),
          db.raw('SUM(total_weight_kg) as total_weight')
        )
        .first(),
      db('waste_deposit_transactions')
        .where('transaction_date', '>=', startOfMonth)
        .select(
          db.raw('COUNT(id) as count'),
          db.raw('SUM(total_amount) as total_amount'),
          db.raw('SUM(total_weight_kg) as total_weight')
        )
        .first(),
    ]);

    const totalCount = parseInt(totalRow?.count || 0, 10);
    const totalAmount = parseFloat(totalRow?.total_amount || 0);
    const totalWeight = parseFloat(totalRow?.total_weight || 0);

    const todayCount = parseInt(todayRow?.count || 0, 10);
    const todayAmount = parseFloat(todayRow?.total_amount || 0);
    const todayWeight = parseFloat(todayRow?.total_weight || 0);

    const monthCount = parseInt(monthRow?.count || 0, 10);
    const monthAmount = parseFloat(monthRow?.total_amount || 0);
    const monthWeight = parseFloat(monthRow?.total_weight || 0);

    return {
      success: true,
      authorized: true,
      tool: 'get_transactions_statistics',
      data: {
        totalCount,
        totalAmount,
        totalWeight,
        today: { count: todayCount, amount: todayAmount, weightKg: todayWeight },
        thisMonth: { count: monthCount, amount: monthAmount, weightKg: monthWeight },
        timestamp: new Date().toISOString(),
      },
      summary:
        `**📈 Ringkasan Transaksi Setoran Sampah (Real-Time Database):**\n\n` +
        `- **Hari Ini**: **${todayCount} transaksi** (Timbangan: **${todayWeight.toLocaleString('id-ID')} kg**, Nilai: **Rp ${todayAmount.toLocaleString('id-ID')}**)\n` +
        `- **Bulan Ini**: **${monthCount} transaksi** (Nilai: **Rp ${monthAmount.toLocaleString('id-ID')}**)\n` +
        `- **Total Keseluruhan**: **${totalCount} transaksi** dengan total perputaran tabungan **Rp ${totalAmount.toLocaleString('id-ID')}** (Volume: **${totalWeight.toLocaleString('id-ID')} kg**).`,
    };
  }

  /**
   * 4. Query Inventory Statistics
   */
  async getInventoryStatistics(args = {}) {
    const invItems = await db('inventory')
      .join('waste_categories', 'inventory.waste_category_id', 'waste_categories.id')
      .select(
        'waste_categories.name as category_name',
        'waste_categories.code as category_code',
        'inventory.current_stock_kg'
      );

    const totalStockKg = invItems.reduce(
      (acc, cur) => acc + parseFloat(cur.current_stock_kg || 0),
      0
    );

    const itemsSummary = invItems
      .map(
        (i) =>
          `- **${i.category_name}**: ${parseFloat(i.current_stock_kg || 0).toLocaleString('id-ID')} kg`
      )
      .join('\n');

    return {
      success: true,
      authorized: true,
      tool: 'get_inventory_statistics',
      data: {
        totalStockKg,
        itemsCount: invItems.length,
        items: invItems,
        timestamp: new Date().toISOString(),
      },
      summary:
        `Total persediaan sampah di gudang penyimpanan saat ini adalah **${totalStockKg.toLocaleString('id-ID')} kg** ` +
        `dari **${invItems.length} kategori sampah**.\n\nRincian per kategori:\n${itemsSummary || '- Belum ada persediaan tercatat.'}`,
    };
  }

  /**
   * 5. Query Full System Overview (Executive Dashboard for Admin)
   */
  async getSystemOverview(args = {}) {
    const [users, customers, transactions, inventory, wallets] = await Promise.all([
      db('users').count('id as count').first(),
      db('customers').count('id as count').first(),
      db('waste_deposit_transactions').count('id as count').first(),
      db('inventory').sum('current_stock_kg as total').first(),
      db('customer_wallets').sum('current_balance as total_balance').first(),
    ]);

    const totalUsers = parseInt(users?.count || 0, 10);
    const totalCustomers = parseInt(customers?.count || 0, 10);
    const totalDeposits = parseInt(transactions?.count || 0, 10);
    const totalInventoryKg = parseFloat(inventory?.total || 0);
    const totalBalance = parseFloat(wallets?.total_balance || 0);

    return {
      success: true,
      authorized: true,
      tool: 'get_system_overview',
      data: {
        totalUsers,
        totalCustomers,
        totalDeposits,
        totalInventoryKg,
        totalBalance,
        timestamp: new Date().toISOString(),
      },
      summary:
        `**📊 Ringkasan Statistik Bank Sampah Digital (Real-Time Database)**\n\n` +
        `**Pengguna & Nasabah:**\n` +
        `- Total Pengguna Sistem: **${totalUsers}**\n` +
        `- Total Nasabah Terdaftar: **${totalCustomers}**\n\n` +
        `**Transaksi Setoran:**\n` +
        `- Total Transaksi: **${totalDeposits}**\n\n` +
        `**Inventaris & Keuangan:**\n` +
        `- Total Stok Gudang: **${totalInventoryKg.toLocaleString('id-ID')} kg**\n` +
        `- Total Saldo Dompet Nasabah: **Rp ${totalBalance.toLocaleString('id-ID')}**\n\n` +
        `*Data bersumber langsung dari database internal Bank Sampah Digital.*`,
    };
  }
  /**
   * 6. Cek Status Kategori Sampah: Ofisialkan apakah kategori sampah aktif atau tidak
   */
  async getWasteCategoryStatus(args = {}) {
    console.log('[DatabaseTools] get_waste_category_status called with args:', args);
    const rawType = String(args.waste_type || '').trim();
    if (!rawType) {
      return {
        success: false,
        authorized: true,
        tool: 'get_waste_category_status',
        message: 'Mohon berikan kode atau nama jenis sampah untuk dicek statusnya (contoh: "kardus", "CRD-BOX-01", "botol plastik").',
      };
    }

    try {
      // Cari kategori berdasarkan code atau nama (case-insensitive)
      const category = await db('waste_categories')
        .where('waste_categories.code', 'like', `%${rawType}%`)
        .orWhere('waste_categories.name', 'like', `%${rawType}%`)
        .first();

      if (!category) {
        console.log('[DatabaseTools] Category not found for:', rawType);
        return {
          success: false,
          authorized: true,
          tool: 'get_waste_category_status',
          message: `Kategori sampah "${rawType}" tidak ditemukan di katalog Bank Sampah Digital.`,
        };
      }

      const isActive = category.is_active === 1;
      const unit = category.unit || 'KG';
      const name = category.name;
      const code = category.code;
      const parentCategory = category.parent_category;

      return {
        success: true,
        authorized: true,
        tool: 'get_waste_category_status',
        data: {
          code,
          name,
          parentCategory,
          unit,
          isActive,
        },
        summary: `Kategori **${name}** (${code})${isActive ? ' aktif' : ' non-aktif'} di Bank Sampah Digital. Satuan: **${unit}**`,
      };
    } catch (err) {
      console.error('[DatabaseToolsService] Gagal cek status kategori sampah:', err.message);
      return {
        success: false,
        authorized: true,
        tool: 'get_waste_category_status',
        message: `Terjadi kesalahan saat membaca data kategori: ${err.message}`,
      };
    }
  }

  /**
   * 6. Kalkulator Harga Sampah: Menghitung nilai rupiah dari berat (kg) sampah
   */
  async calculateWastePrice(args = {}) {
    const rawType = String(args.waste_type || args.wasteType || args.type || '').trim().toLowerCase();
    const rawWeight = String(args.weight_kg !== undefined ? args.weight_kg : (args.weightKg || args.weight || 0)).replace(',', '.');
    const weightKg = parseFloat(rawWeight);

    if (!rawType || isNaN(weightKg) || weightKg <= 0) {
      return {
        success: false,
        authorized: true,
        tool: 'calculate_waste_price',
        message: 'Mohon cantumkan jenis sampah dan beratnya (contoh: 5 kg kardus atau 10 kg botol plastik).',
      };
    }

    try {
      const categories = await db('waste_categories')
        .leftJoin('waste_prices', function () {
          this.on('waste_categories.id', '=', 'waste_prices.waste_category_id')
            .andOn('waste_prices.is_active', '=', db.raw('?', [1]));
        })
        .where('waste_categories.is_active', 1)
        .select(
          'waste_categories.id',
          'waste_categories.code',
          'waste_categories.name',
          'waste_categories.parent_category',
          'waste_categories.unit',
          'waste_prices.buying_price'
        );

      const matched = this.matchWasteCategory(rawType, categories);

      if (!matched || !matched.buying_price) {
        return {
          success: false,
          authorized: true,
          tool: 'calculate_waste_price',
          message: `Jenis sampah "${rawType}" belum memiliki daftar harga resmi aktif di Bank Sampah Digital. Silakan tanyakan kepada petugas loket.`,
        };
      }

      const unitPrice = parseFloat(matched.buying_price);
      const totalValue = weightKg * unitPrice;
      const unit = (matched.unit || 'kg').toUpperCase();

      const formattedUnitPrice = unitPrice.toLocaleString('id-ID');
      const formattedTotal = totalValue.toLocaleString('id-ID');
      const formattedWeight = weightKg.toLocaleString('id-ID', { maximumFractionDigits: 2 });

      return {
        success: true,
        authorized: true,
        tool: 'calculate_waste_price',
        data: {
          categoryCode: matched.code,
          categoryName: matched.name,
          parentCategory: matched.parent_category,
          unit,
          pricePerUnit: unitPrice,
          weight: weightKg,
          totalValue,
        },
        summary: `Harga **${matched.name}** saat ini adalah **Rp ${formattedUnitPrice}/${unit}**. Jadi, untuk **${formattedWeight} ${unit}**, perkiraan nilainya adalah **Rp ${formattedTotal}** (${formattedWeight} ${unit} × Rp ${formattedUnitPrice}). 🌱`,
      };
    } catch (err) {
      console.error('[DatabaseToolsService] Gagal menghitung kalkulator harga:', err);
      return {
        success: false,
        authorized: true,
        tool: 'calculate_waste_price',
        message: `Terjadi kendala saat membaca data harga dari database: ${err.message}`,
      };
    }
  }

  /**
   * Cocokkan kata kunci jenis sampah dengan kategori resmi database
   */
  matchWasteCategory(rawType, categories = []) {
    const term = String(rawType || '').toLowerCase().trim();
    if (!term || !Array.isArray(categories) || categories.length === 0) return null;

    if (term.includes('kardus') || term.includes('karton') || term.includes('box')) {
      const found = categories.find((c) => c.code === 'CRD-BOX-01' || /kardus|karton/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('pet') || term.includes('botol plastik') || term.includes('botol air') || term.includes('mineral')) {
      const found = categories.find((c) => c.code === 'PLS-PET-01' || /botol pet|pet bersih/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('hdpe') || term.includes('jerigen') || term.includes('tutup')) {
      const found = categories.find((c) => c.code === 'PLS-HDPE-02' || /hdpe/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('plastik')) {
      const found = categories.find((c) => c.code === 'PLS-PET-01' || /plastik/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('hvs') || term.includes('buku') || term.includes('dokumen') || term.includes('kertas hvs')) {
      const found = categories.find((c) => c.code === 'PPR-HVS-01' || /hvs/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('koran') || term.includes('majalah')) {
      const found = categories.find((c) => c.code === 'PPR-KOR-02' || /koran/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('kertas')) {
      const found = categories.find((c) => c.code === 'PPR-HVS-01' || /kertas/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('besi') || term.includes('pipa') || term.includes('baja')) {
      const found = categories.find((c) => c.code === 'MTL-BSI-01' || /besi/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('kaleng') || term.includes('aluminium') || term.includes('aluminum')) {
      const found = categories.find((c) => c.code === 'MTL-ALU-02' || /kaleng|aluminium/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('logam')) {
      const found = categories.find((c) => /metal|logam|besi/i.test(c.parent_category || c.name));
      if (found) return found;
    }

    if (term.includes('kaca') || term.includes('botol kaca')) {
      const found = categories.find((c) => c.code === 'GLS-BNG-01' || /kaca/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('jelantah') || term.includes('minyak')) {
      const found = categories.find((c) => c.code === 'OTH-JLT-01' || /jelantah/i.test(c.name));
      if (found) return found;
    }

    if (term.includes('elektronik') || term.includes('e-waste') || term.includes('hp')) {
      const found = categories.find((c) => c.code === 'OTH-ELK-02' || /elektronik/i.test(c.name));
      if (found) return found;
    }

    return (
      categories.find((c) => (c.name || '').toLowerCase().includes(term)) ||
      categories.find((c) => (c.parent_category || '').toLowerCase().includes(term)) ||
      null
    );
  }

  /**
   * Parser teks alami untuk mendeteksi berat (kg) dan nama sampah
   */
  async parseAndCalculate(query) {
    if (!query || typeof query !== 'string') return null;
    const q = query.toLowerCase().replace(/,/g, '.');

    const weightMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilogram|liter|lt)\b/i);
    if (!weightMatch) return null;

    const weightKg = parseFloat(weightMatch[1]);
    if (isNaN(weightKg) || weightKg <= 0) return null;

    const WASTE_TERMS = [
      'botol plastik', 'plastik botol', 'plastik pet', 'plastik hdpe', 'plastik',
      'kardus box', 'kardus', 'karton',
      'kertas hvs', 'kertas koran', 'kertas bekas', 'kertas',
      'koran bekas', 'koran', 'majalah',
      'besi padat', 'besi tua', 'besi', 'logam',
      'kaleng aluminium', 'kaleng minuman', 'kaleng', 'aluminium',
      'botol kaca', 'kaca',
      'minyak jelantah', 'jelantah',
      'limbah elektronik', 'elektronik'
    ];

    let foundTerm = null;
    for (const term of WASTE_TERMS) {
      if (q.includes(term)) {
        foundTerm = term;
        break;
      }
    }

    if (!foundTerm) return null;

    return await this.calculateWastePrice({
      waste_type: foundTerm,
      weight_kg: weightKg,
    });
  }
}

module.exports = new DatabaseToolsService();

