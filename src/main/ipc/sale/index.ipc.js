// src/main/ipc/sale/index.ipc.js - Sale Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class SaleHandler {
  constructor() {
    // Initialize all handlers
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllSales = this.importHandler("./get/all.ipc");
    this.getSaleById = this.importHandler("./get/by_id.ipc");
    this.getSalesByCustomer = this.importHandler("./get/by_customer.ipc");
    this.getSalesByDate = this.importHandler("./get/by_date.ipc");
    this.getActiveSales = this.importHandler("./get/active.ipc"); // initiated sales
    this.getSaleStatistics = this.importHandler("./get/statistics.ipc");
    this.searchSales = this.importHandler("./search.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createSale = this.importHandler("./create.ipc");
    this.updateSale = this.importHandler("./update.ipc");
    this.deleteSale = this.importHandler("./delete.ipc");
    this.markAsPaid = this.importHandler("./mark_as_paid.ipc");
    this.voidSale = this.importHandler("./void.ipc");
    this.refundSale = this.importHandler("./refund.ipc");

    // 📊 STATISTICS HANDLERS (additional)
    this.getDailySales = this.importHandler("./get/daily.ipc");
    this.getSalesRevenue = this.importHandler("./get/revenue.ipc");
    this.getTopProducts = this.importHandler("./get/top_products.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreateSales = this.importHandler("./bulk_create.ipc");
    this.bulkUpdateSales = this.importHandler("./bulk_update.ipc");
    this.importSalesFromCSV = this.importHandler("./import_csv.ipc");
    this.exportSalesToCSV = this.importHandler("./export_csv.ipc");

    // 📄 REPORT HANDLERS
    this.generateReceipt = this.importHandler("./generate_receipt.ipc");
    this.generateSalesReport = this.importHandler("./generate_report.ipc");
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
        `[SaleHandler] Failed to load handler: ${path}`,
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
        logger.info(`SaleHandler: ${method}`, { params });
      }

      // ROUTE REQUESTS
      switch (method) {
        // 📋 READ-ONLY OPERATIONS
        case "getAllSales":
          return await this.getAllSales(enrichedParams);

        case "getSaleById":
          return await this.getSaleById(enrichedParams);

        case "getSalesByCustomer":
          return await this.getSalesByCustomer(enrichedParams);

        case "getSalesByDate":
          return await this.getSalesByDate(enrichedParams);

        case "getActiveSales":
          return await this.getActiveSales(enrichedParams);

        case "getSaleStatistics":
          return await this.getSaleStatistics(enrichedParams);

        case "searchSales":
          return await this.searchSales(enrichedParams);

        // ✏️ WRITE OPERATIONS
        case "createSale":
          return await this.handleWithTransaction(
            this.createSale,
            // @ts-ignore
            enrichedParams,
          );

        case "updateSale":
          return await this.handleWithTransaction(
            this.updateSale,
            // @ts-ignore
            enrichedParams,
          );

        case "deleteSale":
          return await this.handleWithTransaction(
            this.deleteSale,
            // @ts-ignore
            enrichedParams,
          );

        case "markAsPaid":
          return await this.handleWithTransaction(
            this.markAsPaid,
            // @ts-ignore
            enrichedParams,
          );

        case "voidSale":
          return await this.handleWithTransaction(
            this.voidSale,
            // @ts-ignore
            enrichedParams,
          );

        case "refundSale":
          return await this.handleWithTransaction(
            this.refundSale,
            // @ts-ignore
            enrichedParams,
          );

        // 📊 STATISTICS OPERATIONS
        case "getDailySales":
          return await this.getDailySales(enrichedParams);

        case "getSalesRevenue":
          return await this.getSalesRevenue(enrichedParams);

        case "getTopProducts":
          return await this.getTopProducts(enrichedParams);

        // 🔄 BATCH OPERATIONS
        case "bulkCreateSales":
          return await this.handleWithTransaction(
            this.bulkCreateSales,
            // @ts-ignore
            enrichedParams,
          );

        case "bulkUpdateSales":
          return await this.handleWithTransaction(
            this.bulkUpdateSales,
            // @ts-ignore
            enrichedParams,
          );

        case "importSalesFromCSV":
          return await this.handleWithTransaction(
            this.importSalesFromCSV,
            // @ts-ignore
            enrichedParams,
          );

        case "exportSalesToCSV":
          return await this.exportSalesToCSV(enrichedParams);

        // 📄 REPORT OPERATIONS
        case "generateReceipt":
          return await this.generateReceipt(enrichedParams);

        case "generateSalesReport":
          return await this.generateSalesReport(enrichedParams);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("SaleHandler error:", error);
      if (logger) {
        // @ts-ignore
        logger.error("SaleHandler error:", error);
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
        entity: "Sale",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log sale activity:", error);
      if (logger) {
        // @ts-ignore
        logger.warn("Failed to log sale activity:", error);
      }
    }
  }
}

// Register IPC handler
const saleHandler = new SaleHandler();

ipcMain.handle(
  "sale",
  withErrorHandling(
    // @ts-ignore
    saleHandler.handleRequest.bind(saleHandler),
    "IPC:sale",
  ),
);

module.exports = { SaleHandler, saleHandler };
