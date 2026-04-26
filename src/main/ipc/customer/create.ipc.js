const customerService = require("../../../services/Customer");

/**
 * Create a new customer
 * @param {Object} params
 * @param {string} params.name - Customer name
 * @param {string} [params.contactInfo] - Contact info
 * @param {number} [params.loyaltyPointsBalance] - Initial loyalty points
 * @param {boolean} [params.isActive] - Active status (default true)
 * @param {string} [params.user] - User performing action
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const {
      name,
      contactInfo,
      loyaltyPointsBalance,
      isActive = true,
      user = "system",
    } = params;

    if (!name || typeof name !== "string") {
      throw new Error("Customer name is required");
    }

    const customerData = {
      name,
      contactInfo,
      loyaltyPointsBalance: loyaltyPointsBalance !== undefined ? Number(loyaltyPointsBalance) : 0,
      isActive,
    };

    const newCustomer = await customerService.create(customerData, user, queryRunner);
    return {
      status: true,
      message: "Customer created successfully",
      data: newCustomer,
    };
  } catch (error) {
    console.error("Error in createCustomer:", error);
    return {
      status: false,
      message: error.message || "Failed to create customer",
      data: null,
    };
  }
};