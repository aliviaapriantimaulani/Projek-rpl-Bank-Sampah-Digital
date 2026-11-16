
/**
 * Owner Analytics & Reporting Service
 * High-performance aggregation queries for executive dashboard, SVG charts,
 * and 7 operational/financial reports with dynamic date and category filtering.
 */

const db = require('../../config/database');

class OwnerAnalyticsService {
  /**
   * 8 Executive KPI Metrics
   */
  async getOverview() {
    // 1. Customers (Total and Active)
    const custStats = await db('customers')
      .select(
        db.raw('COUNT(id) as total_customers'),
        db.raw('SUM(CASE WHEN status = "ACTIVE" THEN 1 ELSE 0 END) as active_customers')
      )
      .first();

    const totalCustomers = parseInt(custStats?.total_customers || 0, 10);
    const activeCustomers = parseInt(custStats?.active_customers || 0, 10);

    // 2. Total Transactions (Deposits count + Sales count)
    const depCount = await db('waste_deposit_transactions').count('id as count').first();
    const saleCount = await db('waste_sales').count('id as count').first();
    const totalTransactions = parseInt(depCount?.count || 0, 10) + parseInt(saleCount?.count || 0, 10);

    // 3. Total Waste Weight (kg)
    const weightResult = await db('waste_deposit_transactions').sum('total_weight_kg as total_kg').first();
    const totalWasteWeight = parseFloat(weightResult?.total_kg || 0);

    // 4. Customer Wallet Liabilities (Sum of all balances currently owed to customers)
    const liabResult = await db('customer_wallets').sum('current_balance as total_liabilities').first();
    const customerWalletLiabilities = parseFloat(liabResult?.total_liabilities || 0);

    // 5. Inventory (Total Stock Kg and Valuation)
    const invItems = await db('inventory')
      .join('waste_categories', 'inventory.waste_category_id', 'waste_categories.id')
      .leftJoin('waste_prices', 'waste_categories.id', 'waste_prices.waste_category_id')
      .select(
        'inventory.current_stock_kg',
        db.raw('COALESCE(waste_prices.selling_price, 2500) as selling_price')
      );

    let totalInventoryStockKg = 0;
    let inventoryValuation = 0;

    invItems.forEach((item) => {
      const kg = parseFloat(item.current_stock_kg || 0);
      const price = parseFloat(item.selling_price || 2500);
      totalInventoryStockKg += kg;
      inventoryValuation += kg * price;
    });

    // 6. Revenue & Gross Profit Margin (Sales to Buyers)
    const salesStats = await db('waste_sale_items')
      .select(
        db.raw('SUM(waste_sale_items.subtotal) as total_revenue'),
        db.raw('SUM(waste_sale_items.weight_kg * COALESCE(waste_sale_items.cost_price_per_kg, 0)) as total_cogs')
      )
      .first();

    const revenue = parseFloat(salesStats?.total_revenue || 0);
    const cogs = parseFloat(salesStats?.total_cogs || 0);
    const grossProfit = Math.max(0, revenue - cogs);
    const marginPercentage = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;

    return {
      totalCustomers,
      activeCustomers,
      totalTransactions,
      totalWasteWeightKg: totalWasteWeight,
      customerWalletLiabilities,
      totalInventoryStockKg,
      inventoryValuation,
      revenue,
      cogs,
      grossProfit,
      marginPercentage,
    };
  }

