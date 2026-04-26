
const saleService = require("../../../../services/Sale");

/**
 * Get revenue statistics
 * @param {Object} params
 * @param {string} [params.period] - 'today', 'week', 'month', 'year'
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    console.log("[IPC] sale:get/revenue called", params);
    const stats = await saleService.getStatistics(); // reuse statistics
    return {
      status: true,
      message: "Revenue data retrieved",
      data: {
        totalRevenue: stats.totalRevenue,
        averageSale: stats.averageSale,
        todaySales: stats.todaySales,
      },
    };
  } catch (error) {
    console.error("[IPC] sale:get/revenue error:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch revenue",
      data: null,
    };
  }
};