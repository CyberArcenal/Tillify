// src/main/ipc/loyalty/get/all.ipc.js


const loyaltyTransactionService = require("../../../../services/LoyaltyTransaction");

/**
 * Get all loyalty transactions with optional filtering and pagination
 * @param {Object} params - Filter and pagination parameters
 * @param {number} [params.page] - Page number (1-based)
 * @param {number} [params.limit] - Items per page
 * @param {string} [params.sortBy] - Field to sort by (e.g., 'timestamp')
 * @param {'ASC'|'DESC'} [params.sortOrder] - Sort order
 * @param {number} [params.customerId] - Filter by customer ID
 * @param {number} [params.saleId] - Filter by sale ID
 * @param {string} [params.startDate] - ISO date string for start of range
 * @param {string} [params.endDate] - ISO date string for end of range
 * @param {'earn'|'redeem'} [params.type] - Filter by transaction type
 * @param {string} [params.search] - Search in notes
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    const filters = {
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      customerId: params.customerId,
      saleId: params.saleId,
      startDate: params.startDate,
      endDate: params.endDate,
      type: params.type,
      search: params.search,
    };
    // Remove undefined keys
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

    const transactions = await loyaltyTransactionService.findAll(filters);
    return {
      status: true,
      data: transactions,
    };
  } catch (error) {
    console.error('Error in getAllLoyaltyTransactions:', error);
    return {
      status: false,
      message: error.message || 'Failed to fetch loyalty transactions',
      data: null,
    };
  }
};