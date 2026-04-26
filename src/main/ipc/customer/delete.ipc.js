const customerService = require("../../../services/Customer");

/**
 * Soft delete a customer (set isActive = false)
 * @param {Object} params
 * @param {number} params.id - Customer ID
 * @param {string} [params.user] - User performing action
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, user = "system" } = params;

    if (!id || isNaN(id)) {
      throw new Error("Valid customer ID is required");
    }

    const deletedCustomer = await customerService.delete(Number(id), user, queryRunner);
    return {
      status: true,
      message: "Customer deactivated successfully",
      data: deletedCustomer,
    };
  } catch (error) {
    console.error("Error in deleteCustomer:", error);
    return {
      status: false,
      message: error.message || "Failed to deactivate customer",
      data: null,
    };
  }
};