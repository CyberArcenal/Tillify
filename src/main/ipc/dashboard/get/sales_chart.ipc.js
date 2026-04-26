// src/main/ipc/dashboard/get/sales_chart.ipc.js
const Sale = require("../../../../entities/Sale");
const { AppDataSource } = require("../../../db/dataSource");
const { subDays, format, startOfDay, endOfDay } = require("date-fns");

/**
 * Get sales data for chart (last 7 days by default)
 * @param {Object} params - { days?: number, groupBy?: 'day'|'month' }
 */
module.exports = async (params = {}) => {
  try {
    const days = params.days || 7;
    const groupBy = params.groupBy || "day";

    const saleRepo = AppDataSource.getRepository(Sale);

    const endDate = new Date();
    const startDate = subDays(endDate, days - 1);

    const sales = await saleRepo
      .createQueryBuilder("sale")
      .select(["sale.timestamp", "sale.totalAmount"])
      .where("sale.timestamp BETWEEN :start AND :end", {
        start: startOfDay(startDate),
        end: endOfDay(endDate),
      })
      .andWhere("sale.status = :status", { status: "paid" })
      .orderBy("sale.timestamp", "ASC")
      .getMany();

    // Group by day
    const grouped = {};
    sales.forEach((sale) => {
      const key = format(sale.timestamp, groupBy === "day" ? "yyyy-MM-dd" : "yyyy-MM");
      if (!grouped[key]) {
        grouped[key] = { date: key, revenue: 0, count: 0 };
      }
      grouped[key].revenue += parseFloat(sale.totalAmount);
      grouped[key].count += 1;
    });

    const result = Object.values(grouped);
    return {
      status: true,
      message: "Sales chart data retrieved",
      data: result,
    };
  } catch (error) {
    console.error("Error in getSalesChart:", error);
    return {
      status: false,
      message: error.message || "Failed to get sales chart",
      data: null,
    };
  }
};