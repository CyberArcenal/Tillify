// src/main/ipc/purchase/bulk_create.ipc.js


const purchaseService = require('../../../services/PurchaseService');


/**
 * Create multiple purchases in bulk
 * @param {Object} params
 * @param {Array<Object>} params.purchases - Array of purchase data objects
 * @param {string} [params.user] - User performing the action
 * @param {import('typeorm').QueryRunner} [queryRunner] - Transaction query runner
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { purchases, user = "system" } = params;
    if (!Array.isArray(purchases) || purchases.length === 0) {
      return {
        status: false,
        message: "purchases array is required and must not be empty",
        data: null,
      };
    }

    const createdPurchases = [];
    const errors = [];

    for (const data of purchases) {
      try {
        const created = await purchaseService.create(data, user, queryRunner);
        createdPurchases.push(created);
      } catch (err) {
        errors.push({ data, error: err.message });
      }
    }

    return {
      status: errors.length === 0,
      message:
        errors.length === 0
          ? "All purchases created successfully"
          : `${createdPurchases.length} created, ${errors.length} failed`,
      data: { created: createdPurchases, errors },
    };
  } catch (error) {
    console.error("Error in bulkCreatePurchases:", error);
    return {
      status: false,
      message: error.message || "Failed to bulk create purchases",
      data: null,
    };
  }
};
