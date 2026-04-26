// src/main/ipc/customerInsights/index.ipc.js
// Customer Insights Handler (Read-Only)

const { ipcMain } = require("electron");
const { logger } = require("../../../../utils/logger");
// @ts-ignore
const Product = require("../../../../entities/Product");
const { AppDataSource } = require("../../../db/dataSource");
// @ts-ignore
const InventoryMovement = require("../../../../entities/InventoryMovement");
const { withErrorHandling } = require("../../../../middlewares/errorHandler");
const Customer = require("../../../../entities/Customer");
const ReturnRefund = require("../../../../entities/ReturnRefund");
const LoyaltyTransaction = require("../../../../entities/LoyaltyTransaction");
const Sale = require("../../../../entities/Sale");

class CustomerInsightsHandler {
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
        logger.info(`CustomerInsightsHandler: ${method}`, {
          params: this.sanitizeParams(params),
        });
      }

      switch (method) {
        // 📋 BASIC CUSTOMER READ OPERATIONS
        case "getCustomerSummary":
          return await this.getCustomerSummary(params);
        case "getCustomerProfiles":
          return await this.getCustomerProfiles(params);
        case "getCustomerById":
          return await this.getCustomerById(params);
        case "getCustomerByContactInfo":
          return await this.getCustomerByContactInfo(params);

        // 📊 INSIGHTS & STATISTICS
        case "getTopCustomersBySpending":
          return await this.getTopCustomersBySpending(params);
        case "getTopCustomersByLoyaltyPoints":
          return await this.getTopCustomersByLoyaltyPoints(params);
        case "getCustomerSegmentation":
          return await this.getCustomerSegmentation(params);

        // 📜 HISTORY
        case "getCustomerPurchaseHistory":
          return await this.getCustomerPurchaseHistory(params);
        case "getCustomerLoyaltyHistory":
          return await this.getCustomerLoyaltyHistory(params);
        case "getCustomerReturnHistory":
          return await this.getCustomerReturnHistory(params);

        // 📈 EXPORT & REPORT
        case "exportCustomers":
          return await this.exportCustomers(params);
        case "generateCustomerInsightsReport":
          return await this.generateCustomerInsightsReport(params);

        default:
          return {
            status: false,
            message: `Unknown customer insights method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("CustomerInsightsHandler error:", error);
      // @ts-ignore
      if (logger) logger.error("CustomerInsightsHandler error:", error);
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
    if (safe.contactInfo) safe.contactInfo = "[REDACTED]";
    return safe;
  }

  async getCustomerRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(Customer);
  }

  async getSaleRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(Sale);
  }

  async getLoyaltyRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(LoyaltyTransaction);
  }

  async getReturnRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(ReturnRefund);
  }

  /**
   * Build customer query with filters
   */
  async buildCustomerQuery(params = {}) {
    const repo = await this.getCustomerRepository();
    const qb = repo.createQueryBuilder("customer");

    // @ts-ignore
    if (params.searchTerm) {
      qb.andWhere(
        "(customer.name LIKE :search OR customer.contactInfo LIKE :search)",
        // @ts-ignore
        { search: `%${params.searchTerm}%` },
      );
    }
    // @ts-ignore
    if (params.minPoints !== undefined) {
      qb.andWhere("customer.loyaltyPointsBalance >= :minPoints", {
        // @ts-ignore
        minPoints: params.minPoints,
      });
    }
    // @ts-ignore
    if (params.maxPoints !== undefined) {
      qb.andWhere("customer.loyaltyPointsBalance <= :maxPoints", {
        // @ts-ignore
        maxPoints: params.maxPoints,
      });
    }
    // @ts-ignore
    if (params.hasLoyaltyPoints !== undefined) {
      // @ts-ignore
      if (params.hasLoyaltyPoints) {
        qb.andWhere("customer.loyaltyPointsBalance > 0");
      } else {
        qb.andWhere("customer.loyaltyPointsBalance = 0");
      }
    }
    // @ts-ignore
    if (params.createdAfter) {
      qb.andWhere("customer.createdAt >= :createdAfter", {
        // @ts-ignore
        createdAfter: params.createdAfter,
      });
    }
    // @ts-ignore
    if (params.createdBefore) {
      qb.andWhere("customer.createdAt <= :createdBefore", {
        // @ts-ignore
        createdBefore: params.createdBefore,
      });
    }

    // Default order
    qb.orderBy("customer.name", "ASC");

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
  async getCustomerSummary(params) {
    const repo = await this.getCustomerRepository();

    const totalCustomers = await repo.count();
    const activeCustomers = await repo.count({
      where: { loyaltyPointsBalance: { $gt: 0 } },
    }); // Not exactly "active", but proxy
    const avgPoints = await repo
      .createQueryBuilder("customer")
      .select("AVG(customer.loyaltyPointsBalance)", "avg")
      .getRawOne();
    const totalPoints = await repo
      .createQueryBuilder("customer")
      .select("SUM(customer.loyaltyPointsBalance)", "sum")
      .getRawOne();

    // New customers this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newThisMonth = await repo
      .createQueryBuilder("customer")
      .where("customer.createdAt >= :start", { start: startOfMonth })
      .getCount();

    return {
      status: true,
      data: {
        totalCustomers,
        activeCustomers,
        averageLoyaltyPoints: avgPoints?.avg || 0,
        totalLoyaltyPoints: totalPoints?.sum || 0,
        newCustomersThisMonth: newThisMonth,
      },
    };
  }

  // @ts-ignore
  async getCustomerProfiles(params) {
    const qb = await this.buildCustomerQuery(params);
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
  async getCustomerById(params) {
    const { id } = params;
    if (!id) {
      return { status: false, message: "Missing customer ID", data: null };
    }
    const repo = await this.getCustomerRepository();
    const customer = await repo.findOne({
      where: { id },
      relations: ["sales", "loyaltyTransactions"],
    });
    if (!customer) {
      return { status: false, message: "Customer not found", data: null };
    }

    // Compute additional stats: total spent, total loyalty earned, etc.
    const saleRepo = await this.getSaleRepository();
    const totalSpentResult = await saleRepo
      .createQueryBuilder("sale")
      .select("SUM(sale.totalAmount)", "total")
      .where("sale.customerId = :customerId", { customerId: id })
      .andWhere("sale.status = 'paid'")
      .getRawOne();
    const totalSpent = totalSpentResult?.total || 0;

    const loyaltyRepo = await this.getLoyaltyRepository();
    const totalPointsEarnedResult = await loyaltyRepo
      .createQueryBuilder("lt")
      .select("SUM(lt.pointsChange)", "total")
      .where("lt.customerId = :customerId", { customerId: id })
      .andWhere("lt.pointsChange > 0")
      .getRawOne();
    const totalPointsEarned = totalPointsEarnedResult?.total || 0;

    const totalPointsRedeemedResult = await loyaltyRepo
      .createQueryBuilder("lt")
      .select("SUM(lt.pointsChange)", "total")
      .where("lt.customerId = :customerId", { customerId: id })
      .andWhere("lt.pointsChange < 0")
      .getRawOne();
    const totalPointsRedeemed = Math.abs(totalPointsRedeemedResult?.total || 0);

    // Last purchase date
    const lastPurchase = await saleRepo
      .createQueryBuilder("sale")
      .where("sale.customerId = :customerId", { customerId: id })
      .andWhere("sale.status = 'paid'")
      .orderBy("sale.timestamp", "DESC")
      .getOne();

    return {
      status: true,
      data: {
        ...customer,
        stats: {
          totalSpent,
          totalPointsEarned,
          totalPointsRedeemed,
          lastPurchaseDate: lastPurchase?.timestamp || null,
        },
      },
    };
  }

  // @ts-ignore
  async getCustomerByContactInfo(params) {
    const { contactInfo } = params;
    if (!contactInfo) {
      return { status: false, message: "Missing contactInfo", data: null };
    }
    const repo = await this.getCustomerRepository();
    const customer = await repo.findOne({
      where: { contactInfo },
      relations: ["sales", "loyaltyTransactions"],
    });
    if (!customer) {
      return { status: false, message: "Customer not found", data: null };
    }
    return { status: true, data: customer };
  }

  // @ts-ignore
  async getTopCustomersBySpending(params) {
    const { limit = 10, startDate, endDate } = params;
    const saleRepo = await this.getSaleRepository();

    const qb = saleRepo
      .createQueryBuilder("sale")
      .leftJoinAndSelect("sale.customer", "customer")
      .select("customer.id", "customerId")
      .addSelect("customer.name", "customerName")
      .addSelect("COUNT(*)", "purchaseCount")
      .addSelect("SUM(sale.totalAmount)", "totalSpent")
      .where("sale.status = 'paid'")
      .andWhere("sale.customerId IS NOT NULL");

    if (startDate && endDate) {
      qb.andWhere("sale.timestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      });
    } else if (startDate) {
      qb.andWhere("sale.timestamp >= :startDate", { startDate });
    } else if (endDate) {
      qb.andWhere("sale.timestamp <= :endDate", { endDate });
    }

    qb.groupBy("customer.id").orderBy("totalSpent", "DESC").limit(limit);

    const top = await qb.getRawMany();
    return { status: true, data: top };
  }

  // @ts-ignore
  async getTopCustomersByLoyaltyPoints(params) {
    const { limit = 10 } = params;
    const repo = await this.getCustomerRepository();
    const top = await repo
      .createQueryBuilder("customer")
      .select("customer.id", "customerId")
      .addSelect("customer.name", "customerName")
      .addSelect("customer.loyaltyPointsBalance", "points")
      .orderBy("customer.loyaltyPointsBalance", "DESC")
      .limit(limit)
      .getRawMany();
    return { status: true, data: top };
  }

  // @ts-ignore
  async getCustomerSegmentation(params) {
    // Segment customers by spending tiers: high, medium, low, inactive
    const saleRepo = await this.getSaleRepository();

    // Get all customers with total spending
    const spendingData = await saleRepo
      .createQueryBuilder("sale")
      .select("sale.customerId", "customerId")
      .addSelect("SUM(sale.totalAmount)", "totalSpent")
      .addSelect("COUNT(*)", "purchaseCount")
      .where("sale.status = 'paid'")
      .andWhere("sale.customerId IS NOT NULL")
      .groupBy("sale.customerId")
      .getRawMany();

    const totalCustomers = await (await this.getCustomerRepository()).count();

    // Define thresholds
    const sorted = spendingData
      .map((d) => parseFloat(d.totalSpent))
      .sort((a, b) => b - a);
    const highThreshold = sorted[Math.floor(sorted.length * 0.2)] || 0; // top 20%
    const lowThreshold = sorted[Math.floor(sorted.length * 0.5)] || 0; // bottom 50%

    let high = 0,
      medium = 0,
      low = 0,
      inactive = 0;
    spendingData.forEach((d) => {
      const spent = parseFloat(d.totalSpent);
      if (spent >= highThreshold) high++;
      else if (spent >= lowThreshold) medium++;
      else low++;
    });
    inactive = totalCustomers - spendingData.length;

    return {
      status: true,
      data: {
        highValue: high,
        mediumValue: medium,
        lowValue: low,
        inactive,
        thresholds: {
          high: highThreshold,
          low: lowThreshold,
        },
      },
    };
  }

  // @ts-ignore
  async getCustomerPurchaseHistory(params) {
    const { customerId, ...rest } = params;
    if (!customerId) {
      return { status: false, message: "Missing customerId", data: null };
    }
    const saleRepo = await this.getSaleRepository();
    const qb = saleRepo
      .createQueryBuilder("sale")
      .leftJoinAndSelect("sale.saleItems", "saleItems")
      .leftJoinAndSelect("saleItems.product", "product")
      .where("sale.customerId = :customerId", { customerId })
      .orderBy("sale.timestamp", "DESC");

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

  // @ts-ignore
  async getCustomerLoyaltyHistory(params) {
    const { customerId, ...rest } = params;
    if (!customerId) {
      return { status: false, message: "Missing customerId", data: null };
    }
    const loyaltyRepo = await this.getLoyaltyRepository();
    const qb = loyaltyRepo
      .createQueryBuilder("lt")
      .leftJoinAndSelect("lt.sale", "sale")
      .where("lt.customerId = :customerId", { customerId })
      .orderBy("lt.timestamp", "DESC");

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

  // @ts-ignore
  async getCustomerReturnHistory(params) {
    const { customerId, ...rest } = params;
    if (!customerId) {
      return { status: false, message: "Missing customerId", data: null };
    }
    const returnRepo = await this.getReturnRepository();
    const qb = returnRepo
      .createQueryBuilder("refund")
      .leftJoinAndSelect("refund.sale", "sale")
      .leftJoinAndSelect("refund.items", "items")
      .leftJoinAndSelect("items.product", "product")
      .where("refund.customerId = :customerId", { customerId })
      .orderBy("refund.createdAt", "DESC");

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

  // @ts-ignore
  async exportCustomers(params) {
    const qb = await this.buildCustomerQuery(params);
    qb.skip(undefined).take(undefined);
    const customers = await qb.getMany();

    const flatData = customers.map((c) => ({
      id: c.id,
      name: c.name,
      contactInfo: c.contactInfo,
      loyaltyPointsBalance: c.loyaltyPointsBalance,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return {
      status: true,
      data: flatData,
      format: "csv",
    };
  }

  // @ts-ignore
  async generateCustomerInsightsReport(params) {
    const summary = await this.getCustomerSummary(params);
    const topSpenders = await this.getTopCustomersBySpending(params);
    const topLoyalty = await this.getTopCustomersByLoyaltyPoints(params);
    const segmentation = await this.getCustomerSegmentation(params);
    const recentCustomers = await this.getCustomerProfiles({
      ...params,
      limit: 10,
      orderBy: "createdAt DESC",
    });

    return {
      status: true,
      data: {
        summary: summary.data,
        topSpenders: topSpenders.data,
        topLoyalty: topLoyalty.data,
        segmentation: segmentation.data,
        recentCustomers: recentCustomers.data,
        generatedAt: new Date().toISOString(),
        filters: params,
      },
    };
  }
}

// Register IPC handler
const customerInsightsHandler = new CustomerInsightsHandler();

ipcMain.handle(
  "customerInsights",
  withErrorHandling(
    // @ts-ignore
    customerInsightsHandler.handleRequest.bind(customerInsightsHandler),
    "IPC:customerInsights",
  ),
);

module.exports = { CustomerInsightsHandler, customerInsightsHandler };
