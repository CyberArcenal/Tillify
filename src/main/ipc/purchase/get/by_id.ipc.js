// src/main/ipc/purchase/get/by_id.ipc.js


const purchaseService = require("../../../../services/PurchaseService");

/**
 * Get a single purchase by ID
 * @param {Object} params
 * @param {number} params.id - Purchase ID
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { id } = params;
    if (!id) {
      return {
        status: false,
        message: "Purchase ID is required",
        data: null,
      };
    }

    const purchase = await purchaseService.findById(id);
    return {
      status: true,
      message: "Purchase retrieved successfully",
      data: purchase,
    };
  } catch (error) {
    console.error("Error in getPurchaseById:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve purchase",
      data: null,
    };
  }
};
