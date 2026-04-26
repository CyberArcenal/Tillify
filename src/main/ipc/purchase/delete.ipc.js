// src/main/ipc/purchase/delete.ipc.js


const purchaseService = require('../../../services/PurchaseService');


/**
 * Soft delete a purchase (set status to cancelled)
 * @param {Object} params
 * @param {number} params.id - Purchase ID
 * @param {string} [params.user] - User performing the action
 * @param {import('typeorm').QueryRunner} [queryRunner] - Transaction query runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, user = "system" } = params;
    if (!id) {
      return {
        status: false,
        message: "Purchase ID is required",
        data: null,
      };
    }

    const deletedPurchase = await purchaseService.delete(id, user, queryRunner);
    return {
      status: true,
      message: "Purchase cancelled successfully",
      data: deletedPurchase,
    };
  } catch (error) {
    console.error("Error in deletePurchase:", error);
    return {
      status: false,
      message: error.message || "Failed to delete purchase",
      data: null,
    };
  }
};
