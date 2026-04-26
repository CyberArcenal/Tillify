

const Sale = require("../../../entities/Sale");
const customerService = require("../../../services/Customer");
const { AppDataSource } = require("../../db/dataSource");

/**
 * Generate a comprehensive customer report (statistics + top customers + sales summary)
 * @param {Object} params
 * @param {string} [params.startDate] - ISO date string
 * @param {string} [params.endDate] - ISO date string
 * @param {string} [params.userId] - User
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { startDate, endDate, userId = "system" } = params;

    const stats = await customerService.getStatistics();

    // Additional: sales per customer within date range
    let salesData = [];
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const saleRepo = AppDataSource.getRepository(Sale);

    const query = saleRepo
      .createQueryBuilder("sale")
      .leftJoinAndSelect("sale.customer", "customer")
      .select("customer.id", "customerId")
      .addSelect("customer.name", "customerName")
      .addSelect("COUNT(sale.id)", "saleCount")
      .addSelect("SUM(sale.totalAmount)", "totalSpent")
      .where("sale.customerId IS NOT NULL");

    if (startDate) {
      query.andWhere("sale.timestamp >= :start", {
        start: new Date(startDate),
      });
    }
    if (endDate) {
      query.andWhere("sale.timestamp <= :end", { end: new Date(endDate) });
    }

    query.groupBy("customer.id").orderBy("totalSpent", "DESC");

    salesData = await query.getRawMany();

    const report = {
      generatedAt: new Date(),
      statistics: stats,
      customerSales: salesData.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        saleCount: parseInt(row.saleCount),
        totalSpent: parseFloat(row.totalSpent),
      })),
    };

    // Audit log
    await customerService.getRepositories(); // ensure initialized
    const auditRepo = AppDataSource.getRepository("AuditLog");
    const log = auditRepo.create({
      action: "REPORT",
      entity: "Customer",
      user: userId,
      description: "Generated customer report",
      timestamp: new Date(),
    });
    await auditRepo.save(log);

    return {
      status: true,
      message: "Customer report generated successfully",
      data: report,
    };
  } catch (error) {
    console.error("Error in generateCustomerReport:", error);
    return {
      status: false,
      message: error.message || "Failed to generate report",
      data: null,
    };
  }
};
