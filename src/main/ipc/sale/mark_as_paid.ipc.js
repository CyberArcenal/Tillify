

const saleService = require("../../../services/Sale");

/**
 * @param {Object} params
 * @param {number} params.id - Sale ID
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, user = "system" } = params;
    if (!id) return { status: false, message: "id is required", data: null };

    console.log("[IPC] sale:mark_as_paid called", { id });
    const result = await saleService.markAsPaid(id, user, queryRunner);
    return {
      status: true,
      message: "Sale marked as paid",
      data: result,
    };
  } catch (error) {
    console.error("[IPC] sale:mark_as_paid error:", error);
    return {
      status: false,
      message: error.message || "Failed to mark sale as paid",
      data: null,
    };
  }
};