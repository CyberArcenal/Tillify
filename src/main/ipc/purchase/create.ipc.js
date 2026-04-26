// src/main/ipc/purchase/create.ipc.js


const purchaseService = require('../../../services/PurchaseService');

/**
 * Create a new purchase
 * @param {Object} params
 * @param {Object} params.purchaseData - Purchase data (referenceNo, supplierId, items, etc.)
 * @param {string} [params.user] - User performing the action (default: 'system')
 * @param {import('typeorm').QueryRunner} [queryRunner] - Transaction query runner (unused but reserved)
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { purchaseData, user = "system" } = params;
    if (!purchaseData) {
      return {
        status: false,
        message: "purchaseData is required",
        data: null,
      };
    }

    const newPurchase = await purchaseService.create(purchaseData, user, queryRunner);
    return {
      status: true,
      message: "Purchase created successfully",
      data: newPurchase,
    };
  } catch (error) {
    console.error("Error in createPurchase:", error);
    return {
      status: false,
      message: error.message || "Failed to create purchase",
      data: null,
    };
  }
};
