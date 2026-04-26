
const categoryService = require("../../../services/CategoryService");

/**
 * Create a new category (transactional)
 * @param {Object} params
 * @param {string} params.name - Category name (unique)
 * @param {string} [params.description] - Optional description
 * @param {boolean} [params.isActive] - Default true
 * @param {string} [params.user] - User identifier for audit
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    throw new Error("Transaction queryRunner required for create operation");
  }

  try {
    const { name, description, isActive = true, user = "system" } = params;

    const savedCategory = await categoryService.create(
      { name, description, isActive },
      user,
      queryRunner
    );

    return {
      status: true,
      message: "Category created successfully",
      data: savedCategory,
    };
  } catch (error) {
    console.error("[create.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to create category",
      data: null,
    };
  }
};