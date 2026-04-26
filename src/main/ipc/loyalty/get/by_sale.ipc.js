// src/main/ipc/loyalty/get/by_sale.ipc.js


const loyaltyTransactionService = require("../../../../services/LoyaltyTransaction");

/**
 * Get loyalty transactions linked to a specific sale
 * @param {Object} params
 * @param {number} params.saleId - Sale ID
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    if (!params.saleId) {
      return { status: false, message: 'Missing required parameter: saleId', data: null };
    }
    const transactions = await loyaltyTransactionService.findAll({
      saleId: params.saleId,
      sortBy: 'timestamp',
      sortOrder: 'DESC',
    });
    return {
      status: true,
      data: transactions,
    };
  } catch (error) {
    console.error('Error in getLoyaltyTransactionsBySale:', error);
    return {
      status: false,
      message: error.message || 'Failed to fetch transactions for sale',
      data: null,
    };
  }
};