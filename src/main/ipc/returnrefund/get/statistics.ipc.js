
const returnRefundService = require("../../../../services/ReturnRefundService");

/**
 * Get aggregated statistics about returns.
 * @param {Object} params - (No parameters expected, kept for consistency)
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner (optional for reads).
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const statistics = await returnRefundService.getStatistics(queryRunner);
    return {
      status: true,
      message: "Return statistics fetched successfully",
      data: statistics,
    };
  } catch (error) {
    console.error("Error in getReturnStatistics handler:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch return statistics",
      data: null,
    };
  }
};