
const saleService = require("../../../services/Sale");

/**
 * Search sales by query string
 * @param {Object} params
 * @param {string} params.query - search term
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { query } = params;
    if (!query) return { status: false, message: "query is required", data: null };

    console.log("[IPC] sale:search called", { query });
    const sales = await saleService.findAll({ search: query }, queryRunner);
    return {
      status: true,
      message: "Search results",
      data: sales,
    };
  } catch (error) {
    console.error("[IPC] sale:search error:", error);
    return {
      status: false,
      message: error.message || "Failed to search sales",
      data: null,
    };
  }
};