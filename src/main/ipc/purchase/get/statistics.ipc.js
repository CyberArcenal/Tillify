// src/main/ipc/purchase/get/statistics.ipc.js


const purchaseService = require("../../../../services/PurchaseService");

/**
 * Get purchase statistics (counts by status, total completed amount, etc.)
 * @param {Object} params - (optional filters, currently unused)
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const statistics = await purchaseService.getStatistics();
    return {
      status: true,
      message: "Purchase statistics retrieved successfully",
      data: statistics,
    };
  } catch (error) {
    console.error("Error in getPurchaseStatistics:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve purchase statistics",
      data: null,
    };
  }
};
