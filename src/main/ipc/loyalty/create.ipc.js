// src/main/ipc/loyalty/create.ipc.js


const loyaltyTransactionService = require("../../../services/LoyaltyTransaction");

/**
 * Create a manual loyalty transaction (adjustment)
 * @param {Object} params
 * @param {number} params.customerId
 * @param {number} params.pointsChange - Positive for earn, negative for redeem
 * @param {string} [params.notes]
 * @param {number} [params.saleId] - Optional associated sale
 * @param {string} [params.user] - User performing action (default 'system')
 * @param {import("typeorm").QueryRunner} queryRunner - Transaction query runner
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    if (!params.customerId) {
      return { status: false, message: 'customerId is required', data: null };
    }
    if (params.pointsChange === undefined || params.pointsChange === 0) {
      return { status: false, message: 'pointsChange must be non-zero', data: null };
    }

    const data = {
      customerId: params.customerId,
      pointsChange: params.pointsChange,
      notes: params.notes,
      saleId: params.saleId,
    };
    const savedTx = await loyaltyTransactionService.createManual(data, params.user || 'system', queryRunner);

    return {
      status: true,
      data: savedTx,
      message: 'Loyalty transaction created successfully',
    };
  } catch (error) {
    console.error('Error in createLoyaltyTransaction:', error);
    return {
      status: false,
      message: error.message || 'Failed to create loyalty transaction',
      data: null,
    };
  }
};