  /**
   * Datasets for 5 Visual Charts
   */
  async getChartsData() {
    // 1. Transaction Trend (Last 7 days or recent transactions)
    const recentDeposits = await db('waste_deposit_transactions')
      .select(
        db.raw('DATE(transaction_date) as day'),
        db.raw('COUNT(id) as count'),
        db.raw('SUM(total_weight_kg) as weight'),
        db.raw('SUM(total_amount) as amount')
      )
      .groupByRaw('DATE(transaction_date)')
      .orderBy('day', 'desc')
      .limit(7);

    // 2. Waste Volume by Category (Pie / Donut dataset)
    const categoryBreakdown = await db('waste_deposit_items')
      .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
      .select('waste_categories.name as label', 'waste_categories.code')
      .sum('waste_deposit_items.weight_kg as value')
      .groupBy('waste_categories.id', 'waste_categories.name', 'waste_categories.code')
      .orderBy('value', 'desc');

    // 3. Customer Growth (Registrations by month)
    const client = String(db.client?.config?.client || '').toLowerCase();
    const isMysql = client.includes('mysql');
    const monthSql = (col) => (isMysql ? `DATE_FORMAT(${col}, '%Y-%m')` : `strftime('%Y-%m', ${col})`);

    const customerGrowth = await db('customers')
      .select(
        db.raw(`${monthSql('created_at')} as month`),
        db.raw('COUNT(id) as count')
      )
      .groupByRaw(monthSql('created_at'))
      .orderBy('month', 'asc')
      .limit(6);

    // 4. Revenue Trend (Sales by month)
    const revenueTrend = await db('waste_sales')
      .select(
        db.raw(`${monthSql('sale_date')} as month`),
        db.raw('SUM(total_amount) as revenue'),
        db.raw('SUM(total_weight_kg) as weight')
      )
      .groupByRaw(monthSql('sale_date'))
      .orderBy('month', 'asc')
      .limit(6);

    // 5. Inventory Trend (Current Stock by Category)
    const inventoryTrend = await db('inventory')
      .join('waste_categories', 'inventory.waste_category_id', 'waste_categories.id')
      .select('waste_categories.name as label', 'inventory.current_stock_kg as value')
      .orderBy('value', 'desc');

    return {
      transactionTrend: recentDeposits.reverse(),
      categoryVolume: categoryBreakdown.map((c) => ({
        label: c.label,
        value: parseFloat(c.value) || 0,
      })),
      customerGrowth: customerGrowth.map((g) => ({
        month: g.month,
        count: parseInt(g.count, 10),
      })),
      revenueTrend: revenueTrend.map((r) => ({
        month: r.month,
        revenue: parseFloat(r.revenue) || 0,
        weight: parseFloat(r.weight) || 0,
      })),
      inventoryTrend: inventoryTrend.map((i) => ({
        label: i.label,
        value: parseFloat(i.value) || 0,
      })),
    };
  }

  /**
   * Helper to parse date filter range
   */
  resolveDateRange(filter, startDate, endDate) {
    const now = new Date();
    let start = null;
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (filter) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        break;
      case 'this_week':
        const dayOfWeek = now.getDay();
        const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        start = new Date(now.getFullYear(), now.getMonth(), diffToMonday, 0, 0, 0);
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        break;
      case 'custom':
        if (startDate) start = new Date(startDate);
        if (endDate) end = new Date(endDate + 'T23:59:59');
        break;
      default:
        // all-time or last 90 days
        start = null;
        break;
    }

