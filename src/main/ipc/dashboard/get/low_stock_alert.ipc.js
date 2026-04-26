// src/main/ipc/dashboard/get/low_stock_alert.ipc.js
const Product = require("../../../../entities/Product");
const { AppDataSource } = require("../../../db/dataSource");

/**
 * Get products with stock below threshold
 * @param {Object} params - { threshold?: number }
 * @returns {Promise<{status: boolean, message: string, data: Array}>}
 */
module.exports = async (params = {}) => {
  try {
    const threshold = params.threshold || 5;

    const productRepo = AppDataSource.getRepository(Product);

    const products = await productRepo
      .createQueryBuilder("product")
      .where("product.stockQty <= :threshold", { threshold })
      .andWhere("product.isActive = :active", { active: true })
      .orderBy("product.stockQty", "ASC")
      .getMany();

    return {
      status: true,
      message: "Low stock alert retrieved",
      data: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        stockQty: p.stockQty,
        price: p.price,
      })),
    };
  } catch (error) {
    console.error("Error in getLowStockAlert:", error);
    return {
      status: false,
      message: error.message || "Failed to get low stock alert",
      data: null,
    };
  }
};