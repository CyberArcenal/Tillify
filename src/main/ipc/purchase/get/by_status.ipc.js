// src/main/ipc/purchase/get/by_status.ipc.js


const purchaseService = require("../../../../services/PurchaseService");

/**
 * Get purchases filtered by status
 * @param {Object} params
 * @param {string} params.status - Purchase status (pending, completed, cancelled)
 * @param {Object} [options] - Additional options like pagination
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { status, ...otherParams } = params;
    if (!status) {
      return {
        status: false,
        message: "Status is required",
        data: null,
      };
    }

    const purchases = await purchaseService.findAll({ status, ...otherParams });
    return {
      status: true,
      message: `Purchases with status '${status}' retrieved successfully`,
      data: purchases,
    };
  } catch (error) {
    console.error("Error in getPurchasesByStatus:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve purchases by status",
      data: null,
    };
  }
};
