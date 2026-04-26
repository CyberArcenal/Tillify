// src/main/ipc/auditlog/get_counts.ipc.js
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");

module.exports = async (params = {}) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log");

    // Optional filter by date range
    if (params.startDate && params.endDate) {
      query.where("audit_log.timestamp BETWEEN :start AND :end", {
        start: params.startDate,
        end: params.endDate
      });
    }

    // Count by action
    const byAction = await query
      .clone()
      .select("audit_log.action AS action, COUNT(*) AS count")
      .groupBy("audit_log.action")
      .orderBy("count", "DESC")
      .getRawMany();

    // Count by entity
    const byEntity = await query
      .clone()
      .select("audit_log.entity AS entity, COUNT(*) AS count")
      .groupBy("audit_log.entity")
      .orderBy("count", "DESC")
      .getRawMany();

    // Count by user (top 10)
    const byUser = await query
      .clone()
      .select("audit_log.user AS user, COUNT(*) AS count")
      .groupBy("audit_log.user")
      .orderBy("count", "DESC")
      .limit(10)
      .getRawMany();

    return {
      status: true,
      message: "Audit log counts retrieved",
      data: {
        byAction,
        byEntity,
        byUser
      }
    };
  } catch (error) {
    console.error("[AuditLog][GetCounts] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch audit log counts",
      data: null
    };
  }
};