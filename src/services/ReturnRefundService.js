// services/ReturnRefundService.js
// @ts-check

const auditLogger = require("../utils/auditLogger");
// @ts-ignore

const { validateReturnData } = require("../utils/returnUtils");

// 🔧 SETTINGS INTEGRATION: import needed settings getters
const { allowRefunds, refundWindowDays } = require("../utils/system");

class ReturnRefundService {
  constructor() {
    this.returnRepository = null;
    this.returnItemRepository = null;
    this.saleRepository = null;
    this.customerRepository = null;
    this.productRepository = null;
    this.inventoryMovementRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    const ReturnRefund = require("../entities/ReturnRefund");
    const ReturnRefundItem = require("../entities/ReturnRefundItem");
    const Sale = require("../entities/Sale");
    const Customer = require("../entities/Customer");
    const Product = require("../entities/Product");
    const InventoryMovement = require("../entities/InventoryMovement");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.returnRepository = AppDataSource.getRepository(ReturnRefund);
    this.returnItemRepository = AppDataSource.getRepository(ReturnRefundItem);
    this.saleRepository = AppDataSource.getRepository(Sale);
    this.customerRepository = AppDataSource.getRepository(Customer);
    this.productRepository = AppDataSource.getRepository(Product);
    this.inventoryMovementRepository =
      AppDataSource.getRepository(InventoryMovement);
    console.log("ReturnRefundService initialized");
  }

  async getRepositories() {
    if (!this.returnRepository) {
      await this.initialize();
    }
    return {
      return: this.returnRepository,
      returnItem: this.returnItemRepository,
      sale: this.saleRepository,
      customer: this.customerRepository,
      product: this.productRepository,
      inventoryMovement: this.inventoryMovementRepository,
    };
  }

