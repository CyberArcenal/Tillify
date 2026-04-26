// services/ReturnRefundService.js
const auditLogger = require("../utils/auditLogger");
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
   * Helper: get a repository (transactional if queryRunner provided)
   * @param {import("typeorm").QueryRunner | null} qr
   * @param {Function} entityClass
   * @returns {import("typeorm").Repository<any>}
   */
  _getRepo(qr, entityClass) {
    if (qr) {
      return qr.manager.getRepository(entityClass);
    }
    const { AppDataSource } = require("../main/db/datasource");
    return AppDataSource.getRepository(entityClass);
  }

  /**
   * Create a new return/refund with items
   * @param {Object} returnData - Return data including items
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async create(returnData, user = "system", qr = null) {
    const { saveDb } = require("../utils/dbUtils/dbActions");
    const ReturnRefund = require("../entities/ReturnRefund");
    const Sale = require("../entities/Sale");
    const Customer = require("../entities/Customer");
    const Product = require("../entities/Product");

    const returnRepo = this._getRepo(qr, ReturnRefund);
    const saleRepo = this._getRepo(qr, Sale);
    const customerRepo = this._getRepo(qr, Customer);
    const productRepo = this._getRepo(qr, Product);

    try {
      const refundsAllowed = await allowRefunds();
      if (!refundsAllowed) {
        throw new Error("Refunds are disabled in system settings.");
      }

      const validation = validateReturnData(returnData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        referenceNo,
        saleId,
        customerId,
        reason = null,
        refundMethod,
        status = "pending",
        items = [],
      } = returnData;

      console.log(`Creating return: Reference ${referenceNo}`);

      const sale = await saleRepo.findOne({ where: { id: saleId } });
      if (!sale) {
        throw new Error(`Sale with ID ${saleId} not found`);
      }

      if (sale.status !== "paid") {
        throw new Error(
          `Only paid sales can be refunded. Current status: ${sale.status}`
        );
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

      const customer = await customerRepo.findOne({
        where: { id: customerId },
      });
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found`);
      }

      if (referenceNo) {
        const existing = await returnRepo.findOne({ where: { referenceNo } });
        if (existing) {
          throw new Error(
            `Return with reference "${referenceNo}" already exists`
          );
        }
      }

      const returnItems = [];
      let totalAmount = 0;
      for (const item of items) {
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

      const returnRefund = returnRepo.create({
        referenceNo: referenceNo || generateReturnReference(),
        sale,
        customer,
        reason,
        refundMethod,
        totalAmount,
        status,
        items: returnItems,
        createdAt: new Date(),
      });

      const savedReturn = await saveDb(returnRepo, returnRefund);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "CREATE",
          entity: "ReturnRefund",
          entityId: savedReturn.id,
          user,
          description: `Created return ${savedReturn.referenceNo}`,
        });
      } else {
        await auditLogger.logCreate(
          "ReturnRefund",
          savedReturn.id,
          savedReturn,
          user
        );
      }

      console.log(
        `Return created: #${savedReturn.id} - ${savedReturn.referenceNo}`
      );
      return savedReturn;
    } catch (error) {
      console.error("Failed to create return:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing return
   * @param {number} id - Return ID
   * @param {Object} returnData - Updated fields (items not allowed if processed)
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async update(id, returnData, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const ReturnRefund = require("../entities/ReturnRefund");
    const Sale = require("../entities/Sale");
    const Customer = require("../entities/Customer");
    const Product = require("../entities/Product");

    const returnRepo = this._getRepo(qr, ReturnRefund);
    const saleRepo = this._getRepo(qr, Sale);
    const customerRepo = this._getRepo(qr, Customer);
    const productRepo = this._getRepo(qr, Product);

    try {
      const existingReturn = await returnRepo.findOne({
        where: { id },
        relations: ["sale", "customer", "items", "items.product"],
      });
      if (!existingReturn) {
        throw new Error(`Return with ID ${id} not found`);
      }

      if (existingReturn.status === "processed") {
        throw new Error("Cannot update a processed return");
      }
      if (existingReturn.status === "cancelled") {
        throw new Error("Cannot update a cancelled return");
      }

      const oldData = { ...existingReturn };
      const oldStatus = existingReturn.status;

      if (returnData.saleId && returnData.saleId !== existingReturn.sale.id) {
        const sale = await saleRepo.findOne({
          where: { id: returnData.saleId },
        });
        if (!sale) {
          throw new Error(`Sale with ID ${returnData.saleId} not found`);
        }
        existingReturn.sale = sale;
      }

      if (
        returnData.customerId &&
        returnData.customerId !== existingReturn.customer.id
      ) {
        const customer = await customerRepo.findOne({
          where: { id: returnData.customerId },
        });
        if (!customer) {
          throw new Error(
            `Customer with ID ${returnData.customerId} not found`
          );
        }
        existingReturn.customer = customer;
      }

      if (
        returnData.referenceNo &&
        returnData.referenceNo !== existingReturn.referenceNo
      ) {
        const existing = await returnRepo.findOne({
          where: { referenceNo: returnData.referenceNo },
        });
        if (existing) {
          throw new Error(
            `Return with reference "${returnData.referenceNo}" already exists`
          );
        }
        existingReturn.referenceNo = returnData.referenceNo;
      }

      if (returnData.items) {
        if (existingReturn.status !== "pending") {
          throw new Error("Can only update items for pending returns");
        }

        const validation = validateReturnData({ items: returnData.items });
        if (!validation.valid) {
          throw new Error(validation.errors.join(", "));
        }

        if (existingReturn.items && existingReturn.items.length > 0) {
          existingReturn.items = [];
        }

        const newItems = [];
        let totalAmount = 0;
        for (const item of returnData.items) {
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
        existingReturn.items = newItems;
        existingReturn.totalAmount = totalAmount;
      }

      if (returnData.reason !== undefined)
        existingReturn.reason = returnData.reason;
      if (returnData.refundMethod)
        existingReturn.refundMethod = returnData.refundMethod;

      const newStatus = returnData.status;
      if (newStatus && newStatus !== oldStatus) {
        if (oldStatus === "cancelled") {
          throw new Error("Cannot change status of cancelled return");
        }
        if (oldStatus === "processed" && newStatus !== "processed") {
          throw new Error("Cannot revert processed return");
        }

        if (newStatus === "processed") {
          const refundsAllowed = await allowRefunds();
          if (!refundsAllowed) {
            throw new Error(
              "Refunds are disabled in system settings. Cannot process return."
            );
          }

          const windowDaysSetting = await refundWindowDays();
          const saleDate = new Date(existingReturn.sale.timestamp);
          const now = new Date();
          const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
          if (diffDays > windowDaysSetting) {
            throw new Error(
              `Refund window is ${windowDaysSetting} days. This sale is ${diffDays} days old. Cannot process.`
            );
          }

          if (existingReturn.sale.status !== "paid") {
            throw new Error(
              `Cannot process return for sale with status ${existingReturn.sale.status}`
            );
          }
        }

        existingReturn.status = newStatus;
      }

      existingReturn.updatedAt = new Date();
      const savedReturn = await updateDb(returnRepo, existingReturn);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "UPDATE",
          entity: "ReturnRefund",
          entityId: id,
          user,
          description: `Updated return #${id}`,
        });
      } else {
        await auditLogger.logUpdate(
          "ReturnRefund",
          id,
          oldData,
          savedReturn,
          user
        );
      }

      console.log(`Return updated: #${id}`);
      return savedReturn;
    } catch (error) {
      console.error("Failed to update return:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a return (set status to cancelled)
   * @param {number} id - Return ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async delete(id, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const ReturnRefund = require("../entities/ReturnRefund");
    const returnRepo = this._getRepo(qr, ReturnRefund);

    try {
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

      const savedReturn = await updateDb(returnRepo, returnRefund);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "DELETE",
          entity: "ReturnRefund",
          entityId: id,
          user,
          description: `Cancelled return #${id}`,
        });
      } else {
        await auditLogger.logDelete("ReturnRefund", id, oldData, user);
      }

      console.log(`Return cancelled: #${id}`);
      return savedReturn;
    } catch (error) {
      console.error("Failed to delete return:", error.message);
      throw error;
    }
  }

  /**
   * Hard delete a return – only allowed if not processed or if no inventory impact?
   * @param {number} id - Return ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async permanentlyDelete(id, user = "system", qr = null) {
    const { removeDb } = require("../utils/dbUtils/dbActions");
    const ReturnRefund = require("../entities/ReturnRefund");
    const returnRepo = this._getRepo(qr, ReturnRefund);

    const returnRefund = await returnRepo.findOne({
      where: { id },
      relations: ["items"],
    });
    if (!returnRefund) {
      throw new Error(`Return with ID ${id} not found`);
    }

    // Prevent hard delete if processed (because inventory may have been updated)
    if (returnRefund.status === "processed") {
      throw new Error("Cannot permanently delete a processed return");
    }

    await removeDb(returnRepo, returnRefund);

    if (qr) {
      const auditRepo = qr.manager.getRepository("AuditLog");
      await auditRepo.save({
        action: "DELETE",
        entity: "ReturnRefund",
        entityId: id,
        user,
        description: `Permanently deleted return #${id}`,
      });
    } else {
      await auditLogger.logDelete("ReturnRefund", id, returnRefund, user);
    }

    console.log(`Return #${id} permanently deleted`);
  }

  /**
   * Find return by ID
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findById(id, qr = null) {
    const ReturnRefund = require("../entities/ReturnRefund");
    const returnRepo = this._getRepo(qr, ReturnRefund);

    try {
      const returnRefund = await returnRepo.findOne({
        where: { id },
        relations: ["sale", "customer", "items", "items.product"],
      });
      if (!returnRefund) {
        throw new Error(`Return with ID ${id} not found`);
      }
      await auditLogger.logView("ReturnRefund", id, "system");
      return returnRefund;
    } catch (error) {
      console.error("Failed to find return:", error.message);
      throw error;
    }
  }

  /**
   * Find all returns with optional filters
   * @param {Object} options - Filter options
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findAll(options = {}, qr = null) {
    const ReturnRefund = require("../entities/ReturnRefund");
    const returnRepo = this._getRepo(qr, ReturnRefund);

    try {
      const queryBuilder = returnRepo
        .createQueryBuilder("return")
        .leftJoinAndSelect("return.sale", "sale")
        .leftJoinAndSelect("return.customer", "customer")
        .leftJoinAndSelect("return.items", "items")
        .leftJoinAndSelect("items.product", "product");

      if (options.status) {
        queryBuilder.andWhere("return.status = :status", {
          status: options.status,
        });
      }

      if (options.saleId) {
        queryBuilder.andWhere("sale.id = :saleId", { saleId: options.saleId });
      }

      if (options.customerId) {
        queryBuilder.andWhere("customer.id = :customerId", {
          customerId: options.customerId,
        });
      }

      if (options.startDate) {
        queryBuilder.andWhere("return.createdAt >= :startDate", {
          startDate: options.startDate,
        });
      }
      if (options.endDate) {
        queryBuilder.andWhere("return.createdAt <= :endDate", {
          endDate: options.endDate,
        });
      }

      if (options.search) {
        queryBuilder.andWhere(
          "(return.referenceNo LIKE :search OR return.reason LIKE :search)",
          { search: `%${options.search}%` }
        );
      }

      const sortBy = options.sortBy || "createdAt";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`return.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStatistics(qr = null) {
    const ReturnRefund = require("../entities/ReturnRefund");
    const returnRepo = this._getRepo(qr, ReturnRefund);

    try {
      const statusCounts = await returnRepo
        .createQueryBuilder("return")
        .select("return.status", "status")
        .addSelect("COUNT(return.id)", "count")
        .groupBy("return.status")
        .getRawMany();

      const totalProcessed = await returnRepo
        .createQueryBuilder("return")
        .select("SUM(return.totalAmount)", "total")
        .where("return.status = :status", { status: "processed" })
        .getRawOne();

      const avgAmount = await returnRepo
        .createQueryBuilder("return")
        .select("AVG(return.totalAmount)", "average")
        .where("return.status = :status", { status: "processed" })
        .getRawOne();

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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportReturns(
    format = "json",
    filters = {},
    user = "system",
    qr = null
  ) {
    try {
      const returns = await this.findAll(filters, qr);

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
          r.sale?.id || "",
          r.customer?.name || "",
          r.reason || "",
          r.refundMethod,
          r.totalAmount,
          r.status,
          new Date(r.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `returns_export_${
            new Date().toISOString().split("T")[0]
          }.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: returns,
          filename: `returns_export_${
            new Date().toISOString().split("T")[0]
          }.json`,
        };
      }

      await auditLogger.logExport("ReturnRefund", format, filters, user);
      console.log(`Exported ${returns.length} returns in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export returns:", error);
      throw error;
    }
  }

  /**
   * Bulk create multiple returns
   * @param {Array<Object>} returnsArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(returnsArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const returnData of returnsArray) {
      try {
        const saved = await this.create(returnData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ return: returnData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Bulk update multiple returns
   * @param {Array<{ id: number, updates: Object }>} updatesArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkUpdate(updatesArray, user = "system", qr = null) {
    const results = { updated: [], errors: [] };
    for (const { id, updates } of updatesArray) {
      try {
        const saved = await this.update(id, updates, user, qr);
        results.updated.push(saved);
      } catch (err) {
        results.errors.push({ id, updates, error: err.message });
      }
    }
    return results;
  }

  /**
   * Import returns from a CSV file
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
        const returnData = {
          referenceNo: record.referenceNo || undefined,
          saleId: parseInt(record.saleId, 10),
          customerId: parseInt(record.customerId, 10),
          reason: record.reason || null,
          refundMethod: record.refundMethod,
          status: record.status || "pending",
          items: items,
        };
        const validation = validateReturnData(returnData);
        if (!validation.valid) throw new Error(validation.errors.join(", "));
        const saved = await this.create(returnData, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }
}

// Singleton instance
const returnRefundService = new ReturnRefundService();
module.exports = returnRefundService;

function generateReturnReference() {
  const prefix = "RET";
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}-${timestamp}-${random}`;
}
