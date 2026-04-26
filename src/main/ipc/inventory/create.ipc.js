// src/main/ipc/inventory/create.ipc.js


const inventoryMovementService = require("../../../services/InventoryMovement");

/**
 * Create a manual inventory adjustment.
 * @param {Object} params
 * @param {number} params.productId
 * @param {number} params.qtyChange (positive or negative)
 * @param {string} params.movementType - "adjustment" (sale/refund handled elsewhere)
 * @param {string} [params.notes]
 * @param {number} [params.saleId]
 * @param {string} [params.user="system"]
 * @param {import("typeorm").QueryRunner} queryRunner - Required for transaction.
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    return { status: false, message: "Transaction required for create operation", data: null };
  }

  try {
    const { productId, qtyChange, movementType, notes, saleId, user = "system" } = params;

    const movementData = {
      productId,
      qtyChange,
      movementType,
      notes,
      saleId,
    };

    const savedMovement = await inventoryMovementService.createAdjustment(
      movementData,
      user,
      queryRunner
    );

    return {
      status: true,
      message: "Inventory movement created successfully",
      data: savedMovement,
    };
  } catch (error) {
    console.error("Error in createInventoryMovement:", error);
    return {
      status: false,
      message: error.message || "Failed to create inventory movement",
      data: null,
    };
  }
};