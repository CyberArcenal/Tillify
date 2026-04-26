// src/main/ipc/loyalty/export_csv.ipc.js


const loyaltyTransactionService = require("../../../services/LoyaltyTransaction");

/**
 * Export loyalty transactions to CSV format
 * @param {Object} params
 * @param {Object} [params.filters] - Same filters as getAll
 * @param {string} [params.user]
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    const filters = params.filters || {};
    const user = params.user || 'system';

    // Use the service's export method with format 'csv'
    const exportData = await loyaltyTransactionService.exportTransactions('csv', filters, user);

    return {
      status: true,
      data: exportData,
      message: 'CSV export generated successfully',
    };
  } catch (error) {
    console.error('Error in exportLoyaltyTransactionsToCSV:', error);
    return {
      status: false,
      message: error.message || 'Failed to export transactions to CSV',
      data: null,
    };
  }
};