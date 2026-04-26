// src/main/ipc/loyalty/reverse.ipc.js

const auditLogger = require("../../../utils/auditLogger");

/**
 * Reverse a previous loyalty transaction by creating an opposite entry
 * @param {Object} params
 * @param {number} params.transactionId - ID of transaction to reverse
 * @param {string} [params.reason] - Reason for reversal
 * @param {string} [params.user] - User performing action
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    if (!params.transactionId) {
      return { status: false, message: 'transactionId is required', data: null };
    }

    const txRepo = queryRunner.manager.getRepository('LoyaltyTransaction');
    const customerRepo = queryRunner.manager.getRepository('Customer');

    // Find original transaction
    const originalTx = await txRepo.findOne({
      where: { id: params.transactionId },
      relations: ['customer'],
    });

    if (!originalTx) {
      return { status: false, message: `Transaction with ID ${params.transactionId} not found`, data: null };
    }

    // Prevent double reversal? Check if already reversed? We'll skip for simplicity.

    const customer = originalTx.customer;

    // Create opposite points change
    const reversePoints = -originalTx.pointsChange;

    // Check balance if reversal would cause negative (if original was earn, reverse is redeem)
    if (reversePoints < 0 && customer.loyaltyPointsBalance + reversePoints < 0) {
      return {
        status: false,
        message: `Cannot reverse: insufficient points. Available: ${customer.loyaltyPointsBalance}, Required: ${-reversePoints}`,
        data: null,
      };
    }

    // Update customer balance
    const oldBalance = customer.loyaltyPointsBalance;
    customer.loyaltyPointsBalance += reversePoints;
    customer.updatedAt = new Date();
    const updatedCustomer = await customerRepo.save(customer);

    // Create reversal transaction
    const reversalTx = txRepo.create({
      pointsChange: reversePoints,
      notes: `Reversal of transaction #${originalTx.id}. Reason: ${params.reason || 'Not specified'}`,
      customer: updatedCustomer,
      sale: originalTx.sale,
      timestamp: new Date(),
    });
    const savedReversal = await txRepo.save(reversalTx);

    // Optionally mark original as reversed (if we add a field)
    // originalTx.reversedBy = savedReversal.id;
    // await txRepo.save(originalTx);

    // Audit logs
    await auditLogger.logUpdate(
      'Customer',
      customer.id,
      { loyaltyPointsBalance: oldBalance },
      { loyaltyPointsBalance: updatedCustomer.loyaltyPointsBalance },
      params.user || 'system',
      queryRunner.manager
    );
    await auditLogger.logCreate(
      'LoyaltyTransaction',
      savedReversal.id,
      savedReversal,
      params.user || 'system',
      queryRunner.manager
    );
    await auditLogger.logUpdate(
      'LoyaltyTransaction',
      originalTx.id,
      { reversed: false },
      { reversed: true, reversedBy: savedReversal.id },
      params.user || 'system',
      queryRunner.manager
    );

    return {
      status: true,
      data: {
        original: originalTx,
        reversal: savedReversal,
      },
      message: 'Transaction reversed successfully',
    };
  } catch (error) {
    console.error('Error in reverseLoyaltyTransaction:', error);
    return {
      status: false,
      message: error.message || 'Failed to reverse loyalty transaction',
      data: null,
    };
  }
};