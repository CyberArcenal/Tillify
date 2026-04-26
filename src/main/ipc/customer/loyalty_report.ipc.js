

const Customer = require("../../../entities/Customer");
const LoyaltyTransaction = require("../../../entities/LoyaltyTransaction");
const { AppDataSource } = require("../../db/dataSource");

/**
 * Generate loyalty-specific report
 * @param {Object} params
 * @param {string} [params.startDate] - ISO date string
 * @param {string} [params.endDate] - ISO date string
 * @param {string} [params.userId] - User
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { startDate, endDate, userId = "system" } = params;

    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const customerRepo = AppDataSource.getRepository(Customer);
    const txRepo = AppDataSource.getRepository(LoyaltyTransaction);

    // Total points issued and redeemed
    const txQuery = txRepo.createQueryBuilder("tx");
    if (startDate) {
      txQuery.andWhere("tx.timestamp >= :start", {
        start: new Date(startDate),
      });
    }
    if (endDate) {
      txQuery.andWhere("tx.timestamp <= :end", { end: new Date(endDate) });
    }

    const issued = await txQuery
      .clone()
      .select("SUM(tx.pointsChange)", "total")
      .where("tx.pointsChange > 0")
      .getRawOne();

    const redeemed = await txQuery
      .clone()
      .select("SUM(tx.pointsChange)", "total")
      .where("tx.pointsChange < 0")
      .getRawOne();

    // Top 10 customers by points
    const topCustomers = await customerRepo
      .createQueryBuilder("customer")
      .orderBy("customer.loyaltyPointsBalance", "DESC")
      .limit(10)
      .getMany();

    // Points distribution (buckets)
    const distribution = await customerRepo
      .createQueryBuilder("customer")
      .select(
        "CASE " +
          "WHEN loyaltyPointsBalance = 0 THEN '0' " +
          "WHEN loyaltyPointsBalance BETWEEN 1 AND 100 THEN '1-100' " +
          "WHEN loyaltyPointsBalance BETWEEN 101 AND 500 THEN '101-500' " +
          "WHEN loyaltyPointsBalance BETWEEN 501 AND 1000 THEN '501-1000' " +
          "ELSE '1000+' END",
        "bucket",
      )
      .addSelect("COUNT(*)", "count")
      .groupBy("bucket")
      .getRawMany();

    const report = {
      generatedAt: new Date(),
      totalPointsIssued: parseFloat(issued?.total) || 0,
      totalPointsRedeemed: Math.abs(parseFloat(redeemed?.total)) || 0,
      netPoints:
        (parseFloat(issued?.total) || 0) + (parseFloat(redeemed?.total) || 0),
      topCustomers: topCustomers.map((c) => ({
        id: c.id,
        name: c.name,
        points: c.loyaltyPointsBalance,
      })),
      distribution,
    };

    // Audit
    const auditRepo = AppDataSource.getRepository("AuditLog");
    const log = auditRepo.create({
      action: "REPORT",
      entity: "Loyalty",
      user: userId,
      description: "Generated loyalty report",
      timestamp: new Date(),
    });
    await auditRepo.save(log);

    return {
      status: true,
      message: "Loyalty report generated successfully",
      data: report,
    };
  } catch (error) {
    console.error("Error in generateLoyaltyReport:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to generate loyalty report",
      data: null,
    };
  }
};
