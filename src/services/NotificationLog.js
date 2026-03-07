// src/services/notificationLog.service.js
// @ts-check
const NotificationLog = require("../entities/NotificationLog");
const emailSender = require("../channels/email.sender");
const { logger } = require("../utils/logger");


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
 * Supports dependency injection for repository, emailSender, and logger.
 */
class NotificationLogService {
  /**
   * @param {Object} deps - Dependencies
   * @param {typeof emailSender} [deps.emailSender] - Email sender
   * @param {typeof logger} [deps.logger] - Logger instance
   */
  constructor(deps = {}) {
    const { AppDataSource } = require("../main/db/datasource");
    // @ts-ignore
    this.repository = deps.repository || AppDataSource.getRepository(NotificationLog);
    this.emailSender = deps.emailSender || emailSender;
    this.logger = deps.logger || logger;
  }

  /**
   * Get repository – optionally use queryRunner for transactions
   * @param {import('typeorm').QueryRunner} [queryRunner]
   * @returns {import('typeorm').Repository<NotificationLog>}
   */
  getRepository(queryRunner) {
    if (queryRunner?.manager) {
      // @ts-ignore
      return queryRunner.manager.getRepository(NotificationLog);
    }
    return this.repository;
  }

  /**
   * Central error handler – logs and returns a consistent error response
   * @private
   */
  // @ts-ignore
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
   * @param {import('typeorm').QueryRunner} [queryRunner]
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
    queryRunner,
  ) {
    try {
      const repo = this.getRepository(queryRunner);
      const qb = repo.createQueryBuilder("log");

      // Filters
      if (status) qb.andWhere("log.status = :status", { status });
      if (startDate) qb.andWhere("log.created_at >= :startDate", { startDate });
      if (endDate) qb.andWhere("log.created_at <= :endDate", { endDate });

      // Sorting – only allow safe columns
      const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : "created_at";
      qb.orderBy(`log.${safeSortBy}`, sortOrder === "DESC" ? "DESC" : "ASC");

      // Pagination
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
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async getNotificationById({ id }, queryRunner) {
    try {
      if (!id) return { status: false, message: "ID is required", data: null };

      const repo = this.getRepository(queryRunner);
      // @ts-ignore
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

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
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async getNotificationsByRecipient({ recipient_email, page = 1, limit = 50 }, queryRunner) {
    try {
      if (!recipient_email) {
        return { status: false, message: "Recipient email is required", data: null };
      }

      const repo = this.getRepository(queryRunner);
      const [data, total] = await repo.findAndCount({
        // @ts-ignore
        where: { recipient_email },
        // @ts-ignore
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
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async searchNotifications({ keyword, page = 1, limit = 50 }, queryRunner) {
    try {
      if (!keyword) {
        return { status: false, message: "Keyword is required", data: null };
      }

      const repo = this.getRepository(queryRunner);
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
   * Delete a notification by ID.
   * @param {Object} params
   * @param {number} params.id
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async deleteNotification({ id }, queryRunner) {
    try {
      if (!id) return { status: false, message: "ID is required", data: null };

      const repo = this.getRepository(queryRunner);
      // @ts-ignore
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      await repo.remove(notification);
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
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async updateNotificationStatus({ id, status, errorMessage = null }, queryRunner) {
    try {
      if (!id || !status) {
        return { status: false, message: "ID and status are required", data: null };
      }

      const repo = this.getRepository(queryRunner);
      // @ts-ignore
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      // @ts-ignore
      notification.status = status;
      // @ts-ignore
      notification.error_message = errorMessage;

      if (status === LOG_STATUS.SENT) {
        // @ts-ignore
        notification.sent_at = new Date();
      } else if (status === LOG_STATUS.FAILED) {
        // @ts-ignore
        notification.last_error_at = new Date();
      }

      // @ts-ignore
      notification.updated_at = new Date();

      const saved = await repo.save(notification);
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
      // @ts-ignore
      notification.recipient_email,
      // @ts-ignore
      notification.subject || "No Subject",
      // @ts-ignore
      notification.payload || "",
      // @ts-ignore
      null,
      {},
      false,
    );

    if (sendResult?.success) {
      // @ts-ignore
      notification.status = isResend ? LOG_STATUS.RESEND : LOG_STATUS.SENT;
      // @ts-ignore
      notification.sent_at = new Date();
      // @ts-ignore
      notification.error_message = null;
      // @ts-ignore
      notification.last_error_at = null;
    } else {
      // @ts-ignore
      notification.status = LOG_STATUS.FAILED;
      // @ts-ignore
      notification.last_error_at = new Date();
      // @ts-ignore
      notification.error_message = sendResult?.error || "Unknown error";
    }

    if (isResend) {
      // @ts-ignore
      notification.resend_count = (notification.resend_count || 0) + 1;
    } else {
      // @ts-ignore
      notification.retry_count = (notification.retry_count || 0) + 1;
    }

    // @ts-ignore
    notification.updated_at = new Date();
    return sendResult;
  }

  /**
   * Retry a failed or queued notification.
   * @param {Object} params
   * @param {number} params.id
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async retryFailedNotification({ id }, queryRunner) {
    try {
      if (!id) {
        return { status: false, message: "Notification ID is required", data: null };
      }

      const repo = this.getRepository(queryRunner);
      // @ts-ignore
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      // @ts-ignore
      if (![LOG_STATUS.FAILED, LOG_STATUS.QUEUED].includes(notification.status)) {
        return {
          status: false,
          // @ts-ignore
          message: `Cannot retry notification with status: ${notification.status}`,
          data: null,
        };
      }

      // Send and update object (in-memory)
      const sendResult = await this._sendAndUpdate(notification, false);

      // Save changes
      const saved = await repo.save(notification);

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
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async retryAllFailed({ filters = {} }, queryRunner) {
    try {
      const repo = this.getRepository(queryRunner);
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

      // Process sequentially to avoid overwhelming the email sender
      const results = [];
      for (const notification of failedNotifications) {
        const sendResult = await this._sendAndUpdate(notification, false);
        // @ts-ignore
        const saved = await repo.save(notification);
        results.push({
          // @ts-ignore
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
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async resendNotification({ id }, queryRunner) {
    try {
      if (!id) {
        return { status: false, message: "Notification ID is required", data: null };
      }

      const repo = this.getRepository(queryRunner);
      // @ts-ignore
      const notification = await repo.findOne({ where: { id } });

      if (!notification) {
        return { status: false, message: "Notification not found", data: null };
      }

      const sendResult = await this._sendAndUpdate(notification, true);
      const saved = await repo.save(notification);

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
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async getNotificationStats({ startDate, endDate }, queryRunner) {
    try {
      const repo = this.getRepository(queryRunner);
      const qb = repo.createQueryBuilder("log");

      if (startDate) qb.andWhere("log.created_at >= :startDate", { startDate });
      if (endDate) qb.andWhere("log.created_at <= :endDate", { endDate });

      // Status counts
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

  //#region 🧩 CREATE (used by email/sms sender)

  /**
   * Create a new notification log (usually queued).
   * @param {Object} data
   * @param {string} data.to
   * @param {string} data.subject
   * @param {string} [data.html]
   * @param {string} [data.text]
   * @param {import('typeorm').QueryRunner} [queryRunner]
   */
  async createLog(data, queryRunner) {
    try {
      const repo = this.getRepository(queryRunner);
      const log = repo.create({
        // @ts-ignore
        recipient_email: data.to,
        subject: data.subject,
        payload: data.html || data.text,
        status: LOG_STATUS.QUEUED,
        retry_count: 0,
        resend_count: 0,
      });

      const saved = await repo.save(log);
      return { status: true, data: saved };
    } catch (error) {
      return this._handleError(error, "createLog");
    }
  }

  //#endregion
}

module.exports = { NotificationLogService, LOG_STATUS };