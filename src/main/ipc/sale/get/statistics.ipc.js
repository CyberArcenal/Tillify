
const saleService = require("../../../../services/Sale");

/**
 * @param {Object} params (empty or with filters)
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    console.log("[IPC] sale:get/statistics called");
    const stats = await saleService.getStatistics();
    return {
      status: true,
      message: "Statistics retrieved",
      data: stats,
    };
  } catch (error) {
    console.error("[IPC] sale:get/statistics error:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch statistics",
      data: null,
    };
  }
};