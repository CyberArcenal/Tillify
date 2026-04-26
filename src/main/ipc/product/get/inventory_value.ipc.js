// src/main/ipc/product/get/inventory_value.ipc

const { AppDataSource } = require("../../../db/datasource");
const Product = require("../../../../entities/Product");

/**
 * @param {Object} params (optional: filter by active only)
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params = {}) => {
  try {
    const productRepo = AppDataSource.getRepository(Product);
    const query = productRepo
      .createQueryBuilder("product")
      .select("SUM(product.price * product.stockQty)", "totalValue");

    if (params.activeOnly !== false) {
      query.where("product.isActive = :isActive", { isActive: true });
    }

    const result = await query.getRawOne();
    const totalValue = parseFloat(result?.totalValue) || 0;

    return {
      status: true,
      message: "Inventory value calculated successfully",
      data: { totalValue },
    };
  } catch (error) {
    console.error("Error in getInventoryValue:", error);
    return {
      status: false,
      message: error.message || "Failed to calculate inventory value",
      data: null,
    };
  }
};