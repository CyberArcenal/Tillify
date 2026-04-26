
const returnRefundService = require('../../../services/ReturnRefundService');

/**
 * Bulk create multiple returns within the same transaction.
 * @param {Object} params - Request parameters.
 * @param {Array<Object>} params.returns - Array of return objects (each matches create structure).
 * @param {string} [user='system'] - Username.
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner.
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { returns, user = "system" } = params;
    if (!Array.isArray(returns) || returns.length === 0) {
      throw new Error("Returns array is required and must not be empty");
    }

    // Use the service's built-in bulk create which handles transaction
    const result = await returnRefundService.bulkCreate(returns, user, queryRunner);
    return {
      status: result.errors.length === 0,
      message: result.errors.length === 0
        ? `${result.created.length} returns created successfully`
        : `${result.created.length} created, ${result.errors.length} failed`,
      data: result,
    };
  } catch (error) {
    console.error("Error in bulkCreateReturns handler:", error);
    return {
      status: false,
      message: error.message || "Failed to bulk create returns",
      data: null,
    };
  }
};