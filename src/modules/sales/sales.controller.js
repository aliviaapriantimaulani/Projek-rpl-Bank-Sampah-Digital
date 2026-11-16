const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { recordAuditLog } = require('../../middlewares/audit.middleware');

class SalesController {
  async getAllSales(req, res, next) {
    try {
      const sales = await db('waste_sales')
        .join('buyers', 'waste_sales.buyer_id', 'buyers.id')
        .join('users', 'waste_sales.created_by', 'users.id')
        .select(
          'waste_sales.*',
          'buyers.name as buyer_name',
          'buyers.company_name',
          'users.name as creator_name'
        )
        .orderBy('waste_sales.id', 'desc');

      return apiResponse.success(res, 'Daftar penjualan sampah berhasil dimuat', sales);
    } catch (error) {
      next(error);
    }
  }

  async getSaleDetail(req, res, next) {
    try {
      const { id } = req.params;
      const sale = await db('waste_sales')
        .join('buyers', 'waste_sales.buyer_id', 'buyers.id')
        .join('users', 'waste_sales.created_by', 'users.id')
        .select(
          'waste_sales.*',
          'buyers.name as buyer_name',
          'buyers.company_name',
          'buyers.phone as buyer_phone',
          'buyers.address as buyer_address',
          'users.name as creator_name'
        )
        .where('waste_sales.id', id)
        .first();

      if (!sale) throw new AppError('Data penjualan tidak ditemukan.', 404);

      const items = await db('waste_sale_items')
        .join('waste_categories', 'waste_sale_items.waste_category_id', 'waste_categories.id')
        .select(
          'waste_sale_items.*',
          'waste_categories.code as category_code',
          'waste_categories.name as category_name',
          'waste_categories.unit'
        )
        .where('waste_sale_items.waste_sale_id', id);

      // Margin calculations
      let totalCost = 0;
      items.forEach((it) => {
        const cost = Number(it.cost_price_per_kg || 0) * Number(it.weight_kg);
        totalCost += cost;
      });

      const totalRevenue = Number(sale.total_amount);
      const grossProfit = totalRevenue - totalCost;
      const marginPercentage = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;

      return apiResponse.success(res, 'Detail penjualan sampah berhasil dimuat', {
        ...sale,
        items,
        financials: {
          totalRevenue,
          totalAcquisitionCost: totalCost,
          grossProfit,
          marginPercentage: Number(marginPercentage),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async createSale(req, res, next) {
    const trx = await db.transaction();
    try {
      const { buyerId, saleDate, items, notes, paymentStatus = 'PAID', idempotencyKey } = req.body;

      if (!buyerId) throw new AppError('Mitra pengepul wajib dipilih.', 400);
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError('Daftar item sampah yang dijual tidak boleh kosong.', 400);
      }

      // Idempotency check: prevent duplicate submissions
      if (idempotencyKey) {
        const existingSale = await trx('waste_sales')
          .where({ idempotency_key: idempotencyKey })
          .first();

        if (existingSale) {
          await trx.rollback();
          return apiResponse.success(
            res,
            'Penjualan ini telah berhasil dicatat sebelumnya (Idempotent).',
            existingSale
          );
        }
      }

      // Validate Buyer
      const buyer = await trx('buyers').where({ id: buyerId }).first();
      if (!buyer) throw new AppError('Mitra pengepul tidak ditemukan.', 404);
      if (!buyer.is_active) throw new AppError('Mitra pengepul sedang nonaktif.', 400);

      // Validate each item and STOCK AVAILABILITY
      let grandWeight = 0;
      let grandTotal = 0;
      let totalAcquisitionCost = 0;
      const verifiedItems = [];

      for (const item of items) {
        const weight = parseFloat(item.weightKg);
        const price = parseFloat(item.unitPrice);

        if (isNaN(weight) || weight <= 0) {
          throw new AppError(`Berat penjualan harus lebih besar dari 0 (Kategori ID: ${item.wasteCategoryId})`, 400);
        }
        if (isNaN(price) || price <= 0) {
          throw new AppError(`Harga jual per satuan harus lebih besar dari 0`, 400);
        }

        const category = await trx('waste_categories').where({ id: item.wasteCategoryId }).first();
        if (!category) {
          throw new AppError(`Kategori sampah ID ${item.wasteCategoryId} tidak ditemukan`, 404);
        }

        // Check Inventory Stock
        const inv = await trx('inventory')
          .where({
            branch_id: req.user.branch_id || 1,
            waste_category_id: category.id,
          })
          .first();

        const currentStock = inv ? Number(inv.current_stock_kg) : 0;
        if (weight > currentStock) {
          throw new AppError(
            `Stok tidak mencukupi untuk ${category.name}. Tersedia: ${currentStock} ${category.unit}, Dijual: ${weight} ${category.unit}.`,
            400
          );
        }

        // Get buying price as acquisition cost
        const priceRecord = await trx('waste_prices')
          .where({ waste_category_id: category.id, is_active: true })
          .first();

        const acquisitionCostPerKg = priceRecord ? Number(priceRecord.buying_price) : 0;
        const subtotal = Math.round(weight * price);

        grandWeight += weight;
        grandTotal += subtotal;
        totalAcquisitionCost += weight * acquisitionCostPerKg;

        verifiedItems.push({
          categoryId: category.id,
          categoryName: category.name,
          unit: category.unit,
          weightKg: weight,
          unitPrice: price,
          subtotal,
          costPricePerKg: acquisitionCostPerKg,
          currentStock,
        });
      }

      // Generate invoice number
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randNo = Math.floor(1000 + Math.random() * 9000);
      const invoiceNo = `INV-SALE-${dateStr}-${randNo}`;

      // 1. Insert Waste Sale Header
      const [saleId] = await trx('waste_sales').insert(
        {
          invoice_no: invoiceNo,
          branch_id: req.user.branch_id || 1,
          buyer_id: buyer.id,
          sale_date: saleDate ? new Date(saleDate) : now,
          total_weight_kg: grandWeight,
          total_amount: grandTotal,
          payment_status: paymentStatus.toUpperCase(),
          created_by: req.user.id,
          idempotency_key: idempotencyKey || null,
          notes: notes || `Penjualan sampah daur ulang ke ${buyer.company_name || buyer.name}`,
        },
        ['id']
      );

      const realSaleId = typeof saleId === 'object' ? saleId.id : saleId;

      // 2. Insert Sale Items & Atomically Decrement Inventory
      for (const it of verifiedItems) {
        await trx('waste_sale_items').insert({
          waste_sale_id: realSaleId,
          waste_category_id: it.categoryId,
          weight_kg: it.weightKg,
          unit_price: it.unitPrice,
          subtotal: it.subtotal,
          cost_price_per_kg: it.costPricePerKg,
        });

        const stockAfter = it.currentStock - it.weightKg;

        // Decrement stock
        await trx('inventory')
          .where({
            branch_id: req.user.branch_id || 1,
            waste_category_id: it.categoryId,
          })
          .update({
            current_stock_kg: stockAfter,
            last_updated_at: now,
          });

        // Record Inventory Movement (type: SALE)
        await trx('inventory_movements').insert({
          branch_id: req.user.branch_id || 1,
          waste_category_id: it.categoryId,
          movement_type: 'SALE',
          weight_kg: it.weightKg,
          stock_before_kg: it.currentStock,
          stock_after_kg: stockAfter,
          reference_id: invoiceNo,
          notes: `Penjualan ke ${buyer.name} (${invoiceNo})`,
          created_by: req.user.id,
          created_at: now,
        });
      }

      await trx.commit();

      const grossProfit = grandTotal - totalAcquisitionCost;

      await recordAuditLog({
        userId: req.user.id,
        action: 'WASTE_SALE_CREATED',
        entityName: 'waste_sales',
        entityId: realSaleId,
        newValues: {
          invoiceNo,
          buyerName: buyer.name,
          totalWeight: grandWeight,
          totalRevenue: grandTotal,
          grossProfit,
        },
        req,
      });

      return apiResponse.success(
        res,
        `Penjualan sampah berhasil dicatat (Invoice: ${invoiceNo})! Stok gudang telah diperbarui.`,
        {
          saleId: realSaleId,
          invoiceNo,
          totalWeightKg: grandWeight,
          totalAmount: grandTotal,
          grossProfit,
        },
        201
      );
    } catch (error) {
      await trx.rollback();
      next(error);
    }
  }

  async getRevenueSummary(req, res, next) {
    try {
      const salesStats = await db('waste_sales')
        .sum('total_amount as total_revenue')
        .sum('total_weight_kg as total_weight_sold')
        .count('id as total_invoices')
        .first();

      const items = await db('waste_sale_items').select('weight_kg', 'subtotal', 'cost_price_per_kg');
      let totalCost = 0;
      items.forEach((it) => {
        totalCost += Number(it.weight_kg) * Number(it.cost_price_per_kg || 0);
      });

      const totalRevenue = Number(salesStats?.total_revenue || 0);
      const grossMargin = totalRevenue - totalCost;

      return apiResponse.success(res, 'Ringkasan pendapatan penjualan sampah', {
        totalRevenue,
        totalWeightSoldKg: Number(salesStats?.total_weight_sold || 0),
        totalInvoices: Number(salesStats?.total_invoices || 0),
        totalAcquisitionCost: totalCost,
        grossProfit: grossMargin,
        marginPercentage: totalRevenue > 0 ? Number(((grossMargin / totalRevenue) * 100).toFixed(1)) : 0,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SalesController();
