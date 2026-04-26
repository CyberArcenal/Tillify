// src/main/ipc/supplier/get/by_id.ipc

const supplierService = require("../../../../services/SupplierService");
const { logger } = require("../../../../utils/logger");

/**
 * Get a single supplier by ID
 * @param {Object} params
 * @param {number} params.id - Supplier ID
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  const { id } = params;
  if (!id || isNaN(Number(id))) {
    return {
      status: false,
      message: "Valid supplier ID is required",
      data: null,
    };
  }

  try {
    const supplier = await supplierService.findById(Number(id));
    return {
      status: true,
      data: supplier,
    };
  } catch (error) {
    // @ts-ignore
    logger?.error("getSupplierById error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to fetch supplier",
      data: null,
    };
  }
};