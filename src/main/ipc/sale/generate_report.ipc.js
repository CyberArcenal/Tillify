

const saleService = require("../../../services/Sale");

/**
 * Generate a custom sales report (returns data, not file)
 * @param {Object} params
 * @param {string} params.reportType - 'summary', 'detailed', 'tax', 'payment_methods'
 * @param {Object} [params.filters] - filters for findAll
 * @param {import("typeorm").QueryRunner} queryRunner
 */
module.exports = async (params, queryRunner) => {
  try {
    const { reportType, filters = {} } = params;
    if (!reportType) return { status: false, message: "reportType is required", data: null };

    console.log("[IPC] sale:generate_report called", { reportType, filters });

    let reportData;
    switch (reportType) {
      case "summary":
        reportData = await saleService.getStatistics(queryRunner);
        break;
      case "detailed":
        reportData = await saleService.findAll(filters, queryRunner);
        break;
      case "payment_methods": {
        const saleRepo = queryRunner.manager.getRepository("Sale");
        const counts = await saleRepo
          .createQueryBuilder("sale")
          .select("sale.paymentMethod", "method")
          .addSelect("COUNT(*)", "count")
          .addSelect("SUM(sale.totalAmount)", "total")
          .groupBy("sale.paymentMethod")
          .getRawMany();
        reportData = counts;
        break;
      }
      case "tax": {
        const saleItemRepo = queryRunner.manager.getRepository("SaleItem");
        const tax = await saleItemRepo
          .createQueryBuilder("item")
          .select("SUM(item.tax)", "totalTax")
          .getRawOne();
        reportData = { totalTax: tax?.totalTax || 0 };
        break;
      }
      default:
        return { status: false, message: `Unknown report type: ${reportType}`, data: null };
    }

    return {
      status: true,
      message: "Report generated",
      data: reportData,
    };
  } catch (error) {
    console.error("[IPC] sale:generate_report error:", error);
    return {
      status: false,
      message: error.message || "Failed to generate report",
      data: null,
    };
  }
};