// src/main/ipc/inventory/delete.ipc.js

const { AppDataSource } = require("../../db/dataSource");
const InventoryMovement = require("../../../entities/InventoryMovement");
const Product = require("../../../entities/Product");

/**
 * Delete an inventory movement and revert its stock change.
 * @param {Object} params
 * @param {number} params.id
 * @param {string} [params.user="system"]
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    return { status: false, message: "Transaction required for delete operation", data: null };
  }

  try {
    const { id, user = "system" } = params;
    if (!id || isNaN(id)) {
      return { status: false, message: "Valid movement ID is required", data: null };
    }

    const movementRepo = queryRunner.manager.getRepository(InventoryMovement);
    const productRepo = queryRunner.manager.getRepository(Product);

    const movement = await movementRepo.findOne({
      where: { id },
      relations: ["product"],
    });
    if (!movement) {
      return { status: false, message: `Inventory movement with ID ${id} not found`, data: null };
    }

    // Revert stock change
    if (movement.product) {
      movement.product.stockQty -= movement.qtyChange;
      movement.product.updatedAt = new Date();
      await productRepo.save(movement.product);
    }

    await movementRepo.remove(movement);

    return {
      status: true,
      message: "Inventory movement deleted and stock reverted",
      data: { id },
    };
  } catch (error) {
    console.error("Error in deleteInventoryMovement:", error);
    return {
      status: false,
      message: error.message || "Failed to delete inventory movement",
      data: null,
    };
  }
};