// services/SaleService.js
const auditLogger = require("../utils/auditLogger");
const { validateSaleData, calculateSaleTotals } = require("../utils/saleUtils");

// 🔧 SETTINGS INTEGRATION: import all needed settings getters
const {
  getLoyaltyPointRate,
  taxRate,
  discountEnabled,
  maxDiscountPercent,
  allowRefunds,
  refundWindowDays,
  loyaltyPointsEnabled,
  allowNegativeStock,
} = require("../utils/system");

class SaleService {
  constructor() {
    this.saleRepository = null;
    this.saleItemRepository = null;
    this.customerRepository = null;
    this.productRepository = null;
    this.loyaltyTransactionRepository = null;
    this.inventoryMovementRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/dataSource");
    const Sale = require("../entities/Sale");
    const SaleItem = require("../entities/SaleItem");
    const Customer = require("../entities/Customer");
    const Product = require("../entities/Product");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const InventoryMovement = require("../entities/InventoryMovement");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.saleRepository = AppDataSource.getRepository(Sale);
    this.saleItemRepository = AppDataSource.getRepository(SaleItem);
    this.customerRepository = AppDataSource.getRepository(Customer);
    this.productRepository = AppDataSource.getRepository(Product);
    this.loyaltyTransactionRepository =
      AppDataSource.getRepository(LoyaltyTransaction);
    this.inventoryMovementRepository =
      AppDataSource.getRepository(InventoryMovement);
    console.log("SaleService initialized");
  }

  async getRepositories() {
    if (!this.saleRepository) {
      await this.initialize();
    }
    return {
      sale: this.saleRepository,
      saleItem: this.saleItemRepository,
      customer: this.customerRepository,
      product: this.productRepository,
      loyaltyTransaction: this.loyaltyTransactionRepository,
      inventoryMovement: this.inventoryMovementRepository,
    };
  }

  /**
   * Helper: get a repository (transactional if queryRunner provided)
   * @param {import("typeorm").QueryRunner | null} qr
   * @param {Function} entityClass
   * @returns {import("typeorm").Repository<any>}
   */
  _getRepo(qr, entityClass) {
    if (qr) {
      return qr.manager.getRepository(entityClass);
    }
    const { AppDataSource } = require("../main/db/dataSource");
    return AppDataSource.getRepository(entityClass);
  }

