// src/main/ipc/supplier/get/active.ipc

const supplierService = require("../../../../services/SupplierService");
const { logger } = require("../../../../utils/logger");

/**
 * Get all active suppliers (isActive = true)
 * @param {Object} params - (unused, kept for consistency)
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    const suppliers = await supplierService.findAll({ isActive: true });
    return {
      status: true,
      data: suppliers,
    };
  } catch (error) {
    // @ts-ignore
    logger?.error("getActiveSuppliers error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to fetch active suppliers",
      data: null,
    };
  }
};