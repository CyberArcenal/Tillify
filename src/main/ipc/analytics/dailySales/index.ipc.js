// src/main/ipc/dailySales/index.ipc.js
// Daily Sales Handler (Read-Only)

const { ipcMain } = require("electron");
const { logger } = require("../../../../utils/logger");
// @ts-ignore
const Product = require("../../../../entities/Product");
const { AppDataSource } = require("../../../db/dataSource");
// @ts-ignore
const InventoryMovement = require("../../../../entities/InventoryMovement");
const { withErrorHandling } = require("../../../../middlewares/errorHandler");
const Sale = require("../../../../entities/Sale");

class DailySalesHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // All methods defined directly
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
        logger.info(`DailySalesHandler: ${method}`, {
          params: this.sanitizeParams(params),
        });
      }

      switch (method) {
        case "getDailySales":
          return await this.getDailySales(params);
        case "getDailySalesDetails":
          return await this.getDailySalesDetails(params);
        case "getDailySalesChart":
          return await this.getDailySalesChart(params);
        case "exportDailySales":
          return await this.exportDailySales(params);
        case "getDailySalesStats":
          return await this.getDailySalesStats(params);
        default:
          return {
            status: false,
            message: `Unknown daily sales method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("DailySalesHandler error:", error);
      // @ts-ignore
      if (logger) logger.error("DailySalesHandler error:", error);
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
    const safe = { ...params };
    // Nothing particularly sensitive, but we keep the pattern
    return safe;
  }

  async getRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(Sale);
  }

  /**
   * Build base query for sales with date range filter
   */
  async buildBaseQuery(params = {}) {
    const repo = await this.getRepository();
    const qb = repo.createQueryBuilder("sale");

    // @ts-ignore
    if (params.startDate && params.endDate) {
      qb.andWhere("sale.timestamp BETWEEN :startDate AND :endDate", {
        // @ts-ignore
        startDate: params.startDate,
        // @ts-ignore
        endDate: params.endDate,
      });
    // @ts-ignore
    } else if (params.startDate) {
      qb.andWhere("sale.timestamp >= :startDate", {
        // @ts-ignore
        startDate: params.startDate,
      });
    // @ts-ignore
    } else if (params.endDate) {
      // @ts-ignore
      qb.andWhere("sale.timestamp <= :endDate", { endDate: params.endDate });
    }

    // @ts-ignore
    if (params.paymentMethod) {
      qb.andWhere("sale.paymentMethod = :paymentMethod", {
        // @ts-ignore
        paymentMethod: params.paymentMethod,
      });
    }

    // @ts-ignore
    if (params.status) {
      // @ts-ignore
      qb.andWhere("sale.status = :status", { status: params.status });
    }

    return qb;
  }

  // ------------------------------------------------------------------------
  // HANDLER IMPLEMENTATIONS
  // ------------------------------------------------------------------------

  /**
   * Get daily aggregated sales data (grouped by day)
   * Returns: list of days with date, total sales count, total amount, etc.
   */
  // @ts-ignore
  async getDailySales(params) {
    const qb = await this.buildBaseQuery(params);

    // Group by date (using SQLite date function)
    // We need to select date, count, sum
    const rawData = await qb
      .select("DATE(sale.timestamp)", "date")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(sale.totalAmount)", "total")
      .addSelect("AVG(sale.totalAmount)", "average")
      .addSelect(
        "SUM(CASE WHEN sale.status = 'paid' THEN 1 ELSE 0 END)",
        "paidCount",
      )
      .groupBy("DATE(sale.timestamp)")
      .orderBy("date", "DESC")
      .getRawMany();

    // Pagination: we can slice after fetching (since grouping reduces rows)
    let data = rawData;
    const page = params.page || 1;
    const limit = params.limit || data.length;
    const start = (page - 1) * limit;
    const paginatedData = data.slice(start, start + limit);

    return {
      status: true,
      data: paginatedData,
      total: data.length,
      page,
      limit,
    };
  }

  /**
   * Get detailed sales for a specific day
   */
  // @ts-ignore
  async getDailySalesDetails(params) {
    const { date, ...rest } = params;
    if (!date) {
      return { status: false, message: "Missing date parameter", data: null };
    }

    const repo = await this.getRepository();
    const qb = repo
      .createQueryBuilder("sale")
      .leftJoinAndSelect("sale.customer", "customer")
      .leftJoinAndSelect("sale.saleItems", "saleItems")
      .leftJoinAndSelect("saleItems.product", "product")
      .where("DATE(sale.timestamp) = :date", { date });

    // Apply additional filters if any
    if (rest.paymentMethod) {
      qb.andWhere("sale.paymentMethod = :paymentMethod", {
        paymentMethod: rest.paymentMethod,
      });
    }
    if (rest.status) {
      qb.andWhere("sale.status = :status", { status: rest.status });
    }

    qb.orderBy("sale.timestamp", "DESC");

    // Pagination
    if (rest.page && rest.limit) {
      const skip = (rest.page - 1) * rest.limit;
      qb.skip(skip).take(rest.limit);
    } else if (rest.limit) {
      qb.take(rest.limit);
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      status: true,
      data,
      total,
      page: rest.page || 1,
      limit: rest.limit || data.length,
    };
  }

  /**
   * Get data formatted for charts (e.g., line chart of daily totals)
   */
  // @ts-ignore
  async getDailySalesChart(params) {
    const qb = await this.buildBaseQuery(params);

    const chartData = await qb
      .select("DATE(sale.timestamp)", "date")
      .addSelect("SUM(sale.totalAmount)", "total")
      .addSelect("COUNT(*)", "count")
      .groupBy("DATE(sale.timestamp)")
      .orderBy("date", "ASC")
      .getRawMany();

    return {
      status: true,
      data: chartData,
    };
  }

  /**
   * Export daily sales summary to CSV
   */
  // @ts-ignore
  async exportDailySales(params) {
    const qb = await this.buildBaseQuery(params);

    const data = await qb
      .select("DATE(sale.timestamp)", "date")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(sale.totalAmount)", "total")
      .addSelect("AVG(sale.totalAmount)", "average")
      .addSelect(
        "SUM(CASE WHEN sale.status = 'paid' THEN 1 ELSE 0 END)",
        "paidCount",
      )
      .groupBy("DATE(sale.timestamp)")
      .orderBy("date", "DESC")
      .getRawMany();

    // Transform to flat array for CSV
    const flatData = data.map((row) => ({
      date: row.date,
      transactions: row.count,
      totalAmount: row.total,
      averageAmount: row.average,
      paidTransactions: row.paidCount,
    }));

    return {
      status: true,
      data: flatData,
      format: "csv",
    };
  }

  /**
   * Get statistics about daily sales
   */
  // @ts-ignore
  async getDailySalesStats(params) {
    const qb = await this.buildBaseQuery(params);

    // Overall stats for the period
    const totalSales = await qb.clone().getCount();
    const totalRevenue = await qb
      .clone()
      .select("SUM(sale.totalAmount)", "total")
      .getRawOne();

    // Best day (highest revenue)
    const bestDay = await qb
      .clone()
      .select("DATE(sale.timestamp)", "date")
      .addSelect("SUM(sale.totalAmount)", "total")
      .groupBy("DATE(sale.timestamp)")
      .orderBy("total", "DESC")
      .limit(1)
      .getRawOne();

    // Busiest day (most transactions)
    const busiestDay = await qb
      .clone()
      .select("DATE(sale.timestamp)", "date")
      .addSelect("COUNT(*)", "count")
      .groupBy("DATE(sale.timestamp)")
      .orderBy("count", "DESC")
      .limit(1)
      .getRawOne();

    // Average daily sales
const dailyAvg = await qb
  .clone()
  .from((qb2) => {
    return qb2
      .select("DATE(sales.timestamp)", "date")
      .addSelect("SUM(sales.totalAmount)", "total")
      .from("sales", "sales")   // <-- important: define main alias here
      .groupBy("DATE(sales.timestamp)");
  }, "day")
  .select("AVG(day.total)", "avgDaily")
  .getRawOne();


    return {
      status: true,
      data: {
        totalSales,
        totalRevenue: totalRevenue?.total || 0,
        bestDay: bestDay || null,
        busiestDay: busiestDay || null,
        averageDailySales: dailyAvg?.avgDaily || 0,
      },
    };
  }
}

// Register IPC handler
const dailySalesHandler = new DailySalesHandler();

ipcMain.handle(
  "dailySales",
  withErrorHandling(
    // @ts-ignore
    dailySalesHandler.handleRequest.bind(dailySalesHandler),
    "IPC:dailySales",
  ),
);

module.exports = { DailySalesHandler, dailySalesHandler };
