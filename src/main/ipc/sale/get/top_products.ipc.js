
const SaleItem = require("../../../../entities/SaleItem");
const { AppDataSource } = require("../../../db/datasource");

/**
 * @param {Object} params
 * @param {string} [params.startDate] - ISO date
 * @param {string} [params.endDate]
 * @param {number} [params.limit=10]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { startDate, endDate, limit = 10 } = params;

    const saleItemRepo = queryRunner.manager.getRepository(SaleItem);
    const query = saleItemRepo
      .createQueryBuilder("item")
      .leftJoin("item.product", "product")
      .select("product.id", "productId")
      .addSelect("product.name", "productName")
      .addSelect("SUM(item.quantity)", "totalQuantity")
      .addSelect("SUM(item.lineTotal)", "totalRevenue")
      .groupBy("product.id")
      .orderBy("totalQuantity", "DESC")
      .limit(limit);

    if (startDate) {
      query.andWhere("item.createdAt >= :startDate", { startDate });
    }
    if (endDate) {
      query.andWhere("item.createdAt <= :endDate", { endDate });
    }

    const topProducts = await query.getRawMany();

    console.log("[IPC] sale:get/top_products called", { startDate, endDate, limit });
    return {
      status: true,
      message: "Top products retrieved",
      data: topProducts,
    };
  } catch (error) {
    console.error("[IPC] sale:get/top_products error:", error);
    return {
      status: false,
      message: error.message || "Failed to fetch top products",
      data: null,
    };
  }
};