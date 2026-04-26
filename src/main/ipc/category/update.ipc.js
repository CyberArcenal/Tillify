
const categoryService = require("../../../services/CategoryService");

/**
 * Update an existing category (transactional)
 * @param {Object} params
 * @param {number} params.id - Category ID
 * @param {string} [params.name] - New name
 * @param {string} [params.description] - New description
 * @param {boolean} [params.isActive] - New active status
 * @param {string} [params.user] - User identifier for audit
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{ status: boolean; message?: string; data?: any }>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    throw new Error("Transaction queryRunner required for update operation");
  }

  try {
    const { id, name, description, isActive, user = "system" } = params;
    if (!id || isNaN(Number(id))) {
      throw new Error("Invalid or missing category ID");
    }

    // Build update object (only provided fields)
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (Object.keys(updateData).length === 0) {
      const existing = await categoryService.findById(Number(id), queryRunner);
      return {
        status: true,
        message: "No changes provided",
        data: existing,
      };
    }

    const savedCategory = await categoryService.update(
      Number(id),
      updateData,
      user,
      queryRunner
    );

    return {
      status: true,
      message: "Category updated successfully",
      data: savedCategory,
    };
  } catch (error) {
    console.error("[update.ipc] Error:", error.message);
    return {
      status: false,
      message: error.message || "Failed to update category",
      data: null,
    };
  }
};