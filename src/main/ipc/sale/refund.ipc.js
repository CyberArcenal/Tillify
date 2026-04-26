
const saleService = require("../../../services/Sale");

/**
 * @param {Object} params
 * @param {number} params.id
 * @param {Array<{productId: number, quantity: number}>} params.items - Items to refund
 * @param {string} params.reason
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, items, reason, user } = params;
    if (!id) return { status: false, message: "id is required", data: null };
    if (!items || !items.length) return { status: false, message: "items are required", data: null };
    if (!reason) return { status: false, message: "reason is required", data: null };

    console.log("[IPC] sale:refund called", { id, items, reason });
    const result = await saleService.refundSale(id, items, reason, user || "system", queryRunner);
    return {
      status: true,
      message: "Refund processed successfully",
      data: result,
    };
  } catch (error) {
    console.error("[IPC] sale:refund error:", error);
    return {
      status: false,
      message: error.message || "Failed to process refund",
      data: null,
    };
  }
};