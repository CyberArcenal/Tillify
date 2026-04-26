// services/NotificationService.js

const auditLogger = require("../utils/auditLogger");

class NotificationService {
  constructor() {
    this.notificationRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    const Notification = require("../entities/Notification");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.notificationRepository = AppDataSource.getRepository(Notification);
    console.log("NotificationService initialized");
  }

  async getRepository() {
    if (!this.notificationRepository) {
      await this.initialize();
    }
    return this.notificationRepository;
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
    const { AppDataSource } = require("../main/db/datasource");
    return AppDataSource.getRepository(entityClass);
  }

  /**
   * Create a new notification
   * @param {Object} data - { title, message, type?, metadata? }
   * @param {string} user - Who triggered the creation
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async create(data, user = "system", qr = null) {
    const { saveDb } = require("../utils/dbUtils/dbActions");
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);

    try {
      if (!data.title || !data.message)
        throw new Error("title and message are required");

      const notification = repo.create({
        title: data.title,
        message: data.message,
        type: data.type || "info",
        metadata: data.metadata || null,
        isRead: false,
        createdAt: new Date(),
      });

      const saved = await saveDb(repo, notification);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "CREATE",
          entity: "Notification",
          entityId: saved.id,
          user,
          description: `Created notification: ${data.title}`,
        });
      } else {
        await auditLogger.logCreate("Notification", saved.id, saved, user);
      }

      console.log(`Notification created: ${data.title}`);
      return saved;
    } catch (error) {
      console.error("Failed to create notification:", error.message);
      throw error;
    }
  }

  /**
   * Find notification by ID
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async findById(id, qr = null) {
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);

    const notification = await repo.findOne({ where: { id } });
    if (!notification) {
      throw new Error(`Notification with ID ${id} not found`);
    }
    await auditLogger.logView("Notification", id, "system");
    return notification;
  }

  /**
   * Find all notifications with filters (isRead, pagination)
   * @param {Object} options - { isRead?, limit?, offset?, sortBy?, sortOrder? }
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async findAll(options = {}, qr = null) {
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);
    const queryBuilder = repo.createQueryBuilder("notification");

    if (options.isRead !== undefined) {
      queryBuilder.andWhere("notification.isRead = :isRead", {
        isRead: options.isRead,
      });
    }

    const sortBy = options.sortBy || "createdAt";
    const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
    queryBuilder.orderBy(`notification.${sortBy}`, sortOrder);

    if (options.limit) queryBuilder.take(options.limit);
    if (options.offset) queryBuilder.skip(options.offset);

    const notifications = await queryBuilder.getMany();
    await auditLogger.logView("Notification", null, "system");
    return notifications;
  }

  /**
   * Mark a single notification as read/unread
   * @param {number} id
   * @param {boolean} isRead
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async markAsRead(id, isRead = true, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);

    const notification = await repo.findOne({ where: { id } });
    if (!notification) throw new Error(`Notification with ID ${id} not found`);

    const oldData = { ...notification };
    notification.isRead = isRead;
    notification.updatedAt = new Date();

    const saved = await updateDb(repo, notification);

    if (qr) {
      const auditRepo = qr.manager.getRepository("AuditLog");
      await auditRepo.save({
        action: "UPDATE",
        entity: "Notification",
        entityId: id,
        user,
        description: `Marked notification #${id} as ${
          isRead ? "read" : "unread"
        }`,
      });
    } else {
      await auditLogger.logUpdate("Notification", id, oldData, saved, user);
    }

    console.log(`Notification ${id} marked as ${isRead ? "read" : "unread"}`);
    return saved;
  }

  /**
   * Mark all notifications as read
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async markAllAsRead(user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);

    const result = await repo
      .createQueryBuilder()
      .update()
      .set({ isRead: true, updatedAt: new Date() })
      .where("isRead = :isRead", { isRead: false })
      .execute();

    const count = result.affected || 0;
    if (count > 0) {
      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "UPDATE",
          entity: "Notification",
          entityId: null,
          user,
          description: `Marked ${count} notifications as read`,
        });
      } else {
        await auditLogger.logUpdate(
          "Notification",
          null,
          { isRead: false },
          { isRead: true },
          user
        );
      }
      console.log(`Marked ${count} notifications as read`);
    }
    return count;
  }

  /**
   * Hard delete a notification
   * @param {number} id
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async delete(id, user = "system", qr = null) {
    const { removeDb } = require("../utils/dbUtils/dbActions");
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);

    const notification = await repo.findOne({ where: { id } });
    if (!notification) throw new Error(`Notification with ID ${id} not found`);

    await removeDb(repo, notification);

    if (qr) {
      const auditRepo = qr.manager.getRepository("AuditLog");
      await auditRepo.save({
        action: "DELETE",
        entity: "Notification",
        entityId: id,
        user,
        description: `Deleted notification #${id}`,
      });
    } else {
      await auditLogger.logDelete("Notification", id, notification, user);
    }

    console.log(`Notification ${id} deleted`);
    return { success: true };
  }

  /**
   * Delete all notifications
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async deleteAll(user = "system", qr = null) {
    const { removeDb } = require("../utils/dbUtils/dbActions");
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);

    const notifications = await repo.find();
    if (notifications.length === 0) return { success: true, count: 0 };

    await repo.remove(notifications);

    if (qr) {
      const auditRepo = qr.manager.getRepository("AuditLog");
      await auditRepo.save({
        action: "DELETE",
        entity: "Notification",
        entityId: null,
        user,
        description: `Deleted ${notifications.length} notifications`,
      });
    } else {
      await auditLogger.logDelete("Notification", null, {}, user);
    }

    console.log(`Deleted ${notifications.length} notifications`);
    return { success: true, count: notifications.length };
  }

  /**
   * Get unread count
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getUnreadCount(qr = null) {
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);
    return repo.count({ where: { isRead: false } });
  }

  /**
   * Get notification statistics
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStats(qr = null) {
    const Notification = require("../entities/Notification");
    const repo = this._getRepo(qr, Notification);

    const total = await repo.count();
    const unread = await repo.count({ where: { isRead: false } });
    const read = total - unread;

    const typeCounts = await repo
      .createQueryBuilder("notification")
      .select("notification.type", "type")
      .addSelect("COUNT(*)", "count")
      .groupBy("notification.type")
      .getRawMany();

    return {
      total,
      unread,
      read,
      byType: typeCounts.reduce((acc, row) => {
        acc[row.type] = parseInt(row.count, 10);
        return acc;
      }, {}),
    };
  }

  /**
   * Bulk create notifications
   * @param {Array<Object>} notificationsArray - each item: { title, message, type?, metadata? }
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(notificationsArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const data of notificationsArray) {
      try {
        const saved = await this.create(data, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ notification: data, error: err.message });
      }
    }
    return results;
  }

  /**
   * Export notifications to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Same as findAll options
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportNotifications(
    format = "json",
    filters = {},
    user = "system",
    qr = null
  ) {
    try {
      const notifications = await this.findAll(filters, qr);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Title",
          "Message",
          "Type",
          "Is Read",
          "Created At",
          "Updated At",
        ];
        const rows = notifications.map((n) => [
          n.id,
          n.title,
          n.message,
          n.type,
          n.isRead ? "Yes" : "No",
          new Date(n.createdAt).toLocaleString(),
          n.updatedAt ? new Date(n.updatedAt).toLocaleString() : "",
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `notifications_export_${
            new Date().toISOString().split("T")[0]
          }.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: notifications,
          filename: `notifications_export_${
            new Date().toISOString().split("T")[0]
          }.json`,
        };
      }

      await auditLogger.logExport("Notification", format, filters, user);
      console.log(
        `Exported ${notifications.length} notifications in ${format} format`
      );
      return exportData;
    } catch (error) {
      console.error("Failed to export notifications:", error);
      throw error;
    }
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
        const data = {
          title: record.title,
          message: record.message,
          type: record.type || "info",
          metadata: record.metadata ? JSON.parse(record.metadata) : null,
        };
        const saved = await this.create(data, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }
}

// Singleton instance
const notificationService = new NotificationService();
module.exports = notificationService;
