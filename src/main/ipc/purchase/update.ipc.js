// src/main/ipc/purchase/update.ipc.js


const purchaseService = require('../../../services/PurchaseService');


/**
 * Update an existing purchase
 * @param {Object} params
 * @param {number} params.id - Purchase ID
 * @param {Object} params.updateData - Fields to update
 * @param {string} [params.user] - User performing the action
 * @param {import('typeorm').QueryRunner} [queryRunner] - Transaction query runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, updateData, user = "system" } = params;
    if (!id || !updateData) {
      return {
        status: false,
        message: "id and updateData are required",
        data: null,
      };
    }

    const updatedPurchase = await purchaseService.update(id, updateData, user, queryRunner);
    return {
      status: true,
      message: "Purchase updated successfully",
      data: updatedPurchase,
    };
  } catch (error) {
    console.error("Error in updatePurchase:", error);
    return {
      status: false,
      message: error.message || "Failed to update purchase",
      data: null,
    };
  }
};
