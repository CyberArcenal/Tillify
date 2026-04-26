// src/main/ipc/supplier/create.ipc

const supplierService = require("../../../services/SupplierService");
const { logger } = require("../../../utils/logger");

/**
 * Create a new supplier (transactional)
 * @param {Object} params
 * @param {string} params.name - Supplier name (required)
 * @param {string} [params.contactInfo] - Contact info
 * @param {string} [params.email] - Email
 * @param {string} [params.phone] - Phone
 * @param {string} [params.address] - Address
 * @param {boolean} [params.isActive] - Active status (default true)
 * @param {string} [params.user] - User performing action
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { user = "system", ...supplierData } = params;
    const savedSupplier = await supplierService.create(supplierData, user, queryRunner);
    return {
      status: true,
      message: "Supplier created successfully",
      data: savedSupplier,
    };
  } catch (error) {
    logger?.error("createSupplier error:", error);
    return {
      status: false,
      message: error.message || "Failed to create supplier",
      data: null,
    };
  }
};