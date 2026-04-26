// src/main/ipc/auditlog/generate_report.ipc.js
const { AppDataSource } = require("../../db/dataSource");
const { AuditLog } = require("../../../entities/AuditLog");
const fs = require("fs").promises;
const path = require("path");
const { app } = require("electron");

/**
 * Generate a comprehensive audit report (JSON)
 * @param {Object} params
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @param {string} [params.format] - 'json' or 'html' (default: json)
 */
module.exports = async (params = {}) => {
  let filePath = null;
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder("audit_log");

    if (params.startDate && params.endDate) {
      query.where("audit_log.timestamp BETWEEN :start AND :end", {
        start: params.startDate,
        end: params.endDate
      });
    }

    // Fetch all logs (with reasonable limit)
    const logs = await query
      .orderBy("audit_log.timestamp", "DESC")
      .limit(5000)
      .getMany();

    // Compute summary statistics
    const total = logs.length;
    const byAction = {};
    const byEntity = {};
    const byUser = {};
    const dailyCounts = {};

    logs.forEach(log => {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      byEntity[log.entity] = (byEntity[log.entity] || 0) + 1;
      if (log.user) {
        byUser[log.user] = (byUser[log.user] || 0) + 1;
      }
      const day = log.timestamp.split("T")[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    const report = {
      generatedAt: new Date().toISOString(),
      dateRange: params.startDate && params.endDate ? {
        start: params.startDate,
        end: params.endDate
      } : "all time",
      totalEntries: total,
      summary: {
        byAction,
        byEntity,
        byUser,
        dailyCounts
      },
      recentActivities: logs.slice(0, 100) // latest 100 entries
    };

    // Determine export directory
    let exportDir;
    if (typeof app !== "undefined" && app?.getPath) {
      exportDir = path.join(app.getPath("documents"), "POSManagement", "reports");
    } else {
      exportDir = path.join(process.cwd(), "reports");
    }

    await fs.mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const format = params.format === "html" ? "html" : "json";

    if (format === "html") {
      // Simple HTML report
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Audit Report</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Audit Log Report</h1>
  <p>Generated: ${report.generatedAt}</p>
  <p>Period: ${report.dateRange}</p>
  <p>Total Entries: ${report.totalEntries}</p>
  
  <h2>Actions</h2>
  <ul>
    ${Object.entries(report.summary.byAction).map(([k,v]) => `<li>${k}: ${v}</li>`).join("")}
  </ul>
  
  <h2>Recent Activities (last 100)</h2>
  <table>
    <tr><th>ID</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>User</th><th>Timestamp</th></tr>
    ${report.recentActivities.map(log => `
      <tr>
        <td>${log.id}</td>
        <td>${log.action}</td>
        <td>${log.entity}</td>
        <td>${log.entityId}</td>
        <td>${log.user || ''}</td>
        <td>${log.timestamp}</td>
      </tr>
    `).join("")}
  </table>
</body>
</html>
      `;
      filePath = path.join(exportDir, `audit_report_${timestamp}.html`);
      await fs.writeFile(filePath, html, "utf8");
    } else {
      filePath = path.join(exportDir, `audit_report_${timestamp}.json`);
      await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf8");
    }

    return {
      status: true,
      message: `Audit report generated successfully`,
      data: { filePath, format, entryCount: total }
    };
  } catch (error) {
    console.error("[AuditLog][GenerateReport] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to generate audit report",
      data: null
    };
  }
};