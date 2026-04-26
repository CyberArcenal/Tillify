// src/main/ipc/product/search.ipc


const productService = require("../../../services/Product");

/**
 * @param {Object} params
 * @param {string} params.query - search term
 * @param {number} [params.limit]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  const { query, limit } = params;
  if (!query || typeof query !== "string") {
    return { status: false, message: "Search query is required", data: null };
  }

  try {
    const products = await productService.findAll({
      search: query,
      isActive: true,
      limit: limit || 50,
    });
    return {
      status: true,
      message: "Search completed successfully",
      data: products,
    };
  } catch (error) {
    console.error("Error in searchProducts:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Search failed",
      data: null,
    };
  }
};