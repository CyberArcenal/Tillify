// src/main/ipc/inventory/get/all.ipc.js


const inventoryMovementService = require("../../../../services/InventoryMovement");

/**
 * Get all inventory movements with optional filtering and pagination.
 * @param {Object} params - Query parameters.
 * @param {number} [params.page] - Page number (1-based).
 * @param {number} [params.limit] - Items per page.
 * @param {string} [params.sortBy] - Field to sort by.
 * @param {"ASC"|"DESC"} [params.sortOrder] - Sort order.
 * @param {number} [params.productId] - Filter by product ID.
 * @param {number} [params.saleId] - Filter by sale ID.
 * @param {string} [params.movementType] - Filter by exact movement type.
 * @param {string[]} [params.movementTypes] - Filter by multiple types.
 * @param {string} [params.startDate] - ISO date string.
 * @param {string} [params.endDate] - ISO date string.
 * @param {"increase"|"decrease"} [params.direction] - Filter by quantity direction.
 * @param {string} [params.search] - Search in notes.
 * @param {import("typeorm").QueryRunner} [queryRunner] - Optional transaction query runner.
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const filters = {
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      productId: params.productId,
      saleId: params.saleId,
      movementType: params.movementType,
      movementTypes: params.movementTypes,
      startDate: params.startDate,
      endDate: params.endDate,
      direction: params.direction,
      search: params.search,
    };
    // Remove undefined keys
    Object.keys(filters).forEach((key) => filters[key] === undefined && delete filters[key]);

    const movements = await inventoryMovementService.findAll(filters, queryRunner);
    return {
      status: true,
      message: "Inventory movements retrieved successfully",
      data: movements,
    };
  } catch (error) {
    console.error("Error in getAllInventoryMovements:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve inventory movements",
      data: null,
    };
  }
};