// src/main/ipc/notification/index.ipc.js

const { ipcMain } = require("electron");
const { withErrorHandling } = require("../../../middlewares/errorHandler");
const { AppDataSource } = require("../../db/datasource");
const { AuditLog } = require("../../../entities/AuditLog");
const { logger } = require("../../../utils/logger");
const { NotificationLogService } = require("../../../services/NotificationLog");

class NotificationLogHandler {
  /**
   * @param {Object} deps
   * @param {NotificationLogService} [deps.service]
   * @param {typeof logger} [deps.logger]
   */
  constructor(deps = {}) {
    this.service = deps.service || new NotificationLogService();
    // @ts-ignore
    this.auditLogRepo = deps.auditLogRepo || AppDataSource.getRepository(AuditLog);
    this.logger = deps.logger || logger;

    // Map method names to their transaction requirement and handler function
    // All write operations must be wrapped in a transaction and need a user.
    this.methodHandlers = {
      // Read operations – no transaction needed
      getAllNotifications:      { tx: false, needsUser: false, handler: this.service.getAllNotifications.bind(this.service) },
      getNotificationById:      { tx: false, needsUser: false, handler: this.service.getNotificationById.bind(this.service) },
      getNotificationsByRecipient: { tx: false, needsUser: false, handler: this.service.getNotificationsByRecipient.bind(this.service) },
      searchNotifications:      { tx: false, needsUser: false, handler: this.service.searchNotifications.bind(this.service) },
      getNotificationStats:     { tx: false, needsUser: false, handler: this.service.getNotificationStats.bind(this.service) },

      // Write operations – require transaction and user
      createLog:                { tx: true, needsUser: true, handler: this.service.createLog.bind(this.service) },
      retryFailedNotification:  { tx: true, needsUser: true, handler: this.service.retryFailedNotification.bind(this.service) },
      retryAllFailed:           { tx: true, needsUser: true, handler: this.service.retryAllFailed.bind(this.service) },
      resendNotification:       { tx: true, needsUser: true, handler: this.service.resendNotification.bind(this.service) },
      deleteNotification:       { tx: true, needsUser: true, handler: this.service.deleteNotification.bind(this.service) },
      updateNotificationStatus: { tx: true, needsUser: true, handler: this.service.updateNotificationStatus.bind(this.service) },
    };
  }

  /**
   * Main entry point for IPC.
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {Object} payload
   * @param {string} payload.method
   * @param {Object} [payload.params]
   */
  async handleRequest(event, payload) {
    const { method, params = {} } = payload;
    // @ts-ignore
    this.logger.info(`NotificationLogHandler: ${method}`, { params });

    // @ts-ignore
    const handlerConfig = this.methodHandlers[method];
    if (!handlerConfig) {
      throw new Error(`Unknown method: ${method}`);
    }

    // Extract user from params (or default to 'system')
    // @ts-ignore
    const user = params.user || 'system';

    if (handlerConfig.tx) {
      // Run with transaction
      return await this.runInTransaction(handlerConfig.handler, params, user, event, method);
    } else {
      // Run without transaction (read-only)
      // Some read methods accept an optional queryRunner, but we omit it.
      // If they need it, we could pass null.
      const result = await handlerConfig.handler(params);
      // Log activity for read operations? Usually not needed.
      return result;
    }
  }

  /**
   * Execute a service method within a database transaction.
   * @param {Function} serviceMethod - The service method to call
   * @param {Object} params - Parameters to pass (excluding user)
   * @param {string} user - User performing the action
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {string} methodName
   * @returns {Promise<any>}
   */
  async runInTransaction(serviceMethod, params, user, event, methodName) {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Call service method with (params, user, queryRunner)
      const result = await serviceMethod(params, user, queryRunner);

      if (result?.status) {
        await queryRunner.commitTransaction();
        // Log activity (non-critical)
        await this.logActivity(event, methodName, `Notification log ${methodName} executed`, user).catch(err => {
          this.logger.warn('Failed to log activity:', err);
        });
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
   * Log an activity to AuditLog.
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {string} action
   * @param {string} description
   * @param {string} user
   */
  async logActivity(event, action, description, user) {
    // For offline single‑user, we can ignore userId or log with the provided user.
    // The AuditLog entity expects a 'user' field (string). We'll just use the user string.
    const logEntry = this.auditLogRepo.create({
      user: user,
      action,
      description,
      entity: "NotificationLog",
      timestamp: new Date(),
    });
    await this.auditLogRepo.save(logEntry);
  }
}

// Instantiate handler with default dependencies
const handler = new NotificationLogHandler();

// Register IPC handler with error handling middleware
ipcMain.handle(
  "notificationLog",
  // @ts-ignore
  withErrorHandling(handler.handleRequest.bind(handler), "IPC:notificationLog")
);

module.exports = { NotificationLogHandler, notificationHandler: handler };