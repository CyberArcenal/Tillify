// src/main/ipc/customer/index.ipc.js - Customer Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class CustomerHandler {
  constructor() {
    // Initialize all handlers
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllCustomers = this.importHandler("./get/all.ipc");
    this.getCustomerById = this.importHandler("./get/by_id.ipc");
    this.getCustomerByContact = this.importHandler("./get/by_contact.ipc");
    this.getCustomersByName = this.importHandler("./get/by_name.ipc");
    this.getActiveCustomers = this.importHandler("./get/active.ipc");
    this.getCustomerLoyalty = this.importHandler("./get/loyalty.ipc");
    this.getCustomerStatistics = this.importHandler("./get/statistics.ipc");
    this.searchCustomers = this.importHandler("./search.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createCustomer = this.importHandler("./create.ipc");
    this.updateCustomer = this.importHandler("./update.ipc");
    this.deleteCustomer = this.importHandler("./delete.ipc"); // soft delete if applicable
    this.updateLoyaltyPoints = this.importHandler("./update_loyalty.ipc");

    // 📊 LOYALTY & TRANSACTION HANDLERS
    this.getLoyaltyTransactions = this.importHandler(
      "./get/loyalty_transactions.ipc",
    );
    this.addLoyaltyPoints = this.importHandler("./add_loyalty_points.ipc");
    this.redeemLoyaltyPoints = this.importHandler(
      "./redeem_loyalty_points.ipc",
    );

    // 🔄 BATCH OPERATIONS
    this.bulkCreateCustomers = this.importHandler("./bulk_create.ipc");
    this.bulkUpdateCustomers = this.importHandler("./bulk_update.ipc");
    this.importCustomersFromCSV = this.importHandler("./import_csv.ipc");
    this.exportCustomersToCSV = this.importHandler("./export_csv.ipc");

    // 📄 REPORT HANDLERS
    this.generateCustomerReport = this.importHandler("./generate_report.ipc");
    this.generateLoyaltyReport = this.importHandler("./loyalty_report.ipc");

    this.getTotalSpentForCustomers = this.importHandler(
      "./get/total_spent_for_customers.ipc",
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
        `[CustomerHandler] Failed to load handler: ${path}`,
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
        logger.info(`CustomerHandler: ${method}`, { params });
      }

      // ROUTE REQUESTS
      switch (method) {
        // 📋 READ-ONLY OPERATIONS
        case "getAllCustomers":
          return await this.getAllCustomers(enrichedParams);

        case "getCustomerById":
          return await this.getCustomerById(enrichedParams);

        case "getCustomerByContact":
          return await this.getCustomerByContact(enrichedParams);

        case "getCustomersByName":
          return await this.getCustomersByName(enrichedParams);

        case "getActiveCustomers":
          return await this.getActiveCustomers(enrichedParams);

        case "getCustomerLoyalty":
          return await this.getCustomerLoyalty(enrichedParams);

        case "getCustomerStatistics":
          return await this.getCustomerStatistics(enrichedParams);

        case "searchCustomers":
          return await this.searchCustomers(enrichedParams);

        // ✏️ WRITE OPERATIONS
        case "createCustomer":
          return await this.handleWithTransaction(
            this.createCustomer,
            // @ts-ignore
            enrichedParams,
          );

        case "updateCustomer":
          return await this.handleWithTransaction(
            this.updateCustomer,
            // @ts-ignore
            enrichedParams,
          );

        case "deleteCustomer":
          return await this.handleWithTransaction(
            this.deleteCustomer,
            // @ts-ignore
            enrichedParams,
          );

        case "updateLoyaltyPoints":
          return await this.handleWithTransaction(
            this.updateLoyaltyPoints,
            // @ts-ignore
            enrichedParams,
          );

        // 📊 LOYALTY & TRANSACTION OPERATIONS
        case "getLoyaltyTransactions":
          return await this.getLoyaltyTransactions(enrichedParams);

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
        case "bulkCreateCustomers":
          return await this.handleWithTransaction(
            this.bulkCreateCustomers,
            // @ts-ignore
            enrichedParams,
          );

        case "bulkUpdateCustomers":
          return await this.handleWithTransaction(
            this.bulkUpdateCustomers,
            // @ts-ignore
            enrichedParams,
          );

        case "importCustomersFromCSV":
          return await this.handleWithTransaction(
            this.importCustomersFromCSV,
            // @ts-ignore
            enrichedParams,
          );

        case "exportCustomersToCSV":
          return await this.exportCustomersToCSV(enrichedParams);

        // 📄 REPORT OPERATIONS
        case "generateCustomerReport":
          return await this.generateCustomerReport(enrichedParams);

        case "generateLoyaltyReport":
          return await this.generateLoyaltyReport(enrichedParams);

        case "getTotalSpentForCustomers":
          return await this.getTotalSpentForCustomers(enrichedParams);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("CustomerHandler error:", error);
      if (logger) {
        // @ts-ignore
        logger.error("CustomerHandler error:", error);
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
        entity: "Customer",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log customer activity:", error);
      if (logger) {
        // @ts-ignore
        logger.warn("Failed to log customer activity:", error);
      }
    }
  }
}

// Register IPC handler
const customerHandler = new CustomerHandler();

ipcMain.handle(
  "customer",
  withErrorHandling(
    // @ts-ignore
    customerHandler.handleRequest.bind(customerHandler),
    "IPC:customer",
  ),
);

module.exports = { CustomerHandler, customerHandler };
