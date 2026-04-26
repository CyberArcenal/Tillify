
const Sale = require("../../../entities/Sale");

/**
 * Update an existing sale (only allowed for initiated sales, limited fields)
 * @param {Object} params
 * @param {number} params.id
 * @param {Partial<{paymentMethod: string, notes: string}>} params.updates
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { id, updates, user } = params;
    if (!id) return { status: false, message: "id is required", data: null };

    const saleRepo = queryRunner.manager.getRepository(Sale);
    const sale = await saleRepo.findOne({ where: { id } });
    if (!sale) return { status: false, message: "Sale not found", data: null };
    if (sale.status !== "initiated") {
      return { status: false, message: "Only initiated sales can be updated", data: null };
    }

    // Allowed updates
    if (updates.paymentMethod) sale.paymentMethod = updates.paymentMethod;
    if (updates.notes !== undefined) sale.notes = updates.notes;

    sale.updatedAt = new Date();
    const updatedSale = await saleRepo.save(sale);

    // Log audit (optional)
    // await auditLogger.logUpdate(...)

    console.log("[IPC] sale:update success", { id });
    return {
      status: true,
      message: "Sale updated",
      data: updatedSale,
    };
  } catch (error) {
    console.error("[IPC] sale:update error:", error);
    return {
      status: false,
      message: error.message || "Failed to update sale",
      data: null,
    };
  }
};