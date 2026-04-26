
const Sale = require("../../../../entities/Sale");
const { AppDataSource } = require("../../../db/dataSource");

/**
 * Get daily sales summary (grouped by day)
 * @param {Object} params
 * @param {string} [params.startDate] - ISO date
 * @param {string} [params.endDate]
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { startDate, endDate } = params;
    const saleRepo = queryRunner.manager.getRepository(Sale);

    const query = saleRepo
      .createQueryBuilder("sale")
      .select("DATE(sale.timestamp)", "date")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(sale.totalAmount)", "total")
      .addSelect("AVG(sale.totalAmount)", "average")
      .where("sale.status = :status", { status: "paid" });

    if (startDate) {
      query.andWhere("DATE(sale.timestamp) >= :startDate", { startDate });
    }
    if (endDate) {
      query.andWhere("DATE(sale.timestamp) <= :endDate", { endDate });
    }

    query.groupBy("DATE(sale.timestamp)").orderBy("date", "DESC");

    const dailySales = await query.getRawMany();
    console.log("[IPC] sale:get/daily called");
    return {
      status: true,
      message: "Daily sales retrieved",
      data: dailySales,
    };
  } catch (error) {
    console.error("[IPC] sale:get/daily error:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to fetch daily sales",
      data: null,
    };
  }
};