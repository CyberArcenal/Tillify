// src/main/ipc/purchase/index.ipc.js - Purchase Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/datasource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class PurchaseHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllPurchases = this.importHandler("./get/all.ipc");
    this.getPurchaseById = this.importHandler("./get/by_id.ipc");
    this.getPurchasesByStatus = this.importHandler("./get/by_status.ipc");
    this.getPurchasesBySupplier = this.importHandler("./get/by_supplier.ipc");
    this.getPurchasesByDate = this.importHandler("./get/by_date.ipc");
    this.getPurchaseStatistics = this.importHandler("./get/statistics.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createPurchase = this.importHandler("./create.ipc");
    this.updatePurchase = this.importHandler("./update.ipc");
    this.deletePurchase = this.importHandler("./delete.ipc");
    this.updatePurchaseStatus = this.importHandler("./update_status.ipc");

    // 📊 ADDITIONAL HANDLERS
    this.getPurchaseItems = this.importHandler("./get/items.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreatePurchases = this.importHandler("./bulk_create.ipc");
    this.exportPurchasesToCSV = this.importHandler("./export_csv.ipc");
  }

  importHandler(path) {
    try {
      const fullPath = require.resolve(`./${path}`, { paths: [__dirname] });
      return require(fullPath);
    } catch (error) {
      console.warn(`[PurchaseHandler] Failed to load handler: ${path}`, error.message);
      return async () => ({
        status: false,
        message: `Handler not implemented: ${path}`,
        data: null,
      });
    }
  }

  async handleRequest(event, payload) {
    try {
      const method = payload.method;
      const params = payload.params || {};

      if (logger) logger.info(`PurchaseHandler: ${method}`, { params });

      switch (method) {
        // 📋 READ-ONLY
        case "getAllPurchases":
          return await this.getAllPurchases(params);
        case "getPurchaseById":
          return await this.getPurchaseById(params);
        case "getPurchasesByStatus":
          return await this.getPurchasesByStatus(params);
        case "getPurchasesBySupplier":
          return await this.getPurchasesBySupplier(params);
        case "getPurchasesByDate":
          return await this.getPurchasesByDate(params);
        case "getPurchaseStatistics":
          return await this.getPurchaseStatistics(params);
        case "getPurchaseItems":
          return await this.getPurchaseItems(params);

        // ✏️ WRITE
        case "createPurchase":
          return await this.handleWithTransaction(this.createPurchase, params);
        case "updatePurchase":
          return await this.handleWithTransaction(this.updatePurchase, params);
        case "deletePurchase":
          return await this.handleWithTransaction(this.deletePurchase, params);
        case "updatePurchaseStatus":
          return await this.handleWithTransaction(this.updatePurchaseStatus, params);

        // 🔄 BATCH
        case "bulkCreatePurchases":
          return await this.handleWithTransaction(this.bulkCreatePurchases, params);
        case "exportPurchasesToCSV":
          return await this.exportPurchasesToCSV(params);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("PurchaseHandler error:", error);
      if (logger) logger.error("PurchaseHandler error:", error);
      return {
        status: false,
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

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

  async logActivity(userId, action, description, qr = null) {
    const { saveDb } = require("../../../utils/dbUtils/dbActions");
    try {
      let activityRepo = qr
        ? qr.manager.getRepository(AuditLog)
        : AppDataSource.getRepository(AuditLog);

      const activity = activityRepo.create({
        user: userId,
        action,
        description,
        entity: "Purchase",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log purchase activity:", error);
      if (logger) logger.warn("Failed to log purchase activity:", error);
    }
  }
}

const purchaseHandler = new PurchaseHandler();

ipcMain.handle(
  "purchase",
  withErrorHandling(purchaseHandler.handleRequest.bind(purchaseHandler), "IPC:purchase")
);

module.exports = { PurchaseHandler, purchaseHandler };