    return { start, end };
  }

  /**
   * Generates one of the 7 Structured Reports with filters
   * @param {string} reportType
   * @param {Object} queryParams
   */
  async generateReport(reportType, queryParams = {}) {
    const { filter = 'all', startDate, endDate, categoryId } = queryParams;
    const { start, end } = this.resolveDateRange(filter, startDate, endDate);

    switch (reportType) {
      case 'operational':
        return this.getOperationalReport(start, end);
      case 'financial':
        return this.getFinancialReport(start, end);
      case 'inventory':
        return this.getInventoryReport(categoryId);
      case 'customer_activity':
        return this.getCustomerActivityReport(start, end);
      case 'waste_category':
        return this.getWasteCategoryReport(start, end, categoryId);
      case 'sales':
        return this.getSalesReport(start, end);
      case 'withdrawal':
        return this.getWithdrawalReport(start, end);
      default:
        throw new Error(`Jenis laporan "${reportType}" tidak dikenal. Pilihan: operational, financial, inventory, customer_activity, waste_category, sales, withdrawal.`);
    }
  }

  // 1. Operational Report
  async getOperationalReport(start, end) {
    let q = db('waste_deposit_transactions')
      .join('branches', 'waste_deposit_transactions.branch_id', 'branches.id')
      .join('users', 'waste_deposit_transactions.petugas_id', 'users.id')
      .select(
        'waste_deposit_transactions.id',
        'waste_deposit_transactions.transaction_no as invoice_no',
        'waste_deposit_transactions.transaction_date',
        'waste_deposit_transactions.total_weight_kg',
        'waste_deposit_transactions.total_amount',
        'branches.name as branch_name',
        'users.name as petugas_name'
      );

    if (start) q = q.where('waste_deposit_transactions.transaction_date', '>=', start);
    if (end) q = q.where('waste_deposit_transactions.transaction_date', '<=', end);

    const records = await q.orderBy('waste_deposit_transactions.transaction_date', 'desc');

    const totalWeight = records.reduce((acc, r) => acc + parseFloat(r.total_weight_kg || 0), 0);
    const totalAmount = records.reduce((acc, r) => acc + parseFloat(r.total_amount || 0), 0);

    return {
      reportType: 'operational',
      title: 'Laporan Operasional Timbangan & Setoran',
      summary: {
        totalTransactions: records.length,
        totalWeightKg: totalWeight,
        totalDepositAmount: totalAmount,
        averageWeightPerTransaction: records.length ? (totalWeight / records.length).toFixed(2) : 0,
      },
      records,
    };
  }

  // 2. Financial Report
  async getFinancialReport(start, end) {
    let depositQuery = db('waste_deposit_transactions');
    let withdrawalQuery = db('withdrawal_requests').where({ status: 'COMPLETED' });

    if (start) {
      depositQuery = depositQuery.where('transaction_date', '>=', start);
      withdrawalQuery = withdrawalQuery.where('disbursed_at', '>=', start);
    }
    if (end) {
      depositQuery = depositQuery.where('transaction_date', '<=', end);
      withdrawalQuery = withdrawalQuery.where('disbursed_at', '<=', end);
    }

    const deposits = await depositQuery.sum('total_amount as sum').first();
    const withdrawals = await withdrawalQuery.sum('amount as sum').first();

    const totalCredited = parseFloat(deposits?.sum || 0);
    const totalDisbursed = parseFloat(withdrawals?.sum || 0);
    const netLiabilityChange = totalCredited - totalDisbursed;

    const currentLiabilities = await db('customer_wallets').sum('current_balance as total').first();

    return {
      reportType: 'financial',
      title: 'Laporan Keuangan & Liabilitas Buku Tabungan Warga',
      summary: {
        totalCreditedToCustomers: totalCredited,
        totalWithdrawnDisbursed: totalDisbursed,
        netLiabilityChange,
        activeTotalLiabilities: parseFloat(currentLiabilities?.total || 0),
      },
    };
  }

  // 3. Inventory Report
  async getInventoryReport(categoryId) {
    let q = db('inventory')
      .join('waste_categories', 'inventory.waste_category_id', 'waste_categories.id')
      .leftJoin('waste_prices', 'waste_categories.id', 'waste_prices.waste_category_id')
      .select(
        'waste_categories.name as category_name',
        'waste_categories.code',
        'inventory.current_stock_kg',
        'waste_prices.selling_price'
      );

    if (categoryId) q = q.where('inventory.waste_category_id', categoryId);

    const items = await q.orderBy('inventory.current_stock_kg', 'desc');

    let totalStock = 0;
    let totalValuation = 0;

    const records = items.map((i) => {
      const stock = parseFloat(i.current_stock_kg || 0);
      const price = parseFloat(i.selling_price || 2500);
      const val = stock * price;
      totalStock += stock;
      totalValuation += val;

      return {
        category: i.category_name,
        code: i.code,
        currentStockKg: stock,
        minimumStockKg: 10.0,
        estimatedSellingPrice: price,
        valuation: val,
        status: stock >= 300 ? 'MENUMPUK' : stock <= 10 ? 'RENDAH' : 'OPTIMAL',
      };
    });

    return {
      reportType: 'inventory',
      title: 'Laporan Persediaan & Stok Gudang Sampah Daur Ulang',
      summary: {
        totalStockKg: totalStock,
        totalValuation,
        categoryCount: records.length,
      },
      records,
    };
  }

  // 4. Customer Activity Report
  async getCustomerActivityReport(start, end) {
    let q = db('customers')
      .join('users', 'customers.user_id', 'users.id')
      .leftJoin('waste_deposit_transactions', 'customers.id', 'waste_deposit_transactions.customer_id')
      .select(
        'customers.id',
        'users.name',
        'customers.account_no',
        'customers.status',
        db.raw('COUNT(waste_deposit_transactions.id) as period_transaction_count'),
        db.raw('COALESCE(SUM(waste_deposit_transactions.total_weight_kg), 0) as period_weight_kg'),
        db.raw('COALESCE(SUM(waste_deposit_transactions.total_amount), 0) as period_earned')
      )
      .groupBy('customers.id', 'users.name', 'customers.account_no', 'customers.status');

    const records = await q.orderBy('period_weight_kg', 'desc');

    return {
      reportType: 'customer_activity',
      title: 'Laporan Aktivitas & Kontribusi Nasabah Warga',
      summary: {
        totalCustomersAnalyzed: records.length,
        activeContributors: records.filter((r) => r.period_transaction_count > 0).length,
      },
      records: records.map((r) => ({
        id: r.id,
        name: r.name,
        accountNo: r.account_no,
        status: r.status,
        allTimeWeightKg: parseFloat(r.total_waste_deposited_kg || 0),
        transactionCount: parseInt(r.period_transaction_count || 0, 10),
        periodWeightKg: parseFloat(r.period_weight_kg || 0),
        periodEarned: parseFloat(r.period_earned || 0),
      })),
    };
  }

  // 5. Waste Category Report
  async getWasteCategoryReport(start, end, categoryId) {
    let q = db('waste_deposit_items')
      .join('waste_deposit_transactions', 'waste_deposit_items.transaction_id', 'waste_deposit_transactions.id')
      .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
      .select(
        'waste_categories.id',
        'waste_categories.name as category_name',
        'waste_categories.code',
        db.raw('COUNT(waste_deposit_items.id) as deposit_count'),
        db.raw('SUM(waste_deposit_items.weight_kg) as total_weight_kg'),
        db.raw('SUM(waste_deposit_items.subtotal) as total_value')
      )
      .groupBy('waste_categories.id', 'waste_categories.name', 'waste_categories.code');

    if (start) q = q.where('waste_deposit_transactions.transaction_date', '>=', start);
    if (end) q = q.where('waste_deposit_transactions.transaction_date', '<=', end);
    if (categoryId) q = q.where('waste_categories.id', categoryId);

    const records = await q.orderBy('total_weight_kg', 'desc');

    return {
      reportType: 'waste_category',
      title: 'Laporan Komposisi & Distribusi Jenis Sampah',
      records: records.map((r) => ({
        categoryId: r.id,
        categoryName: r.category_name,
        code: r.code,
        depositCount: parseInt(r.deposit_count || 0, 10),
        totalWeightKg: parseFloat(r.total_weight_kg || 0),
        totalValue: parseFloat(r.total_value || 0),
      })),
    };
  }

  // 6. Sales Report
  async getSalesReport(start, end) {
    let q = db('waste_sales')
      .join('buyers', 'waste_sales.buyer_id', 'buyers.id')
      .join('users', 'waste_sales.created_by', 'users.id')
      .select(
        'waste_sales.id',
        'waste_sales.invoice_no',
        'waste_sales.sale_date',
        'waste_sales.total_weight_kg',
        'waste_sales.total_amount',
        'waste_sales.payment_status',
        'buyers.name as buyer_name',
        'users.name as creator_name'
      );

    if (start) q = q.where('waste_sales.sale_date', '>=', start);
    if (end) q = q.where('waste_sales.sale_date', '<=', end);

    const records = await q.orderBy('waste_sales.sale_date', 'desc');

    const totalWeight = records.reduce((acc, r) => acc + parseFloat(r.total_weight_kg || 0), 0);
    const totalRevenue = records.reduce((acc, r) => acc + parseFloat(r.total_amount || 0), 0);

    return {
      reportType: 'sales',
      title: 'Laporan Penjualan Sampah Daur Ulang ke Pengepul',
      summary: {
        totalSalesInvoices: records.length,
        totalWeightSoldKg: totalWeight,
        totalRevenue,
      },
      records,
    };
  }

  // 7. Withdrawal Report
  async getWithdrawalReport(start, end) {
    let q = db('withdrawal_requests')
      .join('customers', 'withdrawal_requests.customer_id', 'customers.id')
      .join('users', 'customers.user_id', 'users.id')
      .select(
        'withdrawal_requests.id',
        'withdrawal_requests.request_no as ticket_no',
        'withdrawal_requests.amount',
        'withdrawal_requests.status',
        'withdrawal_requests.method as payment_method',
        'withdrawal_requests.bank_name',
        'withdrawal_requests.bank_account_number',
        'withdrawal_requests.created_at',
        'withdrawal_requests.disbursed_at',
        'users.name as customer_name',
        'customers.account_no'
      );

    if (start) q = q.where('withdrawal_requests.created_at', '>=', start);
    if (end) q = q.where('withdrawal_requests.created_at', '<=', end);

    const records = await q.orderBy('withdrawal_requests.created_at', 'desc');

    const totalAmount = records.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);

    return {
      reportType: 'withdrawal',
      title: 'Laporan Riwayat Penarikan Saldo Nasabah',
      summary: {
        totalRequests: records.length,
        totalWithdrawnAmount: totalAmount,
      },
      records,
    };
  }
}

module.exports = new OwnerAnalyticsService();
