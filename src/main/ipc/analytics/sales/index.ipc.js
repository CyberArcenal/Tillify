// src/main/ipc/sales/index.ipc.js
// Sales Reports Handler (Read-Only)

const { ipcMain } = require("electron");
const { logger } = require("../../../../utils/logger");
const { AppDataSource } = require("../../../db/datasource");
const Sale = require("../../../../entities/Sale");
const SaleItem = require("../../../../entities/SaleItem");
const { withErrorHandling } = require("../../../../middlewares/errorHandler");

class SalesReportHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // All methods are defined in the class
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
        logger.info(`SalesReportHandler: ${method}`, {
          params: this.sanitizeParams(params),
        });
      }

      switch (method) {
        // 📋 BASIC READ OPERATIONS
        case "getAllSales":
          return await this.getAllSales(params);
        case "getSaleById":
          return await this.getSaleById(params);
        case "getSalesByCustomer":
          return await this.getSalesByCustomer(params);
        case "getSalesByDateRange":
          return await this.getSalesByDateRange(params);
        case "getSalesByStatus":
          return await this.getSalesByStatus(params);
        case "getSalesByPaymentMethod":
          return await this.getSalesByPaymentMethod(params);

        // 📊 AGGREGATION & STATS
        case "getSalesSummary":
          return await this.getSalesSummary(params);
        case "getSalesStats":
          return await this.getSalesStats(params);

        // 📈 EXPORT & REPORT
        case "exportSales":
          return await this.exportSales(params);
        case "generateSalesReport":
          return await this.generateSalesReport(params);

        default:
          return {
            status: false,
            message: `Unknown sales report method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("SalesReportHandler error:", error);
      // @ts-ignore
      if (logger) logger.error("SalesReportHandler error:", error);
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
    if (safe.notes) safe.notes = "[REDACTED]";
    return safe;
  }

  async getRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(Sale);
  }

  /**
   * Build reusable query builder with common filters for sales
   */
  async buildQuery(params = {}) {
    const repo = await this.getRepository();
    const qb = repo
      .createQueryBuilder("sale")
      .leftJoinAndSelect("sale.customer", "customer")
      .leftJoinAndSelect("sale.saleItems", "saleItems")
      .leftJoinAndSelect("saleItems.product", "product");

    // Filters
    // @ts-ignore
    if (params.customerId) {
      qb.andWhere("sale.customerId = :customerId", {
        // @ts-ignore
        customerId: params.customerId,
      });
    }
    // @ts-ignore
    if (params.status) {
      // @ts-ignore
      qb.andWhere("sale.status = :status", { status: params.status });
    }
    // @ts-ignore
    if (params.paymentMethod) {
      qb.andWhere("sale.paymentMethod = :paymentMethod", {
        // @ts-ignore
        paymentMethod: params.paymentMethod,
      });
    }
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
    if (params.minAmount) {
      qb.andWhere("sale.totalAmount >= :minAmount", {
        // @ts-ignore
        minAmount: params.minAmount,
      });
    }
    // @ts-ignore
    if (params.maxAmount) {
      qb.andWhere("sale.totalAmount <= :maxAmount", {
        // @ts-ignore
        maxAmount: params.maxAmount,
      });
    }
    // @ts-ignore
    if (params.searchTerm) {
      qb.andWhere(
        "(sale.notes LIKE :search OR customer.name LIKE :search OR sale.paymentMethod LIKE :search)",
        // @ts-ignore
        { search: `%${params.searchTerm}%` },
      );
    }

    // Default ordering (most recent first)
    qb.orderBy("sale.timestamp", "DESC");

    // Pagination
    // @ts-ignore
    if (params.page && params.limit) {
      // @ts-ignore
      const skip = (params.page - 1) * params.limit;
      // @ts-ignore
      qb.skip(skip).take(params.limit);
      // @ts-ignore
    } else if (params.limit) {
      // @ts-ignore
      qb.take(params.limit);
    }

    return qb;
  }

  // ------------------------------------------------------------------------
  // HANDLER IMPLEMENTATIONS
  // ------------------------------------------------------------------------

  // @ts-ignore
  async getAllSales(params) {
    const qb = await this.buildQuery(params);
    const [data, total] = await qb.getManyAndCount();
    return {
      status: true,
      data,
      total,
      page: params.page || 1,
      limit: params.limit || data.length,
    };
  }

  // @ts-ignore
  async getSaleById(params) {
    const { id } = params;
    if (!id) {
      return { status: false, message: "Missing sale ID", data: null };
    }
    const repo = await this.getRepository();
    const record = await repo.findOne({
      where: { id },
      relations: ["customer", "saleItems", "saleItems.product"],
    });
    if (!record) {
      return { status: false, message: "Sale not found", data: null };
    }
    return { status: true, data: record };
  }

  // @ts-ignore
  async getSalesByCustomer(params) {
    const { customerId, ...rest } = params;
    if (!customerId) {
      return { status: false, message: "Missing customerId", data: null };
    }
    const qb = await this.buildQuery({ ...rest, customerId });
    const [data, total] = await qb.getManyAndCount();
    return { status: true, data, total };
  }

  // @ts-ignore
  async getSalesByDateRange(params) {
    const { startDate, endDate, ...rest } = params;
    if (!startDate || !endDate) {
      return {
        status: false,
        message: "Missing startDate or endDate",
        data: null,
      };
    }
    const qb = await this.buildQuery({ ...rest, startDate, endDate });
    const [data, total] = await qb.getManyAndCount();
    return { status: true, data, total };
  }

  // @ts-ignore
  async getSalesByStatus(params) {
    const { status, ...rest } = params;
    if (!status) {
      return { status: false, message: "Missing status", data: null };
    }
    const qb = await this.buildQuery({ ...rest, status });
    const [data, total] = await qb.getManyAndCount();
    return { status: true, data, total };
  }

  // @ts-ignore
  async getSalesByPaymentMethod(params) {
    const { paymentMethod, ...rest } = params;
    if (!paymentMethod) {
      return { status: false, message: "Missing paymentMethod", data: null };
    }
    const qb = await this.buildQuery({ ...rest, paymentMethod });
    const [data, total] = await qb.getManyAndCount();
    return { status: true, data, total };
  }

  // @ts-ignore
  async getSalesSummary(params) {
    // Aggregate: total count, total amount, average, by day/week/month
    const qb = await this.buildQuery(params);
    qb.skip(undefined).take(undefined);

    const totalCount = await qb.getCount();
    const sumResult = await qb
      .select("SUM(sale.totalAmount)", "totalAmount")
      .getRawOne();
    const totalAmount = sumResult?.totalAmount || 0;

    // Status breakdown
    const statusBreakdown = await qb
      .clone()
      .select("sale.status", "status")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(sale.totalAmount)", "amount")
      .groupBy("sale.status")
      .getRawMany();

    // Payment method breakdown
    const paymentMethodBreakdown = await qb
      .clone()
      .select("sale.paymentMethod", "method")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(sale.totalAmount)", "amount")
      .groupBy("sale.paymentMethod")
      .getRawMany();

    // Daily summary (if date range provided or default last 30 days)
    let dailySummary = [];
    if (params.startDate && params.endDate) {
      dailySummary = await qb
        .clone()
        .select("DATE(sale.timestamp)", "date")
        .addSelect("COUNT(*)", "count")
        .addSelect("SUM(sale.totalAmount)", "amount")
        .groupBy("DATE(sale.timestamp)")
        .orderBy("date", "ASC")
        .getRawMany();
    }

    return {
      status: true,
      data: {
        totalCount,
        totalAmount,
        averageAmount: totalCount ? totalAmount / totalCount : 0,
        statusBreakdown,
        paymentMethodBreakdown,
        dailySummary,
      },
    };
  }

  // @ts-ignore
  async getSalesStats(params) {
    // More detailed stats: top products, top customers, hourly distribution, etc.
    const qb = await this.buildQuery(params);
    qb.skip(undefined).take(undefined);

    // Top products by quantity sold
    const topProducts = await AppDataSource.getRepository(SaleItem)
      .createQueryBuilder("item")
      .leftJoin("item.product", "product")
      .select("product.id", "productId")
      .addSelect("product.name", "productName")
      .addSelect("SUM(item.quantity)", "totalQuantity")
      .addSelect("SUM(item.lineTotal)", "totalRevenue")
      .where(qb.expressionMap.wheres.map((w) => w.condition).join(" AND ")) // reuse conditions
      .setParameters(qb.getParameters())
      .groupBy("product.id")
      .orderBy("totalQuantity", "DESC")
      .limit(10)
      .getRawMany();

    // Top customers by purchase amount
    const topCustomers = await AppDataSource.getRepository(Sale)
      .createQueryBuilder("sale") // main alias
      .leftJoin("sale.customer", "c") // alias customer as 'c'
      .select("sale.customerId", "customerId")
      .addSelect("c.name", "customerName") // use 'c' instead of 'customer'
      .addSelect("COUNT(*)", "purchaseCount")
      .addSelect("SUM(sale.totalAmount)", "totalSpent")
      .groupBy("sale.customerId")
      .orderBy("totalSpent", "DESC")
      .limit(10)
      .getRawMany();

    // Hourly distribution of sales
    const hourlyDistribution = await qb
      .clone()
      .select("strftime('%H', sale.timestamp)", "hour")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(sale.totalAmount)", "amount")
      .groupBy("strftime('%H', sale.timestamp)")
      .orderBy("hour", "ASC")
      .getRawMany();

    return {
      status: true,
      data: {
        topProducts,
        topCustomers,
        hourlyDistribution,
      },
    };
  }

  // @ts-ignore
  async exportSales(params) {
    // Generate CSV data (array of objects)
    const qb = await this.buildQuery(params);
    qb.skip(undefined).take(undefined);
    const records = await qb.getMany();

    const flatData = records.map((sale) => ({
      id: sale.id,
      timestamp: sale.timestamp,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      totalAmount: sale.totalAmount,
      // @ts-ignore
      customer: sale.customer?.name || "",
      notes: sale.notes,
      // @ts-ignore
      itemCount: sale.saleItems?.length || 0,
    }));

    return {
      status: true,
      data: flatData,
      format: "csv",
    };
  }

  // @ts-ignore
  async generateSalesReport(params) {
    const summary = await this.getSalesSummary(params);
    const stats = await this.getSalesStats(params);
    const recentQb = await this.buildQuery({ ...params, limit: 20 });
    const recent = await recentQb.getMany();

    return {
      status: true,
      data: {
        summary: summary.data,
        stats: stats.data,
        recentSales: recent,
        generatedAt: new Date().toISOString(),
        filters: params,
      },
    };
  }
}

// Register IPC handler
const salesReportHandler = new SalesReportHandler();

ipcMain.handle(
  "salesReport",
  withErrorHandling(
    // @ts-ignore
    salesReportHandler.handleRequest.bind(salesReportHandler),
    "IPC:salesReport",
  ),
);

module.exports = { SalesReportHandler, salesReportHandler };
