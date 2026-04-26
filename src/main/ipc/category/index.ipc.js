// src/main/ipc/category/index.ipc.js - Category Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/datasource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class CategoryHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllCategories = this.importHandler("./get/all.ipc");
    this.getCategoryById = this.importHandler("./get/by_id.ipc");
    this.getActiveCategories = this.importHandler("./get/active.ipc");
    this.getCategoryStatistics = this.importHandler("./get/statistics.ipc");
    this.searchCategories = this.importHandler("./search.ipc");

    // ✏️ WRITE OPERATION HANDLERS
    this.createCategory = this.importHandler("./create.ipc");
    this.updateCategory = this.importHandler("./update.ipc");
    this.deleteCategory = this.importHandler("./delete.ipc");

    // 📊 ADDITIONAL HANDLERS
    this.getCategoriesWithProductCount = this.importHandler("./get/with_product_count.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreateCategories = this.importHandler("./bulk_create.ipc");
    this.exportCategoriesToCSV = this.importHandler("./export_csv.ipc");
  }

  /**
   * @param {string} path
   */
  importHandler(path) {
    try {
      const fullPath = require.resolve(`./${path}`, { paths: [__dirname] });
      return require(fullPath);
    } catch (error) {
      console.warn(`[CategoryHandler] Failed to load handler: ${path}`, error.message);
      return async () => ({
        status: false,
        message: `Handler not implemented: ${path}`,
        data: null,
      });
    }
  }

  /**
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {{ method: string; params?: any }} payload
   */
  async handleRequest(event, payload) {
    try {
      const method = payload.method;
      const params = payload.params || {};

      if (logger) logger.info(`CategoryHandler: ${method}`, { params });

      switch (method) {
        // 📋 READ-ONLY
        case "getAllCategories":
          return await this.getAllCategories(params);
        case "getCategoryById":
          return await this.getCategoryById(params);
        case "getActiveCategories":
          return await this.getActiveCategories(params);
        case "getCategoryStatistics":
          return await this.getCategoryStatistics(params);
        case "searchCategories":
          return await this.searchCategories(params);
        case "getCategoriesWithProductCount":
          return await this.getCategoriesWithProductCount(params);

        // ✏️ WRITE
        case "createCategory":
          return await this.handleWithTransaction(this.createCategory, params);
        case "updateCategory":
          return await this.handleWithTransaction(this.updateCategory, params);
        case "deleteCategory":
          return await this.handleWithTransaction(this.deleteCategory, params);

        // 🔄 BATCH
        case "bulkCreateCategories":
          return await this.handleWithTransaction(this.bulkCreateCategories, params);
        case "exportCategoriesToCSV":
          return await this.exportCategoriesToCSV(params);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("CategoryHandler error:", error);
      if (logger) logger.error("CategoryHandler error:", error);
      return {
        status: false,
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

  /**
   * @param {(params: any, queryRunner: import("typeorm").QueryRunner) => Promise<any>} handler
   * @param {any} params
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
   * @param {string|number} userId
   * @param {string} action
   * @param {string} description
   * @param {import("typeorm").QueryRunner} [qr]
   */
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
        entity: "Category",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log category activity:", error);
      if (logger) logger.warn("Failed to log category activity:", error);
    }
  }
}

const categoryHandler = new CategoryHandler();

ipcMain.handle(
  "category",
  withErrorHandling(categoryHandler.handleRequest.bind(categoryHandler), "IPC:category")
);

module.exports = { CategoryHandler, categoryHandler };