// src/main/ipc/dashboard/get/inventory_status.ipc.js
const Product = require("../../../../entities/Product");
const { AppDataSource } = require("../../../db/dataSource");

/**
 * Get current inventory status: total products, total value, low stock items (list)
 * @param {Object} params - { lowStockThreshold?: number }
 * @returns {Promise<{status: boolean, message: string, data: Object}>}
 */
module.exports = async (params = {}) => {
  try {
    const threshold = params.lowStockThreshold || 5;

    const productRepo = AppDataSource.getRepository(Product);

    const products = await productRepo.find();

    const totalProducts = products.length;
    const totalValue = products.reduce(
      (sum, p) => sum + parseFloat(p.price) * p.stockQty,
      0,
    );

    const lowStockItems = products
      .filter((p) => p.stockQty <= threshold && p.isActive)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        stockQty: p.stockQty,
        price: p.price,
      }));

    return {
      status: true,
      message: "Inventory status retrieved",
      data: {
        totalProducts,
        totalValue,
        lowStockCount: lowStockItems.length,
        lowStockItems,
      },
    };
  } catch (error) {
    console.error("Error in getInventoryStatus:", error);
    return {
      status: false,
      message: error.message || "Failed to get inventory status",
      data: null,
    };
  }
};