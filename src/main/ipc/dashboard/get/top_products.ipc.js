// src/main/ipc/dashboard/get/top_products.ipc.js
const SaleItem = require("../../../../entities/SaleItem");
const { AppDataSource } = require("../../../db/dataSource");

/**
 * Get top selling products by quantity or revenue
 * @param {Object} params - { limit?: number, orderBy?: 'quantity'|'revenue', startDate?: Date, endDate?: Date }
 */
module.exports = async (params = {}) => {
  try {
    const limit = params.limit || 5;
    const orderBy = params.orderBy || "quantity"; // 'quantity' or 'revenue'
    const { startDate, endDate } = params;

    const saleItemRepo = AppDataSource.getRepository(SaleItem);

    const queryBuilder = saleItemRepo
      .createQueryBuilder("item")
      .leftJoinAndSelect("item.product", "product")
      .leftJoin("item.sale", "sale")
      .select([
        "product.id as productId",
        "product.name as productName",
        "product.sku as sku",
        "SUM(item.quantity) as totalQuantity",
        "SUM(item.lineTotal) as totalRevenue",
      ])
      .where("sale.status = :status", { status: "paid" })
      .groupBy("product.id")
      .orderBy(orderBy === "quantity" ? "totalQuantity" : "totalRevenue", "DESC")
      .limit(limit);

    if (startDate) {
      queryBuilder.andWhere("sale.timestamp >= :startDate", { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere("sale.timestamp <= :endDate", { endDate });
    }

    const results = await queryBuilder.getRawMany();

    return {
      status: true,
      message: "Top products retrieved",
      data: results.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        sku: r.sku,
        totalQuantity: parseInt(r.totalQuantity),
        totalRevenue: parseFloat(r.totalRevenue),
      })),
    };
  } catch (error) {
    console.error("Error in getTopProducts:", error);
    return {
      status: false,
      message: error.message || "Failed to get top products",
      data: null,
    };
  }
};