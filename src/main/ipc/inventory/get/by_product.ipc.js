// src/main/ipc/inventory/get/by_product.ipc.js

const { AppDataSource } = require("../../../db/datasource");
const InventoryMovement = require("../../../../entities/InventoryMovement");

/**
 * Get inventory movements for a specific product.
 * @param {Object} params
 * @param {number} params.productId - Product ID.
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { productId } = params;
    if (!productId || isNaN(productId)) {
      return { status: false, message: "Valid product ID is required", data: null };
    }

    const repo = queryRunner
      ? queryRunner.manager.getRepository(InventoryMovement)
      : AppDataSource.getRepository(InventoryMovement);

    const movements = await repo.find({
      where: { product: { id: productId } },
      relations: ["product", "sale"],
      order: { timestamp: "DESC" },
    });

    return {
      status: true,
      message: "Product movements retrieved successfully",
      data: movements,
    };
  } catch (error) {
    console.error("Error in getInventoryMovementsByProduct:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve product movements",
      data: null,
    };
  }
};