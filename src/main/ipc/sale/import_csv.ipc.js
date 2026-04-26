

const saleService = require("../../../services/Sale");

/**
 * @param {Object} params
 * @param {string} params.format - 'csv' or 'json'
 * @param {Object} params.filters - filters for findAll
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { format = "json", filters = {}, user = "system" } = params;
    console.log("[IPC] sale:export_csv called", { format, filters });
    const exportData = await saleService.exportSales(format, filters, user, queryRunner);
    return {
      status: true,
      message: "Export successful",
      data: exportData,
    };
  } catch (error) {
    console.error("[IPC] sale:export_csv error:", error);
    return {
      status: false,
      message: error.message || "Failed to export sales",
      data: null,
    };
  }
};