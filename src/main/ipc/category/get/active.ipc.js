

const categoryService = require("../../../../services/CategoryService");

/**
 * Get all active categories
 * @param {Object} params
 * @param {string} [params.search] - Optional search term
 * @param {number} [params.page] - Pagination
 * @param {number} [params.limit] - Pagination
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params = {}) => {
  try {
    const filters = { isActive: true };
    if (params.search) filters.search = String(params.search);
    if (params.page) filters.page = Number(params.page);
    if (params.limit) filters.limit = Number(params.limit);

    const categories = await categoryService.findAll(filters);
    return {
      status: true,
      data: categories,
    };
  } catch (error) {
    console.error("[get/active.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch active categories",
      data: null,
    };
  }
};