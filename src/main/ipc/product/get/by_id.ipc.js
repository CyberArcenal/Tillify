// src/main/ipc/product/get/by_id.ipc


const productService = require("../../../../services/Product");

/**
 * @param {Object} params
 * @param {number} params.id
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  const { id } = params;
  if (!id || typeof id !== "number") {
    return { status: false, message: "Valid product ID is required", data: null };
  }

  try {
    const product = await productService.findById(id);
    return {
      status: true,
      message: "Product retrieved successfully",
      data: product,
    };
  } catch (error) {
    console.error("Error in getProductById:", error);
    return {
      status: false,
      message: error.message || "Product not found",
      data: null,
    };
  }
};