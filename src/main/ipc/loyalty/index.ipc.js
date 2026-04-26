// src/main/ipc/loyalty/index.ipc.js - Loyalty Transaction Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/datasource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class LoyaltyHandler {
  constructor() {
    // Initialize all handlers
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllLoyaltyTransactions = this.importHandler("./get/all.ipc");
    this.getLoyaltyTransactionById = this.importHandler("./get/by_id.ipc");
    this.getLoyaltyTransactionsByCustomer = this.importHandler(
      "./get/by_customer.ipc",
    );
    this.getLoyaltyTransactionsBySale = this.importHandler("./get/by_sale.ipc");
    this.getLoyaltyStatistics = this.importHandler("./get/statistics.ipc");
    this.searchLoyaltyTransactions = this.importHandler("./search.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createLoyaltyTransaction = this.importHandler("./create.ipc");
    this.reverseLoyaltyTransaction = this.importHandler("./reverse.ipc");

    // 📊 CUSTOMER LOYALTY HANDLERS
    this.getCustomerLoyaltySummary = this.importHandler(
      "./get/customer_summary.ipc",
    );
    this.addLoyaltyPoints = this.importHandler("./add_points.ipc");
    this.redeemLoyaltyPoints = this.importHandler("./redeem_points.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreateLoyaltyTransactions =
      this.importHandler("./bulk_create.ipc");
    this.exportLoyaltyTransactionsToCSV =
      this.importHandler("./export_csv.ipc");

    // 📄 REPORT HANDLERS
    this.generateLoyaltyReport = this.importHandler("./generate_report.ipc");
    this.generatePointsHistory = this.importHandler("./points_history.ipc");
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
        `[LoyaltyHandler] Failed to load handler: ${path}`,
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
        logger.info(`LoyaltyHandler: ${method}`, { params });
      }

      // ROUTE REQUESTS
      switch (method) {
        // 📋 READ-ONLY OPERATIONS
        case "getAllLoyaltyTransactions":
          return await this.getAllLoyaltyTransactions(enrichedParams);

        case "getLoyaltyTransactionById":
          return await this.getLoyaltyTransactionById(enrichedParams);

        case "getLoyaltyTransactionsByCustomer":
          return await this.getLoyaltyTransactionsByCustomer(enrichedParams);

        case "getLoyaltyTransactionsBySale":
          return await this.getLoyaltyTransactionsBySale(enrichedParams);

        case "getLoyaltyStatistics":
          return await this.getLoyaltyStatistics(enrichedParams);

        case "searchLoyaltyTransactions":
          return await this.searchLoyaltyTransactions(enrichedParams);

        // ✏️ WRITE OPERATIONS
        case "createLoyaltyTransaction":
          return await this.handleWithTransaction(
            this.createLoyaltyTransaction,
            // @ts-ignore
            enrichedParams,
          );

        case "reverseLoyaltyTransaction":
          return await this.handleWithTransaction(
            this.reverseLoyaltyTransaction,
            // @ts-ignore
            enrichedParams,
          );

        // 📊 CUSTOMER LOYALTY OPERATIONS
        case "getCustomerLoyaltySummary":
          return await this.getCustomerLoyaltySummary(enrichedParams);

        case "addLoyaltyPoints":
          return await this.handleWithTransaction(
            this.addLoyaltyPoints,
            // @ts-ignore
            enrichedParams,
          );

        case "redeemLoyaltyPoints":
          return await this.handleWithTransaction(
            this.redeemLoyaltyPoints,
            // @ts-ignore
            enrichedParams,
          );

        // 🔄 BATCH OPERATIONS
        case "bulkCreateLoyaltyTransactions":
          return await this.handleWithTransaction(
            this.bulkCreateLoyaltyTransactions,
            // @ts-ignore
            enrichedParams,
          );

        case "exportLoyaltyTransactionsToCSV":
          return await this.exportLoyaltyTransactionsToCSV(enrichedParams);

        // 📄 REPORT OPERATIONS
        case "generateLoyaltyReport":
          return await this.generateLoyaltyReport(enrichedParams);

        case "generatePointsHistory":
          return await this.generatePointsHistory(enrichedParams);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("LoyaltyHandler error:", error);
      if (logger) {
        // @ts-ignore
        logger.error("LoyaltyHandler error:", error);
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
        entity: "LoyaltyTransaction",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log loyalty activity:", error);
      if (logger) {
        // @ts-ignore
        logger.warn("Failed to log loyalty activity:", error);
      }
    }
  }
}

// Register IPC handler
const loyaltyHandler = new LoyaltyHandler();

ipcMain.handle(
  "loyalty",
  withErrorHandling(
    // @ts-ignore
    loyaltyHandler.handleRequest.bind(loyaltyHandler),
    "IPC:loyalty",
  ),
);

module.exports = { LoyaltyHandler, loyaltyHandler };
