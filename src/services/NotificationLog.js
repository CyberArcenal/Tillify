// services/NotificationLogService.js
const NotificationLog = require("../entities/NotificationLog");
const emailSender = require("../channels/email.sender");
const { logger } = require("../utils/logger");
const auditLogger = require("../utils/auditLogger");

const LOG_STATUS = {
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
  RESEND: "resend",
};

/**
 * Allowed columns for sorting (prevents SQL injection)
 */
const ALLOWED_SORT_COLUMNS = new Set([
  "id",
  "recipient_email",
  "subject",
  "status",
  "retry_count",
  "resend_count",
  "sent_at",
  "last_error_at",
  "created_at",
  "updated_at",
]);

/**
 * Service for managing notification logs.
 * Supports transaction via queryRunner.
 */
class NotificationLogService {
  constructor() {
    this.notificationLogRepository = null;
    this.emailSender = emailSender;
    this.logger = logger;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/dataSource");
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.notificationLogRepository = AppDataSource.getRepository(NotificationLog);
    console.log("NotificationLogService initialized");
  }

  async getRepository() {
    if (!this.notificationLogRepository) {
      await this.initialize();
    }
    return this.notificationLogRepository;
  }

  /**
   * Helper: get a repository (transactional if queryRunner provided)
   * @param {import("typeorm").QueryRunner | null} qr
   * @param {Function} entityClass
   * @returns {import("typeorm").Repository<any>}
   */
  _getRepo(qr, entityClass) {
    if (qr) {
      return qr.manager.getRepository(entityClass);
    }
    const { AppDataSource } = require("../main/db/dataSource");
    return AppDataSource.getRepository(entityClass);
  }

  /**
   * Central error handler – logs and returns a consistent error response
   * @private
   */
  _handleError(error, context = "") {
    this.logger.error(`NotificationLogService${context ? ` [${context}]` : ""}:`, error);
    return {
      status: false,
      message: error?.message || "Unknown error",
      data: null,
    };
  }

  //#region 📋 READ OPERATIONS

