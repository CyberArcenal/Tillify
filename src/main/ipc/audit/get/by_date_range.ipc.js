// src/main/ipc/auditlog/get/by_date_range.ipc.js
const { AppDataSource } = require("../../../db/dataSource");
const { AuditLog } = require("../../../../entities/AuditLog");

module.exports = async (params) => {
  try {
    if (!params.startDate || !params.endDate) {
      throw new Error("Missing required parameters: startDate and endDate");
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log")
      .where("audit_log.timestamp BETWEEN :start AND :end", {
        start: params.startDate,
        end: params.endDate
      });

    // Pagination
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, params.limit || 50);
    const skip = (page - 1) * limit;

    query.orderBy("audit_log.timestamp", "DESC");
    query.skip(skip).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      status: true,
      message: "Audit logs by date range retrieved",
      data: {
        items: data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error("[AuditLog][GetByDateRange] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch audit logs by date range",
      data: null
    };
  }
};