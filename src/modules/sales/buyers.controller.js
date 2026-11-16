const db = require('../../config/database');
const apiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { recordAuditLog } = require('../../middlewares/audit.middleware');

class BuyersController {
  async getAllBuyers(req, res, next) {
    try {
      const { search, isActive } = req.query;
      let query = db('buyers').select('*').orderBy('id', 'desc');

      if (search) {
        const s = `%${search}%`;
        query = query.where((qb) => {
          qb.where('name', 'like', s).orWhere('company_name', 'like', s).orWhere('phone', 'like', s);
        });
      }

      if (isActive !== undefined) {
        query = query.where('is_active', isActive === 'true' || isActive === '1');
      }

      const buyers = await query;
      return apiResponse.success(res, 'Daftar mitra pengepul berhasil dimuat', buyers);
    } catch (error) {
      next(error);
    }
  }

  async getBuyerById(req, res, next) {
    try {
      const { id } = req.params;
      const buyer = await db('buyers').where({ id }).first();
      if (!buyer) throw new AppError('Mitra pengepul tidak ditemukan.', 404);

      // Fetch sales history with this buyer
      const salesHistory = await db('waste_sales')
        .where({ buyer_id: id })
        .orderBy('id', 'desc')
        .limit(10);

      return apiResponse.success(res, 'Detail mitra pengepul berhasil dimuat', {
        ...buyer,
        salesHistory,
      });
    } catch (error) {
      next(error);
    }
  }

  async createBuyer(req, res, next) {
    try {
      const { name, companyName, phone, address } = req.body;
      if (!name) throw new AppError('Nama mitra / penanggung jawab wajib diisi.', 400);

      const [id] = await db('buyers').insert(
        {
          name,
          company_name: companyName || null,
          phone: phone || null,
          address: address || null,
          is_active: true,
        },
        ['id']
      );

      const realId = typeof id === 'object' ? id.id : id;

      await recordAuditLog({
        userId: req.user.id,
        action: 'BUYER_CREATED',
        entityName: 'buyers',
        entityId: realId,
        newValues: { name, companyName, phone },
        req,
      });

      const newBuyer = await db('buyers').where({ id: realId }).first();
      return apiResponse.success(res, 'Mitra pengepul berhasil ditambahkan', newBuyer, 201);
    } catch (error) {
      next(error);
    }
  }

  async updateBuyer(req, res, next) {
    try {
      const { id } = req.params;
      const { name, companyName, phone, address, isActive } = req.body;

      const buyer = await db('buyers').where({ id }).first();
      if (!buyer) throw new AppError('Mitra pengepul tidak ditemukan.', 404);

      const payload = { updated_at: new Date() };
      if (name) payload.name = name;
      if (companyName !== undefined) payload.company_name = companyName;
      if (phone !== undefined) payload.phone = phone;
      if (address !== undefined) payload.address = address;
      if (isActive !== undefined) payload.is_active = Boolean(isActive);

      await db('buyers').where({ id }).update(payload);

      await recordAuditLog({
        userId: req.user.id,
        action: 'BUYER_UPDATED',
        entityName: 'buyers',
        entityId: id,
        oldValues: { name: buyer.name, is_active: buyer.is_active },
        newValues: payload,
        req,
      });

      const updated = await db('buyers').where({ id }).first();
      return apiResponse.success(res, 'Data mitra pengepul berhasil diperbarui', updated);
    } catch (error) {
      next(error);
    }
  }

  async deleteBuyer(req, res, next) {
    try {
      const { id } = req.params;
      const buyer = await db('buyers').where({ id }).first();
      if (!buyer) throw new AppError('Mitra pengepul tidak ditemukan.', 404);

      // Check if buyer has transactions
      const hasSales = await db('waste_sales').where({ buyer_id: id }).first();
      if (hasSales) {
        // Soft deactivate to preserve historical sales
        await db('buyers').where({ id }).update({ is_active: false, updated_at: new Date() });
      } else {
        await db('buyers').where({ id }).delete();
      }

      await recordAuditLog({
        userId: req.user.id,
        action: 'BUYER_DEACTIVATED',
        entityName: 'buyers',
        entityId: id,
        req,
      });

      return apiResponse.success(res, 'Mitra pengepul berhasil dinonaktifkan/dihapus.');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BuyersController();
