const customerService = require("../../../services/Customer");

/**
 * Import customers from a CSV file
 * @param {Object} params
 * @param {string} params.filePath - Full path to CSV file
 * @param {string} [params.user] - User
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  const { filePath, user = "system" } = params;

  if (!filePath || typeof filePath !== "string") {
    return { status: false, message: "Valid file path required", data: null };
  }

  try {
    const result = await customerService.importFromCSV(filePath, user, queryRunner);
    return {
      status: result.errors.length === 0,
      message: `Import completed. Imported: ${result.imported.length}, Errors: ${result.errors.length}`,
      data: result,
    };
  } catch (error) {
    console.error("Error in importCustomersFromCSV:", error);
    return {
      status: false,
      message: error.message || "CSV import failed",
      data: null,
    };
  }
};