// src/main/ipc/supplier/get/all.ipc

const supplierService = require("../../../../services/SupplierService");
const { logger } = require("../../../../utils/logger");

/**
 * Get all suppliers with optional filters, sorting, and pagination
 * @param {Object} params - Request parameters
 * @param {boolean} [params.isActive] - Filter by active status
 * @param {string} [params.search] - Search term for name/contact/address
 * @param {string} [params.sortBy] - Field to sort by (default: createdAt)
 * @param {string} [params.sortOrder] - 'ASC' or 'DESC' (default: DESC)
 * @param {number} [params.page] - Page number for pagination
 * @param {number} [params.limit] - Items per page
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    const suppliers = await supplierService.findAll(params);
    return {
      status: true,
      data: suppliers,
    };
  } catch (error) {
    // @ts-ignore
    logger?.error("getAllSuppliers error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to fetch suppliers",
      data: null,
    };
  }
};