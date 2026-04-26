const customerService = require("../../../services/Customer");

/**
 * Add loyalty points to a customer
 * @param {Object} params
 * @param {number} params.id - Customer ID
 * @param {number} params.points - Points to add (positive)
 * @param {string} [params.notes] - Reason
 * @param {number} [params.saleId] - Associated sale ID
 * @param {string} [params.user] - User
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, points, notes, saleId, user = "system" } = params;

    if (!id || isNaN(id)) {
      throw new Error("Valid customer ID is required");
    }
    if (!points || isNaN(points) || points <= 0) {
      throw new Error("Points must be a positive number");
    }

    const result = await customerService.addLoyaltyPoints(
      Number(id),
      Number(points),
      notes || null,
      saleId ? Number(saleId) : null,
      user,
      queryRunner
    );

    return {
      status: true,
      message: "Loyalty points added successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error in addLoyaltyPoints:", error);
    return {
      status: false,
      message: error.message || "Failed to add loyalty points",
      data: null,
    };
  }
};