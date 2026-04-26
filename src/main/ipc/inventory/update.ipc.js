// src/main/ipc/inventory/update.ipc.js

const { AppDataSource } = require("../../db/datasource");
const InventoryMovement = require("../../../entities/InventoryMovement");
const Product = require("../../../entities/Product");

/**
 * Update an existing inventory movement (only notes and possibly qtyChange with stock reversion).
 * @param {Object} params
 * @param {number} params.id
 * @param {string} [params.notes]
 * @param {number} [params.qtyChange] - If provided, stock will be adjusted accordingly.
 * @param {string} [params.user="system"]
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  if (!queryRunner) {
    return { status: false, message: "Transaction required for update operation", data: null };
  }

  try {
    const { id, notes, qtyChange, user = "system" } = params;
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

    // If qtyChange is being updated, we need to revert the old change and apply the new one
    if (qtyChange !== undefined && qtyChange !== movement.qtyChange) {
      const product = movement.product;
      if (!product) {
        return { status: false, message: "Associated product not found", data: null };
      }

      // Revert old change
      product.stockQty -= movement.qtyChange;
      // Apply new change
      if (qtyChange < 0 && product.stockQty + qtyChange < 0) {
        return {
          status: false,
          message: `Insufficient stock for new qtyChange. Available after revert: ${product.stockQty}, new change: ${qtyChange}`,
          data: null,
        };
      }
      product.stockQty += qtyChange;
      product.updatedAt = new Date();
      await productRepo.save(product);

      movement.qtyChange = qtyChange;
    }

    if (notes !== undefined) {
      movement.notes = notes;
    }

    movement.updatedAt = new Date();
    const updatedMovement = await movementRepo.save(movement);

    return {
      status: true,
      message: "Inventory movement updated successfully",
      data: updatedMovement,
    };
  } catch (error) {
    console.error("Error in updateInventoryMovement:", error);
    return {
      status: false,
      message: error.message || "Failed to update inventory movement",
      data: null,
    };
  }
};