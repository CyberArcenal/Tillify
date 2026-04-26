// src/main/ipc/auditlog/index.ipc.js - Audit Log Handler (Read-Only)
const { ipcMain } = require("electron");
const { logger } = require("../../../utils/logger");
const { AppDataSource } = require("../../db/dataSource");
const {AuditLog} = require("../../../entities/AuditLog");
const { withErrorHandling } = require("../../../middlewares/errorHandler");

class AuditLogHandler {
  constructor() {
    // Initialize all read-only handlers
    this.initializeHandlers();
  }

  initializeHandlers() {
    // 📋 READ-ONLY HANDLERS ONLY
    this.getAllAuditLogs = this.importHandler("./get/all.ipc");
    this.getAuditLogById = this.importHandler("./get/by_id.ipc");
    this.getAuditLogsByEntity = this.importHandler("./get/by_entity.ipc");
    this.getAuditLogsByUser = this.importHandler("./get/by_user.ipc");
    this.getAuditLogsByAction = this.importHandler("./get/by_action.ipc");
    this.getAuditLogsByDateRange = this.importHandler("./get/by_date_range.ipc");
    this.getAuditLogSummary = this.importHandler("./get/summary.ipc");
    this.getAuditLogStats = this.importHandler("./get/stats.ipc");
    this.searchAuditLogs = this.importHandler("./search.ipc");
    
    // 📊 AGGREGATION HANDLERS
    this.getAuditLogCounts = this.importHandler("./get_counts.ipc");
    this.getTopActivities = this.importHandler("./get_top_activities.ipc");
    this.getRecentActivity = this.importHandler("./get/recent.ipc");
    
    // 📈 REPORT HANDLERS
    this.exportAuditLogs = this.importHandler("./export_csv.ipc");
    this.generateAuditReport = this.importHandler("./generate_report.ipc");
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
        `[AuditLogHandler] Failed to load handler: ${path}`,
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

      // Log the request (but be careful not to create infinite loops!)
      if (logger) {
        // @ts-ignore
        logger.info(`AuditLogHandler: ${method}`, { 
          params: this.sanitizeAuditParams(params) 
        });
      }

      // ROUTE REQUESTS (Read-Only Only)
      switch (method) {
        // 📋 BASIC READ OPERATIONS
        case "getAllAuditLogs":
          return await this.getAllAuditLogs(enrichedParams);

        case "getAuditLogById":
          return await this.getAuditLogById(enrichedParams);

        case "getAuditLogsByEntity":
          return await this.getAuditLogsByEntity(enrichedParams);

        case "getAuditLogsByUser":
          return await this.getAuditLogsByUser(enrichedParams);

        case "getAuditLogsByAction":
          return await this.getAuditLogsByAction(enrichedParams);

        case "getAuditLogsByDateRange":
          return await this.getAuditLogsByDateRange(enrichedParams);

        case "getAuditLogSummary":
          return await this.getAuditLogSummary(enrichedParams);

        case "getAuditLogStats":
          return await this.getAuditLogStats(enrichedParams);

        case "searchAuditLogs":
          return await this.searchAuditLogs(enrichedParams);

        // 📊 AGGREGATION OPERATIONS
        case "getAuditLogCounts":
          return await this.getAuditLogCounts(enrichedParams);

        case "getTopActivities":
          return await this.getTopActivities(enrichedParams);

        case "getRecentActivity":
          return await this.getRecentActivity(enrichedParams);

        // 📈 REPORT OPERATIONS
        case "exportAuditLogs":
          return await this.exportAuditLogs(enrichedParams);

        case "generateAuditReport":
          return await this.generateAuditReport(enrichedParams);

        default:
          return {
            status: false,
            message: `Unknown audit log method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("AuditLogHandler error:", error);
      if (logger) {
        // @ts-ignore
        logger.error("AuditLogHandler error:", error);
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
   * Sanitize parameters for audit log queries
   * (Avoid logging sensitive search terms)
   */
  sanitizeAuditParams(params) {
    const sanitized = { ...params };
    // Remove any potential sensitive search terms
    if (sanitized.searchTerm) {
      sanitized.searchTerm = "[REDACTED]";
    }
    if (sanitized.user) {
      sanitized.user = "[REDACTED]";
    }
    return sanitized;
  }

  /**
   * Helper to get repository (no transaction needed for read-only)
   */
  async getRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(AuditLog);
  }

  /**
   * Helper method to build common query for audit logs
   * (Can be used by individual handlers)
   */
  async buildAuditLogQuery(params = {}) {
    const repo = await this.getRepository();
    const queryBuilder = repo.createQueryBuilder("audit_log");
    
    // Apply filters
    if (params.entity) {
      queryBuilder.andWhere("audit_log.entity = :entity", { entity: params.entity });
    }
    
    if (params.user) {
      queryBuilder.andWhere("audit_log.user = :user", { user: params.user });
    }
    
    if (params.action) {
      queryBuilder.andWhere("audit_log.action = :action", { action: params.action });
    }
    
    if (params.startDate && params.endDate) {
      queryBuilder.andWhere("audit_log.timestamp BETWEEN :startDate AND :endDate", {
        startDate: params.startDate,
        endDate: params.endDate
      });
    } else if (params.startDate) {
      queryBuilder.andWhere("audit_log.timestamp >= :startDate", { startDate: params.startDate });
    } else if (params.endDate) {
      queryBuilder.andWhere("audit_log.timestamp <= :endDate", { endDate: params.endDate });
    }
    
    if (params.entityId) {
      queryBuilder.andWhere("audit_log.entityId = :entityId", { entityId: params.entityId });
    }
    
    // Apply search term
    if (params.searchTerm) {
      queryBuilder.andWhere(
        "(audit_log.action LIKE :search OR audit_log.entity LIKE :search OR audit_log.user LIKE :search)",
        { search: `%${params.searchTerm}%` }
      );
    }
    
    // Default order (newest first)
    queryBuilder.orderBy("audit_log.timestamp", "DESC");
    
    // Apply pagination
    if (params.page && params.limit) {
      const skip = (params.page - 1) * params.limit;
      queryBuilder.skip(skip).take(params.limit);
    } else if (params.limit) {
      queryBuilder.take(params.limit);
    }
    
    return queryBuilder;
  }
}

// Register IPC handler
const auditLogHandler = new AuditLogHandler();

ipcMain.handle(
  "auditLog",
  withErrorHandling(
    // @ts-ignore
    auditLogHandler.handleRequest.bind(auditLogHandler),
    "IPC:auditLog",
  ),
);

module.exports = { AuditLogHandler, auditLogHandler };