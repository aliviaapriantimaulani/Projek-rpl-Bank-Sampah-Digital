/**
 * AI Analytics & Operational Insights Service
 * Computes deterministic business intelligence, growth trends, inventory alerts,
 * and operational anomalies grounded strictly in actual database records.
 */

const db = require('../../config/database');

class AiInsightsService {
  /**
   * Generates operational insights across categories, customers, inventory, and sales
   */
  async generateInsights() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // 1. Most Deposited Category (All-time and Recent 30 Days)
    const categoryVolume = await db('waste_deposit_items')
      .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
      .select('waste_categories.name as category_name', 'waste_categories.code')
      .sum('waste_deposit_items.weight_kg as total_kg')
      .groupBy('waste_categories.id', 'waste_categories.name', 'waste_categories.code')
      .orderBy('total_kg', 'desc');

    const topCategory = categoryVolume[0] || null;

    // 2. Growth Comparison (Fastest Growing Waste Category)
    // Weight in [30 days ago -> now] vs [60 days ago -> 30 days ago]
    const recentDeposits = await db('waste_deposit_items')
      .join('waste_deposit_transactions', 'waste_deposit_items.transaction_id', 'waste_deposit_transactions.id')
      .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
      .where('waste_deposit_transactions.transaction_date', '>=', thirtyDaysAgo)
      .select('waste_categories.name as category_name')
      .sum('waste_deposit_items.weight_kg as weight_recent')
      .groupBy('waste_categories.id', 'waste_categories.name');

    const previousDeposits = await db('waste_deposit_items')
      .join('waste_deposit_transactions', 'waste_deposit_items.transaction_id', 'waste_deposit_transactions.id')
      .join('waste_categories', 'waste_deposit_items.waste_category_id', 'waste_categories.id')
      .where('waste_deposit_transactions.transaction_date', '>=', sixtyDaysAgo)
      .where('waste_deposit_transactions.transaction_date', '<', thirtyDaysAgo)
      .select('waste_categories.name as category_name')
      .sum('waste_deposit_items.weight_kg as weight_prev')
      .groupBy('waste_categories.id', 'waste_categories.name');

    const growthMap = {};
    recentDeposits.forEach((r) => {
      growthMap[r.category_name] = { recent: parseFloat(r.weight_recent) || 0, prev: 0 };
    });
    previousDeposits.forEach((p) => {
      if (!growthMap[p.category_name]) {
        growthMap[p.category_name] = { recent: 0, prev: parseFloat(p.weight_prev) || 0 };
      } else {
        growthMap[p.category_name].prev = parseFloat(p.weight_prev) || 0;
      }
    });

    let fastestGrowing = null;
    let highestGrowthRate = -Infinity;

    for (const [name, stats] of Object.entries(growthMap)) {
      let growthRate = 0;
      if (stats.prev > 0) {
        growthRate = ((stats.recent - stats.prev) / stats.prev) * 100;
      } else if (stats.recent > 0) {
        growthRate = 100; // New growth
      }
      if (growthRate > highestGrowthRate) {
        highestGrowthRate = growthRate;
        fastestGrowing = { name, growthRate: Math.round(growthRate), currentWeight: stats.recent };
      }
    }

    // 3. Inactive Customer Trends
    const totalCustomers = await db('customers').count('id as count').first();
    const totalCustCount = parseInt(totalCustomers?.count || 0, 10);

    const activeCustomerIds = await db('waste_deposit_transactions')
      .where('transaction_date', '>=', thirtyDaysAgo)
      .distinct('customer_id')
      .pluck('customer_id');

    const activeCount = activeCustomerIds.length;
    const inactiveCount = Math.max(0, totalCustCount - activeCount);
    const inactivePercentage = totalCustCount > 0 ? Math.round((inactiveCount / totalCustCount) * 100) : 0;

    // 4. Inventory Accumulation Warnings
    const inventoryItems = await db('inventory')
      .join('waste_categories', 'inventory.waste_category_id', 'waste_categories.id')
      .select(
        'waste_categories.name as category_name',
        'inventory.current_stock_kg'
      );

    const accumulatedItems = inventoryItems
      .filter((i) => parseFloat(i.current_stock_kg) >= 100) // stock >= 100kg waiting for off-take
      .map((i) => ({
        category: i.category_name,
        currentStockKg: parseFloat(i.current_stock_kg),
        status: parseFloat(i.current_stock_kg) >= 300 ? 'KRITIS_MENUMPUK' : 'PERLU_DIJUAL',
      }));

