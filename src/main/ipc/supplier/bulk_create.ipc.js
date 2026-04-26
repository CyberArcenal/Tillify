// src/main/ipc/supplier/bulk_create.ipc

const { logger } = require("../../../utils/logger");
const supplierService = require("../../../services/SupplierService");

/**
 * Bulk create suppliers (transactional)
 * @param {Object} params
 * @param {Array<{name: string, contactInfo?: string, email?: string, phone?: string, address?: string, isActive?: boolean}>} params.suppliers - Array of supplier objects
 * @param {string} [params.user] - User performing action
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params, queryRunner) => {
  const { suppliers, user = "system" } = params;

  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    return {
      status: false,
      message: "Suppliers array is required and must not be empty",
      data: null,
    };
  }

  try {
    const result = await supplierService.bulkCreate(suppliers, user, queryRunner);
    return {
      status: result.errors.length === 0,
      message: result.errors.length === 0
        ? `Successfully created ${result.created.length} suppliers`
        : `${result.created.length} created, ${result.errors.length} failed`,
      data: result,
    };
  } catch (error) {
    logger?.error("bulkCreateSuppliers error:", error);
    return {
      status: false,
      message: error.message || "Failed to bulk create suppliers",
      data: null,
    };
  }
};