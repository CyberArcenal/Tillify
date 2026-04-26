// src/main/ipc/purchase/export_csv.ipc.js


const purchaseService = require("../../../services/PurchaseService");

/**
 * Export purchases to CSV format
 * @param {Object} params
 * @param {Object} [params.filters] - Filters to apply before export (same as findAll)
 * @param {string} [params.user] - User performing the action
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { filters = {}, user = "system" } = params;

    // exportPurchases expects: format, filters, user, queryRunner (optional)
    const exportData = await purchaseService.exportPurchases(
      "csv",
      filters,
      user
    );
    return {
      status: true,
      message: "Purchases exported to CSV successfully",
      data: exportData,
    };
  } catch (error) {
    console.error("Error in exportPurchasesToCSV:", error);
    return {
      status: false,
      message: error.message || "Failed to export purchases",
      data: null,
    };
  }
};