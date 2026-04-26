// src/main/ipc/supplier/index.ipc.js - Supplier Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class SupplierHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllSuppliers = this.importHandler("./get/all.ipc");
    this.getSupplierById = this.importHandler("./get/by_id.ipc");
    this.getActiveSuppliers = this.importHandler("./get/active.ipc");
    this.getSupplierStatistics = this.importHandler("./get/statistics.ipc");
    this.searchSuppliers = this.importHandler("./search.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createSupplier = this.importHandler("./create.ipc");
    this.updateSupplier = this.importHandler("./update.ipc");
    this.deleteSupplier = this.importHandler("./delete.ipc");

    // 📊 ADDITIONAL HANDLERS
    this.getSuppliersWithProductCount = this.importHandler("./get/with_product_count.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreateSuppliers = this.importHandler("./bulk_create.ipc");
    this.exportSuppliersToCSV = this.importHandler("./export_csv.ipc");
  }

  // @ts-ignore
  importHandler(path) {
    try {
      const fullPath = require.resolve(`./${path}`, { paths: [__dirname] });
      return require(fullPath);
    } catch (error) {
      // @ts-ignore
      console.warn(`[SupplierHandler] Failed to load handler: ${path}`, error.message);
      return async () => ({
        status: false,
        message: `Handler not implemented: ${path}`,
        data: null,
      });
    }
  }

  // @ts-ignore
  async handleRequest(event, payload) {
    try {
      const method = payload.method;
      const params = payload.params || {};

      // @ts-ignore
      if (logger) logger.info(`SupplierHandler: ${method}`, { params });

      switch (method) {
        // 📋 READ-ONLY
        case "getAllSuppliers":
          return await this.getAllSuppliers(params);
        case "getSupplierById":
          return await this.getSupplierById(params);
        case "getActiveSuppliers":
          return await this.getActiveSuppliers(params);
        case "getSupplierStatistics":
          return await this.getSupplierStatistics(params);
        case "searchSuppliers":
          return await this.searchSuppliers(params);
        case "getSuppliersWithProductCount":
          return await this.getSuppliersWithProductCount(params);

        // ✏️ WRITE
        case "createSupplier":
          return await this.handleWithTransaction(this.createSupplier, params);
        case "updateSupplier":
          return await this.handleWithTransaction(this.updateSupplier, params);
        case "deleteSupplier":
          return await this.handleWithTransaction(this.deleteSupplier, params);

        // 🔄 BATCH
        case "bulkCreateSuppliers":
          return await this.handleWithTransaction(this.bulkCreateSuppliers, params);
        case "exportSuppliersToCSV":
          return await this.exportSuppliersToCSV(params);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("SupplierHandler error:", error);
      // @ts-ignore
      if (logger) logger.error("SupplierHandler error:", error);
      return {
        status: false,
        // @ts-ignore
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

  // @ts-ignore
  async handleWithTransaction(handler, params) {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await handler(params, queryRunner);
      if (result.status) {
        await queryRunner.commitTransaction();
      } else {
        await queryRunner.rollbackTransaction();
      }
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // @ts-ignore
  async logActivity(userId, action, description, qr = null) {
    const { saveDb } = require("../../../utils/dbUtils/dbActions");
    try {
      let activityRepo = qr
        // @ts-ignore
        ? qr.manager.getRepository(AuditLog)
        : AppDataSource.getRepository(AuditLog);

      const activity = activityRepo.create({
        user: userId,
        action,
        description,
        entity: "Supplier",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log supplier activity:", error);
      // @ts-ignore
      if (logger) logger.warn("Failed to log supplier activity:", error);
    }
  }
}

const supplierHandler = new SupplierHandler();

ipcMain.handle(
  "supplier",
  withErrorHandling(supplierHandler.handleRequest.bind(supplierHandler), "IPC:supplier")
);

module.exports = { SupplierHandler, supplierHandler };