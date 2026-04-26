
const categoryService = require("../../../../services/CategoryService");

/**
 * Get category statistics (counts, product distribution)
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async () => {
  try {
    const stats = await categoryService.getStatistics();
    return {
      status: true,
      data: stats,
    };
  } catch (error) {
    console.error("[get/statistics.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch category statistics",
      data: null,
    };
  }
};
