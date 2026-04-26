// src/main/ipc/product/index.ipc.js - Product Management Handler

const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/datasource");
const { AuditLog } = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class ProductHandler {
  constructor() {
    // Initialize all handlers
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS
    this.getAllProducts = this.importHandler("./get/all.ipc");
    this.getProductById = this.importHandler("./get/by_id.ipc");
    this.getProductByBarcode = this.importHandler("./get/by_barcode.ipc");
    this.getProductBySKU = this.importHandler("./get/by_sku.ipc");
    this.getActiveProducts = this.importHandler("./get/active.ipc");
    this.getLowStockProducts = this.importHandler("./get/low_stock.ipc");
    this.getProductStatistics = this.importHandler("./get/statistics.ipc");
    this.searchProducts = this.importHandler("./search.ipc");
    this.getProductsByDate = this.importHandler("./get/by_date.ipc");
    this.getInventoryMovements = this.importHandler(
      "./get/inventory_movements.ipc"
    );

    // ✏️ WRITE OPERATION HANDLERS
    this.createProduct = this.importHandler("./create.ipc");
    this.updateProduct = this.importHandler("./update.ipc");
    this.deleteProduct = this.importHandler("./delete.ipc");
    this.hardDeleteProduct = this.importHandler("./hard_delete.ipc");
    this.updateProductStock = this.importHandler("./update_stock.ipc");

    // 📊 STATISTICS HANDLERS (additional)
    this.getInventoryValue = this.importHandler("./get/inventory_value.ipc");
    this.getProductSalesReport = this.importHandler("./get/sales_report.ipc");

    // 🔄 BATCH OPERATIONS
    this.bulkCreateProducts = this.importHandler("./bulk_create.ipc");
    this.bulkUpdateProducts = this.importHandler("./bulk_update.ipc");
    this.importProductsFromCSV = this.importHandler("./import_csv.ipc");
    this.exportProductsToCSV = this.importHandler("./export_csv.ipc");

    // 📄 REPORT HANDLERS
    this.generateProductReport = this.importHandler("./generate_report.ipc");
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
        `[ProductHandler] Failed to load handler: ${path}`,
        // @ts-ignore
        error.message
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
        logger.info(`ProductHandler: ${method}`, { params });
      }

      // ROUTE REQUESTS
      switch (method) {
        // 📋 READ-ONLY OPERATIONS
        case "getAllProducts":
          return await this.getAllProducts(enrichedParams);

        case "getProductById":
          return await this.getProductById(enrichedParams);
        case "getProductByBarcode":
          return await this.getProductByBarcode(enrichedParams);

        case "getProductBySKU":
          return await this.getProductBySKU(enrichedParams);

        case "getActiveProducts":
          return await this.getActiveProducts(enrichedParams);

        case "getLowStockProducts":
          return await this.getLowStockProducts(enrichedParams);

        case "getProductStatistics":
          return await this.getProductStatistics(enrichedParams);

        case "searchProducts":
          return await this.searchProducts(enrichedParams);

        case "getProductsByDate":
          return await this.getProductsByDate(enrichedParams);

        case "getInventoryMovements":
          return await this.getInventoryMovements(enrichedParams);

        // ✏️ WRITE OPERATIONS
        case "createProduct":
          return await this.handleWithTransaction(
            this.createProduct,
            // @ts-ignore
            enrichedParams
          );

        case "updateProduct":
          return await this.handleWithTransaction(
            this.updateProduct,
            // @ts-ignore
            enrichedParams
          );

        case "deleteProduct":
          return await this.handleWithTransaction(
            this.deleteProduct,
            // @ts-ignore
            enrichedParams
          );

        case "hardDeleteProduct":
          return await this.handleWithTransaction(
            this.hardDeleteProduct,
            // @ts-ignore
            enrichedParams
          );

        case "updateProductStock":
          return await this.handleWithTransaction(
            this.updateProductStock,
            // @ts-ignore
            enrichedParams
          );

        // 📊 STATISTICS OPERATIONS
        case "getInventoryValue":
          return await this.getInventoryValue(enrichedParams);

        case "getProductSalesReport":
          return await this.getProductSalesReport(enrichedParams);

        // 🔄 BATCH OPERATIONS
        case "bulkCreateProducts":
          return await this.handleWithTransaction(
            this.bulkCreateProducts,
            // @ts-ignore
            enrichedParams
          );

        case "bulkUpdateProducts":
          return await this.handleWithTransaction(
            this.bulkUpdateProducts,
            // @ts-ignore
            enrichedParams
          );

        case "importProductsFromCSV":
          return await this.handleWithTransaction(
            this.importProductsFromCSV,
            // @ts-ignore
            enrichedParams
          );

        case "exportProductsToCSV":
          return await this.exportProductsToCSV(enrichedParams);

        // 📄 REPORT OPERATIONS
        case "generateProductReport":
          return await this.generateProductReport(enrichedParams);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("ProductHandler error:", error);
      if (logger) {
        // @ts-ignore
        logger.error("ProductHandler error:", error);
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
        entity: "Product",
        timestamp: new Date(),
      });

      await saveDb(activityRepo, activity);
    } catch (error) {
      console.warn("Failed to log product activity:", error);
      if (logger) {
        // @ts-ignore
        logger.warn("Failed to log product activity:", error);
      }
    }
  }
}

// Register IPC handler
const productHandler = new ProductHandler();

ipcMain.handle(
  "product",
  withErrorHandling(
    // @ts-ignore
    productHandler.handleRequest.bind(productHandler),
    "IPC:product"
  )
);
// console.log('PRODUCT HANDLER LOADED', new Date().toISOString());
module.exports = { ProductHandler, productHandler };
