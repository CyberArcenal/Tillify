const customerService = require("../../../services/Customer");

/**
 * Bulk create customers (within a transaction)
 * @param {Object} params
 * @param {Array<{name: string, contactInfo?: string, loyaltyPointsBalance?: number, isActive?: boolean}>} params.customers - Array of customer data
 * @param {string} [params.user] - User
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  const { customers, user = "system" } = params;

  if (!Array.isArray(customers) || customers.length === 0) {
    return {
      status: false,
      message: "Customers array is required and must not be empty",
      data: null,
    };
  }

  try {
    const result = await customerService.bulkCreate(customers, user, queryRunner);
    return {
      status: result.errors.length === 0,
      message:
        result.errors.length > 0
          ? `Bulk create completed with ${result.errors.length} error(s)`
          : "All customers created successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error in bulkCreateCustomers:", error);
    return {
      status: false,
      message: error.message || "Bulk create failed",
      data: null,
    };
  }
};