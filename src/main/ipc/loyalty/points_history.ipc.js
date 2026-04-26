// src/main/ipc/loyalty/points_history.ipc.js


const customerService = require("../../../services/Customer");

/**
 * Generate points history for a specific customer (running balance over time)
 * @param {Object} params
 * @param {number} params.customerId
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    if (!params.customerId) {
      return { status: false, message: 'customerId is required', data: null };
    }

    // Get all transactions for customer (unpaginated)
    const transactions = await customerService.getLoyaltyHistory(
      Number(params.customerId),
      {
        sortBy: 'timestamp',
        sortOrder: 'ASC',
      }
    );

    // Filter by date range manually if needed (service doesn't support date filters directly)
    let filtered = transactions;
    if (params.startDate) {
      const start = new Date(params.startDate);
      filtered = filtered.filter(tx => new Date(tx.timestamp) >= start);
    }
    if (params.endDate) {
      const end = new Date(params.endDate);
      filtered = filtered.filter(tx => new Date(tx.timestamp) <= end);
    }

    // Compute running balance
    let balance = 0;
    const history = filtered.map(tx => {
      balance += tx.pointsChange;
      return {
        id: tx.id,
        date: tx.timestamp,
        pointsChange: tx.pointsChange,
        runningBalance: balance,
        notes: tx.notes,
        saleId: tx.saleId,
      };
    });

    return {
      status: true,
      data: {
        customerId: params.customerId,
        history,
        currentBalance: balance,
      },
    };
  } catch (error) {
    console.error('Error in generatePointsHistory:', error);
    return {
      status: false,
      message: error.message || 'Failed to generate points history',
      data: null,
    };
  }
};