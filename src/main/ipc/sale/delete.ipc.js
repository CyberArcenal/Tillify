
const Sale = require("../../../entities/Sale");

/**
 * Hard delete a sale (use only for testing/cleanup)
 * @param {Object} params
 * @param {number} params.id
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id } = params;
    if (!id) return { status: false, message: "id is required", data: null };

    const saleRepo = queryRunner.manager.getRepository(Sale);
    const sale = await saleRepo.findOne({ where: { id } });
    if (!sale) return { status: false, message: "Sale not found", data: null };

    await saleRepo.remove(sale);

    console.log("[IPC] sale:delete success", { id });
    return {
      status: true,
      message: "Sale deleted",
      data: { id },
    };
  } catch (error) {
    console.error("[IPC] sale:delete error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to delete sale",
      data: null,
    };
  }
};