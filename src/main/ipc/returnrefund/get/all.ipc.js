
const returnRefundService = require('../../../../services/ReturnRefundService');

/**
 * Get all returns with optional filtering, sorting, and pagination.
 * @param {Object} params - Query parameters.
 * @param {string} [params.status] - Filter by status.
 * @param {number} [params.saleId] - Filter by sale ID.
 * @param {number} [params.customerId] - Filter by customer ID.
 * @param {string} [params.startDate] - ISO date string for start of range.
 * @param {string} [params.endDate] - ISO date string for end of range.
 * @param {string} [params.search] - Search term for reference or reason.
 * @param {string} [params.sortBy='createdAt'] - Field to sort by.
 * @param {'ASC'|'DESC'} [params.sortOrder='DESC'] - Sort order.
 * @param {number} [params.page] - Page number (1-indexed).
 * @param {number} [params.limit] - Items per page.
 * @param {import('typeorm').QueryRunner} queryRunner - Transaction runner (optional for reads).
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const returns = await returnRefundService.findAll(params || {}, queryRunner);
    return {
      status: true,
      message: "Returns fetched successfully",
      data: returns,
    };
  } catch (error) {
    console.error("Error in getAllReturns handler:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch returns",
      data: null,
    };
  }
};