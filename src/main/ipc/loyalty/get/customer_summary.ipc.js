// src/main/ipc/loyalty/get/customer_summary.ipc.js


const customerService = require("../../../../services/Customer");
const loyaltyTransactionService = require("../../../../services/LoyaltyTransaction");

/**
 * Get loyalty summary for a specific customer
 * @param {Object} params
 * @param {number} params.customerId - Customer ID
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  try {
    if (!params.customerId) {
      return { status: false, message: 'Missing required parameter: customerId', data: null };
    }
    const customerId = Number(params.customerId);

    const customer = await customerService.findById(customerId);
    if (!customer) {
      return { status: false, message: `Customer with ID ${customerId} not found`, data: null };
    }

    // Recent transactions (last 10)
    const recentTransactions = await loyaltyTransactionService.findAll({
      customerId,
      limit: 10,
      sortBy: 'timestamp',
      sortOrder: 'DESC',
    });

    // Points earned this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const allThisMonth = await loyaltyTransactionService.findAll({
      customerId,
      startDate: startOfMonth.toISOString(),
      endDate: endOfMonth.toISOString(),
    });
    const earnedThisMonth = allThisMonth
      .filter(tx => tx.pointsChange > 0)
      .reduce((sum, tx) => sum + tx.pointsChange, 0);
    const redeemedThisMonth = allThisMonth
      .filter(tx => tx.pointsChange < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.pointsChange), 0);

    return {
      status: true,
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          loyaltyPointsBalance: customer.loyaltyPointsBalance,
        },
        summary: {
          earnedThisMonth,
          redeemedThisMonth,
        },
        recentTransactions,
      },
    };
  } catch (error) {
    console.error('Error in getCustomerLoyaltySummary:', error);
    return {
      status: false,
      message: error.message || 'Failed to fetch customer loyalty summary',
      data: null,
    };
  }
};