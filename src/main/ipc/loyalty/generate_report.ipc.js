// src/main/ipc/loyalty/generate_report.ipc.js


const loyaltyTransactionService = require("../../../services/LoyaltyTransaction");

/**
 * Generate a loyalty report (summary and statistics)
 * @param {Object} params
 * @param {string} [params.startDate] - ISO start date
 * @param {string} [params.endDate] - ISO end date
 * @param {string} [params.groupBy] - 'day', 'week', 'month'
 * @param {string} [params.user]
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    const stats = await loyaltyTransactionService.getStatistics();

    let filteredData = null;
    if (params.startDate || params.endDate) {
      const filters = {};
      if (params.startDate) filters.startDate = params.startDate;
      if (params.endDate) filters.endDate = params.endDate;
      filters.limit = 1000;
      const allResult = await loyaltyTransactionService.findAll(filters);
      filteredData = allResult;
    }

    return {
      status: true,
      data: {
        statistics: stats,
        filteredTransactions: filteredData,
        reportGeneratedAt: new Date().toISOString(),
        params,
      },
      message: 'Loyalty report generated',
    };
  } catch (error) {
    console.error('Error in generateLoyaltyReport:', error);
    return {
      status: false,
      message: error.message || 'Failed to generate loyalty report',
      data: null,
    };
  }
};