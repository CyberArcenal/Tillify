
const saleService = require("../../../services/Sale");
const csv = require("csv-parse/sync");

/**
 * @param {Object} params
 * @param {string} params.csvData - Raw CSV string
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { csvData, user = "system" } = params;
    if (!csvData) return { status: false, message: "csvData is required", data: null };

    const records = csv.parse(csvData, { columns: true, skip_empty_lines: true });
    const results = [];
    for (const record of records) {
      const saleData = {
        // @ts-ignore
        items: JSON.parse(record.items || "[]"),
        // @ts-ignore
        customerId: record.customerId ? parseInt(record.customerId) : undefined,
        // @ts-ignore
        paymentMethod: record.paymentMethod,
        // @ts-ignore
        notes: record.notes,
        // @ts-ignore
        loyaltyRedeemed: record.loyaltyRedeemed ? parseInt(record.loyaltyRedeemed) : 0,
      };
      const created = await saleService.create(saleData, user, queryRunner);
      results.push(created);
    }

    console.log(`[IPC] sale:import_csv imported ${results.length} sales`);
    return {
      status: true,
      message: "Import successful",
      data: results,
    };
  } catch (error) {
    console.error("[IPC] sale:import_csv error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to import sales",
      data: null,
    };
  }
};