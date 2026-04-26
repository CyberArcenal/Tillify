
const returnRefundService = require("../../../services/ReturnRefundService");

/**
 * Update only the status of a return.
 * @param {Object} params - Request parameters.
 * @param {number} params.id - Return ID.
 * @param {string} params.status - New status ('pending', 'processed', 'cancelled').
 * @param {string} [user='system'] - Username.
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner.
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, status, user = "system" } = params;
    if (!id || typeof id !== "number") {
      throw new Error("Valid return ID is required");
    }
    if (!status || typeof status !== "string") {
      throw new Error("Valid status is required");
    }

    const updated = await returnRefundService.update(id, { status }, user, queryRunner);
    return {
      status: true,
      message: "Return status updated successfully",
      data: updated,
    };
  } catch (error) {
    console.error("Error in updateReturnStatus handler:", error);
    return {
      status: false,
      message: error.message || "Failed to update return status",
      data: null,
    };
  }
};