
const categoryService = require("../../../../services/CategoryService");

/**
 * Get a single category by ID
 * @param {Object} params
 * @param {number} params.id - Category ID
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params = {}) => {
  try {
    const { id } = params;
    if (!id || isNaN(Number(id))) {
      throw new Error("Invalid or missing category ID");
    }

    const category = await categoryService.findById(Number(id));
    return {
      status: true,
      data: category,
    };
  } catch (error) {
    console.error("[get/by_id.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to fetch category",
      data: null,
    };
  }
};
