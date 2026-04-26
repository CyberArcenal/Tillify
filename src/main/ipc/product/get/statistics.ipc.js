// src/main/ipc/product/get/statistics.ipc


const productService = require("../../../../services/Product");

/**
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async () => {
  try {
    const stats = await productService.getStatistics();
    return {
      status: true,
      message: "Product statistics retrieved successfully",
      data: stats,
    };
  } catch (error) {
    console.error("Error in getProductStatistics:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve product statistics",
      data: null,
    };
  }
};