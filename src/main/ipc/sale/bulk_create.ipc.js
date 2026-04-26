
const saleService = require("../../../services/Sale");

/**
 * @param {Object} params
 * @param {Array<Object>} params.sales - Array of sale data objects
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { sales, user } = params;
    if (!sales || !Array.isArray(sales)) {
      return { status: false, message: "sales array is required", data: null };
    }

    const results = [];
    for (const saleData of sales) {
      const created = await saleService.create(saleData, user || "system", queryRunner);
      results.push(created);
    }

    console.log(`[IPC] sale:bulk_create created ${results.length} sales`);
    return {
      status: true,
      message: "Bulk create successful",
      data: results,
    };
  } catch (error) {
    console.error("[IPC] sale:bulk_create error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to bulk create sales",
      data: null,
    };
  }
};