// src/main/ipc/product/get/low_stock.ipc


const productService = require("../../../../services/Product");

/**
 * @param {Object} params
 * @param {number} [params.threshold] - default 5
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  const threshold = params.threshold && typeof params.threshold === "number" ? params.threshold : 5;

  try {
    const products = await productService.getLowStock(threshold);
    return {
      status: true,
      message: "Low stock products retrieved successfully",
      data: products,
    };
  } catch (error) {
    console.error("Error in getLowStockProducts:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve low stock products",
      data: null,
    };
  }
};