

const saleService = require("../../../../services/Sale");

/**
 * Get active (initiated) sales
 * @param {Object} params (optional)
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    console.log("[IPC] sale:get/active called");
    const sales = await saleService.findAll({ status: "initiated" });
    return {
      status: true,
      message: "Active sales retrieved",
      data: sales,
    };
  } catch (error) {
    console.error("[IPC] sale:get/active error:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch active sales",
      data: null,
    };
  }
};