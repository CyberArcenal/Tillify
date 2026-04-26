
const saleService = require("../../../../services/Sale");

/**
 * Get sales by date range
 * @param {Object} params
 * @param {string} params.startDate - ISO date string
 * @param {string} [params.endDate] - ISO date string (defaults to now)
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { startDate, endDate } = params;
    if (!startDate) return { status: false, message: "startDate is required", data: null };

    console.log("[IPC] sale:get/by_date called", { startDate, endDate });
    const sales = await saleService.findAll({ startDate, endDate });
    return {
      status: true,
      message: "Sales retrieved",
      data: sales,
    };
  } catch (error) {
    console.error("[IPC] sale:get/by_date error:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch sales by date",
      data: null,
    };
  }
};