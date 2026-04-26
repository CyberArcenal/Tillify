// src/main/ipc/product/get/sales_report.ipc

const { AppDataSource } = require("../../../db/datasource");
const SaleItem = require("../../../../entities/SaleItem");

/**
 * @param {Object} params
 * @param {string} [params.startDate] - ISO date
 * @param {string} [params.endDate]   - ISO date
 * @param {number} [params.productId] - filter by product
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  const { startDate, endDate, productId } = params;

  try {
    const query = AppDataSource.getRepository(SaleItem)
      .createQueryBuilder("saleItem")
      .leftJoinAndSelect("saleItem.product", "product")
      .leftJoin("saleItem.sale", "sale")
      .select([
        "product.id AS productId",
        "product.name AS productName",
        "product.sku AS productSku",
        "SUM(saleItem.quantity) AS totalQuantity",
        "SUM(saleItem.lineTotal) AS totalRevenue",
        "AVG(saleItem.unitPrice) AS avgPrice",
      ])
      .where("sale.status = :status", { status: "paid" });

    if (startDate && endDate) {
      query.andWhere("sale.timestamp BETWEEN :start AND :end", {
        start: new Date(startDate),
        end: new Date(endDate),
      });
    }
    if (productId) {
      query.andWhere("product.id = :productId", { productId });
    }

    query.groupBy("product.id");

    const report = await query.getRawMany();

    return {
      status: true,
      message: "Product sales report generated",
      data: report,
    };
  } catch (error) {
    console.error("Error in getProductSalesReport:", error);
    return {
      status: false,
      message: error.message || "Failed to generate sales report",
      data: null,
    };
  }
};