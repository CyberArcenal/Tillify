// src/main/ipc/supplier/update.ipc
const { logger } = require("../../../utils/logger");
const supplierService = require("../../../services/SupplierService");

/**
 * Update an existing supplier (transactional)
 * @param {Object} params
 * @param {number} params.id - Supplier ID
 * @param {string} [params.name] - New name
 * @param {string} [params.contactInfo] - New contact info
 * @param {string} [params.email] - New email
 * @param {string} [params.phone] - New phone
 * @param {string} [params.address] - New address
 * @param {boolean} [params.isActive] - New active status
 * @param {string} [params.user] - User performing action
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, user = "system", ...updateData } = params;
    if (!id || isNaN(Number(id))) {
      throw new Error("Valid supplier ID is required");
    }
    const updated = await supplierService.update(Number(id), updateData, user, queryRunner);
    return {
      status: true,
      message: "Supplier updated successfully",
      data: updated,
    };
  } catch (error) {
    logger?.error("updateSupplier error:", error);
    return {
      status: false,
      message: error.message || "Failed to update supplier",
      data: null,
    };
  }
};