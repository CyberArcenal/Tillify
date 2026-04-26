
const categoryService = require("../../../services/CategoryService");

/**
 * Bulk create categories (transactional)
 * @param {Object} params
 * @param {Array<{ name: string; description?: string; isActive?: boolean }>} params.categories
 * @param {string} [params.user] - User identifier for audit
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    throw new Error("Transaction queryRunner required for bulk create");
  }

  try {
    const { categories, user = "system" } = params;
    if (!Array.isArray(categories) || categories.length === 0) {
      throw new Error("Categories array is required and must not be empty");
    }

    const result = await categoryService.bulkCreate(categories, user, queryRunner);

    if (result.errors.length > 0) {
      throw new Error(`Bulk create failed for some categories: ${JSON.stringify(result.errors)}`);
    }

    return {
      status: true,
      message: `Successfully created ${result.created.length} categories`,
      data: result.created,
    };
  } catch (error) {
    console.error("[bulk_create.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Bulk create failed",
      data: null,
    };
  }
};