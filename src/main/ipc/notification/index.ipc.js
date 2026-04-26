// src/main/ipc/notification/index.ipc.js
const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const notificationService = require("../../../services/NotificationService");
const { withErrorHandling } = require("../../../middlewares/errorHandler");
const { AppDataSource } = require("../../db/datasource");

class NotificationHandler {
  constructor() {}

  /**
   * @param {any} event
   * @param {{ method: any; params: {}; }} payload
   */
  async handleRequest(event, payload) {
    try {
      const method = payload.method;
      const params = payload.params || {};

      if (logger) logger.info(`NotificationHandler: ${method}`, { params });

      switch (method) {
        // 📨 CREATE – transactional
        case "create":
          return await this.handleWithTransaction(this.create, params);

        // 📋 READ OPERATIONS (no transaction)
        case "getAll":
          return await this.getAll(params);
        case "getById":
          return await this.getById(params.id);
        case "getUnreadCount":
          return await this.getUnreadCount();
        case "getStats":
          return await this.getStats();

        // ✏️ UPDATE – transactional
        case "markAsRead":
          return await this.handleWithTransaction(this.markAsRead, params);
        case "markAllAsRead":
          return await this.handleWithTransaction(this.markAllAsRead, params);

        // 🗑 DELETE – transactional
        case "delete":
          return await this.handleWithTransaction(this.delete, params);

        default:
          return {
            status: false,
            message: `Unknown notification method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      if (logger) logger.error("NotificationHandler error:", error);
      return {
        status: false,
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

  /**
   * Wrap write operations in a database transaction
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

  // --- Handlers (each calls the service) ---

  /**
   * @param {{ title: any; message: any; type: any; metadata: any; user?: string }} params
   * @param {import("typeorm").QueryRunner} queryRunner
   */
  async create(params, queryRunner) {
    const { title, message, type, metadata, user = "system" } = params;
    if (!title || !message) throw new Error("Missing required fields: title, message");

    const result = await notificationService.create(
      { title, message, type, metadata },
      user,
      queryRunner
    );
    return { status: true, data: result };
  }

  /**
   * @param {{ isRead?: boolean; limit?: number; offset?: number; sortBy?: string; sortOrder?: string }} params
   */
  async getAll(params) {
    const { isRead, limit, offset, sortBy, sortOrder } = params;
    const result = await notificationService.findAll({
      isRead,
      limit,
      offset,
      sortBy,
      sortOrder,
    });
    return { status: true, data: result };
  }

  /**
   * @param {number} id
   */
  async getById(id) {
    const result = await notificationService.findById(id);
    return { status: true, data: result };
  }

  async getUnreadCount() {
    const count = await notificationService.getUnreadCount();
    return { status: true, data: { unreadCount: count } };
  }

  async getStats() {
    const stats = await notificationService.getStats();
    return { status: true, data: stats };
  }

  /**
   * @param {{ id: number; isRead?: boolean; user?: string }} params
   * @param {import("typeorm").QueryRunner} queryRunner
   */
  async markAsRead(params, queryRunner) {
    const { id, isRead = true, user = "system" } = params;
    if (!id) throw new Error("id is required");
    const result = await notificationService.markAsRead(id, isRead, user, queryRunner);
    return { status: true, data: result };
  }

  /**
   * @param {{ user?: string }} params
   * @param {import("typeorm").QueryRunner} queryRunner
   */
  async markAllAsRead(params, queryRunner) {
    const { user = "system" } = params;
    const count = await notificationService.markAllAsRead(user, queryRunner);
    return { status: true, data: { updatedCount: count } };
  }

  /**
   * @param {{ id: number; user?: string }} params
   * @param {import("typeorm").QueryRunner} queryRunner
   */
  async delete(params, queryRunner) {
    const { id, user = "system" } = params;
    if (!id) throw new Error("id is required");
    const result = await notificationService.delete(id, user, queryRunner);
    return { status: true, data: result };
  }
}

// Register IPC handler
const notificationHandler = new NotificationHandler();
ipcMain.handle(
  "notification",
  withErrorHandling(
    notificationHandler.handleRequest.bind(notificationHandler),
    "IPC:notification"
  )
);

module.exports = { NotificationHandler, notificationHandler };