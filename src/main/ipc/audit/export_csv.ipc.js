// src/main/ipc/auditlog/export_csv.ipc.js
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");
const fs = require("fs").promises;
const path = require("path");
const { app } = require("electron");

/**
 * Export filtered audit logs as CSV
 * @param {Object} params - Same filters as search.ipc.js
 * @returns {Promise<{status: boolean, message: string, data: {filePath: string}}>}
 */
module.exports = async (params = {}) => {
  let filePath = null;
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log");

    // Reuse same filtering logic as search
    if (params.searchTerm) {
      query.andWhere(
        "(audit_log.action LIKE :search OR audit_log.entity LIKE :search OR audit_log.user LIKE :search)",
        { search: `%${params.searchTerm}%` }
      );
    }
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
    }

    query.orderBy("audit_log.timestamp", "DESC");

    // Limit export to avoid huge files (max 10000 rows)
    const exportLimit = Math.min(10000, params.limit || 5000);
    query.take(exportLimit);

    const logs = await query.getMany();

    // Generate CSV content
    const headers = ["ID", "Action", "Entity", "Entity ID", "User", "Timestamp"];
    const rows = logs.map(log => [
      log.id,
      log.action,
      log.entity,
      log.entityId,
      log.user || "",
      log.timestamp
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    // Determine export directory
    let exportDir;
    if (typeof app !== "undefined" && app?.getPath) {
      exportDir = path.join(app.getPath("documents"), "POSManagement", "exports");
    } else {
      exportDir = path.join(process.cwd(), "exports");
    }

    await fs.mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    filePath = path.join(exportDir, `audit_log_export_${timestamp}.csv`);
    await fs.writeFile(filePath, csvContent, "utf8");

    return {
      status: true,
      message: `Exported ${logs.length} audit log entries`,
      data: { filePath }
    };
  } catch (error) {
    console.error("[AuditLog][ExportCSV] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to export audit logs",
      data: null
    };
  }
};