// src/main/ipc/inventory/get/by_sale.ipc.js

const { AppDataSource } = require("../../../db/dataSource");
const InventoryMovement = require("../../../../entities/InventoryMovement");

/**
 * Get inventory movements associated with a sale.
 * @param {Object} params
 * @param {number} params.saleId - Sale ID.
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { saleId } = params;
    if (!saleId || isNaN(saleId)) {
      return { status: false, message: "Valid sale ID is required", data: null };
    }

    const repo = queryRunner
      ? queryRunner.manager.getRepository(InventoryMovement)
      : AppDataSource.getRepository(InventoryMovement);

    const movements = await repo.find({
      where: { sale: { id: saleId } },
      relations: ["product", "sale"],
      order: { timestamp: "DESC" },
    });

    return {
      status: true,
      message: "Sale movements retrieved successfully",
      data: movements,
    };
  } catch (error) {
    console.error("Error in getInventoryMovementsBySale:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve sale movements",
      data: null,
    };
  }
};