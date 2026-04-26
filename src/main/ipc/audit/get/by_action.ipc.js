// src/main/ipc/auditlog/get/by_action.ipc.js
const { AppDataSource } = require("../../../db/dataSource");
const { AuditLog } = require("../../../../entities/AuditLog");

module.exports = async (params) => {
  try {
    if (!params.action) {
      throw new Error("Missing required parameter: action");
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log")
      .where("audit_log.action = :action", { action: params.action });

    // Pagination
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, params.limit || 50);
    const skip = (page - 1) * limit;

    query.orderBy("audit_log.timestamp", "DESC");
    query.skip(skip).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      status: true,
      message: "Audit logs by action retrieved",
      data: {
        items: data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error("[AuditLog][GetByAction] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch audit logs by action",
      data: null
    };
  }
};