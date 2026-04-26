

const saleService = require("../../../services/Sale");

/**
 * @param {Object} params
 * @param {Array<{productId: number, quantity: number, unitPrice?: number, discount?: number, tax?: number}>} params.items
 * @param {number} [params.customerId]
 * @param {string} [params.paymentMethod] - 'cash'|'card'|'wallet'
 * @param {string} [params.notes]
 * @param {number} [params.loyaltyRedeemed]
 * @param {string} [params.user] - Username or ID
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    if (!params.items || !params.items.length) {
      return { status: false, message: "items are required", data: null };
    }

    console.log("[IPC] sale:create called", params);
    const { user = "system", ...saleData } = params;
    const result = await saleService.create(saleData, user, queryRunner);
    return {
      status: true,
      message: "Sale created successfully",
      data: result,
    };
  } catch (error) {
    console.error("[IPC] sale:create error:", error);
    return {
      status: false,
      message: error.message || "Failed to create sale",
      data: null,
    };
  }
};