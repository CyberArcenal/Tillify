// src/main/ipc/inventory/export_csv.ipc.js


const inventoryMovementService = require("../../../services/InventoryMovement");

/**
 * Export inventory movements to CSV format.
 * @param {Object} params - Same filters as getAll.
 * @param {string} [params.user="system"]
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: { csv: string, filename: string } }>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { filters = {}, user = "system" } = params;
    const exportData = await inventoryMovementService.exportMovements("csv", filters, user, queryRunner);

    return {
      status: true,
      message: "CSV export generated",
      data: exportData,
    };
  } catch (error) {
    console.error("Error in exportInventoryMovementsToCSV:", error);
    return {
      status: false,
      message: error.message || "Export failed",
      data: null,
    };
  }
};