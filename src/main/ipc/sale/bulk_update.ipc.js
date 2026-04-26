
const Sale = require("../../../entities/Sale");

/**
 * Bulk update multiple sales (only allowed fields for initiated sales)
 * @param {Object} params
 * @param {Array<{id: number, updates: {paymentMethod?: string, notes?: string}}>} params.updates
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { updates, user } = params;
    if (!updates || !Array.isArray(updates)) {
      return { status: false, message: "updates array is required", data: null };
    }

    const saleRepo = queryRunner.manager.getRepository(Sale);
    const results = [];

    for (const item of updates) {
      const { id, updates: changes } = item;
      const sale = await saleRepo.findOne({ where: { id } });
      if (!sale) {
        results.push({ id, status: "failed", reason: "Sale not found" });
        continue;
      }
      if (sale.status !== "initiated") {
        results.push({ id, status: "failed", reason: "Only initiated sales can be updated" });
        continue;
      }

      if (changes.paymentMethod) sale.paymentMethod = changes.paymentMethod;
      if (changes.notes !== undefined) sale.notes = changes.notes;

      sale.updatedAt = new Date();
      const updated = await saleRepo.save(sale);
      results.push({ id, status: "success", data: updated });
    }

    console.log("[IPC] sale:bulk_update completed");
    return {
      status: true,
      message: "Bulk update processed",
      data: results,
    };
  } catch (error) {
    console.error("[IPC] sale:bulk_update error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to bulk update sales",
      data: null,
    };
  }
};