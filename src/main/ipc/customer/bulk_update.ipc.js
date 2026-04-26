const customerService = require("../../../services/Customer");

/**
 * Bulk update customers (partial updates)
 * @param {Object} params
 * @param {Array<{id: number, name?: string, contactInfo?: string, loyaltyPointsBalance?: number, isActive?: boolean}>} params.updates - Array of updates
 * @param {string} [params.user] - User
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  const { updates, user = "system" } = params;

  if (!Array.isArray(updates) || updates.length === 0) {
    return {
      status: false,
      message: "Updates array is required and must not be empty",
      data: null,
    };
  }

  try {
    const result = await customerService.bulkUpdate(updates, user, queryRunner);
    return {
      status: result.errors.length === 0,
      message:
        result.errors.length > 0
          ? `Bulk update completed with ${result.errors.length} error(s)`
          : "All customers updated successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error in bulkUpdateCustomers:", error);
    return {
      status: false,
      message: error.message || "Bulk update failed",
      data: null,
    };
  }
};