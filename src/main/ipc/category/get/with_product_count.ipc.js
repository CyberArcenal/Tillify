
const categoryService = require("../../../../services/CategoryService");

/**
 * Get categories with product count (uses statistics method)
 * @param {Object} params
 * @param {boolean} [params.activeOnly] - Only include active categories
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params = {}) => {
  try {
    const stats = await categoryService.getStatistics();
    let data = stats.categoriesWithProductCount || [];

    if (params.activeOnly) {
      // The statistics method already returns only active categories product counts
      // But we can re-filter if needed
      // The current implementation already filters active categories in the query
    }

    return {
      status: true,
      data,
    };
  } catch (error) {
    console.error("[get/with_product_count.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch categories with product count",
      data: null,
    };
  }
};
