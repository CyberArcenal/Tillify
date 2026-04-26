// src/main/ipc/purchase/get/by_date.ipc.js


const purchaseService = require("../../../../services/PurchaseService");

/**
 * Get purchases within a date range
 * @param {Object} params
 * @param {string} params.startDate - Start date (ISO string)
 * @param {string} params.endDate - End date (ISO string)
 * @param {Object} [options] - Additional filters
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { startDate, endDate, ...otherParams } = params;
    if (!startDate || !endDate) {
      return {
        status: false,
        message: "Both startDate and endDate are required",
        data: null,
      };
    }

    const purchases = await purchaseService.findAll({
      startDate,
      endDate,
      ...otherParams,
    });
    return {
      status: true,
      message: `Purchases between ${startDate} and ${endDate} retrieved successfully`,
      data: purchases,
    };
  } catch (error) {
    console.error("Error in getPurchasesByDate:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve purchases by date",
      data: null,
    };
  }
};
