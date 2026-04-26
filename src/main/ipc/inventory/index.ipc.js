// src/main/ipc/inventory/index.ipc.js - Inventory Movement Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class InventoryHandler {
  constructor() {
    // Initialize all handlers
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllInventoryMovements = this.importHandler("./get/all.ipc");
    this.getInventoryMovementById = this.importHandler("./get/by_id.ipc");
    this.getInventoryMovementsByProduct = this.importHandler(
      "./get/by_product.ipc",
    );
    this.getInventoryMovementsBySale = this.importHandler("./get/by_sale.ipc");
    this.getInventoryMovementsByType = this.importHandler("./get/by_type.ipc");
    this.getInventoryStatistics = this.importHandler("./get/statistics.ipc");
    this.searchInventoryMovements = this.importHandler("./search.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createInventoryMovement = this.importHandler("./create.ipc"); // for adjustments
    this.updateInventoryMovement = this.importHandler("./update.ipc");
    this.deleteInventoryMovement = this.importHandler("./delete.ipc");

    // 📊 PRODUCT STOCK HISTORY
    this.getProductStockHistory = this.importHandler("./get/stock_history.ipc");
    this.getStockAlerts = this.importHandler("./get/stock_alerts.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreateInventoryMovements = this.importHandler("./bulk_create.ipc");
    this.exportInventoryMovementsToCSV = this.importHandler("./export_csv.ipc");

    // 📄 REPORT HANDLERS
    this.generateInventoryReport = this.importHandler("./generate_report.ipc");
    this.generateStockValuationReport = this.importHandler(
      "./stock_valuation.ipc",
    );
  }

  /**
   * @param {string} path
   */
  importHandler(path) {
    try {
      // Adjust path to be relative to current file
      const fullPath = require.resolve(`./${path}`, { paths: [__dirname] });
      return require(fullPath);
    } catch (error) {
      console.warn(
        `[InventoryHandler] Failed to load handler: ${path}`,
        // @ts-ignore
        error.message,
      );
      // Return a fallback handler
      return async () => ({
        status: false,
        message: `Handler not implemented: ${path}`,
        data: null,
      });
    }
  }

  /** @param {Electron.IpcMainInvokeEvent} event @param {{ method: any; params: {}; }} payload */
  async handleRequest(event, payload) {
    try {
      const method = payload.method;
      const params = payload.params || {};

      // @ts-ignore
      const enrichedParams = { ...params };

      // Log the request
      if (logger) {
        // @ts-ignore
        logger.info(`InventoryHandler: ${method}`, { params });
      }

      // ROUTE REQUESTS
      switch (method) {
        // 📋 READ-ONLY OPERATIONS
        case "getAllInventoryMovements":
          return await this.getAllInventoryMovements(enrichedParams);

        case "getInventoryMovementById":
          return await this.getInventoryMovementById(enrichedParams);

        case "getInventoryMovementsByProduct":
          return await this.getInventoryMovementsByProduct(enrichedParams);

        case "getInventoryMovementsBySale":
          return await this.getInventoryMovementsBySale(enrichedParams);

        case "getInventoryMovementsByType":
          return await this.getInventoryMovementsByType(enrichedParams);

        case "getInventoryStatistics":
          return await this.getInventoryStatistics(enrichedParams);

        case "searchInventoryMovements":
          return await this.searchInventoryMovements(enrichedParams);

        // ✏️ WRITE OPERATIONS
        case "createInventoryMovement":
          return await this.handleWithTransaction(
            this.createInventoryMovement,
            // @ts-ignore
            enrichedParams,
          );

        case "updateInventoryMovement":
          return await this.handleWithTransaction(
            this.updateInventoryMovement,
            // @ts-ignore
            enrichedParams,
          );

        case "deleteInventoryMovement":
          return await this.handleWithTransaction(
            this.deleteInventoryMovement,
            // @ts-ignore
            enrichedParams,
          );

        // 📊 STOCK HISTORY
        case "getProductStockHistory":
          return await this.getProductStockHistory(enrichedParams);

        case "getStockAlerts":
          return await this.getStockAlerts(enrichedParams);

        // 🔄 BATCH OPERATIONS
        case "bulkCreateInventoryMovements":
          return await this.handleWithTransaction(
            this.bulkCreateInventoryMovements,
            // @ts-ignore
            enrichedParams,
          );

        case "exportInventoryMovementsToCSV":
          return await this.exportInventoryMovementsToCSV(enrichedParams);

        // 📄 REPORT OPERATIONS
        case "generateInventoryReport":
          return await this.generateInventoryReport(enrichedParams);

        case "generateStockValuationReport":
          return await this.generateStockValuationReport(enrichedParams);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("InventoryHandler error:", error);
      if (logger) {
        // @ts-ignore
        logger.error("InventoryHandler error:", error);
      }
      return {
        status: false,
        // @ts-ignore
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

  /**
   * Wrap critical operations in a database transaction
   * @param {(arg0: any, arg1: import("typeorm").QueryRunner) => any} handler
   * @param {{ userId: any; }} params
   */
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

  /**
   * @param {any} user_id
   * @param {any} action
   * @param {any} description
   */
  async logActivity(user_id, action, description, qr = null) {
    const { saveDb } = require("../../../utils/dbUtils/dbActions");
    try {
      let activityRepo;

      if (qr) {
        // @ts-ignore
        activityRepo = qr.manager.getRepository(AuditLog);
      } else {
        activityRepo = AppDataSource.getRepository(AuditLog);
      }

      const activity = activityRepo.create({
        user: user_id,
        action,
        description,
        entity: "InventoryMovement",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log inventory activity:", error);
      if (logger) {
        // @ts-ignore
        logger.warn("Failed to log inventory activity:", error);
      }
    }
  }
}

// Register IPC handler
const inventoryHandler = new InventoryHandler();

ipcMain.handle(
  "inventory",
  withErrorHandling(
    // @ts-ignore
    inventoryHandler.handleRequest.bind(inventoryHandler),
    "IPC:inventory",
  ),
);

module.exports = { InventoryHandler, inventoryHandler };
