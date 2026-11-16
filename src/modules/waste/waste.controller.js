const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { recordAuditLog } = require('../../middlewares/audit.middleware');

class WasteController {
  async getAllCategories(req, res, next) {
    try {
      const categories = await db('waste_categories')
        .leftJoin('waste_prices', function () {
          this.on('waste_categories.id', '=', 'waste_prices.waste_category_id').andOn(
            'waste_prices.is_active',
            '=',
            db.raw('?', [true])
          );
        })
        .leftJoin('inventory', 'waste_categories.id', 'inventory.waste_category_id')
        .select(
          'waste_categories.id',
          'waste_categories.code',
          'waste_categories.name',
          'waste_categories.parent_category',
          'waste_categories.description',
          'waste_categories.unit',
          'waste_categories.icon',
          'waste_categories.is_active',
          'waste_prices.buying_price',
          'waste_prices.selling_price',
          'inventory.current_stock_kg'
        )
        .orderBy('waste_categories.parent_category', 'asc');

      return apiResponse.success(res, 'Katalog sampah dan harga berhasil dimuat', categories);
    } catch (error) {
      next(error);
    }
  }

  async updatePrice(req, res, next) {
    try {
      const { id } = req.params; // waste_category_id
      const { buyingPrice, sellingPrice, reason } = req.body;

      if (!buyingPrice || !sellingPrice) {
        throw new AppError('Harga beli dan harga jual wajib diisi.', 400);
      }

      const category = await db('waste_categories').where({ id }).first();
      if (!category) throw new AppError('Kategori sampah tidak ditemukan.', 404);

      const currentPrice = await db('waste_prices')
        .where({ waste_category_id: id, is_active: true })
        .first();

      const oldBuying = currentPrice ? currentPrice.buying_price : 0;
      const oldSelling = currentPrice ? currentPrice.selling_price : 0;

      // Update or insert price
      if (currentPrice) {
        await db('waste_prices').where({ id: currentPrice.id }).update({
          buying_price: buyingPrice,
          selling_price: sellingPrice,
          effective_date: new Date().toISOString().split('T')[0],
          updated_at: new Date(),
        });
      } else {
        await db('waste_prices').insert({
          branch_id: req.user.branch_id || 1,
          waste_category_id: id,
          buying_price: buyingPrice,
          selling_price: sellingPrice,
          effective_date: new Date().toISOString().split('T')[0],
          is_active: true,
        });
      }

      // Record price history
      await db('waste_price_history').insert({
        waste_category_id: id,
        branch_id: req.user.branch_id || 1,
        old_buying_price: oldBuying,
        new_buying_price: buyingPrice,
        old_selling_price: oldSelling,
        new_selling_price: sellingPrice,
        changed_by: req.user.id,
        reason: reason || 'Penyesuaian harga pasar daur ulang',
        created_at: new Date(),
      });

      await recordAuditLog({
        userId: req.user.id,
        action: 'PRICE_UPDATED',
        entityName: 'waste_prices',
        entityId: id,
        oldValues: { oldBuying, oldSelling },
        newValues: { buyingPrice, sellingPrice, reason },
        req,
      });

      return apiResponse.success(res, `Harga ${category.name} berhasil diperbarui!`);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WasteController();
