// src/main/ipc/auditlog/search.ipc.js
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");

/**
 * Search audit logs with full-text filtering
 * @param {Object} params
 * @param {string} params.searchTerm - Keyword to search in action, entity, user
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.limit - Items per page
 * @param {string} [params.entity] - Filter by entity name
 * @param {string} [params.user] - Filter by user
 * @param {string} [params.action] - Filter by action
 * @param {string} [params.startDate] - ISO date string
 * @param {string} [params.endDate] - ISO date string
 */
module.exports = async (params) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log");

    // Apply search term across multiple fields
    if (params.searchTerm) {
      query.andWhere(
        "(audit_log.action LIKE :search OR audit_log.entity LIKE :search OR audit_log.user LIKE :search)",
        { search: `%${params.searchTerm}%` }
      );
    }

    // Optional filters
    if (params.entity) {
      query.andWhere("audit_log.entity = :entity", { entity: params.entity });
    }
    if (params.user) {
      query.andWhere("audit_log.user = :user", { user: params.user });
    }
    if (params.action) {
      query.andWhere("audit_log.action = :action", { action: params.action });
    }
    if (params.startDate && params.endDate) {
      query.andWhere("audit_log.timestamp BETWEEN :start AND :end", {
        start: params.startDate,
        end: params.endDate
      });
    } else if (params.startDate) {
      query.andWhere("audit_log.timestamp >= :start", { start: params.startDate });
    } else if (params.endDate) {
      query.andWhere("audit_log.timestamp <= :end", { end: params.endDate });
    }

    // Pagination
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, params.limit || 50);
    const skip = (page - 1) * limit;

    query.orderBy("audit_log.timestamp", "DESC");
    query.skip(skip).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      status: true,
      message: "Search completed",
      data: {
        items: data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error("[AuditLog][Search] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to search audit logs",
      data: null
    };
  }
};