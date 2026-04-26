

const categoryService = require("../../../services/CategoryService");

/**
 * Search categories by name/description
 * @param {Object} params
 * @param {string} params.query - Search query
 * @param {boolean} [params.activeOnly] - Only active categories
 * @param {number} [params.limit] - Max results
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params = {}) => {
  try {
    const { query, activeOnly, limit } = params;
    if (!query || typeof query !== "string") {
      throw new Error("Search query is required");
    }

    const filters = {
      search: query,
      isActive: activeOnly === true ? true : undefined,
      limit: limit ? Number(limit) : 50, // default limit
    };
    const results = await categoryService.findAll(filters);
    return {
      status: true,
      data: results,
    };
  } catch (error) {
    console.error("[search.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Search failed",
      data: null,
    };
  }
};
