
const saleService = require("../../../services/Sale");

/**
 * @param {Object} params
 * @param {number} params.id
 * @param {string} params.reason
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, reason, user } = params;
    if (!id) return { status: false, message: "id is required", data: null };
    if (!reason) return { status: false, message: "reason is required", data: null };

    console.log("[IPC] sale:void called", { id, reason });
   const result = await saleService.voidSale(id, reason, user, queryRunner);
    return {
      status: true,
      message: "Sale voided successfully",
      data: result,
    };
  } catch (error) {
    console.error("[IPC] sale:void error:", error);
    return {
      status: false,
      message: error.message || "Failed to void sale",
      data: null,
    };
  }
};