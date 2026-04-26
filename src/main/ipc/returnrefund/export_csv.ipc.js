
const returnRefundService = require("../../../services/ReturnRefundService");

/**
 * Export returns to CSV format.
 * @param {Object} params - Export parameters.
 * @param {string} [params.format='csv'] - Export format (only 'csv' supported here).
 * @param {Object} [params.filters] - Filters to apply before export.
 * @param {string} [user='system'] - Username.
 * @param {import('typeorm').QueryRunner} [queryRunner] - Optional transaction runner (unused for export).
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { format = "csv", filters = {}, user = "system" } = params;
    if (format !== "csv") {
      throw new Error("Only CSV export is supported in this handler");
    }

    const exportData = await returnRefundService.exportReturns(
      "csv",
      filters,
      user,
      queryRunner // export is read-only, but pass anyway
    );
    return {
      status: true,
      message: "Returns exported to CSV successfully",
      data: exportData,
    };
  } catch (error) {
    console.error("Error in exportReturnsToCSV handler:", error);
    return {
      status: false,
      message: error.message || "Failed to export returns to CSV",
      data: null,
    };
  }
};