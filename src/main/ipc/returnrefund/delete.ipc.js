
const returnRefundService = require("../../../services/ReturnRefundService");

/**
 * Soft-delete a return by setting its status to 'cancelled'.
 * @param {Object} params - Request parameters.
 * @param {number} params.id - Return ID.
 * @param {string} [user='system'] - Username.
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner.
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, user = "system" } = params;
    if (!id || typeof id !== "number") {
      throw new Error("Valid return ID is required");
    }

    const deleted = await returnRefundService.delete(id, user, queryRunner);
    return {
      status: true,
      message: "Return cancelled successfully",
      data: deleted,
    };
  } catch (error) {
    console.error("Error in deleteReturn handler:", error);
    return {
      status: false,
      message: error.message || "Failed to delete return",
      data: null,
    };
  }
};