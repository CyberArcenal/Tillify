// src/main/ipc/returnrefund/index.ipc.js - Return/Refund Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class ReturnRefundHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllReturns = this.importHandler("./get/all.ipc");
    this.getReturnById = this.importHandler("./get/by_id.ipc");
    this.getReturnsByStatus = this.importHandler("./get/by_status.ipc");
    this.getReturnsByCustomer = this.importHandler("./get/by_customer.ipc");
    this.getReturnsBySale = this.importHandler("./get/by_sale.ipc");
    this.getReturnsByDate = this.importHandler("./get/by_date.ipc");
    this.getReturnStatistics = this.importHandler("./get/statistics.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createReturn = this.importHandler("./create.ipc");
    this.updateReturn = this.importHandler("./update.ipc");
    this.deleteReturn = this.importHandler("./delete.ipc");
    this.updateReturnStatus = this.importHandler("./update_status.ipc");

    // 📊 ADDITIONAL HANDLERS
    this.getReturnItems = this.importHandler("./get/items.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreateReturns = this.importHandler("./bulk_create.ipc");
    this.exportReturnsToCSV = this.importHandler("./export_csv.ipc");
  }

  importHandler(path) {
    try {
      const fullPath = require.resolve(`./${path}`, { paths: [__dirname] });
      return require(fullPath);
    } catch (error) {
      console.warn(`[ReturnRefundHandler] Failed to load handler: ${path}`, error.message);
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

      if (logger) logger.info(`ReturnRefundHandler: ${method}`, { params });

      switch (method) {
        // 📋 READ-ONLY
        case "getAllReturns":
          return await this.getAllReturns(params);
        case "getReturnById":
          return await this.getReturnById(params);
        case "getReturnsByStatus":
          return await this.getReturnsByStatus(params);
        case "getReturnsByCustomer":
          return await this.getReturnsByCustomer(params);
        case "getReturnsBySale":
          return await this.getReturnsBySale(params);
        case "getReturnsByDate":
          return await this.getReturnsByDate(params);
        case "getReturnStatistics":
          return await this.getReturnStatistics(params);
        case "getReturnItems":
          return await this.getReturnItems(params);

        // ✏️ WRITE
        case "createReturn":
          return await this.handleWithTransaction(this.createReturn, params);
        case "updateReturn":
          return await this.handleWithTransaction(this.updateReturn, params);
        case "deleteReturn":
          return await this.handleWithTransaction(this.deleteReturn, params);
        case "updateReturnStatus":
          return await this.handleWithTransaction(this.updateReturnStatus, params);

        // 🔄 BATCH
        case "bulkCreateReturns":
          return await this.handleWithTransaction(this.bulkCreateReturns, params);
        case "exportReturnsToCSV":
          return await this.exportReturnsToCSV(params);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("ReturnRefundHandler error:", error);
      if (logger) logger.error("ReturnRefundHandler error:", error);
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
        entity: "ReturnRefund",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log return activity:", error);
      if (logger) logger.warn("Failed to log return activity:", error);
    }
  }
}

const returnRefundHandler = new ReturnRefundHandler();

ipcMain.handle(
  "returnRefund",
  withErrorHandling(returnRefundHandler.handleRequest.bind(returnRefundHandler), "IPC:returnrefund")
);

module.exports = { ReturnRefundHandler, returnRefundHandler };