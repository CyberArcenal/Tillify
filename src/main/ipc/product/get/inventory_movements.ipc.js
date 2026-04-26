// src/main/ipc/product/get/inventory_movements.ipc

const { AppDataSource } = require("../../../db/datasource");
const InventoryMovement = require("../../../../entities/InventoryMovement");

/**
 * @param {Object} params
 * @param {number} params.productId
 * @param {number} [params.limit]
 * @param {number} [params.offset]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  const { productId, limit = 100, offset = 0 } = params;
  if (!productId || typeof productId !== "number") {
    return { status: false, message: "Valid productId is required", data: null };
  }

  try {
    const movementRepo = AppDataSource.getRepository(InventoryMovement);
    const movements = await movementRepo.find({
      where: { product: { id: productId } },
      relations: ["sale"],
      order: { timestamp: "DESC" },
      take: limit,
      skip: offset,
    });

    return {
      status: true,
      message: "Inventory movements retrieved successfully",
      data: movements,
    };
  } catch (error) {
    console.error("Error in getInventoryMovements:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve inventory movements",
      data: null,
    };
  }
};