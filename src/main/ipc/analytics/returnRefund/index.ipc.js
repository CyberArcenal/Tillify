// src/main/ipc/returnRefund/index.ipc.js
// Return & Refund Report Handler (Read-Only)

const { ipcMain } = require("electron");
const { AppDataSource } = require("../../../db/dataSource");
// @ts-ignore
const Sale = require("../../../../entities/Sale");
// @ts-ignore
const SaleItem = require("../../../../entities/SaleItem");
const { withErrorHandling } = require("../../../../middlewares/errorHandler");
const { logger } = require("../../../../utils/logger");
const ReturnRefund = require("../../../../entities/ReturnRefund");

class ReturnRefundHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // All methods are defined directly in the class for simplicity
    // (no separate file imports)
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
        logger.info(`ReturnRefundHandler: ${method}`, {
          params: this.sanitizeParams(params),
        });
      }

      switch (method) {
        // 📋 BASIC READ OPERATIONS
        case "getAllReturnRefunds":
          return await this.getAllReturnRefunds(params);
        case "getReturnRefundById":
          return await this.getReturnRefundById(params);
        case "getReturnRefundsByCustomer":
          return await this.getReturnRefundsByCustomer(params);
        case "getReturnRefundsByDateRange":
          return await this.getReturnRefundsByDateRange(params);
        case "getReturnRefundsByStatus":
          return await this.getReturnRefundsByStatus(params);

        // 📊 AGGREGATION & STATS
        case "getReturnRefundSummary":
          return await this.getReturnRefundSummary(params);
        case "getReturnRefundStats":
          return await this.getReturnRefundStats(params);

        // 📈 EXPORT & REPORT
        case "exportReturnRefunds":
          return await this.exportReturnRefunds(params);
        case "generateReturnReport":
          return await this.generateReturnReport(params);

        default:
          return {
            status: false,
            message: `Unknown return refund method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("ReturnRefundHandler error:", error);
      // @ts-ignore
      if (logger) logger.error("ReturnRefundHandler error:", error);
      return {
        status: false,
        // @ts-ignore
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

  /**
   * Remove sensitive data from logs
   */
  // @ts-ignore
  sanitizeParams(params) {
    const safe = { ...params };
    if (safe.reason) safe.reason = "[REDACTED]";
    if (safe.notes) safe.notes = "[REDACTED]";
    return safe;
  }

  /**
   * Get ReturnRefund repository (ensures DB connection)
   */
  async getRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(ReturnRefund);
  }

  /**
   * Build reusable query builder with common filters
   */
  async buildQuery(params = {}) {
    const repo = await this.getRepository();
    const qb = repo
      .createQueryBuilder("rr")
      .leftJoinAndSelect("rr.customer", "customer")
      .leftJoinAndSelect("rr.sale", "sale")
      .leftJoinAndSelect("rr.items", "items")
      .leftJoinAndSelect("items.product", "product");

    // Filters
    // @ts-ignore
    if (params.customerId) {
      qb.andWhere("rr.customerId = :customerId", {
        // @ts-ignore
        customerId: params.customerId,
      });
    }
    // @ts-ignore
    if (params.status) {
      // @ts-ignore
      qb.andWhere("rr.status = :status", { status: params.status });
    }
    // @ts-ignore
    if (params.refundMethod) {
      qb.andWhere("rr.refundMethod = :refundMethod", {
        // @ts-ignore
        refundMethod: params.refundMethod,
      });
    }
    // @ts-ignore
    if (params.startDate && params.endDate) {
      qb.andWhere("rr.createdAt BETWEEN :startDate AND :endDate", {
        // @ts-ignore
        startDate: params.startDate,
        // @ts-ignore
        endDate: params.endDate,
      });
      // @ts-ignore
    } else if (params.startDate) {
      qb.andWhere("rr.createdAt >= :startDate", {
        // @ts-ignore
        startDate: params.startDate,
      });
      // @ts-ignore
    } else if (params.endDate) {
      // @ts-ignore
      qb.andWhere("rr.createdAt <= :endDate", { endDate: params.endDate });
    }
    // @ts-ignore
    if (params.minAmount) {
      qb.andWhere("rr.totalAmount >= :minAmount", {
        // @ts-ignore
        minAmount: params.minAmount,
      });
    }
    // @ts-ignore
    if (params.maxAmount) {
      qb.andWhere("rr.totalAmount <= :maxAmount", {
        // @ts-ignore
        maxAmount: params.maxAmount,
      });
    }
    // @ts-ignore
    if (params.searchTerm) {
      qb.andWhere(
        "(rr.referenceNo LIKE :search OR rr.reason LIKE :search OR customer.name LIKE :search)",
        // @ts-ignore
        { search: `%${params.searchTerm}%` },
      );
    }

    // Default ordering
    qb.orderBy("rr.createdAt", "DESC");

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
  async getAllReturnRefunds(params) {
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
  async getReturnRefundById(params) {
    const { id } = params;
    if (!id) {
      return { status: false, message: "Missing return refund ID", data: null };
    }
    const repo = await this.getRepository();
    const record = await repo.findOne({
      where: { id },
      relations: ["customer", "sale", "items", "items.product"],
    });
    if (!record) {
      return { status: false, message: "Return refund not found", data: null };
    }
    return { status: true, data: record };
  }

  // @ts-ignore
  async getReturnRefundsByCustomer(params) {
    const { customerId, ...rest } = params;
    if (!customerId) {
      return { status: false, message: "Missing customerId", data: null };
    }
    const qb = await this.buildQuery({ ...rest, customerId });
    const [data, total] = await qb.getManyAndCount();
    return { status: true, data, total };
  }

  // @ts-ignore
  async getReturnRefundsByDateRange(params) {
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
  async getReturnRefundsByStatus(params) {
    const { status, ...rest } = params;
    if (!status) {
      return { status: false, message: "Missing status", data: null };
    }
    const qb = await this.buildQuery({ ...rest, status });
    const [data, total] = await qb.getManyAndCount();
    return { status: true, data, total };
  }

  // @ts-ignore
  async getReturnRefundSummary(params) {
    // Aggregate totals: count, sum of amounts, average, by status, etc.
    const qb = await this.buildQuery(params);
    // Remove pagination to get full aggregation
    qb.skip(undefined).take(undefined);

    const totalCount = await qb.getCount();
    const sumResult = await qb
      .select("SUM(rr.totalAmount)", "totalAmount")
      .getRawOne();
    const totalAmount = sumResult?.totalAmount || 0;

    // Status breakdown
    const statusBreakdown = await qb
      .clone()
      .select("rr.status", "status")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(rr.totalAmount)", "amount")
      .groupBy("rr.status")
      .getRawMany();

    // Daily summary if date range provided (or default last 30 days)
    let dailySummary = [];
    if (params.startDate && params.endDate) {
      dailySummary = await qb
        .clone()
        .select("DATE(rr.createdAt)", "date")
        .addSelect("COUNT(*)", "count")
        .addSelect("SUM(rr.totalAmount)", "amount")
        .groupBy("DATE(rr.createdAt)")
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
        dailySummary,
      },
    };
  }

  // @ts-ignore
  async getReturnRefundStats(params) {
    // More detailed statistics: by month, by refund method, top customers, etc.
    const qb = await this.buildQuery(params);
    qb.skip(undefined).take(undefined);

    // By refund method
    const byMethod = await qb
      .clone()
      .select("rr.refundMethod", "method")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(rr.totalAmount)", "amount")
      .groupBy("rr.refundMethod")
      .getRawMany();

    // By month (if date range covers > 1 month)
    const byMonth = await qb
      .clone()
      .select("strftime('%Y-%m', rr.createdAt)", "month")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(rr.totalAmount)", "amount")
      .groupBy("strftime('%Y-%m', rr.createdAt)")
      .orderBy("month", "ASC")
      .getRawMany();

    // Top customers by return amount
    const topCustomers = await AppDataSource.getRepository("return_refunds")
      .createQueryBuilder("rr") // main alias
      .leftJoin("customers", "c", "c.id = rr.customerId") // explicit join
      .select("rr.customerId", "customerId")
      .addSelect("c.name", "customerName")
      .addSelect("COUNT(rr.id)", "returnCount") // qualify COUNT
      .addSelect("SUM(rr.totalAmount)", "totalReturned")
      .groupBy("rr.customerId")
      .addGroupBy("c.name") // include customerName in GROUP BY
      .orderBy("totalReturned", "DESC")
      .limit(10)
      .getRawMany();

    return {
      status: true,
      data: {
        byMethod,
        byMonth,
        topCustomers,
      },
    };
  }

  // @ts-ignore
  async exportReturnRefunds(params) {
    // Generate CSV data (array of objects)
    const qb = await this.buildQuery(params);
    qb.skip(undefined).take(undefined); // no limit for export
    const records = await qb.getMany();

    // Flatten the data for CSV
    const flatData = records.map((rr) => ({
      id: rr.id,
      referenceNo: rr.referenceNo,
      date: rr.createdAt,
      // @ts-ignore
      customer: rr.customer?.name || "",
      // @ts-ignore
      saleReference: rr.sale?.referenceNo || "",
      reason: rr.reason,
      refundMethod: rr.refundMethod,
      totalAmount: rr.totalAmount,
      status: rr.status,
      // @ts-ignore
      itemCount: rr.items?.length || 0,
    }));

    return {
      status: true,
      data: flatData,
      format: "csv",
    };
  }

  // @ts-ignore
  async generateReturnReport(params) {
    // Combined summary and stats for a complete report
    const summary = await this.getReturnRefundSummary(params);
    const stats = await this.getReturnRefundStats(params);
    // Optionally fetch a sample of recent returns
    const recentQb = await this.buildQuery({ ...params, limit: 20 });
    const recent = await recentQb.getMany();

    return {
      status: true,
      data: {
        summary: summary.data,
        stats: stats.data,
        recentReturns: recent,
        generatedAt: new Date().toISOString(),
        filters: params,
      },
    };
  }
}

// Register IPC handler
const returnRefundHandler = new ReturnRefundHandler();

ipcMain.handle(
  "returnRefundReports",
  withErrorHandling(
    // @ts-ignore
    returnRefundHandler.handleRequest.bind(returnRefundHandler),
    "IPC:returnRefundReports",
  ),
);

module.exports = { ReturnRefundHandler, returnRefundHandler };
