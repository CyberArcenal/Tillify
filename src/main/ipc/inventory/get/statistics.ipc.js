// src/main/ipc/inventory/get/statistics.ipc.js


const inventoryMovementService = require("../../../../services/InventoryMovement");

/**
 * Get inventory movement statistics.
 * @param {Object} params - (unused, kept for consistency)
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const stats = await inventoryMovementService.getStatistics(queryRunner);
    return {
      status: true,
      message: "Statistics retrieved successfully",
      data: stats,
    };
  } catch (error) {
    console.error("Error in getInventoryStatistics:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve statistics",
      data: null,
    };
  }
};