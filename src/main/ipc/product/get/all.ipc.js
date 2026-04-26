// src/main/ipc/product/get/all.ipc


const productService = require("../../../../services/Product");

/**
 * Get all products with optional filtering, sorting, pagination
 * @param {Object} params
 * @param {boolean} [params.isActive]
 * @param {string} [params.search]
 * @param {number} [params.minPrice]
 * @param {number} [params.maxPrice]
 * @param {string} [params.sortBy]      - field name (default: 'createdAt')
 * @param {string} [params.sortOrder]    - 'ASC' or 'DESC' (default: 'DESC')
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const products = await productService.findAll(params);
    return {
      status: true,
      message: "Products retrieved successfully",
      data: products,
    };
  } catch (error) {
    console.error("Error in getAllProducts:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve products",
      data: null,
    };
  }
};