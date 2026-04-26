// src/main/ipc/auditlog/get/by_id.ipc.js
const { AppDataSource } = require("../../../db/dataSource");
const { AuditLog } = require("../../../../entities/AuditLog");

module.exports = async (params) => {
  try {
    if (!params.id) {
      throw new Error("Missing required parameter: id");
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const log = await repo.findOneBy({ id: params.id });

    if (!log) {
      return {
        status: false,
        message: `Audit log with id ${params.id} not found`,
        data: null
      };
    }

    return {
      status: true,
      message: "Audit log retrieved",
      data: log
    };
  } catch (error) {
    console.error("[AuditLog][GetById] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch audit log",
      data: null
    };
  }
};