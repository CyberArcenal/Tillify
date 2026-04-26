
const returnRefundService = require("../../../../services/ReturnRefundService");

/**
 * Get returns associated with a specific sale.
 * @param {Object} params - Request parameters.
 * @param {number} params.saleId - Sale ID.
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner (optional for reads).
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { saleId } = params;
    if (!saleId || typeof saleId !== "number") {
      throw new Error("Valid sale ID is required");
    }

    const returns = await returnRefundService.findAll({ saleId }, queryRunner);
    return {
      status: true,
      message: `Returns for sale ID ${saleId} fetched successfully`,
      data: returns,
    };
  } catch (error) {
    console.error("Error in getReturnsBySale handler:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch returns by sale",
      data: null,
    };
  }
};