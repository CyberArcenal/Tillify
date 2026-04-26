// src/main/ipc/auditlog/export_csv.ipc.js
const { AuditLog } = require("../../../../entities/AuditLog");
const { AppDataSource } = require("../../../db/dataSource");
const { Parser } = require("json2csv");

/**
 * Export audit logs to CSV
 * @param {{ format?: string; startDate?: Date; endDate?: Date; entity?: string; user?: string; }} params
 */
async function exportAuditLogsHandler(params) {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const queryBuilder = repo.createQueryBuilder("audit_log");

    // Apply filters
    if (params.entity) {
      queryBuilder.andWhere("audit_log.entity = :entity", {
        entity: params.entity,
      });
    }

    if (params.user) {
      queryBuilder.andWhere("audit_log.user = :user", { user: params.user });
    }

    if (params.startDate && params.endDate) {
      queryBuilder.andWhere(
        "audit_log.timestamp BETWEEN :startDate AND :endDate",
        {
          startDate: params.startDate,
          endDate: params.endDate,
        },
      );
    }

    queryBuilder.orderBy("audit_log.timestamp", "DESC");

    const auditLogs = await queryBuilder.getMany();

    // Format for CSV
    const formattedLogs = auditLogs.map((log) => ({
      ID: log.id,
      Timestamp: log.timestamp
        ? new Date(log.timestamp).toLocaleString()
        : "N/A",
      Action: log.action || "N/A",
      Entity: log.entity || "N/A",
      EntityID: log.entityId || "N/A",
      User: log.user || "System",
      Details: log.description || "",
    }));

    // Convert to CSV
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(formattedLogs);

    // Generate filename
    const timestamp = new Date().toISOString().split("T")[0];
    const entityFilter = params.entity ? `_${params.entity}` : "";
    const filename = `audit_logs${entityFilter}_${timestamp}.csv`;

    return {
      status: true,
      message: `Exported ${auditLogs.length} audit logs to CSV`,
      data: {
        csv,
        filename,
        count: auditLogs.length,
        format: "csv",
      },
    };
  } catch (error) {
    console.error("Export audit logs error:", error);
    return {
      status: false,
      message: error.message || "Failed to export audit logs",
      data: null,
    };
  }
}

module.exports = exportAuditLogsHandler;
