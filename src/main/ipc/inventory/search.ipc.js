// src/main/ipc/inventory/search.ipc.js


const inventoryMovementService = require("../../../services/InventoryMovement");

/**
 * Search inventory movements by keyword (notes) and optional filters.
 * @param {Object} params
 * @param {string} params.keyword - Search term.
 * @param {number} [params.limit] - Max results.
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { keyword, limit = 50 } = params;
    if (!keyword || keyword.trim() === "") {
      return { status: false, message: "Search keyword is required", data: null };
    }

    const movements = await inventoryMovementService.findAll(
      {
        search: keyword,
        limit,
        sortBy: "timestamp",
        sortOrder: "DESC",
      },
      queryRunner
    );

    return {
      status: true,
      message: "Search completed",
      data: movements,
    };
  } catch (error) {
    console.error("Error in searchInventoryMovements:", error);
    return {
      status: false,
      message: error.message || "Search failed",
      data: null,
    };
  }
};