    // 5. Sales & Margin Trends
    const salesAgg = await db('waste_sale_items')
      .join('waste_sales', 'waste_sale_items.waste_sale_id', 'waste_sales.id')
      .select(
        db.raw('SUM(waste_sale_items.weight_kg) as total_weight_sold'),
        db.raw('SUM(waste_sale_items.subtotal) as total_revenue'),
        db.raw('SUM(waste_sale_items.weight_kg * COALESCE(waste_sale_items.cost_price_per_kg, 0)) as total_cogs')
      )
      .first();

    const revenue = parseFloat(salesAgg?.total_revenue || 0);
    const cogs = parseFloat(salesAgg?.total_cogs || 0);
    const grossProfit = Math.max(0, revenue - cogs);
    const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;

    // 6. Operational Anomalies (High value or large single deposit)
    const largeDeposits = await db('waste_deposit_transactions')
      .join('customers', 'waste_deposit_transactions.customer_id', 'customers.id')
      .join('users', 'customers.user_id', 'users.id')
      .where('waste_deposit_transactions.total_weight_kg', '>=', 50)
      .select(
        'waste_deposit_transactions.transaction_no as invoice_no',
        'users.name as customer_name',
        'waste_deposit_transactions.total_weight_kg',
        'waste_deposit_transactions.total_amount',
        'waste_deposit_transactions.transaction_date'
      )
      .orderBy('waste_deposit_transactions.transaction_date', 'desc')
      .limit(3);

    // Assemble Structured Insights
    const insights = [];

    if (topCategory) {
      insights.push({
        type: 'MOST_DEPOSITED',
        severity: 'INFO',
        title: 'Kategori Sampah Paling Dominan',
        description: `Kategori "${topCategory.category_name}" mendominasi setoran dengan total akumulasi ${parseFloat(topCategory.total_kg).toLocaleString('id-ID')} kg.`,
        metric: `${parseFloat(topCategory.total_kg).toLocaleString('id-ID')} kg`,
      });
    }

    if (fastestGrowing && fastestGrowing.growthRate > 0) {
      insights.push({
        type: 'FASTEST_GROWING',
        severity: 'SUCCESS',
        title: 'Pertumbuhan Setoran Tercepat',
        description: `Kategori "${fastestGrowing.name}" mengalami lonjakan setoran sebesar +${fastestGrowing.growthRate}% dalam 30 hari terakhir.`,
        metric: `+${fastestGrowing.growthRate}%`,
      });
    }

    if (inactivePercentage >= 20) {
      insights.push({
        type: 'INACTIVE_CUSTOMERS',
        severity: 'WARNING',
        title: 'Tren Warga Pasif Membutuhkan Edukasi',
        description: `Terdapat ${inactiveCount} nasabah (${inactivePercentage}%) yang belum melakukan setoran dalam 30 hari terakhir. Disarankan aktivasi kampanye jemput bola RT.`,
        metric: `${inactivePercentage}% Pasif`,
      });
    }

    if (accumulatedItems.length > 0) {
      const names = accumulatedItems.map((a) => `${a.category} (${a.currentStockKg} kg)`).join(', ');
      insights.push({
        type: 'INVENTORY_ACCUMULATION',
        severity: 'WARNING',
        title: 'Penumpukan Stok di Gudang',
        description: `Stok siap jual menumpuk pada: ${names}. Jadwalkan pengambilan dengan mitra pengepul untuk menjaga kelancaran arus kas.`,
        metric: `${accumulatedItems.reduce((acc, c) => acc + c.currentStockKg, 0)} kg Menumpuk`,
      });
    }

    if (revenue > 0) {
      insights.push({
        type: 'FINANCIAL_MARGIN',
        severity: 'SUCCESS',
        title: 'Margin Penjualan ke Pengepul',
        description: `Penjualan daur ulang menghasilkan margin kotor sebesar ${marginPct}% (Pendapatan: Rp ${revenue.toLocaleString('id-ID')}, Laba Kotor: Rp ${grossProfit.toLocaleString('id-ID')}).`,
        metric: `${marginPct}% Margin`,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalCustomers: totalCustCount,
        activeCustomers30Days: activeCount,
        inactiveCustomers30Days: inactiveCount,
        topCategoryName: topCategory?.category_name || '-',
        fastestGrowingCategory: fastestGrowing?.name || '-',
        grossMarginPercentage: marginPct,
      },
      insights,
      anomalies: largeDeposits.map((d) => ({
        invoiceNo: d.invoice_no,
        customerName: d.customer_name,
        weightKg: parseFloat(d.total_weight_kg),
        amount: parseFloat(d.total_amount),
        date: d.transaction_date,
        note: 'Setoran berskala besar (>= 50 kg)',
      })),
    };
  }
}

module.exports = new AiInsightsService();
