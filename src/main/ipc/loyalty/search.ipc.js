// src/main/ipc/loyalty/search.ipc.js


const loyaltyTransactionService = require("../../../services/LoyaltyTransaction");

/**
 * Search loyalty transactions by various criteria
 * @param {Object} params
 * @param {string} [params.query] - Search term for notes or customer name
 * @param {number} [params.customerId]
 * @param {number} [params.saleId]
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @param {number} [params.minPoints]
 * @param {number} [params.maxPoints]
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    const filters = {
      customerId: params.customerId,
      saleId: params.saleId,
      startDate: params.startDate,
      endDate: params.endDate,
      search: params.query, // service uses 'search' for notes
      page: params.page,
      limit: params.limit,
      sortBy: 'timestamp',
      sortOrder: 'DESC',
    };
    // Note: minPoints/maxPoints are not directly supported by service findAll; we could implement later.
    // For now, ignore them or fetch all and filter. Simpler: ignore.
    if (params.minPoints !== undefined || params.maxPoints !== undefined) {
      // Fallback: get all and filter in memory (simple but not efficient)
      const all = await loyaltyTransactionService.findAll({ ...filters, limit: 1000 });
      let filtered = all;
      if (params.minPoints !== undefined) {
        filtered = filtered.filter(tx => Math.abs(tx.pointsChange) >= params.minPoints);
      }
      if (params.maxPoints !== undefined) {
        filtered = filtered.filter(tx => Math.abs(tx.pointsChange) <= params.maxPoints);
      }
      return {
        status: true,
        data: {
          transactions: filtered,
          total: filtered.length,
          page: params.page || 1,
          limit: params.limit || filtered.length,
        },
      };
    }

    const transactions = await loyaltyTransactionService.findAll(filters);
    return {
      status: true,
      data: {
        transactions,
        total: transactions.length,
        page: params.page || 1,
        limit: params.limit || transactions.length,
      },
    };
  } catch (error) {
    console.error('Error in searchLoyaltyTransactions:', error);
    return {
      status: false,
      message: error.message || 'Failed to search loyalty transactions',
      data: null,
    };
  }
};