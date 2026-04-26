// src/main/ipc/loyalty/bulk_create.ipc.js


const loyaltyTransactionService = require("../../../services/LoyaltyTransaction");

/**
 * Bulk create multiple loyalty transactions
 * @param {Object} params
 * @param {Array<{customerId: number, pointsChange: number, notes?: string, saleId?: number}>} params.transactions
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { transactions, user = 'system' } = params;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return { status: false, message: 'transactions array is required and cannot be empty', data: null };
    }

    const result = await loyaltyTransactionService.bulkCreate(transactions, user, queryRunner);

    const success = result.errors.length === 0;
    return {
      status: success,
      data: result,
      message: success
        ? `Successfully created ${result.created.length} transactions`
        : `Created ${result.created.length} transactions with ${result.errors.length} errors`,
    };
  } catch (error) {
    console.error('Error in bulkCreateLoyaltyTransactions:', error);
    return {
      status: false,
      message: error.message || 'Failed to bulk create loyalty transactions',
      data: null,
    };
  }
};