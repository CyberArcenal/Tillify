
const returnRefundService = require("../../../services/ReturnRefundService");

/**
 * Update an existing return (only allowed if status is pending).
 * @param {Object} params - Update data.
 * @param {number} params.id - Return ID.
 * @param {Object} params.updates - Fields to update (referenceNo, saleId, customerId, reason, refundMethod, status, items).
 * @param {string} [user='system'] - Username.
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner.
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, updates, user = "system" } = params;
    if (!id || typeof id !== "number") {
      throw new Error("Valid return ID is required");
    }
    if (!updates || typeof updates !== "object") {
      throw new Error("Updates object is required");
    }

    const updated = await returnRefundService.update(id, updates, user, queryRunner);
    return {
      status: true,
      message: "Return updated successfully",
      data: updated,
    };
  } catch (error) {
    console.error("Error in updateReturn handler:", error);
    return {
      status: false,
      message: error.message || "Failed to update return",
      data: null,
    };
  }
};