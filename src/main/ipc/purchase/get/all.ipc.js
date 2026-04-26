// src/main/ipc/purchase/get/all.ipc.js


const purchaseService = require("../../../../services/PurchaseService");


/**
 * Get all purchases with optional filtering and pagination
 * @param {Object} params - Query parameters
 * @param {string} [params.status] - Filter by status
 * @param {number} [params.supplierId] - Filter by supplier ID
 * @param {string} [params.startDate] - Filter by start date (ISO string)
 * @param {string} [params.endDate] - Filter by end date (ISO string)
 * @param {string} [params.search] - Search by reference number
 * @param {string} [params.sortBy] - Sort field (default: 'orderDate')
 * @param {'ASC'|'DESC'} [params.sortOrder] - Sort order (default: 'DESC')
 * @param {number} [params.page] - Page number for pagination
 * @param {number} [params.limit] - Items per page
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const purchases = await purchaseService.findAll(params);
    return {
      status: true,
      message: "Purchases retrieved successfully",
      data: purchases,
    };
  } catch (error) {
    console.error("Error in getAllPurchases:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve purchases",
      data: null,
    };
  }
};