// src/main/ipc/loyalty/get/by_id.ipc.js


const loyaltyTransactionService = require("../../../../services/LoyaltyTransaction");

/**
 * Get a single loyalty transaction by ID
 * @param {Object} params
 * @param {number} params.id - Transaction ID
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    if (!params.id) {
      return { status: false, message: 'Missing required parameter: id', data: null };
    }
    const transaction = await loyaltyTransactionService.findById(Number(params.id));
    return {
      status: true,
      data: transaction,
    };
  } catch (error) {
    console.error('Error in getLoyaltyTransactionById:', error);
    return {
      status: false,
      message: error.message || 'Failed to fetch loyalty transaction',
      data: null,
    };
  }
};