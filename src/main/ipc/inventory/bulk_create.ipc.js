// src/main/ipc/inventory/bulk_create.ipc.js


const inventoryMovementService = require("../../../services/InventoryMovement");

/**
 * Create multiple inventory movements in one transaction.
 * @param {Object} params
 * @param {Array<{productId: number, qtyChange: number, movementType: string, notes?: string, saleId?: number}>} params.movements
 * @param {string} [params.user="system"]
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    return { status: false, message: "Transaction required for bulk create", data: null };
  }

  try {
    const { movements, user = "system" } = params;
    if (!Array.isArray(movements) || movements.length === 0) {
      return { status: false, message: "Movements array is required and cannot be empty", data: null };
    }

    const result = await inventoryMovementService.bulkCreateAdjustments(movements, user, queryRunner);

    const success = result.errors.length === 0;
    return {
      status: success,
      message: success
        ? "All movements created successfully"
        : `Created ${result.created.length} movements with ${result.errors.length} errors`,
      data: result,
    };
  } catch (error) {
    console.error("Error in bulkCreateInventoryMovements:", error);
    return {
      status: false,
      message: error.message || "Bulk create failed",
      data: null,
    };
  }
};