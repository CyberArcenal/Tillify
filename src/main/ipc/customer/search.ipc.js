

const customerService = require("../../../services/Customer");

/**
 * Search customers by name or contact (wrapper for findAll with search)
 * @param {Object} params
 * @param {string} params.query - Search query
 * @param {number} [params.limit] - Max results
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { query, limit } = params;
    if (!query || typeof query !== "string") {
      throw new Error("Search query is required");
    }

    const customers = await customerService.findAll({
      search: query,
      sortBy: "name",
      sortOrder: "ASC",
      limit: limit ? Number(limit) : undefined,
    });

    return {
      status: true,
      message: "Search completed successfully",
      data: customers,
    };
  } catch (error) {
    console.error("Error in searchCustomers:", error);
    return {
      status: false,
      message: error.message || "Failed to search customers",
      data: null,
    };
  }
};
