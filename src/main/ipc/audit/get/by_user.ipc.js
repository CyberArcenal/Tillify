// src/main/ipc/auditlog/get/by_user.ipc.js
const { AppDataSource } = require("../../../db/dataSource");
const { AuditLog } = require("../../../../entities/AuditLog");

module.exports = async (params) => {
  try {
    if (!params.user) {
      throw new Error("Missing required parameter: user");
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log")
      .where("audit_log.user = :user", { user: params.user });

    // Pagination
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, params.limit || 50);
    const skip = (page - 1) * limit;

    query.orderBy("audit_log.timestamp", "DESC");
    query.skip(skip).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      status: true,
      message: "Audit logs by user retrieved",
      data: {
        items: data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error("[AuditLog][GetByUser] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch audit logs by user",
      data: null
    };
  }
};