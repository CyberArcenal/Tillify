// src/main/ipc/inventory/stock_valuation.ipc.js

const { AppDataSource } = require("../../db/dataSource");
const Product = require("../../../entities/Product");

/**
 * Calculate current stock valuation (cost * quantity).
 * @param {Object} params
 * @param {number[]} [params.productIds] - Restrict to specific products.
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { productIds } = params;
    const productRepo = queryRunner
      ? queryRunner.manager.getRepository(Product)
      : AppDataSource.getRepository(Product);

    const queryBuilder = productRepo
      .createQueryBuilder("product")
      .where("product.isActive = :active", { active: true });

    if (productIds && productIds.length > 0) {
      queryBuilder.andWhere("product.id IN (:...productIds)", { productIds });
    }

    const products = await queryBuilder.getMany();

    let totalValue = 0;
    const details = products.map((p) => {
      const value = parseFloat(p.price) * p.stockQty;
      totalValue += value;
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQty: p.stockQty,
        price: p.price,
        value,
      };
    });

    return {
      status: true,
      message: "Stock valuation calculated",
      data: {
        totalValue,
        currency: "PHP", // or configurable
        details,
      },
    };
  } catch (error) {
    console.error("Error in generateStockValuationReport:", error);
    return {
      status: false,
      message: error.message || "Valuation failed",
      data: null,
    };
  }
};