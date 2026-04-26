// src/main/ipc/financialReports/index.ipc.js
// Financial Reports Handler (Read-Only)

const { ipcMain } = require("electron");
const { logger } = require("../../../../utils/logger");
// @ts-ignore
const Product = require("../../../../entities/Product");
const { AppDataSource } = require("../../../db/dataSource");
// @ts-ignore
const InventoryMovement = require("../../../../entities/InventoryMovement");
const { withErrorHandling } = require("../../../../middlewares/errorHandler");
const ReturnRefund = require("../../../../entities/ReturnRefund");
const Sale = require("../../../../entities/Sale");
const SaleItem = require("../../../../entities/SaleItem");
const Purchase = require("../../../../entities/Purchase");

class FinancialReportsHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // All methods defined in class
  }

  /**
   * Main IPC request handler
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {{ method: string; params: object }} payload
   */
  // @ts-ignore
  async handleRequest(event, payload) {
    try {
      const { method, params = {} } = payload;

      if (logger) {
        // @ts-ignore
        logger.info(`FinancialReportsHandler: ${method}`, {
          params: this.sanitizeParams(params),
        });
      }

      switch (method) {
        case "getFinancialSummary":
          return await this.getFinancialSummary(params);
        case "getRevenueBreakdown":
          return await this.getRevenueBreakdown(params);
        case "getProfitLoss":
          return await this.getProfitLoss(params);
        case "getExpenseBreakdown":
          return await this.getExpenseBreakdown(params);
        case "getFinancialChartData":
          return await this.getFinancialChartData(params);
        case "exportFinancialReport":
          return await this.exportFinancialReport(params);
        case "generateFinancialReport":
          return await this.generateFinancialReport(params);
        default:
          return {
            status: false,
            message: `Unknown financial reports method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("FinancialReportsHandler error:", error);
      // @ts-ignore
      if (logger) logger.error("FinancialReportsHandler error:", error);
      return {
        status: false,
        // @ts-ignore
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

  // @ts-ignore
  sanitizeParams(params) {
    // No sensitive data typically in financial reports
    return params;
  }

  /**
   * Apply common date filters to a query builder
   */
  // @ts-ignore
  applyDateFilter(qb, dateField, params) {
    if (params.startDate && params.endDate) {
      qb.andWhere(`${dateField} BETWEEN :startDate AND :endDate`, {
        startDate: params.startDate,
        endDate: params.endDate,
      });
    } else if (params.startDate) {
      qb.andWhere(`${dateField} >= :startDate`, {
        startDate: params.startDate,
      });
    } else if (params.endDate) {
      qb.andWhere(`${dateField} <= :endDate`, { endDate: params.endDate });
    }
    return qb;
  }

  // ------------------------------------------------------------------------
  // HANDLER IMPLEMENTATIONS
  // ------------------------------------------------------------------------

  /**
   * Get overall financial summary for a period
   */
  // @ts-ignore
  async getFinancialSummary(params) {
    // We need:
    // - Total revenue (from paid sales)
    // - Total refunds (from return_refunds)
    // - Net revenue (revenue - refunds)
    // - Cost of goods sold (sum of purchase costs for items sold)
    // - Gross profit (net revenue - COGS)
    // - Expenses (maybe from purchases? But purchases are for inventory, not expenses)
    //   We'll consider purchases as part of COGS, not separate expenses.
    //   We can also add other expenses if we have an Expenses entity later.

    const connection = AppDataSource;
    if (!connection.isInitialized) await connection.initialize();

    // Helper to get total from a table with filters
    const getSum = async (
      // @ts-ignore
      entity,
      // @ts-ignore
      field,
      // @ts-ignore
      alias,
      statusCondition = "",
      paymentCondition = "",
    ) => {
      const repo = connection.getRepository(entity);
      const qb = repo.createQueryBuilder(alias);
      this.applyDateFilter(qb, `${alias}.createdAt`, params);
      if (statusCondition) {
        qb.andWhere(statusCondition);
      }
      if (paymentCondition) {
        qb.andWhere(paymentCondition);
      }
      const result = await qb
        .select(`SUM(${alias}.${field})`, "total")
        .getRawOne();
      return parseFloat(result.total) || 0;
    };

    // Total revenue from paid sales (only "paid" status)
    const totalRevenue = await getSum(
      Sale,
      "totalAmount",
      "sale",
      "sale.status = 'paid'",
    );

    // Total refunds from processed returns
    const totalRefunds = await getSum(
      ReturnRefund,
      "totalAmount",
      "refund",
      "refund.status = 'processed'",
    );

    // Net revenue
    const netRevenue = totalRevenue - totalRefunds;

    // Cost of Goods Sold (COGS): sum of purchase cost of products sold
    // We need to join SaleItem with Product and get the cost from purchase items.
    // This is complex; for simplicity, we can approximate by summing purchase cost of items sold.
    // Alternatively, we can compute based on average cost, but for now we'll use a placeholder.
    // Let's compute using sale_items and product's average cost (if we had cost tracking).
    // Since we don't have cost per product in entities, we'll skip COGS for now.
    // Or we can compute from purchases made within period (not accurate). Better to return 0 and note.

    // For now, we'll provide a placeholder
    const cogs = 0; // Would require cost field in Product or PurchaseItem linking

    const grossProfit = netRevenue - cogs;

    return {
      status: true,
      data: {
        totalRevenue,
        totalRefunds,
        netRevenue,
        cogs,
        grossProfit,
        profitMargin: netRevenue ? (grossProfit / netRevenue) * 100 : 0,
      },
    };
  }

  /**
   * Get revenue breakdown by payment method and/or product category
   */
  // @ts-ignore
  async getRevenueBreakdown(params) {
    const connection = AppDataSource;
    if (!connection.isInitialized) await connection.initialize();

    const { groupBy = "paymentMethod" } = params; // can be "paymentMethod", "category", "product"

    let data = [];
    if (groupBy === "paymentMethod") {
      const qb = connection
        .getRepository(Sale)
        .createQueryBuilder("sale")
        .select("sale.paymentMethod", "method")
        .addSelect("COUNT(*)", "count")
        .addSelect("SUM(sale.totalAmount)", "amount")
        .where("sale.status = 'paid'");
      this.applyDateFilter(qb, "sale.timestamp", params);
      const result = await qb.groupBy("sale.paymentMethod").getRawMany();
      data = result;
    } else if (groupBy === "category") {
      // Revenue by product category via sale_items and product
      const result = await connection
        .getRepository(SaleItem)
        .createQueryBuilder("item")
        .leftJoin("item.product", "product")
        .leftJoin("product.category", "category")
        .select("category.name", "category")
        .addSelect("SUM(item.lineTotal)", "amount")
        .addSelect("SUM(item.quantity)", "quantity")
        // @ts-ignore
        .where((qb) => {
          const subQb = connection
            .getRepository(Sale)
            .createQueryBuilder("sale")
            .select("sale.id")
            .where("sale.status = 'paid'");
          this.applyDateFilter(subQb, "sale.timestamp", params);
          return "item.saleId IN (" + subQb.getQuery() + ")";
        })
        .setParameters(params)
        .groupBy("category.id")
        .orderBy("amount", "DESC")
        .getRawMany();
      data = result;
    } else if (groupBy === "product") {
      const result = await connection
        .getRepository(SaleItem)
        .createQueryBuilder("item")
        .leftJoin("item.product", "product")
        .select("product.id", "productId")
        .addSelect("product.name", "productName")
        .addSelect("SUM(item.lineTotal)", "amount")
        .addSelect("SUM(item.quantity)", "quantity")
        // @ts-ignore
        .where((qb) => {
          const subQb = connection
            .getRepository(Sale)
            .createQueryBuilder("sale")
            .select("sale.id")
            .where("sale.status = 'paid'");
          this.applyDateFilter(subQb, "sale.timestamp", params);
          return "item.saleId IN (" + subQb.getQuery() + ")";
        })
        .setParameters(params)
        .groupBy("product.id")
        .orderBy("amount", "DESC")
        .limit(params.limit || 20)
        .getRawMany();
      data = result;
    }

    return { status: true, data };
  }

  /**
   * Get profit and loss data grouped by time period (day, week, month)
   */
  // @ts-ignore
  async getProfitLoss(params) {
    const { groupBy = "day" } = params; // day, week, month
    const connection = AppDataSource;
    if (!connection.isInitialized) await connection.initialize();

    // Define date truncation based on groupBy for SQLite
    let dateFormat;
    if (groupBy === "day") dateFormat = "%Y-%m-%d";
    else if (groupBy === "week")
      dateFormat = "%Y-%W"; // week number
    else if (groupBy === "month") dateFormat = "%Y-%m";
    else dateFormat = "%Y-%m-%d";

    // Get revenue per period
    const revenueQb = connection
      .getRepository(Sale)
      .createQueryBuilder("sale")
      .select(`strftime('${dateFormat}', sale.timestamp)`, "period")
      .addSelect("SUM(sale.totalAmount)", "revenue")
      .where("sale.status = 'paid'");
    this.applyDateFilter(revenueQb, "sale.timestamp", params);
    revenueQb.groupBy("period");

    // Get refunds per period
    const refundQb = connection
      .getRepository(ReturnRefund)
      .createQueryBuilder("refund")
      .select(`strftime('${dateFormat}', refund.createdAt)`, "period")
      .addSelect("SUM(refund.totalAmount)", "refunds")
      .where("refund.status = 'processed'");
    this.applyDateFilter(refundQb, "refund.createdAt", params);
    refundQb.groupBy("period");

    // Combine (full outer join simulation via union or separate then merge)
    const revenueData = await revenueQb.getRawMany();
    const refundData = await refundQb.getRawMany();

    // Merge by period
    const map = new Map();
    revenueData.forEach((r) =>
      map.set(r.period, {
        period: r.period,
        revenue: parseFloat(r.revenue) || 0,
        refunds: 0,
      }),
    );
    refundData.forEach((r) => {
      if (map.has(r.period)) {
        map.get(r.period).refunds = parseFloat(r.refunds) || 0;
      } else {
        map.set(r.period, {
          period: r.period,
          revenue: 0,
          refunds: parseFloat(r.refunds) || 0,
        });
      }
    });

    const result = Array.from(map.values())
      .map((item) => ({
        ...item,
        netRevenue: item.revenue - item.refunds,
        // COGS would require additional computation; omit for now
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return { status: true, data: result };
  }

  /**
   * Get expense breakdown (currently only purchases considered as expenses, but purchases are assets until sold)
   * We'll treat purchases as expenses for simplicity or separate.
   */
  // @ts-ignore
  async getExpenseBreakdown(params) {
    const connection = AppDataSource;
    if (!connection.isInitialized) await connection.initialize();

    // For now, we can show purchases by supplier or category
    // Or we can show refunds as negative expense? Better to handle in P&L.

    // Purchases by supplier
    const qb = connection
      .getRepository(Purchase)
      .createQueryBuilder("purchase")
      .leftJoinAndSelect("purchase.supplier", "supplier")
      .select("supplier.id", "supplierId")
      .addSelect("supplier.name", "supplierName")
      .addSelect("SUM(purchase.totalAmount)", "amount")
      .addSelect("COUNT(*)", "count")
      .where("purchase.status = 'completed'");
    this.applyDateFilter(qb, "purchase.createdAt", params);
    const purchases = await qb
      .groupBy("supplier.id")
      .orderBy("amount", "DESC")
      .getRawMany();

    return { status: true, data: purchases };
  }

  /**
   * Get data formatted for charts (revenue, net revenue, etc. over time)
   */
  // @ts-ignore
  async getFinancialChartData(params) {
    const { chartType = "revenue" } = params; // revenue, profit, comparison

    const connection = AppDataSource;
    if (!connection.isInitialized) await connection.initialize();

    let data = [];
    if (chartType === "revenue") {
      const qb = connection
        .getRepository(Sale)
        .createQueryBuilder("sale")
        .select("DATE(sale.timestamp)", "date")
        .addSelect("SUM(sale.totalAmount)", "revenue")
        .where("sale.status = 'paid'");
      this.applyDateFilter(qb, "sale.timestamp", params);
      const result = await qb
        .groupBy("DATE(sale.timestamp)")
        .orderBy("date", "ASC")
        .getRawMany();
      data = result;
    } else if (chartType === "profit") {
      // Use getProfitLoss data but return raw for chart
      const pl = await this.getProfitLoss({ ...params, groupBy: "day" });
      data = pl.data.map((item) => ({
        date: item.period,
        revenue: item.revenue,
        refunds: item.refunds,
        netRevenue: item.netRevenue,
      }));
    } else if (chartType === "comparison") {
      // Compare revenue vs previous period? Not implemented
      data = [];
    }

    return { status: true, data };
  }

  /**
   * Export financial data to CSV
   */
  // @ts-ignore
  async exportFinancialReport(params) {
    // Get summary data as flat array
    const summary = await this.getFinancialSummary(params);
    const revenueBreakdown = await this.getRevenueBreakdown(params);
    const profitLoss = await this.getProfitLoss(params);

    // For CSV, we need a flat array; we'll combine into a structured format
    const flatData = {
      summary: summary.data,
      revenueBreakdown: revenueBreakdown.data,
      profitLoss: profitLoss.data,
    };

    // Or we could flatten each section into separate arrays; for simplicity, return as JSON and let renderer convert.
    return {
      status: true,
      data: flatData,
      format: "json", // or we can generate CSV string here if needed
    };
  }

  /**
   * Generate comprehensive financial report
   */
  // @ts-ignore
  async generateFinancialReport(params) {
    const summary = await this.getFinancialSummary(params);
    const revenueBreakdown = await this.getRevenueBreakdown(params);
    const profitLoss = await this.getProfitLoss(params);
    const expenseBreakdown = await this.getExpenseBreakdown(params);
    const chartData = await this.getFinancialChartData(params);

    return {
      status: true,
      data: {
        summary: summary.data,
        revenueBreakdown: revenueBreakdown.data,
        profitLoss: profitLoss.data,
        expenseBreakdown: expenseBreakdown.data,
        chartData: chartData.data,
        generatedAt: new Date().toISOString(),
        filters: params,
      },
    };
  }
}

// Register IPC handler
const financialReportsHandler = new FinancialReportsHandler();

ipcMain.handle(
  "financialReports",
  withErrorHandling(
    // @ts-ignore
    financialReportsHandler.handleRequest.bind(financialReportsHandler),
    "IPC:financialReports",
  ),
);

module.exports = { FinancialReportsHandler, financialReportsHandler };
