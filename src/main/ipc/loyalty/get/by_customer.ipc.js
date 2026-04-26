// src/main/ipc/loyalty/get/by_customer.ipc.js


const loyaltyTransactionService = require("../../../../services/LoyaltyTransaction");

/**
 * Get loyalty transactions for a specific customer
 * @param {Object} params
 * @param {number} params.customerId - Customer ID
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    if (!params.customerId) {
      return { status: false, message: 'Missing required parameter: customerId', data: null };
    }
    const transactions = await loyaltyTransactionService.findAll({
      customerId: params.customerId,
      page: params.page,
      limit: params.limit,
      sortBy: 'timestamp',
      sortOrder: 'DESC',
    });
    return {
      status: true,
      data: transactions,
    };
  } catch (error) {
    console.error('Error in getLoyaltyTransactionsByCustomer:', error);
    return {
      status: false,
      message: error.message || 'Failed to fetch transactions for customer',
      data: null,
    };
  }
};