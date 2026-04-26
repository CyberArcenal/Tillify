// src/main/ipc/product/get/active.ipc


const productService = require("../../../../services/Product");

/**
 * @param {Object} params (optional filters)
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const products = await productService.findAll({ ...params, isActive: true });
    return {
      status: true,
      message: "Active products retrieved successfully",
      data: products,
    };
  } catch (error) {
    console.error("Error in getActiveProducts:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve active products",
      data: null,
    };
  }
};