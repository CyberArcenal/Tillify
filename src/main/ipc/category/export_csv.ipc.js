

const categoryService = require("../../../services/CategoryService");

/**
 * Export categories to CSV or JSON
 * @param {Object} params
 * @param {"csv"|"json"} [params.format] - Export format (default: json)
 * @param {Object} [params.filters] - Filters to apply before export
 * @param {string} [params.user] - User identifier for audit
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params = {}) => {
  try {
    const { format = "json", filters = {}, user = "system" } = params;

    if (format !== "csv" && format !== "json") {
      throw new Error("Format must be 'csv' or 'json'");
    }

    const exportData = await categoryService.exportCategories(
      format,
      filters,
      user
    );

    return {
      status: true,
      message: `Export successful (${format})`,
      data: exportData,
    };
  } catch (error) {
    console.error("[export_csv.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Export failed",
      data: null,
    };
  }
};