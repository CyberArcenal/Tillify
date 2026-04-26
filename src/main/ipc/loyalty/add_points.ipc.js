// src/main/ipc/loyalty/add_points.ipc.js


const customerService = require("../../../services/Customer");

/**
 * Add loyalty points to a customer
 * @param {Object} params
 * @param {number} params.customerId
 * @param {number} params.points - Positive number of points to add
 * @param {string} [params.notes]
 * @param {number} [params.saleId]
 * @param {string} [params.user]
 * @param {import("typeorm").QueryRunner} queryRunner
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { customerId, points, notes, saleId, user = 'system' } = params;

    if (!customerId) {
      return { status: false, message: 'customerId is required', data: null };
    }
    if (!points || points <= 0) {
      return { status: false, message: 'points must be a positive number', data: null };
    }

    const result = await customerService.addLoyaltyPoints(
      Number(customerId),
      Number(points),
      notes || null,
      saleId ? Number(saleId) : null,
      user,
      queryRunner
    );

    return {
      status: true,
      data: result,
      message: 'Loyalty points added successfully',
    };
  } catch (error) {
    console.error('Error in addLoyaltyPoints:', error);
    return {
      status: false,
      message: error.message || 'Failed to add loyalty points',
      data: null,
    };
  }
};