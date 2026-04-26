

const saleService = require("../../../../services/Sale");

/**
 * Get sales by customer ID
 * @param {Object} params
 * @param {number} params.customerId
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { customerId } = params;
    if (!customerId) return { status: false, message: "customerId is required", data: null };

    console.log("[IPC] sale:get/by_customer called", { customerId });
    const sales = await saleService.findAll({ customerId });
    return {
      status: true,
      message: "Sales retrieved",
      data: sales,
    };
  } catch (error) {
    console.error("[IPC] sale:get/by_customer error:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch sales by customer",
      data: null,
    };
  }
};