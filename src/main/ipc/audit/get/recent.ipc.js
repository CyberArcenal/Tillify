// src/main/ipc/auditlog/get/recent.ipc.js
const { AppDataSource } = require("../../../db/dataSource");
const { AuditLog } = require("../../../../entities/AuditLog");

module.exports = async (params = {}) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const limit = Math.min(50, params.limit || 10);

    const data = await repo.createQueryBuilder("audit_log")
      .orderBy("audit_log.timestamp", "DESC")
      .take(limit)
      .getMany();

    return {
      status: true,
      message: "Recent audit logs retrieved",
      data: {
        items: data,
        limit
      }
    };
  } catch (error) {
    console.error("[AuditLog][Recent] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch recent audit logs",
      data: null
    };
  }
};