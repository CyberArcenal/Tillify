

const customerService = require("../../../../services/Customer");

/**
 * Get loyalty transaction history for a customer
 * @param {Object} params
 * @param {number} params.id - Customer ID
 * @param {number} [params.page] - Page number
 * @param {number} [params.limit] - Items per page
 * @param {string} [params.sortBy] - Field to sort by
 * @param {string} [params.sortOrder] - Sort order
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { id, page, limit, sortBy, sortOrder } = params;
    if (!id || isNaN(id)) {
      throw new Error("Valid customer ID is required");
    }

    const options = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy,
      sortOrder,
    };

    const transactions = await customerService.getLoyaltyHistory(
      Number(id),
      options,
    );
    return {
      status: true,
      message: "Loyalty transactions retrieved successfully",
      data: transactions,
    };
  } catch (error) {
    console.error("Error in getLoyaltyTransactions:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve loyalty transactions",
      data: null,
    };
  }
};
