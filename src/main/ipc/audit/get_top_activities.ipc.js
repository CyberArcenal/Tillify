// src/main/ipc/auditlog/get_top_activities.ipc.js
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");

module.exports = async (params = {}) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log");

    // Optional date range
    if (params.startDate && params.endDate) {
      query.where("audit_log.timestamp BETWEEN :start AND :end", {
        start: params.startDate,
        end: params.endDate
      });
    }

    const limit = Math.min(20, params.limit || 10);

    // Top actions
    const topActions = await query
      .clone()
      .select("audit_log.action AS action, COUNT(*) AS count")
      .groupBy("audit_log.action")
      .orderBy("count", "DESC")
      .limit(limit)
      .getRawMany();

    // Top entities
    const topEntities = await query
      .clone()
      .select("audit_log.entity AS entity, COUNT(*) AS count")
      .groupBy("audit_log.entity")
      .orderBy("count", "DESC")
      .limit(limit)
      .getRawMany();

    // Top users
    const topUsers = await query
      .clone()
      .select("audit_log.user AS user, COUNT(*) AS count")
      .groupBy("audit_log.user")
      .orderBy("count", "DESC")
      .limit(limit)
      .getRawMany();

    return {
      status: true,
      message: "Top activities retrieved",
      data: {
        topActions,
        topEntities,
        topUsers
      }
    };
  } catch (error) {
    console.error("[AuditLog][TopActivities] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch top activities",
      data: null
    };
  }
};