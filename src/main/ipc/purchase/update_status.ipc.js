// src/main/ipc/purchase/update_status.ipc.js


const purchaseService = require('../../../services/PurchaseService');


/**
 * Update only the status of a purchase
 * @param {Object} params
 * @param {number} params.id - Purchase ID
 * @param {string} params.status - New status (pending, completed, cancelled)
 * @param {string} [params.user] - User performing the action
 * @param {import('typeorm').QueryRunner} [queryRunner] - Transaction query runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, status, user = "system" } = params;
    if (!id || !status) {
      return {
        status: false,
        message: "id and status are required",
        data: null,
      };
    }

    // Use update method with only status change
    const updatedPurchase = await purchaseService.update(id, { status }, user, queryRunner);
    return {
      status: true,
      message: "Purchase status updated successfully",
      data: updatedPurchase,
    };
  } catch (error) {
    console.error("Error in updatePurchaseStatus:", error);
    return {
      status: false,
      message: error.message || "Failed to update purchase status",
      data: null,
    };
  }
};
