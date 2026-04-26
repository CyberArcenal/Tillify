// src/main/ipc/product/get/by_sku.ipc

const { AppDataSource } = require("../../../db/dataSource");
const Product = require("../../../../entities/Product");

/**
 * @param {Object} params
 * @param {string} params.sku
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  const { sku } = params;
  if (!sku || typeof sku !== "string") {
    return { status: false, message: "Valid SKU is required", data: null };
  }

  try {
    const productRepo = AppDataSource.getRepository(Product);
    const product = await productRepo.findOne({ where: { sku } });
    if (!product) {
      return { status: false, message: `Product with SKU ${sku} not found`, data: null };
    }
    return {
      status: true,
      message: "Product retrieved successfully",
      data: product,
    };
  } catch (error) {
    console.error("Error in getProductBySKU:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve product",
      data: null,
    };
  }
};