  /**
   * Create a new sale (initiated)
   * @param {Object} saleData - Sale data including items and optional customer
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async create(saleData, user = "system", qr = null) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const Sale = require("../entities/Sale");
    const SaleItem = require("../entities/SaleItem");
    const Customer = require("../entities/Customer");
    const Product = require("../entities/Product");

    const saleRepo = this._getRepo(qr, Sale);
    const saleItemRepo = this._getRepo(qr, SaleItem);
    const customerRepo = this._getRepo(qr, Customer);
    const productRepo = this._getRepo(qr, Product);

    try {
      const validation = validateSaleData(saleData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        items,
        customerId,
        paymentMethod = "cash",
        notes = null,
        loyaltyRedeemed = 0,
      } = saleData;

      const isDiscountEnabled = await discountEnabled();
      const hasDiscount = items.some((i) => (i.discount || 0) > 0);
      if (hasDiscount && !isDiscountEnabled) {
        throw new Error("Discounts are disabled in system settings.");
      }

      const maxDiscount = await maxDiscountPercent();
      for (const item of items) {
        if (item.discount && item.discount > 0) {
          const itemSubtotal = item.unitPrice * item.quantity;
          const discountPercent = (item.discount / itemSubtotal) * 100;
          if (discountPercent > maxDiscount) {
            throw new Error(
              `Discount exceeds maximum allowed (${maxDiscount}%) for product ID ${item.productId}`
            );
          }
        }
      }

      const isLoyaltyEnabled = await loyaltyPointsEnabled();
      if (loyaltyRedeemed > 0 && !isLoyaltyEnabled) {
        throw new Error("Loyalty points are disabled in system settings.");
      }

      let customer = null;
      if (customerId) {
        customer = await customerRepo.findOne({ where: { id: customerId } });
        if (!customer)
          throw new Error(`Customer with ID ${customerId} not found`);
      }

      const defaultTaxRate = await taxRate();
      const itemDetails = [];
      let subtotal = 0;

      for (const item of items) {
        const product = await productRepo.findOne({
          where: { id: item.productId, isActive: true },
        });
        if (!product)
          throw new Error(`Product ID ${item.productId} not found or inactive`);

        const unitPrice = item.unitPrice || product.price;
        const discount = item.discount || 0;

        let tax = item.tax;
        if (tax === undefined || tax === null) {
          tax =
            defaultTaxRate > 0
              ? (unitPrice * item.quantity * defaultTaxRate) / 100
              : 0;
        }

        const lineTotal = unitPrice * item.quantity - discount + tax;
        itemDetails.push({
          product,
          quantity: item.quantity,
          unitPrice,
          discount,
          tax,
          lineTotal,
        });
        subtotal += unitPrice * item.quantity;
      }

      const negativeStockAllowed = await allowNegativeStock();
      if (!negativeStockAllowed) {
        for (const det of itemDetails) {
          if (det.product.stockQty < det.quantity) {
            throw new Error(
              `Insufficient stock for product ${det.product.name}. Available: ${det.product.stockQty}, Requested: ${det.quantity}`
            );
          }
        }
      }

      const totals = calculateSaleTotals({
        items: itemDetails,
        loyaltyRedeemed,
        subtotal,
      });

      const sale = saleRepo.create({
        timestamp: new Date(),
        status: "initiated",
        paymentMethod,
        totalAmount: this.round2(totals.total),
        notes,
        customer: customer || null,
        createdAt: new Date(),
        usedLoyalty: loyaltyRedeemed > 0,
        loyaltyRedeemed,
        usedDiscount: items.some((i) => (i.discount || 0) > 0),
        totalDiscount: items.reduce((sum, i) => sum + (i.discount || 0), 0),
        usedVoucher: !!saleData.voucherCode,
        voucherCode: saleData.voucherCode || null,
      });

      const savedSale = await saveDb(saleRepo, sale);

      for (const det of itemDetails) {
        const saleItem = saleItemRepo.create({
          quantity: det.quantity,
          unitPrice: det.unitPrice,
          discount: det.discount,
          tax: det.tax,
          lineTotal: det.lineTotal,
          sale: savedSale,
          product: det.product,
          createdAt: new Date(),
        });
        await saveDb(saleItemRepo, saleItem);
      }

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "CREATE",
          entity: "Sale",
          entityId: savedSale.id,
          user,
          description: `Created sale #${savedSale.id}`,
        });
      } else {
        await auditLogger.logCreate("Sale", savedSale.id, savedSale, user);
      }

      savedSale.status = "paid";
      const paidSale = await updateDb(saleRepo, savedSale);
      console.log(`Sale created: #${savedSale.id} (paid)`);
      return paidSale;
    } catch (error) {
      console.error("Failed to create sale:", error.message);
      throw error;
    }
  }

  /**
   * Mark a sale as paid (complete transaction)
   * @param {number} id - Sale ID
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async markAsPaid(id, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Sale = require("../entities/Sale");
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const sale = await saleRepo.findOne({ where: { id } });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      if (sale.status !== "initiated") {
        throw new Error(`Cannot mark a ${sale.status} sale as paid`);
      }

      const oldData = { ...sale };
      sale.status = "paid";
      sale.updatedAt = new Date();

      const updatedSale = await updateDb(saleRepo, sale);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "UPDATE",
          entity: "Sale",
          entityId: id,
          user,
          description: `Marked sale #${id} as paid`,
        });
      } else {
        await auditLogger.logUpdate("Sale", id, oldData, updatedSale, user);
      }

      console.log(`Sale #${id} marked as paid`);
      return updatedSale;
    } catch (error) {
      console.error("Failed to mark sale as paid:", error.message);
      throw error;
    }
  }

  /**
   * Void a sale (before payment)
   * @param {number} id
   * @param {string} reason
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async voidSale(id, reason, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Sale = require("../entities/Sale");
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const sale = await saleRepo.findOne({
        where: { id },
        relations: ["saleItems", "saleItems.product", "customer"],
      });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      if (sale.status !== "initiated") {
        throw new Error("Only initiated sales can be voided");
      }

      const oldData = { ...sale };
      sale.status = "voided";
      sale.notes = sale.notes
        ? `${sale.notes}\nVoided: ${reason}`
        : `Voided: ${reason}`;
      sale.updatedAt = new Date();

      const voidedSale = await updateDb(saleRepo, sale);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "UPDATE",
          entity: "Sale",
          entityId: id,
          user,
          description: `Voided sale #${id}: ${reason}`,
        });
      } else {
        await auditLogger.logUpdate("Sale", id, oldData, voidedSale, user);
      }

      console.log(`Sale #${id} voided`);
      return voidedSale;
    } catch (error) {
      console.error("Failed to void sale:", error.message);
      throw error;
    }
  }

  /**
   * Process a refund (partial or full)
   * @param {number} id - Original sale ID
   * @param {Array<{productId: number, quantity: number}>} itemsToRefund - Items and quantities to refund
   * @param {string} reason
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async refundSale(id, itemsToRefund, reason, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Sale = require("../entities/Sale");
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const refundsAllowed = await allowRefunds();
      if (!refundsAllowed) {
        throw new Error("Refunds are disabled in system settings.");
      }

      const sale = await saleRepo.findOne({
        where: { id },
        relations: ["saleItems", "saleItems.product", "customer"],
      });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      if (sale.status !== "paid") {
        throw new Error("Only paid sales can be refunded");
      }

      const windowDaysSetting = await refundWindowDays();
      const saleDate = new Date(sale.timestamp);
      const now = new Date();
      const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
      if (diffDays > windowDaysSetting) {
        throw new Error(
          `Refund window is ${windowDaysSetting} days. This sale is ${diffDays} days old.`
        );
      }

      const isFullRefund =
        itemsToRefund.every((req) => {
          const orig = sale.saleItems.find(
            (i) => i.product.id === req.productId
          );
          return orig && req.quantity === orig.quantity;
        }) && itemsToRefund.length === sale.saleItems.length;

      if (!isFullRefund) throw new Error("Partial refund not implemented");

      const oldData = { ...sale };
      sale.status = "refunded";
      sale.notes = sale.notes
        ? `${sale.notes}\nRefunded: ${reason}`
        : `Refunded: ${reason}`;
      sale.updatedAt = new Date();

      const refundedSale = await updateDb(saleRepo, sale);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "UPDATE",
          entity: "Sale",
          entityId: id,
          user,
          description: `Refunded sale #${id}: ${reason}`,
        });
      } else {
        await auditLogger.logUpdate("Sale", id, oldData, refundedSale, user);
      }

      console.log(`Sale #${id} refunded`);
      return refundedSale;
    } catch (error) {
      console.error("Failed to refund sale:", error.message);
      throw error;
    }
  }

  /**
   * Find sale by ID with items and customer
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async findById(id, qr = null) {
    const Sale = require("../entities/Sale");
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const sale = await saleRepo.findOne({
        where: { id },
        relations: ["saleItems", "saleItems.product", "customer"],
      });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      await auditLogger.logView("Sale", id, "system");
      return sale;
    } catch (error) {
      console.error("Failed to find sale:", error.message);
      throw error;
    }
  }

  /**
   * Find all sales with filters
   * @param {Object} options
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async findAll(options = {}, qr = null) {
    const Sale = require("../entities/Sale");
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const queryBuilder = saleRepo
        .createQueryBuilder("sale")
        .leftJoinAndSelect("sale.customer", "customer")
        .leftJoinAndSelect("sale.saleItems", "saleItems")
        .leftJoinAndSelect("saleItems.product", "product");

      if (options.status) {
        queryBuilder.andWhere("sale.status = :status", {
          status: options.status,
        });
      }
      if (options.statuses && options.statuses.length) {
        queryBuilder.andWhere("sale.status IN (:...statuses)", {
          statuses: options.statuses,
        });
      }

      if (options.startDate) {
        const start = new Date(options.startDate);
        start.setHours(0, 0, 0, 0);
        queryBuilder.andWhere("sale.timestamp >= :startDate", {
          startDate: start,
        });
      }
      if (options.endDate) {
        const end = new Date(options.endDate);
        end.setHours(23, 59, 59, 999);
        queryBuilder.andWhere("sale.timestamp <= :endDate", { endDate: end });
      }

      if (options.customerId) {
        queryBuilder.andWhere("sale.customerId = :customerId", {
          customerId: options.customerId,
        });
      }

      if (options.paymentMethod) {
        queryBuilder.andWhere("sale.paymentMethod = :paymentMethod", {
          paymentMethod: options.paymentMethod,
        });
      }

      if (options.search) {
        queryBuilder.andWhere(
          "(sale.notes LIKE :search OR customer.name LIKE :search)",
          { search: `%${options.search}%` }
        );
      }

      const sortBy = options.sortBy || "timestamp";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`sale.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
        queryBuilder.skip(offset).take(options.limit);
      }

      const sales = await queryBuilder.getMany();
      await auditLogger.logView("Sale", null, "system");
      return sales;
    } catch (error) {
      console.error("Failed to fetch sales:", error);
      throw error;
    }
  }

  /**
   * Get sales statistics
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStatistics(qr = null) {
    const Sale = require("../entities/Sale");
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const revenueResult = await saleRepo
        .createQueryBuilder("sale")
        .select("SUM(sale.totalAmount)", "totalRevenue")
        .where("sale.status = :status", { status: "paid" })
        .getRawOne();
      const totalRevenue = parseFloat(revenueResult.totalRevenue) || 0;

      const statusCounts = await saleRepo
        .createQueryBuilder("sale")
        .select("sale.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("sale.status")
        .getRawMany();

      const avgResult = await saleRepo
        .createQueryBuilder("sale")
        .select("AVG(sale.totalAmount)", "average")
        .where("sale.status = :status", { status: "paid" })
        .getRawOne();
      const averageSale = parseFloat(avgResult.average) || 0;

      const today = new Date().toISOString().split("T")[0];
      const todaySales = await saleRepo
        .createQueryBuilder("sale")
        .where("date(sale.timestamp) = :today", { today })
        .andWhere("sale.status = :status", { status: "paid" })
        .getCount();

      return {
        totalRevenue,
        averageSale,
        todaySales,
        statusCounts,
      };
    } catch (error) {
      console.error("Failed to get sales statistics:", error);
      throw error;
    }
  }

  /**
   * Generate a receipt for a sale
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async generateReceipt(id, qr = null) {
    const sale = await this.findById(id, qr);
    if (!sale) throw new Error("Sale not found");

    const receipt = {
      receiptNumber: `RCP-${sale.id.toString().padStart(6, "0")}`,
      date: sale.timestamp,
      customer: sale.customer
        ? {
            name: sale.customer.name,
            loyaltyPoints: sale.customer.loyaltyPointsBalance,
          }
        : null,
      items: sale.saleItems.map((item) => ({
        product: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax,
        lineTotal: item.lineTotal,
      })),
      subtotal: sale.saleItems.reduce(
        (sum, i) => sum + i.unitPrice * i.quantity,
        0
      ),
      tax: sale.saleItems.reduce((sum, i) => sum + i.tax, 0),
      discount: sale.saleItems.reduce((sum, i) => sum + i.discount, 0),
      total: sale.totalAmount,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
    };

    // Log receipt generation (use qr if available)
    if (qr) {
      const auditRepo = qr.manager.getRepository("AuditLog");
      await auditRepo.save({
        action: "GENERATE_RECEIPT",
        entity: "Sale",
        entityId: id,
        newData: { receiptNumber: receipt.receiptNumber },
        user: "system",
      });
    } else {
      await auditLogger.log({
        action: "GENERATE_RECEIPT",
        entity: "Sale",
        entityId: id,
        newData: { receiptNumber: receipt.receiptNumber },
        user: "system",
      });
    }
    return receipt;
  }

  /**
   * Export sales to CSV/JSON
   * @param {string} format
   * @param {Object} filters
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportSales(format = "json", filters = {}, user = "system", qr = null) {
    try {
      const sales = await this.findAll(filters, qr);

      let exportData;
      if (format === "csv") {
        const headers = [
          "Sale ID",
          "Date",
          "Customer",
          "Items Count",
          "Subtotal",
          "Tax",
          "Discount",
          "Total",
          "Payment Method",
          "Status",
          "Notes",
        ];
        const rows = sales.map((s) => [
          s.id,
          new Date(s.timestamp).toLocaleString(),
          s.customer?.name || "Walk-in",
          s.saleItems.length,
          s.saleItems
            .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
            .toFixed(2),
          s.saleItems.reduce((sum, i) => sum + i.tax, 0).toFixed(2),
          s.saleItems.reduce((sum, i) => sum + i.discount, 0).toFixed(2),
          s.totalAmount,
          s.paymentMethod,
          s.status,
          s.notes || "",
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `sales_export_${
            new Date().toISOString().split("T")[0]
          }.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: sales,
          filename: `sales_export_${
            new Date().toISOString().split("T")[0]
          }.json`,
        };
      }

      await auditLogger.logExport("Sale", format, filters, user);
      console.log(`Exported ${sales.length} sales in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export sales:", error);
      throw error;
    }
  }

  /**
   * Bulk create multiple sales
   * @param {Array<Object>} salesArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(salesArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const saleData of salesArray) {
      try {
        const saved = await this.create(saleData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ sale: saleData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Bulk update multiple sales (only allowed for certain fields)
   * @param {Array<{ id: number, updates: Object }>} updatesArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkUpdate(updatesArray, user = "system", qr = null) {
    const results = { updated: [], errors: [] };
    for (const { id, updates } of updatesArray) {
      try {
        // Only allow note updates and maybe status changes (but careful)
        const allowedUpdates = {};
        if (updates.notes !== undefined) allowedUpdates.notes = updates.notes;
        if (updates.paymentMethod !== undefined)
          allowedUpdates.paymentMethod = updates.paymentMethod;
        // For status changes, we have dedicated methods; avoid direct status update via bulkUpdate
        if (Object.keys(allowedUpdates).length === 0) {
          throw new Error("No allowed fields to update");
        }
        // We'll implement a generic update method if needed, but for simplicity we update directly
        const saleRepo = this._getRepo(qr, require("../entities/Sale"));
        const sale = await saleRepo.findOne({ where: { id } });
        if (!sale) throw new Error(`Sale with ID ${id} not found`);
        const oldData = { ...sale };
        Object.assign(sale, allowedUpdates);
        sale.updatedAt = new Date();
        const saved = await saleRepo.save(sale);
        results.updated.push(saved);
      } catch (err) {
        results.errors.push({ id, updates, error: err.message });
      }
    }
    return results;
  }

  /**
   * Import sales from a CSV file
   * @param {string} filePath
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async importFromCSV(filePath, user = "system", qr = null) {
    const fs = require("fs").promises;
    const csv = require("csv-parse/sync");
    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = { imported: [], errors: [] };
    for (const record of records) {
      try {
        let items = [];
        if (record.items) {
          items = JSON.parse(record.items);
        }
        const saleData = {
          items,
          customerId: record.customerId
            ? parseInt(record.customerId, 10)
            : undefined,
          paymentMethod: record.paymentMethod || "cash",
          notes: record.notes || null,
          loyaltyRedeemed: record.loyaltyRedeemed
            ? parseInt(record.loyaltyRedeemed, 10)
            : 0,
          voucherCode: record.voucherCode || null,
        };
        const validation = validateSaleData(saleData);
        if (!validation.valid) throw new Error(validation.errors.join(", "));
        const saved = await this.create(saleData, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }

  /**
   * @param {number} value
   */
  round2(value) {
    return Math.round(value * 100) / 100;
  }
}

// Singleton instance
const saleService = new SaleService();
module.exports = saleService;
