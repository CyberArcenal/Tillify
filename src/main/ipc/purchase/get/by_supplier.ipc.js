// src/main/ipc/purchase/get/by_supplier.ipc.js


const purchaseService = require("../../../../services/PurchaseService");

/**
 * Get purchases by supplier ID
 * @param {Object} params
 * @param {number} params.supplierId - Supplier ID
 * @param {Object} [options] - Additional filters/pagination
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { supplierId, ...otherParams } = params;
    if (!supplierId) {
      return {
        status: false,
        message: "Supplier ID is required",
        data: null,
      };
    }

    const purchases = await purchaseService.findAll({
      supplierId,
      ...otherParams,
    });
    return {
      status: true,
      message: `Purchases for supplier ID ${supplierId} retrieved successfully`,
      data: purchases,
    };
  } catch (error) {
    console.error("Error in getPurchasesBySupplier:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve purchases by supplier",
      data: null,
    };
  }
};
