// src/main/ipc/dashboard/get/summary.ipc.js
const Customer = require("../../../../entities/Customer");
const InventoryMovement = require("../../../../entities/InventoryMovement");
const Product = require("../../../../entities/Product");
const Sale = require("../../../../entities/Sale");
const { AppDataSource } = require("../../../db/dataSource");
const { format, startOfDay, endOfDay } = require("date-fns");

/**
 * Get dashboard summary (today's sales, revenue, customer count, low stock count)
 * @param {Object} params - (optional) { date?: string } defaults to today
 * @returns {Promise<{status: boolean, message: string, data: Object}>}
 */
module.exports = async (params = {}) => {
  try {
    const targetDate = params.date ? new Date(params.date) : new Date();
    const start = startOfDay(targetDate);
    const end = endOfDay(targetDate);

    // Get repositories

    const saleRepo = AppDataSource.getRepository(Sale);
    const customerRepo = AppDataSource.getRepository(Customer);
    const productRepo = AppDataSource.getRepository(Product);
    const invRepo = AppDataSource.getRepository(InventoryMovement);

    // Today's sales (paid)
    const todaySales = await saleRepo
      .createQueryBuilder("sale")
      .where("sale.timestamp BETWEEN :start AND :end", { start, end })
      .andWhere("sale.status = :status", { status: "paid" })
      .getMany();

    const totalRevenue = todaySales.reduce(
      (sum, s) => sum + parseFloat(s.totalAmount),
      0,
    );

    // Customer count (all time – can be filtered by date if needed)
    const totalCustomers = await customerRepo.count();

    // Low stock count (e.g., stock <= 5)
    const lowStockThreshold = 5;
    const lowStockCount = await productRepo
      .createQueryBuilder("product")
      .where("product.stockQty <= :threshold", { threshold: lowStockThreshold })
      .getCount();

    // Inventory movements today (optional)
    const movementsToday = await invRepo
      .createQueryBuilder("mov")
      .where("mov.timestamp BETWEEN :start AND :end", { start, end })
      .getCount();

    return {
      status: true,
      message: "Dashboard summary retrieved",
      data: {
        date: format(targetDate, "yyyy-MM-dd"),
        salesToday: todaySales.length,
        revenueToday: totalRevenue,
        totalCustomers,
        lowStockCount,
        inventoryMovementsToday: movementsToday,
      },
    };
  } catch (error) {
    console.error("Error in getSummary:", error);
    return {
      status: false,
      message: error.message || "Failed to get dashboard summary",
      data: null,
    };
  }
};