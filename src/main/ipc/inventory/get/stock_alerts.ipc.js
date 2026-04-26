// src/main/ipc/inventory/get/stock_alerts.ipc.js


const productService = require("../../../../services/Product");

/**
 * Get products with low stock (below threshold).
 * @param {Object} params
 * @param {number} [params.threshold=5] - Stock threshold.
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const threshold = params.threshold || 5;
    const lowStockProducts = await productService.getLowStock(threshold);
    return {
      status: true,
      message: "Stock alerts retrieved",
      data: lowStockProducts,
    };
  } catch (error) {
    console.error("Error in getStockAlerts:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve stock alerts",
      data: null,
    };
  }
};