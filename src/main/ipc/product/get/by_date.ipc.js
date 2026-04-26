// src/main/ipc/product/get/by_date.ipc

const { Between } = require("typeorm");
const { AppDataSource } = require("../../../db/datasource");
const Product = require("../../../../entities/Product");

/**
 * @param {Object} params
 * @param {string} params.startDate - ISO date string
 * @param {string} params.endDate   - ISO date string
 * @param {string} [params.field]   - 'createdAt' or 'updatedAt' (default 'createdAt')
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  const { startDate, endDate, field = "createdAt" } = params;
  if (!startDate || !endDate) {
    return { status: false, message: "startDate and endDate are required", data: null };
  }

  try {
    const productRepo = AppDataSource.getRepository(Product);
    const products = await productRepo.find({
      where: {
        [field]: Between(new Date(startDate), new Date(endDate)),
      },
      order: { [field]: "DESC" },
    });

    return {
      status: true,
      message: "Products by date retrieved successfully",
      data: products,
    };
  } catch (error) {
    console.error("Error in getProductsByDate:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve products by date",
      data: null,
    };
  }
};