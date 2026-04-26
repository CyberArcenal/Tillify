
const saleService = require("../../../../services/Sale");

/**
 * @param {Object} params
 * @param {number} params.id - Sale ID
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id } = params;
    if (!id) return { status: false, message: "id is required", data: null };

    console.log("[IPC] sale:get/by_id called", { id });
    const sale = await saleService.findById(id);
    return {
      status: true,
      message: "Sale found",
      data: sale,
    };
  } catch (error) {
    console.error("[IPC] sale:get/by_id error:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch sale",
      data: null,
    };
  }
};