// src/main/ipc/supplier/delete.ipc

const { logger } = require("../../../utils/logger");
const supplierService = require("../../../services/SupplierService");

/**
 * Soft-delete a supplier (set isActive = false) (transactional)
 * @param {Object} params
 * @param {number} params.id - Supplier ID
 * @param {string} [params.user] - User performing action
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, user = "system" } = params;
    if (!id || isNaN(Number(id))) {
      throw new Error("Valid supplier ID is required");
    }
    const updated = await supplierService.delete(Number(id), user, queryRunner);
    return {
      status: true,
      message: "Supplier deactivated successfully",
      data: updated,
    };
  } catch (error) {
    logger?.error("deleteSupplier error:", error);
    return {
      status: false,
      message: error.message || "Failed to delete supplier",
      data: null,
    };
  }
};