

const saleService = require("../../../../services/Sale");

/**
 * Get all sales with optional filters
 * @param {Object} params
 * @param {string} [params.status] - Filter by status
 * @param {string[]} [params.statuses] - Filter by multiple statuses
 * @param {string} [params.startDate] - ISO date string
 * @param {string} [params.endDate] - ISO date string
 * @param {number} [params.customerId]
 * @param {string} [params.paymentMethod]
 * @param {string} [params.search]
 * @param {string} [params.sortBy] - e.g., 'timestamp'
 * @param {'ASC'|'DESC'} [params.sortOrder]
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    console.log("[IPC] sale:get/all called", params);
    const sales = await saleService.findAll(params);
    return {
      status: true,
      message: "Sales retrieved successfully",
      data: sales,
    };
  } catch (error) {
    console.error("[IPC] sale:get/all error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to fetch sales",
      data: null,
    };
  }
};