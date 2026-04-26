// src/main/ipc/loyalty/get/statistics.ipc.js


const loyaltyTransactionService = require("../../../../services/LoyaltyTransaction");

/**
 * Get loyalty statistics (totals, trends, top customers)
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async () => {
  try {
    const stats = await loyaltyTransactionService.getStatistics();
    return {
      status: true,
      data: stats,
    };
  } catch (error) {
    console.error('Error in getLoyaltyStatistics:', error);
    return {
      status: false,
      message: error.message || 'Failed to compute loyalty statistics',
      data: null,
    };
  }
};