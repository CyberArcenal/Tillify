// src/main/ipc/purchase/get/items.ipc.js


const purchaseService = require("../../../../services/PurchaseService");

/**
 * Get items of a specific purchase
 * @param {Object} params
 * @param {number} params.purchaseId - Purchase ID
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { purchaseId } = params;
    if (!purchaseId) {
      return {
        status: false,
        message: "purchaseId is required",
        data: null,
      };
    }

    // Use findById which loads purchaseItems relation
    const purchase = await purchaseService.findById(purchaseId);
    return {
      status: true,
      message: "Purchase items retrieved successfully",
      data: purchase.purchaseItems || [],
    };
  } catch (error) {
    console.error("Error in getPurchaseItems:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve purchase items",
      data: null,
    };
  }
};
