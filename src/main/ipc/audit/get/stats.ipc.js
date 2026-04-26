// src/main/ipc/auditlog/get/stats.ipc.js
const { AppDataSource } = require("../../../db/dataSource");
const { AuditLog } = require("../../../../entities/AuditLog");

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

    // Total count
    const total = await query.clone().getCount();

    // Average logs per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const last30Days = await repo.createQueryBuilder("audit_log")
      .where("audit_log.timestamp >= :date", { date: thirtyDaysAgo.toISOString() })
      .getCount();
    const avgPerDay = (last30Days / 30).toFixed(1);

    // Most active day
    const mostActiveDay = await query
      .clone()
      .select("DATE(audit_log.timestamp) AS day, COUNT(*) AS count")
      .groupBy("day")
      .orderBy("count", "DESC")
      .limit(1)
      .getRawOne();

    // Unique users count
    const uniqueUsers = await query
      .clone()
      .select("COUNT(DISTINCT audit_log.user) AS count")
      .getRawOne();

    return {
      status: true,
      message: "Audit log statistics retrieved",
      data: {
        total,
        avgPerDay,
        mostActiveDay: mostActiveDay || null,
        uniqueUsers: uniqueUsers?.count || 0,
        dateRange: params.startDate && params.endDate ? {
          start: params.startDate,
          end: params.endDate
        } : null
      }
    };
  } catch (error) {
    console.error("[AuditLog][Stats] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to generate audit log statistics",
      data: null
    };
  }
};