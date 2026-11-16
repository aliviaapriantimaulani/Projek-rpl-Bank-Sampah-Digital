const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');

class InventoryController {
  async getInventory(req, res, next) {
    try {
      const inventory = await db('inventory')
        .join('waste_categories', 'inventory.waste_category_id', 'waste_categories.id')
        .leftJoin('waste_prices', function () {
          this.on('waste_categories.id', '=', 'waste_prices.waste_category_id').andOn(
            'waste_prices.is_active',
            '=',
            db.raw('?', [true])
          );
        })
        .select(
          'inventory.id',
          'inventory.waste_category_id',
          'waste_categories.code',
          'waste_categories.name',
          'waste_categories.parent_category',
          'waste_categories.unit',
          'inventory.current_stock_kg',
          'waste_prices.selling_price',
          'inventory.last_updated_at'
        )
        .orderBy('inventory.current_stock_kg', 'desc');

      // Calculate total stock and estimated inventory valuation
      let totalStockKg = 0;
      let totalEstimatedValuation = 0;

      inventory.forEach((item) => {
        const stock = Number(item.current_stock_kg);
        const price = Number(item.selling_price || 0);
        totalStockKg += stock;
        totalEstimatedValuation += stock * price;
      });

      return apiResponse.success(res, 'Data stok gudang berhasil dimuat', {
        items: inventory,
        totalStockKg,
        totalEstimatedValuation,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMovements(req, res, next) {
    try {
      const movements = await db('inventory_movements')
        .join('waste_categories', 'inventory_movements.waste_category_id', 'waste_categories.id')
        .leftJoin('users', 'inventory_movements.created_by', 'users.id')
        .select(
          'inventory_movements.*',
          'waste_categories.name as category_name',
          'waste_categories.unit',
          'users.name as creator_name'
        )
        .orderBy('inventory_movements.id', 'desc')
        .limit(100);

      return apiResponse.success(res, 'Riwayat mutasi stok gudang berhasil dimuat', movements);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InventoryController();