  /**
   * Create a new return/refund with items
   * @param {Object} returnData - Return data including items
   * @param {string} user - User performing the action
   */
  async create(returnData, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const {
      return: returnRepo,
      sale: saleRepo,
      customer: customerRepo,
      product: productRepo,
    } = await this.getRepositories();

    try {
      // 🔧 SETTINGS INTEGRATION: check if refunds are allowed globally
      const refundsAllowed = await allowRefunds();
      if (!refundsAllowed) {
        throw new Error("Refunds are disabled in system settings.");
      }

      // Validate return data
      const validation = validateReturnData(returnData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        // @ts-ignore
        referenceNo,
        // @ts-ignore
        saleId,
        // @ts-ignore
        customerId,
        // @ts-ignore
        reason = null,
        // @ts-ignore
        refundMethod,
        // @ts-ignore
        status = "pending",
        // @ts-ignore
        items = [],
      } = returnData;

      console.log(`Creating return: Reference ${referenceNo}`);

      // Check sale exists and is eligible for return
      // @ts-ignore
      const sale = await saleRepo.findOne({
        where: { id: saleId },
      });
      if (!sale) {
        throw new Error(`Sale with ID ${saleId} not found`);
      }

      // 🔧 SETTINGS INTEGRATION: ensure sale is paid
      if (sale.status !== "paid") {
        throw new Error(
          `Only paid sales can be refunded. Current status: ${sale.status}`,
        );
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

      // Check customer exists
      // @ts-ignore
      const customer = await customerRepo.findOne({
        where: { id: customerId },
      });
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found`);
      }

      // Check reference uniqueness if provided
      if (referenceNo) {
        // @ts-ignore
        const existing = await returnRepo.findOne({ where: { referenceNo } });
        if (existing) {
          throw new Error(
            `Return with reference "${referenceNo}" already exists`,
          );
        }
      }

      // Prepare return items with calculated subtotals
      const returnItems = [];
      let totalAmount = 0;
      for (const item of items) {
        // @ts-ignore
        const product = await productRepo.findOne({
          where: { id: item.productId },
        });
        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }
        const quantity = item.quantity;
        const unitPrice = item.unitPrice;
        const subtotal = quantity * unitPrice;
        totalAmount += subtotal;

        returnItems.push({
          product,
          quantity,
          unitPrice,
          subtotal,
          reason: item.reason || null,
        });
      }

      // Create return entity
      // @ts-ignore
      const returnRefund = returnRepo.create({
        referenceNo,
        sale,
        customer,
        reason,
        refundMethod,
        totalAmount,
        status,
        items: returnItems,
        createdAt: new Date(),
      });

      // Save return (cascade will save items)
      // @ts-ignore
      const savedReturn = await saveDb(returnRepo, returnRefund);

      await auditLogger.logCreate(
        "ReturnRefund",
        savedReturn.id,
        savedReturn,
        user,
      );

      console.log(
        `Return created: #${savedReturn.id} - ${savedReturn.referenceNo}`,
      );

      return savedReturn;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create return:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing return
   * @param {number} id - Return ID
   * @param {Object} returnData - Updated fields (items not allowed if processed)
   * @param {string} user - User performing the action
   */
  async update(id, returnData, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const {
      return: returnRepo,
      sale: saleRepo,
      customer: customerRepo,
      product: productRepo,
    } = await this.getRepositories();

    try {
      // @ts-ignore
      const existingReturn = await returnRepo.findOne({
        where: { id },
        relations: ["sale", "customer", "items", "items.product"],
      });
      if (!existingReturn) {
        throw new Error(`Return with ID ${id} not found`);
      }

      // Prevent updates if return is already processed or cancelled
      if (existingReturn.status === "processed") {
        throw new Error("Cannot update a processed return");
      }
      if (existingReturn.status === "cancelled") {
        throw new Error("Cannot update a cancelled return");
      }

      const oldData = { ...existingReturn };
      const oldStatus = existingReturn.status;

      // Handle sale change (should be rare, but allow if pending)
      // @ts-ignore
      if (returnData.saleId && returnData.saleId !== existingReturn.sale.id) {
        // @ts-ignore
        const sale = await saleRepo.findOne({
          // @ts-ignore
          where: { id: returnData.saleId },
        });
        if (!sale) {
          // @ts-ignore
          throw new Error(`Sale with ID ${returnData.saleId} not found`);
        }
        // @ts-ignore
        existingReturn.sale = sale;
      }

      // Handle customer change
      if (
        // @ts-ignore
        returnData.customerId &&
        // @ts-ignore
        returnData.customerId !== existingReturn.customer.id
      ) {
        // @ts-ignore
        const customer = await customerRepo.findOne({
          // @ts-ignore
          where: { id: returnData.customerId },
        });
        if (!customer) {
          throw new Error(
            // @ts-ignore
            `Customer with ID ${returnData.customerId} not found`,
          );
        }
        // @ts-ignore
        existingReturn.customer = customer;
      }

      // Handle reference change uniqueness
      if (
        // @ts-ignore
        returnData.referenceNo &&
        // @ts-ignore
        returnData.referenceNo !== existingReturn.referenceNo
      ) {
        // @ts-ignore
        const existing = await returnRepo.findOne({
          // @ts-ignore
          where: { referenceNo: returnData.referenceNo },
        });
        if (existing) {
          throw new Error(
            // @ts-ignore
            `Return with reference "${returnData.referenceNo}" already exists`,
          );
        }
        // @ts-ignore
        existingReturn.referenceNo = returnData.referenceNo;
      }

      // Handle items update if provided (only allowed for pending returns)
      // @ts-ignore
      if (returnData.items) {
        if (existingReturn.status !== "pending") {
          throw new Error("Can only update items for pending returns");
        }

        // Validate new items
        // @ts-ignore
        const validation = validateReturnData({ items: returnData.items });
        if (!validation.valid) {
          throw new Error(validation.errors.join(", "));
        }

        // Remove old items (cascade should handle)
        // @ts-ignore
        if (existingReturn.items && existingReturn.items.length > 0) {
          // @ts-ignore
          existingReturn.items = [];
        }

        const newItems = [];
        let totalAmount = 0;
        // @ts-ignore
        for (const item of returnData.items) {
          // @ts-ignore
          const product = await productRepo.findOne({
            where: { id: item.productId },
          });
          if (!product) {
            throw new Error(`Product with ID ${item.productId} not found`);
          }
          const quantity = item.quantity;
          const unitPrice = item.unitPrice;
          const subtotal = quantity * unitPrice;
          totalAmount += subtotal;

          newItems.push({
            product,
            quantity,
            unitPrice,
            subtotal,
            reason: item.reason || null,
          });
        }
        // @ts-ignore
        existingReturn.items = newItems;
        existingReturn.totalAmount = totalAmount;
      }

      // Update other fields
      // @ts-ignore
      if (returnData.reason !== undefined)
        // @ts-ignore
        existingReturn.reason = returnData.reason;
      // @ts-ignore
      if (returnData.refundMethod)
        // @ts-ignore
        existingReturn.refundMethod = returnData.refundMethod;

      // Handle status change
      // @ts-ignore
      const newStatus = returnData.status;
      if (newStatus && newStatus !== oldStatus) {
        // Validate status transition
        if (oldStatus === "cancelled") {
          throw new Error("Cannot change status of cancelled return");
        }
        if (oldStatus === "processed" && newStatus !== "processed") {
          throw new Error("Cannot revert processed return");
        }

        // 🔧 SETTINGS INTEGRATION: if moving to 'processed', re-check refund window and sale status
        if (newStatus === "processed") {
          const refundsAllowed = await allowRefunds();
          if (!refundsAllowed) {
            throw new Error(
              "Refunds are disabled in system settings. Cannot process return.",
            );
          }

          const windowDays = await refundWindowDays();
          // @ts-ignore
          const saleDate = new Date(existingReturn.sale.timestamp);
          const now = new Date();
          // @ts-ignore
          const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
          if (diffDays > windowDays) {
            throw new Error(
              `Refund window is ${windowDays} days. This sale is ${diffDays} days old. Cannot process.`,
            );
          }

          // @ts-ignore
          if (existingReturn.sale.status !== "paid") {
            throw new Error(
              // @ts-ignore
              `Cannot process return for sale with status ${existingReturn.sale.status}`,
            );
          }
        }

        existingReturn.status = newStatus;
      }

      existingReturn.updatedAt = new Date();

      // Save updated return
      // @ts-ignore
      const savedReturn = await updateDb(returnRepo, existingReturn);

      await auditLogger.logUpdate(
        "ReturnRefund",
        id,
        oldData,
        savedReturn,
        user,
      );

      console.log(`Return updated: #${id}`);
      return savedReturn;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to update return:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a return (set status to cancelled)
   * @param {number} id - Return ID
   * @param {string} user - User performing the action
   */
  async delete(id, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { return: returnRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const returnRefund = await returnRepo.findOne({
        where: { id },
        relations: ["items"],
      });
      if (!returnRefund) {
        throw new Error(`Return with ID ${id} not found`);
      }

      if (returnRefund.status === "cancelled") {
        throw new Error(`Return #${id} is already cancelled`);
      }

      const oldData = { ...returnRefund };
      returnRefund.status = "cancelled";
      returnRefund.updatedAt = new Date();

      // @ts-ignore
      const savedReturn = await updateDb(returnRepo, returnRefund);

      await auditLogger.logDelete("ReturnRefund", id, oldData, user);

      console.log(`Return cancelled: #${id}`);
      return savedReturn;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to delete return:", error.message);
      throw error;
    }
  }

  /**
   * Find return by ID
   * @param {number} id
   */
  async findById(id) {
    const { return: returnRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const returnRefund = await returnRepo.findOne({
        where: { id },
        relations: ["sale", "customer", "items", "items.product"],
      });
      if (!returnRefund) {
        throw new Error(`Return with ID ${id} not found`);
      }
      // @ts-ignore
      await auditLogger.logView("ReturnRefund", id, "system");
      return returnRefund;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find return:", error.message);
      throw error;
    }
  }

  /**
   * Find all returns with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { return: returnRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = returnRepo
        .createQueryBuilder("return")
        .leftJoinAndSelect("return.sale", "sale")
        .leftJoinAndSelect("return.customer", "customer")
        .leftJoinAndSelect("return.items", "items")
        .leftJoinAndSelect("items.product", "product");

      // Filter by status
      // @ts-ignore
      if (options.status) {
        queryBuilder.andWhere("return.status = :status", {
          // @ts-ignore
          status: options.status,
        });
      }

      // Filter by sale
      // @ts-ignore
      if (options.saleId) {
        // @ts-ignore
        queryBuilder.andWhere("sale.id = :saleId", { saleId: options.saleId });
      }

      // Filter by customer
      // @ts-ignore
      if (options.customerId) {
        queryBuilder.andWhere("customer.id = :customerId", {
          // @ts-ignore
          customerId: options.customerId,
        });
      }

      // Date range
      // @ts-ignore
      if (options.startDate) {
        queryBuilder.andWhere("return.createdAt >= :startDate", {
          // @ts-ignore
          startDate: options.startDate,
        });
      }
      // @ts-ignore
      if (options.endDate) {
        queryBuilder.andWhere("return.createdAt <= :endDate", {
          // @ts-ignore
          endDate: options.endDate,
        });
      }

      // Search by reference or reason
      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere(
          "(return.referenceNo LIKE :search OR return.reason LIKE :search)",
          // @ts-ignore
          { search: `%${options.search}%` },
        );
      }

      // Sorting
      // @ts-ignore
      const sortBy = options.sortBy || "createdAt";
      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`return.${sortBy}`, sortOrder);

      // Pagination
      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;
        // @ts-ignore
        queryBuilder.skip(offset).take(options.limit);
      }

      const returns = await queryBuilder.getMany();

      await auditLogger.logView("ReturnRefund", null, "system");
      return returns;
    } catch (error) {
      console.error("Failed to fetch returns:", error);
      throw error;
    }
  }

  /**
   * Get return statistics
   */
  async getStatistics() {
    const { return: returnRepo } = await this.getRepositories();

    try {
      // Count by status
      // @ts-ignore
      const statusCounts = await returnRepo
        .createQueryBuilder("return")
        .select("return.status", "status")
        .addSelect("COUNT(return.id)", "count")
        .groupBy("return.status")
        .getRawMany();

      // Total refund amount for processed returns
      // @ts-ignore
      const totalProcessed = await returnRepo
        .createQueryBuilder("return")
        .select("SUM(return.totalAmount)", "total")
        .where("return.status = :status", { status: "processed" })
        .getRawOne();

      // Average refund amount
      // @ts-ignore
      const avgAmount = await returnRepo
        .createQueryBuilder("return")
        .select("AVG(return.totalAmount)", "average")
        .where("return.status = :status", { status: "processed" })
        .getRawOne();

      // Top customers by return count/amount
      // @ts-ignore
      const topCustomers = await returnRepo
        .createQueryBuilder("return")
        .leftJoin("return.customer", "customer")
        .select("customer.id", "customerId")
        .addSelect("customer.name", "customerName")
        .addSelect("COUNT(return.id)", "returnCount")
        .addSelect("SUM(return.totalAmount)", "totalRefunded")
        .where("return.status = :status", { status: "processed" })
        .groupBy("customer.id")
        .orderBy("totalRefunded", "DESC")
        .limit(5)
        .getRawMany();

      return {
        statusCounts,
        totalProcessedAmount: parseFloat(totalProcessed?.total) || 0,
        averageProcessedAmount: parseFloat(avgAmount?.average) || 0,
        topCustomers,
      };
    } catch (error) {
      console.error("Failed to get return statistics:", error);
      throw error;
    }
  }

  /**
   * Export returns to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters
   * @param {string} user
   */
  async exportReturns(format = "json", filters = {}, user = "system") {
    try {
      const returns = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Reference No",
          "Sale ID",
          "Customer",
          "Reason",
          "Refund Method",
          "Total Amount",
          "Status",
          "Created At",
        ];
        const rows = returns.map((r) => [
          r.id,
          r.referenceNo || "",
          // @ts-ignore
          r.sale?.id || "",
          // @ts-ignore
          r.customer?.name || "",
          r.reason || "",
          r.refundMethod,
          r.totalAmount,
          r.status,
          // @ts-ignore
          new Date(r.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `returns_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: returns,
          filename: `returns_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      // @ts-ignore
      await auditLogger.logExport("ReturnRefund", format, filters, user);
      console.log(`Exported ${returns.length} returns in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export returns:", error);
      throw error;
    }
  }
}

// Singleton instance
const returnRefundService = new ReturnRefundService();
module.exports = returnRefundService;
