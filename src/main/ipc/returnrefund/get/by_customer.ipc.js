
const returnRefundService = require("../../../../services/ReturnRefundService");

/**
 * Get returns for a specific customer.
 * @param {Object} params - Request parameters.
 * @param {number} params.customerId - Customer ID.
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner (optional for reads).
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { customerId } = params;
    if (!customerId || typeof customerId !== "number") {
      throw new Error("Valid customer ID is required");
    }

    const returns = await returnRefundService.findAll({ customerId }, queryRunner);
    return {
      status: true,
      message: `Returns for customer ID ${customerId} fetched successfully`,
      data: returns,
    };
  } catch (error) {
    console.error("Error in getReturnsByCustomer handler:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch returns by customer",
      data: null,
    };
  }
};