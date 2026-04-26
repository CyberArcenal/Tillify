

const categoryService = require("../../../../services/CategoryService");

/**
 * Get all categories with optional filters (search, isActive, pagination, sorting)
 * @param {Object} params
 * @param {string} [params.search] - Search by name
 * @param {boolean} [params.isActive] - Filter by active status
 * @param {number} [params.page] - Page number (1-based)
 * @param {number} [params.limit] - Items per page
 * @param {string} [params.sortBy] - Field to sort by (default: createdAt)
 * @param {"ASC"|"DESC"} [params.sortOrder] - Sort order
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params = {}) => {
  try {
    const {
      search,
      isActive,
      page,
      limit,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = params;

    // Build filters
    const filters = {};
    if (search !== undefined) filters.search = String(search);
    if (isActive !== undefined) filters.isActive = Boolean(isActive);
    if (page !== undefined) filters.page = Number(page);
    if (limit !== undefined) filters.limit = Number(limit);
    filters.sortBy = sortBy;
    filters.sortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

    const categories = await categoryService.findAll(filters);
    return {
      status: true,
      data: categories,
    };
  } catch (error) {
    console.error("[get/all.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch categories",
      data: null,
    };
  }
};