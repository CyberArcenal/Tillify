// src/main/ipc/dashboard/get/customer_stats.ipc.js

const Customer = require("../../../../entities/Customer");
const Sale = require("../../../../entities/Sale");
const { AppDataSource } = require("../../../db/dataSource");
const { subDays, startOfDay, endOfDay } = require("date-fns");

/**
 * Get customer statistics: new customers (today, this week, total), top spenders, loyalty distribution
 * @param {Object} params - {}
 * @returns {Promise<{status: boolean, message: string, data: Object}>}
 */
module.exports = async (params = {}) => {
  try {
    const customerRepo = AppDataSource.getRepository(Customer);

    // Total customers
    const totalCustomers = await customerRepo.count();

    // New customers today
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const newToday = await customerRepo
      .createQueryBuilder("c")
      .where("c.createdAt BETWEEN :start AND :end", {
        start: todayStart,
        end: todayEnd,
      })
      .getCount();

    // New customers this week (last 7 days)
    const weekStart = startOfDay(subDays(new Date(), 7));
    const newThisWeek = await customerRepo
      .createQueryBuilder("c")
      .where("c.createdAt BETWEEN :start AND :end", {
        start: weekStart,
        end: todayEnd,
      })
      .getCount();

    // Top spenders (requires Sale aggregation)
    const saleRepo = AppDataSource.getRepository(Sale);

    const topSpenders = await saleRepo
      .createQueryBuilder("sale")
      .leftJoinAndSelect("sale.customer", "customer")
      .select([
        "customer.id as customerId",
        "customer.name as customerName",
        "SUM(sale.totalAmount) as totalSpent",
      ])
      .where("sale.customer IS NOT NULL")
      .andWhere("sale.status = :status", { status: "paid" })
      .groupBy("customer.id")
      .orderBy("totalSpent", "DESC")
      .limit(5)
      .getRawMany();

    // Loyalty points distribution (optional)
    const loyaltyCounts = await customerRepo
      .createQueryBuilder("customer")
      .select([
        "CASE WHEN customer.loyaltyPointsBalance = 0 THEN '0' " +
          "WHEN customer.loyaltyPointsBalance BETWEEN 1 AND 100 THEN '1-100' " +
          "WHEN customer.loyaltyPointsBalance BETWEEN 101 AND 500 THEN '101-500' " +
          "ELSE '500+' END as range",
        "COUNT(*) as count",
      ])
      .groupBy("range")
      .getRawMany();

    return {
      status: true,
      message: "Customer statistics retrieved",
      data: {
        totalCustomers,
        newCustomersToday: newToday,
        newCustomersThisWeek: newThisWeek,
        topSpenders: topSpenders.map((s) => ({
          customerId: s.customerId,
          name: s.customerName,
          totalSpent: parseFloat(s.totalSpent),
        })),
        loyaltyDistribution: loyaltyCounts,
      },
    };
  } catch (error) {
    console.error("Error in getCustomerStats:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to get customer stats",
      // @ts-ignore
      data: null,
    };
  }
};