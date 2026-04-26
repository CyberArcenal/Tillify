

const saleService = require("../../../services/Sale");

/**
 * @param {Object} params
 * @param {number} params.id
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id } = params;
    if (!id) return { status: false, message: "id is required", data: null };

    console.log("[IPC] sale:generate_receipt called", { id });
    const receipt = await saleService.generateReceipt(id, queryRunner);
    return {
      status: true,
      message: "Receipt generated",
      data: receipt,
    };
  } catch (error) {
    console.error("[IPC] sale:generate_receipt error:", error);
    return {
      status: false,
      message: error.message || "Failed to generate receipt",
      data: null,
    };
  }
};