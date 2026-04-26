// src/main/ipc/inventory/get/by_type.ipc.js

const { AppDataSource } = require("../../../db/datasource");
const InventoryMovement = require("../../../../entities/InventoryMovement");

/**
 * Get inventory movements filtered by movement type.
 * @param {Object} params
 * @param {string} params.movementType - "sale" | "refund" | "adjustment"
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { movementType } = params;
    const validTypes = ["sale", "refund", "adjustment"];
    if (!movementType || !validTypes.includes(movementType)) {
      return { status: false, message: `Movement type must be one of: ${validTypes.join(", ")}`, data: null };
    }

    const repo = queryRunner
      ? queryRunner.manager.getRepository(InventoryMovement)
      : AppDataSource.getRepository(InventoryMovement);

    const movements = await repo.find({
      where: { movementType },
      relations: ["product", "sale"],
      order: { timestamp: "DESC" },
    });

    return {
      status: true,
      message: "Movements by type retrieved successfully",
      data: movements,
    };
  } catch (error) {
    console.error("Error in getInventoryMovementsByType:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve movements by type",
      data: null,
    };
  }
};