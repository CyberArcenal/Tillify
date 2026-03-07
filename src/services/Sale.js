// services/SaleService.js
//@ts-check

const auditLogger = require("../utils/auditLogger");

const { validateSaleData, calculateSaleTotals } = require("../utils/saleUtils");
// 🔧 SETTINGS INTEGRATION: import all needed settings getters
const {
  // @ts-ignore
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
    const { AppDataSource } = require("../main/db/datasource");
    const Sale = require("../entities/Sale");
    const SaleItem = require("../entities/SaleItem");
    const Customer = require("../entities/Customer");
    const Product = require("../entities/Product");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const InventoryMovement = require("../entities/InventoryMovement");
    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }
    } catch (err) {}

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
   * Create a new sale (initiated)
   * @param {Object} saleData - Sale data including items and optional customer
   * @param {string} user - User performing the action
   */
  async create(saleData, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const {
      sale: saleRepo,
      saleItem: saleItemRepo,
      customer: customerRepo,
      product: productRepo,
    } = await this.getRepositories();

    try {
      // Validate sale data
      const validation = validateSaleData(saleData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        // @ts-ignore
        items,
        // @ts-ignore
        customerId,
        // @ts-ignore
        paymentMethod = "cash",
        // @ts-ignore
        notes = null,
        // @ts-ignore
        loyaltyRedeemed = 0,
      } = saleData;

      // 🔧 SETTINGS INTEGRATION: check if discount is enabled globally
      const isDiscountEnabled = await discountEnabled();
      // @ts-ignore
      const hasDiscount = items.some((i) => (i.discount || 0) > 0);
      if (hasDiscount && !isDiscountEnabled) {
        throw new Error("Discounts are disabled in system settings.");
      }

      // 🔧 SETTINGS INTEGRATION: check max discount percent per item
      const maxDiscount = await maxDiscountPercent();
      for (const item of items) {
        if (item.discount && item.discount > 0) {
          // Assume item.unitPrice and item.quantity are provided
          const itemSubtotal = item.unitPrice * item.quantity;
          const discountPercent = (item.discount / itemSubtotal) * 100;
          if (discountPercent > maxDiscount) {
            throw new Error(
              `Discount exceeds maximum allowed (${maxDiscount}%) for product ID ${item.productId}`,
            );
          }
        }
      }

      // 🔧 SETTINGS INTEGRATION: check if loyalty redemption is allowed
      const isLoyaltyEnabled = await loyaltyPointsEnabled();
      if (loyaltyRedeemed > 0 && !isLoyaltyEnabled) {
        throw new Error("Loyalty points are disabled in system settings.");
      }

      // Check customer if provided
      let customer = null;
      if (customerId) {
        // @ts-ignore
        customer = await customerRepo.findOne({ where: { id: customerId } });
        if (!customer)
          throw new Error(`Customer with ID ${customerId} not found`);
      }

      // 🔧 SETTINGS INTEGRATION: get default tax rate (integer percentage)
      const defaultTaxRate = await taxRate();

      // Validate items and calculate totals
      const itemDetails = [];
      let subtotal = 0;
      for (const item of items) {
        // @ts-ignore
        const product = await productRepo.findOne({
          where: { id: item.productId, isActive: true },
        });
        if (!product)
          throw new Error(`Product ID ${item.productId} not found or inactive`);

        const unitPrice = item.unitPrice || product.price;
        const discount = item.discount || 0;

        // 🔧 SETTINGS INTEGRATION: apply default tax if not provided
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

      // 🔧 SETTINGS INTEGRATION: check stock availability if negative stock not allowed
      const negativeStockAllowed = await allowNegativeStock();
      if (!negativeStockAllowed) {
        for (const det of itemDetails) {
          // @ts-ignore
          if (det.product.stockQuantity < det.quantity) {
            throw new Error(
              // @ts-ignore
              `Insufficient stock for product ${det.product.name}. Available: ${det.product.stockQuantity}, Requested: ${det.quantity}`,
            );
          }
        }
      }

      const totals = calculateSaleTotals({
        items: itemDetails,
        loyaltyRedeemed,
        subtotal,
      });

      // Create Sale (status = initiated by default)
      // @ts-ignore
      const sale = saleRepo.create({
        timestamp: new Date(),
        status: "initiated",
        paymentMethod,
        totalAmount: this.round2(totals.total),
        notes,
        customer: customer || null,
        createdAt: new Date(),

        // Flags for promos/redemptions
        usedLoyalty: loyaltyRedeemed > 0,
        loyaltyRedeemed,
        // @ts-ignore
        usedDiscount: items.some((i) => (i.discount || 0) > 0),
        // @ts-ignore
        totalDiscount: items.reduce((sum, i) => sum + (i.discount || 0), 0),
        // @ts-ignore
        usedVoucher: !!saleData.voucherCode,
        // @ts-ignore
        voucherCode: saleData.voucherCode || null,
      });

      // @ts-ignore
      const savedSale = await saveDb(saleRepo, sale);

      // Create SaleItems (no stock or loyalty side effects here)
      for (const det of itemDetails) {
        // @ts-ignore
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
        // @ts-ignore
        await saveDb(saleItemRepo, saleItem);
      }

      // Audit sale creation
      await auditLogger.logCreate("Sale", savedSale.id, savedSale, user);

      savedSale.status = "paid";

      // @ts-ignore
      const paidSale = await updateDb(saleRepo, savedSale);
      console.log(`Sale created: #${savedSale.id} (paid)`);

      return paidSale;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create sale:", error.message);
      throw error;
    }
  }

  /**
   * Mark a sale as paid (complete transaction)
   * @param {number} id - Sale ID
   * @param {string} user
   */
  async markAsPaid(id, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { sale: saleRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const sale = await saleRepo.findOne({ where: { id } });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      if (sale.status !== "initiated") {
        throw new Error(`Cannot mark a ${sale.status} sale as paid`);
      }

      const oldData = { ...sale };

      sale.status = "paid";
      sale.updatedAt = new Date();

      // @ts-ignore
      const updatedSale = await updateDb(saleRepo, sale);

      await auditLogger.logUpdate("Sale", id, oldData, updatedSale, user);

      console.log(`Sale #${id} marked as paid`);
      return updatedSale;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to mark sale as paid:", error.message);
      throw error;
    }
  }

  /**
   * Void a sale (before payment)
   * @param {number} id
   * @param {string} reason
   * @param {string} user
   */
  async voidSale(id, reason, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { sale: saleRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const sale = await saleRepo.findOne({
        where: { id },
        relations: ["saleItems", "saleItems.product", "customer"],
      });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      if (sale.status !== "initiated") {
        throw new Error(`Only initiated sales can be voided`);
      }

      const oldData = { ...sale };

      sale.status = "voided";
      sale.notes = sale.notes
        ? `${sale.notes}\nVoided: ${reason}`
        : `Voided: ${reason}`;
      sale.updatedAt = new Date();

      // @ts-ignore
      const voidedSale = await updateDb(saleRepo, sale);
      await auditLogger.logUpdate("Sale", id, oldData, voidedSale, user);

      console.log(`Sale #${id} voided`);
      return voidedSale;
    } catch (error) {
      // @ts-ignore
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
   */
  // @ts-ignore
  async refundSale(id, itemsToRefund, reason, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { sale: saleRepo } = await this.getRepositories();

    try {
      // 🔧 SETTINGS INTEGRATION: check if refunds are allowed
      const refundsAllowed = await allowRefunds();
      if (!refundsAllowed) {
        throw new Error("Refunds are disabled in system settings.");
      }

      // @ts-ignore
      const sale = await saleRepo.findOne({
        where: { id },
        relations: ["saleItems", "saleItems.product", "customer"],
      });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      if (sale.status !== "paid") {
        throw new Error(`Only paid sales can be refunded`);
      }

      // 🔧 SETTINGS INTEGRATION: check refund window
      const windowDays = await refundWindowDays();
      // @ts-ignore
      const saleDate = new Date(sale.timestamp);
      const now = new Date();
      // @ts-ignore
      const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
      if (diffDays > windowDays) {
        throw new Error(
          `Refund window is ${windowDays} days. This sale is ${diffDays} days old.`,
        );
      }

      // @ts-ignore
      const isFullRefund =
        itemsToRefund.every((req) => {
          // @ts-ignore
          const orig = sale.saleItems.find(
            // @ts-ignore
            (i) => i.product.id === req.productId,
          );
          return orig && req.quantity === orig.quantity;
          // @ts-ignore
        }) && itemsToRefund.length === sale.saleItems.length;
      if (!isFullRefund) throw new Error("Partial refund not implemented");

      const oldData = { ...sale };

      sale.status = "refunded";
      sale.notes = sale.notes
        ? `${sale.notes}\nRefunded: ${reason}`
        : `Refunded: ${reason}`;
      sale.updatedAt = new Date();

      // @ts-ignore
      const refundedSale = await updateDb(saleRepo, sale);
      await auditLogger.logUpdate("Sale", id, oldData, refundedSale, user);

      console.log(`Sale #${id} refunded`);
      return refundedSale;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to refund sale:", error.message);
      throw error;
    }
  }

  /**
   * Find sale by ID with items and customer
   * @param {number} id
   */
  async findById(id) {
    const { sale: saleRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const sale = await saleRepo.findOne({
        where: { id },
        relations: ["saleItems", "saleItems.product", "customer"],
      });
      if (!sale) throw new Error(`Sale with ID ${id} not found`);
      // @ts-ignore
      await auditLogger.logView("Sale", id, "system");
      return sale;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find sale:", error.message);
      throw error;
    }
  }

  /**
   * Find all sales with filters
   * @param {Object} options
   */
  async findAll(options = {}) {
    const { sale: saleRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = saleRepo
        .createQueryBuilder("sale")
        .leftJoinAndSelect("sale.customer", "customer")
        .leftJoinAndSelect("sale.saleItems", "saleItems")
        .leftJoinAndSelect("saleItems.product", "product");

      // Filter by status
      // @ts-ignore
      if (options.status) {
        queryBuilder.andWhere("sale.status = :status", {
          // @ts-ignore
          status: options.status,
        });
      }
      // @ts-ignore
      if (options.statuses && options.statuses.length) {
        queryBuilder.andWhere("sale.status IN (:...statuses)", {
          // @ts-ignore
          statuses: options.statuses,
        });
      }

      // Filter by date range
      // @ts-ignore
      if (options.startDate) {
        // @ts-ignore
        const start = new Date(options.startDate);
        start.setHours(0, 0, 0, 0);
        queryBuilder.andWhere("sale.timestamp >= :startDate", {
          startDate: start,
        });
      }
      // @ts-ignore
      if (options.endDate) {
        // @ts-ignore
        const end = new Date(options.endDate);
        end.setHours(23, 59, 59, 999);
        queryBuilder.andWhere("sale.timestamp <= :endDate", { endDate: end });
      }

      // Filter by customer
      // @ts-ignore
      if (options.customerId) {
        queryBuilder.andWhere("sale.customerId = :customerId", {
          // @ts-ignore
          customerId: options.customerId,
        });
      }

      // Filter by payment method
      // @ts-ignore
      if (options.paymentMethod) {
        queryBuilder.andWhere("sale.paymentMethod = :paymentMethod", {
          // @ts-ignore
          paymentMethod: options.paymentMethod,
        });
      }

      // Search by notes or customer name
      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere(
          "(sale.notes LIKE :search OR customer.name LIKE :search)",
          // @ts-ignore
          { search: `%${options.search}%` },
        );
      }

      // Sorting
      // @ts-ignore
      const sortBy = options.sortBy || "timestamp";
      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`sale.${sortBy}`, sortOrder);

      // Pagination
      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;
        // @ts-ignore
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
   */
  async getStatistics() {
    const { sale: saleRepo } = await this.getRepositories();

    try {
      // Total revenue (paid sales)
      // @ts-ignore
      const revenueResult = await saleRepo
        .createQueryBuilder("sale")
        .select("SUM(sale.totalAmount)", "totalRevenue")
        .where("sale.status = :status", { status: "paid" })
        .getRawOne();
      const totalRevenue = parseFloat(revenueResult.totalRevenue) || 0;

      // Count by status
      // @ts-ignore
      const statusCounts = await saleRepo
        .createQueryBuilder("sale")
        .select("sale.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("sale.status")
        .getRawMany();

      // Average sale value
      // @ts-ignore
      const avgResult = await saleRepo
        .createQueryBuilder("sale")
        .select("AVG(sale.totalAmount)", "average")
        .where("sale.status = :status", { status: "paid" })
        .getRawOne();
      const averageSale = parseFloat(avgResult.average) || 0;

      // Today's sales
      const today = new Date().toISOString().split("T")[0];
      // @ts-ignore
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
   */
  async generateReceipt(id) {
    const sale = await this.findById(id);
    if (!sale) throw new Error("Sale not found");

    const receipt = {
      // @ts-ignore
      receiptNumber: `RCP-${sale.id.toString().padStart(6, "0")}`,
      date: sale.timestamp,
      // @ts-ignore
      customer: sale.customer
        ? {
            // @ts-ignore
            name: sale.customer.name,
            // @ts-ignore
            loyaltyPoints: sale.customer.loyaltyPointsBalance,
          }
        : null,
      // @ts-ignore
      items: sale.saleItems.map((item) => ({
        product: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax,
        lineTotal: item.lineTotal,
      })),
      // @ts-ignore
      subtotal: sale.saleItems.reduce(
        // @ts-ignore
        (sum, i) => sum + i.unitPrice * i.quantity,
        0,
      ),
      // @ts-ignore
      tax: sale.saleItems.reduce((sum, i) => sum + i.tax, 0),
      // @ts-ignore
      discount: sale.saleItems.reduce((sum, i) => sum + i.discount, 0),
      total: sale.totalAmount,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
    };

    // @ts-ignore
    await auditLogger.log({
      action: "GENERATE_RECEIPT",
      entity: "Sale",
      entityId: id,
      newData: { receiptNumber: receipt.receiptNumber },
      user: "system",
    });
    return receipt;
  }

  /**
   * Export sales to CSV/JSON
   * @param {string} format
   * @param {Object} filters
   * @param {string} user
   */
  async exportSales(format = "json", filters = {}, user = "system") {
    try {
      const sales = await this.findAll(filters);

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
          // @ts-ignore
          new Date(s.timestamp).toLocaleString(),
          // @ts-ignore
          s.customer?.name || "Walk-in",
          // @ts-ignore
          s.saleItems.length,
          // @ts-ignore
          s.saleItems
            // @ts-ignore
            .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
            .toFixed(2),
          // @ts-ignore
          s.saleItems.reduce((sum, i) => sum + i.tax, 0).toFixed(2),
          // @ts-ignore
          s.saleItems.reduce((sum, i) => sum + i.discount, 0).toFixed(2),
          s.totalAmount,
          s.paymentMethod,
          s.status,
          s.notes || "",
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `sales_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: sales,
          filename: `sales_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      // @ts-ignore
      await auditLogger.logExport("Sale", format, filters, user);
      console.log(`Exported ${sales.length} sales in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export sales:", error);
      throw error;
    }
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