  /**
   * Get all notifications with filtering, sorting, and pagination.
   * @param {Object} params
   * @param {number} [params.page=1]
   * @param {number} [params.limit=50]
   * @param {string} [params.status]
   * @param {Date|string} [params.startDate]
   * @param {Date|string} [params.endDate]
   * @param {string} [params.sortBy='created_at']
   * @param {'ASC'|'DESC'} [params.sortOrder='DESC']
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async getAllNotifications(
    {
      page = 1,
      limit = 50,
      status,
      startDate,
      endDate,
      sortBy = "created_at",
      sortOrder = "DESC",
    },
    qr = null
  ) {
    try {
      const repo = this._getRepo(qr, NotificationLog);
      const qb = repo.createQueryBuilder("log");

      if (status) qb.andWhere("log.status = :status", { status });
      if (startDate) qb.andWhere("log.created_at >= :startDate", { startDate });
      if (endDate) qb.andWhere("log.created_at <= :endDate", { endDate });

      const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : "created_at";
      qb.orderBy(`log.${safeSortBy}`, sortOrder === "DESC" ? "DESC" : "ASC");

      qb.skip((page - 1) * limit).take(limit);

      const [data, total] = await qb.getManyAndCount();

      return {
        status: true,
        data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      return this._handleError(error, "getAllNotifications");
    }
  }

  /**
   * Get a single notification by ID.
   * @param {Object} params
   * @param {number} params.id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async getNotificationById({ id }, qr = null) {
    try {
      if (!id) return { status: false, message: "ID is required", data: null };

      const repo = this._getRepo(qr, NotificationLog);
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      await auditLogger.logView("NotificationLog", id, "system");
      return { status: true, data: notification };
    } catch (error) {
      return this._handleError(error, "getNotificationById");
    }
  }

  /**
   * Get notifications by recipient email with pagination.
   * @param {Object} params
   * @param {string} params.recipient_email
   * @param {number} [params.page=1]
   * @param {number} [params.limit=50]
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async getNotificationsByRecipient({ recipient_email, page = 1, limit = 50 }, qr = null) {
    try {
      if (!recipient_email) {
        return { status: false, message: "Recipient email is required", data: null };
      }

      const repo = this._getRepo(qr, NotificationLog);
      const [data, total] = await repo.findAndCount({
        where: { recipient_email },
        order: { created_at: "DESC" },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        status: true,
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return this._handleError(error, "getNotificationsByRecipient");
    }
  }

  /**
   * Search notifications by keyword (recipient, subject, payload).
   * @param {Object} params
   * @param {string} params.keyword
   * @param {number} [params.page=1]
   * @param {number} [params.limit=50]
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async searchNotifications({ keyword, page = 1, limit = 50 }, qr = null) {
    try {
      if (!keyword) {
        return { status: false, message: "Keyword is required", data: null };
      }

      const repo = this._getRepo(qr, NotificationLog);
      const qb = repo
        .createQueryBuilder("log")
        .where("log.recipient_email LIKE :keyword", { keyword: `%${keyword}%` })
        .orWhere("log.subject LIKE :keyword", { keyword: `%${keyword}%` })
        .orWhere("log.payload LIKE :keyword", { keyword: `%${keyword}%` })
        .orderBy("log.created_at", "DESC")
        .skip((page - 1) * limit)
        .take(limit);

      const [data, total] = await qb.getManyAndCount();

      return {
        status: true,
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return this._handleError(error, "searchNotifications");
    }
  }

  //#endregion

  //#region ✏️ WRITE OPERATIONS

  /**
   * Create a new notification log (usually queued).
   * @param {Object} data
   * @param {string} data.to
   * @param {string} data.subject
   * @param {string} [data.html]
   * @param {string} [data.text]
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async createLog(data, user = "system", qr = null) {
    try {
      const repo = this._getRepo(qr, NotificationLog);
      const log = repo.create({
        recipient_email: data.to,
        subject: data.subject,
        payload: data.html || data.text,
        status: LOG_STATUS.QUEUED,
        retry_count: 0,
        resend_count: 0,
      });

      const saved = await repo.save(log);

      await auditLogger.logCreate("NotificationLog", saved.id, saved, user);

      return { status: true, data: saved };
    } catch (error) {
      return this._handleError(error, "createLog");
    }
  }

  /**
   * Delete a notification by ID.
   * @param {Object} params
   * @param {number} params.id
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async deleteNotification({ id }, user = "system", qr = null) {
    try {
      if (!id) return { status: false, message: "ID is required", data: null };

      const repo = this._getRepo(qr, NotificationLog);
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      const oldData = { ...notification };
      await repo.remove(notification);

      await auditLogger.logDelete("NotificationLog", id, oldData, user);

      return { status: true, message: "Notification deleted successfully" };
    } catch (error) {
      return this._handleError(error, "deleteNotification");
    }
  }

  /**
   * Update the status of a notification and set timestamps accordingly.
   * @param {Object} params
   * @param {number} params.id
   * @param {string} params.status
   * @param {string|null} [params.errorMessage=null]
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async updateNotificationStatus({ id, status, errorMessage = null }, user = "system", qr = null) {
    try {
      if (!id || !status) {
        return { status: false, message: "ID and status are required", data: null };
      }

      const repo = this._getRepo(qr, NotificationLog);
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      const oldData = { ...notification };

      notification.status = status;
      notification.error_message = errorMessage;

      if (status === LOG_STATUS.SENT) {
        notification.sent_at = new Date();
      } else if (status === LOG_STATUS.FAILED) {
        notification.last_error_at = new Date();
      }

      notification.updated_at = new Date();

      const saved = await repo.save(notification);

      await auditLogger.logUpdate("NotificationLog", id, oldData, saved, user);

      return { status: true, data: saved };
    } catch (error) {
      return this._handleError(error, "updateNotificationStatus");
    }
  }

  //#endregion

  //#region 🔄 RETRY / RESEND OPERATIONS

  /**
   * Internal method to send email and update the notification object (without saving).
   * @private
   * @param {NotificationLog} notification
   * @param {boolean} [isResend=false]
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async _sendAndUpdate(notification, isResend = false) {
    const sendResult = await this.emailSender.send(
      notification.recipient_email,
      notification.subject || "No Subject",
      notification.payload || "",
      null,
      {},
      false,
    );

    if (sendResult?.success) {
      notification.status = isResend ? LOG_STATUS.RESEND : LOG_STATUS.SENT;
      notification.sent_at = new Date();
      notification.error_message = null;
      notification.last_error_at = null;
    } else {
      notification.status = LOG_STATUS.FAILED;
      notification.last_error_at = new Date();
      notification.error_message = sendResult?.error || "Unknown error";
    }

    if (isResend) {
      notification.resend_count = (notification.resend_count || 0) + 1;
    } else {
      notification.retry_count = (notification.retry_count || 0) + 1;
    }

    notification.updated_at = new Date();
    return sendResult;
  }

  /**
   * Retry a failed or queued notification.
   * @param {Object} params
   * @param {number} params.id
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async retryFailedNotification({ id }, user = "system", qr = null) {
    try {
      if (!id) {
        return { status: false, message: "Notification ID is required", data: null };
      }

      const repo = this._getRepo(qr, NotificationLog);
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      if (![LOG_STATUS.FAILED, LOG_STATUS.QUEUED].includes(notification.status)) {
        return {
          status: false,
          message: `Cannot retry notification with status: ${notification.status}`,
          data: null,
        };
      }

      const oldData = { ...notification };
      const sendResult = await this._sendAndUpdate(notification, false);
      const saved = await repo.save(notification);

      await auditLogger.logUpdate("NotificationLog", id, oldData, saved, user);

      return {
        status: true,
        data: saved,
        sendResult,
      };
    } catch (error) {
      return this._handleError(error, "retryFailedNotification");
    }
  }

  /**
   * Retry all failed/queued notifications, optionally filtered.
   * @param {Object} params
   * @param {Object} [params.filters={}]
   * @param {string} [params.filters.recipient_email]
   * @param {Date|string} [params.filters.createdBefore]
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async retryAllFailed({ filters = {} }, user = "system", qr = null) {
    try {
      const repo = this._getRepo(qr, NotificationLog);
      const qb = repo
        .createQueryBuilder("log")
        .where("log.status IN (:...statuses)", {
          statuses: [LOG_STATUS.FAILED, LOG_STATUS.QUEUED],
        });

      if (filters.recipient_email) {
        qb.andWhere("log.recipient_email = :recipient", {
          recipient: filters.recipient_email,
        });
      }

      if (filters.createdBefore) {
        qb.andWhere("log.created_at <= :before", {
          before: filters.createdBefore,
        });
      }

      const failedNotifications = await qb.getMany();

      const results = [];
      for (const notification of failedNotifications) {
        const oldData = { ...notification };
        const sendResult = await this._sendAndUpdate(notification, false);
        const saved = await repo.save(notification);
        await auditLogger.logUpdate("NotificationLog", notification.id, oldData, saved, user);
        results.push({
          id: notification.id,
          success: sendResult?.success,
          error: sendResult?.error,
        });
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;

      return {
        status: true,
        message: `Retried ${results.length} notifications. ${successCount} succeeded, ${failCount} failed.`,
        data: results,
      };
    } catch (error) {
      return this._handleError(error, "retryAllFailed");
    }
  }

  /**
   * Resend a notification (manual resend, regardless of previous status).
   * @param {Object} params
   * @param {number} params.id
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async resendNotification({ id }, user = "system", qr = null) {
    try {
      if (!id) {
        return { status: false, message: "Notification ID is required", data: null };
      }

      const repo = this._getRepo(qr, NotificationLog);
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      const oldData = { ...notification };
      const sendResult = await this._sendAndUpdate(notification, true);
      const saved = await repo.save(notification);

      await auditLogger.logUpdate("NotificationLog", id, oldData, saved, user);

      return {
        status: true,
        data: saved,
        sendResult,
      };
    } catch (error) {
      return this._handleError(error, "resendNotification");
    }
  }

  //#endregion

  //#region 📊 STATISTICS

  /**
   * Get notification statistics.
   * @param {Object} params
   * @param {Date|string} [params.startDate]
   * @param {Date|string} [params.endDate]
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async getNotificationStats({ startDate, endDate }, qr = null) {
    try {
      const repo = this._getRepo(qr, NotificationLog);
      const qb = repo.createQueryBuilder("log");

      if (startDate) qb.andWhere("log.created_at >= :startDate", { startDate });
      if (endDate) qb.andWhere("log.created_at <= :endDate", { endDate });

      const statusStats = await qb
        .clone()
        .select("log.status", "status")
        .addSelect("COUNT(log.id)", "count")
        .groupBy("log.status")
        .getRawMany();

      const total = await qb.clone().getCount();

      const avgRetry = await qb
        .clone()
        .where("log.status = :status", { status: LOG_STATUS.FAILED })
        .select("AVG(log.retry_count)", "avg")
        .getRawOne();

      const last24h = await qb
        .clone()
        .where("log.created_at >= :date", {
          date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
        .getCount();

      const byStatus = statusStats.reduce((acc, { status, count }) => {
        acc[status] = parseInt(count, 10);
        return acc;
      }, {});

      return {
        status: true,
        data: {
          total,
          byStatus,
          avgRetryFailed: parseFloat(avgRetry?.avg) || 0,
          last24h,
        },
      };
    } catch (error) {
      return this._handleError(error, "getNotificationStats");
    }
  }

  //#endregion

  //#region 📤 EXPORT

  /**
   * Export notifications to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters (same as getAllNotifications)
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportNotifications(format = "json", filters = {}, user = "system", qr = null) {
    try {
      const result = await this.getAllNotifications(filters, qr);
      if (!result.status) throw new Error(result.message);
      const notifications = result.data;

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Recipient Email",
          "Subject",
          "Status",
          "Retry Count",
          "Resend Count",
          "Sent At",
          "Last Error At",
          "Error Message",
          "Created At",
        ];
        const rows = notifications.map((n) => [
          n.id,
          n.recipient_email,
          n.subject,
          n.status,
          n.retry_count,
          n.resend_count,
          n.sent_at ? new Date(n.sent_at).toLocaleString() : "",
          n.last_error_at ? new Date(n.last_error_at).toLocaleString() : "",
          n.error_message || "",
          new Date(n.created_at).toLocaleString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `notifications_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: notifications,
          filename: `notifications_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      await auditLogger.logExport("NotificationLog", format, filters, user);
      console.log(`Exported ${notifications.length} notifications in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export notifications:", error);
      throw error;
    }
  }

  //#endregion

  //#region 📦 BULK OPERATIONS

  /**
   * Bulk create notification logs
   * @param {Array<Object>} logsArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(logsArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const logData of logsArray) {
      try {
        const result = await this.createLog(logData, user, qr);
        if (result.status) {
          results.created.push(result.data);
        } else {
          results.errors.push({ log: logData, error: result.message });
        }
      } catch (err) {
        results.errors.push({ log: logData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Import notifications from a CSV file
   * @param {string} filePath
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async importFromCSV(filePath, user = "system", qr = null) {
    const fs = require("fs").promises;
    const csv = require("csv-parse/sync");
    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = { imported: [], errors: [] };
    for (const record of records) {
      try {
        const logData = {
          to: record.recipient_email,
          subject: record.subject,
          html: record.payload || record.html,
          text: record.text,
        };
        const result = await this.createLog(logData, user, qr);
        if (result.status) {
          results.imported.push(result.data);
        } else {
          results.errors.push({ row: record, error: result.message });
        }
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }

  //#endregion
}

module.exports = { NotificationLogService, LOG_STATUS };