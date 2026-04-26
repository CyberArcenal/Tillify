
const categoryService = require("../../../services/CategoryService");

/**
 * Soft delete a category (set isActive = false) (transactional)
 * @param {Object} params
 * @param {number} params.id - Category ID
 * @param {string} [params.user] - User identifier for audit
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    throw new Error("Transaction queryRunner required for delete operation");
  }

  try {
    const { id, user = "system" } = params;
    if (!id || isNaN(Number(id))) {
      throw new Error("Invalid or missing category ID");
    }

    const savedCategory = await categoryService.delete(
      Number(id),
      user,
      queryRunner
    );

    return {
      status: true,
      message: "Category deactivated successfully",
      data: savedCategory,
    };
  } catch (error) {
    console.error("[delete.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to delete category",
      data: null,
    };
  }
};