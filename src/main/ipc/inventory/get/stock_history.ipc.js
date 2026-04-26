// src/main/ipc/inventory/get/stock_history.ipc.js


const inventoryMovementService = require("../../../../services/InventoryMovement");

/**
 * Get stock change history for a specific product over time.
 * @param {Object} params
 * @param {number} params.productId
 * @param {string} [params.startDate] - ISO date.
 * @param {string} [params.endDate] - ISO date.
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { productId, startDate, endDate } = params;
    if (!productId || isNaN(productId)) {
      return { status: false, message: "Valid product ID is required", data: null };
    }

    const movements = await inventoryMovementService.findAll(
      {
        productId: Number(productId),
        startDate,
        endDate,
        sortBy: "timestamp",
        sortOrder: "ASC",
      },
      queryRunner
    );

    return {
      status: true,
      message: "Stock history retrieved",
      data: movements,
    };
  } catch (error) {
    console.error("Error in getProductStockHistory:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve stock history",
      data: null,
    };
  }
};