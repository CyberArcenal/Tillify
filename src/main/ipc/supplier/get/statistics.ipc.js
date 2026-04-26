// src/main/ipc/supplier/get/statistics.ipc

const supplierService = require("../../../../services/SupplierService");
const { logger } = require("../../../../utils/logger");

/**
 * Get supplier statistics (counts, product counts, etc.)
 * @param {Object} params - (unused)
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    const stats = await supplierService.getStatistics();
    return {
      status: true,
      data: stats,
    };
  } catch (error) {
    // @ts-ignore
    logger?.error("getSupplierStatistics error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to fetch supplier statistics",
      data: null,
    };
  }
};