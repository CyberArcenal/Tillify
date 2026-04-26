

const auditLogger = require("../utils/auditLogger");
// @ts-ignore
const { Between, In, MoreThanOrEqual, LessThanOrEqual } = require("typeorm");

class ReportService {
  constructor() {
    this.repositories = {};
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Load entities lazily to avoid circular dependencies
    const Sale = require("../entities/Sale");
    const SaleItem = require("../entities/SaleItem");
    const Product = require("../entities/Product");
    const Customer = require("../entities/Customer");
    const InventoryMovement = require("../entities/InventoryMovement");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const { AuditLog } = require("../entities/AuditLog");

    this.repositories = {
      sale: AppDataSource.getRepository(Sale),
      saleItem: AppDataSource.getRepository(SaleItem),
      product: AppDataSource.getRepository(Product),
      customer: AppDataSource.getRepository(Customer),
      inventoryMovement: AppDataSource.getRepository(InventoryMovement),
      loyaltyTransaction: AppDataSource.getRepository(LoyaltyTransaction),
      auditLog: AppDataSource.getRepository(AuditLog),
    };

    console.log("ReportService initialized");
  }

  async getRepositories() {
    if (Object.keys(this.repositories).length === 0) {
      await this.initialize();
    }
    return this.repositories;
  }

  /**
   * Generate sales report with flexible grouping and filtering
   * @param {Object} filters
   * @param {Date} [filters.startDate]
   * @param {Date} [filters.endDate]
   * @param {number} [filters.productId]
   * @param {number} [filters.customerId]
   * @param {string} [filters.paymentMethod] - 'cash', 'card', 'wallet'
   * @param {string} [filters.status] - 'paid', 'refunded', etc.
   * @param {string} [filters.groupBy] - 'day', 'month', 'product', 'customer', 'paymentMethod'
   * @param {string} user - user requesting report
   * @returns {Promise<Object>}
   */
  async getSalesReport(filters = {}, user = "system") {
    // @ts-ignore
    const { sale, saleItem, product } = await this.getRepositories();

    try {
      const {
        startDate,
        endDate,
        productId,
        customerId,
        paymentMethod,
        status,
        groupBy = "day",
      } = filters;

      // Base query for sales
      const queryBuilder = sale
        .createQueryBuilder("sale")
        .leftJoinAndSelect("sale.saleItems", "saleItem")
        .leftJoin("saleItem.product", "product")
        .addSelect(["product.id", "product.name", "product.sku"]);

      // Apply filters
      if (startDate) {
        queryBuilder.andWhere("sale.timestamp >= :startDate", { startDate });
      }
      if (endDate) {
        queryBuilder.andWhere("sale.timestamp <= :endDate", { endDate });
      }
      if (customerId) {
        queryBuilder.andWhere("sale.customer = :customerId", { customerId });
      }
      if (paymentMethod) {
        queryBuilder.andWhere("sale.paymentMethod = :paymentMethod", {
          paymentMethod,
        });
      }
      if (status) {
        queryBuilder.andWhere("sale.status = :status", { status });
      }
      if (productId) {
        queryBuilder.andWhere("product.id = :productId", { productId });
      }

      const sales = await queryBuilder.getMany();

      // Aggregate based on groupBy
      let reportData = [];
      let summary = {
        totalSales: 0,
        totalRevenue: 0,
        totalItems: 0,
        averageTicket: 0,
      };

      if (groupBy === "day") {
        const grouped = {};
        // @ts-ignore
        sales.forEach((sale) => {
          const day = sale.timestamp.toISOString().split("T")[0];
          // @ts-ignore
          if (!grouped[day]) {
            // @ts-ignore
            grouped[day] = { count: 0, revenue: 0, items: 0 };
          }
          // @ts-ignore
          grouped[day].count += 1;
          // @ts-ignore
          grouped[day].revenue += parseFloat(sale.totalAmount);
          // @ts-ignore
          grouped[day].items += sale.saleItems.reduce(
            // @ts-ignore
            (sum, item) => sum + item.quantity,
            0,
          );
        });
        reportData = Object.entries(grouped).map(([date, values]) => ({
          date,
          ...values,
        }));
      } else if (groupBy === "month") {
        const grouped = {};
        // @ts-ignore
        sales.forEach((sale) => {
          const month = sale.timestamp.toISOString().slice(0, 7); // YYYY-MM
          // @ts-ignore
          if (!grouped[month]) {
            // @ts-ignore
            grouped[month] = { count: 0, revenue: 0, items: 0 };
          }
          // @ts-ignore
          grouped[month].count += 1;
          // @ts-ignore
          grouped[month].revenue += parseFloat(sale.totalAmount);
          // @ts-ignore
          grouped[month].items += sale.saleItems.reduce(
            // @ts-ignore
            (sum, item) => sum + item.quantity,
            0,
          );
        });
        reportData = Object.entries(grouped).map(([month, values]) => ({
          month,
          ...values,
        }));
      } else if (groupBy === "product") {
        // Aggregate by product across all sales
        const productMap = {};
        // @ts-ignore
        sales.forEach((sale) => {
          // @ts-ignore
          sale.saleItems.forEach((item) => {
            const prodId = item.product.id;
            // @ts-ignore
            if (!productMap[prodId]) {
              // @ts-ignore
              productMap[prodId] = {
                productId: prodId,
                productName: item.product.name,
                productSku: item.product.sku,
                quantity: 0,
                revenue: 0,
              };
            }
            // @ts-ignore
            productMap[prodId].quantity += item.quantity;
            // @ts-ignore
            productMap[prodId].revenue += parseFloat(item.lineTotal);
          });
        });
        reportData = Object.values(productMap);
      } else if (groupBy === "customer") {
        const customerMap = {};
        // @ts-ignore
        sales.forEach((sale) => {
          const custId = sale.customer ? sale.customer.id : null;
          const custName = sale.customer ? sale.customer.name : "Guest";
          // @ts-ignore
          if (!customerMap[custId]) {
            // @ts-ignore
            customerMap[custId] = {
              customerId: custId,
              customerName: custName,
              purchaseCount: 0,
              totalSpent: 0,
            };
          }
          // @ts-ignore
          customerMap[custId].purchaseCount += 1;
          // @ts-ignore
          customerMap[custId].totalSpent += parseFloat(sale.totalAmount);
        });
        reportData = Object.values(customerMap);
      } else if (groupBy === "paymentMethod") {
        const methodMap = {};
        // @ts-ignore
        sales.forEach((sale) => {
          const method = sale.paymentMethod;
          // @ts-ignore
          if (!methodMap[method]) {
            // @ts-ignore
            methodMap[method] = { count: 0, revenue: 0 };
          }
          // @ts-ignore
          methodMap[method].count += 1;
          // @ts-ignore
          methodMap[method].revenue += parseFloat(sale.totalAmount);
        });
        reportData = Object.entries(methodMap).map(([method, values]) => ({
          paymentMethod: method,
          ...values,
        }));
      }

      // Calculate summary
      summary.totalSales = sales.length;
      summary.totalRevenue = sales.reduce(
        // @ts-ignore
        (sum, s) => sum + parseFloat(s.totalAmount),
        0,
      );
      summary.totalItems = sales.reduce(
        // @ts-ignore
        (sum, s) =>
          sum +
          // @ts-ignore
          s.saleItems.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      );
      summary.averageTicket =
        summary.totalSales > 0 ? summary.totalRevenue / summary.totalSales : 0;

      await auditLogger.logCreate("SalesReport", filters, user);

      return {
        filters,
        summary,
        data: reportData,
        rawCount: sales.length,
      };
    } catch (error) {
      // @ts-ignore
      console.error("Failed to generate sales report:", error.message);
      throw error;
    }
  }

  /**
   * Inventory report: current stock levels, low stock, movements
   * @param {Object} filters
   * @param {boolean} [filters.includeMovements=false]
   * @param {number} [filters.lowStockThreshold=5]
   * @param {number[]} [filters.productIds]
   * @param {string} user
   */
  async getInventoryReport(filters = {}, user = "system") {
    // @ts-ignore
    const { product, inventoryMovement } = await this.getRepositories();

    try {
      const {
        includeMovements = false,
        lowStockThreshold = 5,
        productIds,
      } = filters;

      // Product query
      const productQuery = product.createQueryBuilder("product");
      if (productIds && productIds.length > 0) {
        productQuery.andWhere("product.id IN (:...productIds)", { productIds });
      }
      const products = await productQuery.getMany();

      // Low stock count
      const lowStockProducts = products.filter(
        // @ts-ignore
        (p) => p.stockQty <= lowStockThreshold,
      );

      // Total inventory value
      const totalValue = products.reduce(
        // @ts-ignore
        (sum, p) => sum + parseFloat(p.price) * p.stockQty,
        0,
      );

      let movements = [];
      if (includeMovements) {
        // Fetch recent movements (last 30 days by default)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const movementQuery = inventoryMovement
          .createQueryBuilder("movement")
          .leftJoinAndSelect("movement.product", "product")
          .leftJoinAndSelect("movement.sale", "sale")
          .where("movement.timestamp >= :since", { since: thirtyDaysAgo });

        if (productIds && productIds.length > 0) {
          movementQuery.andWhere("product.id IN (:...productIds)", {
            productIds,
          });
        }

        movements = await movementQuery
          .orderBy("movement.timestamp", "DESC")
          .getMany();
      }

      await auditLogger.logCreate("InventoryReport", filters, user);

      return {
        filters,
        summary: {
          totalProducts: products.length,
          totalValue,
          lowStockCount: lowStockProducts.length,
        },
        lowStockProducts,
        // @ts-ignore
        products: products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          price: p.price,
          stockQty: p.stockQty,
          isActive: p.isActive,
        })),
        movements: includeMovements ? movements : undefined,
      };
    } catch (error) {
      // @ts-ignore
      console.error("Failed to generate inventory report:", error.message);
      throw error;
    }
  }

  /**
   * Customer report: purchase history, loyalty points
   * @param {Object} filters
   * @param {number} [filters.customerId] - if not provided, aggregate all customers
   * @param {Date} [filters.startDate]
   * @param {Date} [filters.endDate]
   * @param {string} user
   */
  async getCustomerReport(filters = {}, user = "system") {
    // @ts-ignore
    const { customer, sale, loyaltyTransaction } = await this.getRepositories();

    try {
      const { customerId, startDate, endDate } = filters;

      const whereConditions = {};
      if (customerId) {
        // @ts-ignore
        whereConditions.id = customerId;
      }

      const customers = await customer.find({
        where: whereConditions,
        relations: ["sales", "loyaltyTransactions"],
      });

      const report = await Promise.all(
        // @ts-ignore
        customers.map(async (cust) => {
          // Filter sales by date if needed
          let sales = cust.sales || [];
          if (startDate || endDate) {
            // @ts-ignore
            sales = sales.filter((sale) => {
              const saleDate = new Date(sale.timestamp);
              if (startDate && saleDate < startDate) return false;
              if (endDate && saleDate > endDate) return false;
              return true;
            });
          }

          const totalSpent = sales.reduce(
            // @ts-ignore
            (sum, s) => sum + parseFloat(s.totalAmount),
            0,
          );
          const purchaseCount = sales.length;

          // Loyalty transactions
          let loyaltyTx = cust.loyaltyTransactions || [];
          if (startDate || endDate) {
            // @ts-ignore
            loyaltyTx = loyaltyTx.filter((tx) => {
              const txDate = new Date(tx.timestamp);
              if (startDate && txDate < startDate) return false;
              if (endDate && txDate > endDate) return false;
              return true;
            });
          }

          const pointsEarned = loyaltyTx
            // @ts-ignore
            .filter((tx) => tx.pointsChange > 0)
            // @ts-ignore
            .reduce((sum, tx) => sum + tx.pointsChange, 0);
          const pointsRedeemed = loyaltyTx
            // @ts-ignore
            .filter((tx) => tx.pointsChange < 0)
            // @ts-ignore
            .reduce((sum, tx) => sum + Math.abs(tx.pointsChange), 0);

          return {
            customerId: cust.id,
            name: cust.name,
            contactInfo: cust.contactInfo,
            loyaltyPointsBalance: cust.loyaltyPointsBalance,
            purchaseCount,
            totalSpent,
            pointsEarned,
            pointsRedeemed,
          };
        }),
      );

      await auditLogger.logCreate("CustomerReport", filters, user);

      return {
        filters,
        data: report,
      };
    } catch (error) {
      // @ts-ignore
      console.error("Failed to generate customer report:", error.message);
      throw error;
    }
  }

  /**
   * Loyalty report: points activity
   * @param {Object} filters
   * @param {number} [filters.customerId]
   * @param {Date} [filters.startDate]
   * @param {Date} [filters.endDate]
   * @param {string} user
   */
  async getLoyaltyReport(filters = {}, user = "system") {
    // @ts-ignore
    const { loyaltyTransaction } = await this.getRepositories();

    try {
      const { customerId, startDate, endDate } = filters;

      const queryBuilder = loyaltyTransaction
        .createQueryBuilder("tx")
        .leftJoinAndSelect("tx.customer", "customer")
        .leftJoinAndSelect("tx.sale", "sale");

      if (customerId) {
        queryBuilder.andWhere("customer.id = :customerId", { customerId });
      }
      if (startDate) {
        queryBuilder.andWhere("tx.timestamp >= :startDate", { startDate });
      }
      if (endDate) {
        queryBuilder.andWhere("tx.timestamp <= :endDate", { endDate });
      }

      const transactions = await queryBuilder
        .orderBy("tx.timestamp", "DESC")
        .getMany();

      // Summary
      const totalPointsEarned = transactions
        // @ts-ignore
        .filter((tx) => tx.pointsChange > 0)
        // @ts-ignore
        .reduce((sum, tx) => sum + tx.pointsChange, 0);
      const totalPointsRedeemed = transactions
        // @ts-ignore
        .filter((tx) => tx.pointsChange < 0)
        // @ts-ignore
        .reduce((sum, tx) => sum + Math.abs(tx.pointsChange), 0);
      const netPoints = totalPointsEarned - totalPointsRedeemed;

      await auditLogger.logCreate("LoyaltyReport", filters, user);

      return {
        filters,
        summary: {
          totalTransactions: transactions.length,
          totalPointsEarned,
          totalPointsRedeemed,
          netPoints,
        },
        // @ts-ignore
        transactions: transactions.map((tx) => ({
          id: tx.id,
          customerId: tx.customer?.id,
          customerName: tx.customer?.name,
          pointsChange: tx.pointsChange,
          timestamp: tx.timestamp,
          notes: tx.notes,
          saleId: tx.sale?.id,
        })),
      };
    } catch (error) {
      // @ts-ignore
      console.error("Failed to generate loyalty report:", error.message);
      throw error;
    }
  }

  /**
   * Audit log report
   * @param {Object} filters
   * @param {string} [filters.user]
   * @param {string} [filters.entity]
   * @param {string} [filters.action]
   * @param {Date} [filters.startDate]
   * @param {Date} [filters.endDate]
   * @param {string} user
   */
  async getAuditLogReport(filters = {}, user = "system") {
    // @ts-ignore
    const { auditLog } = await this.getRepositories();

    try {
      const { user: filterUser, entity, action, startDate, endDate } = filters;

      const where = {};
      if (filterUser) where.user = filterUser;
      if (entity) where.entity = entity;
      if (action) where.action = action;
      if (startDate || endDate) {
        // @ts-ignore
        where.timestamp = {};
        if (startDate)
          // @ts-ignore
          where.timestamp = Between(startDate, endDate || new Date());
        // @ts-ignore
        else if (endDate) where.timestamp = LessThanOrEqual(endDate);
      }

      const logs = await auditLog.find({
        where,
        order: { timestamp: "DESC" },
      });

      await auditLogger.logCreate("AuditLogReport", filters, user);

      return {
        filters,
        count: logs.length,
        logs,
      };
    } catch (error) {
      // @ts-ignore
      console.error("Failed to generate audit log report:", error.message);
      throw error;
    }
  }

  /**
   * Export any report to CSV or JSON
   * @param {string} reportType - 'sales', 'inventory', 'customer', 'loyalty', 'audit'
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - filters for the specific report
   * @param {string} user
   */
  async exportReport(
    reportType,
    format = "json",
    filters = {},
    user = "system",
  ) {
    let data;
    switch (reportType) {
      case "sales":
        data = await this.getSalesReport(filters, user);
        break;
      case "inventory":
        data = await this.getInventoryReport(filters, user);
        break;
      case "customer":
        data = await this.getCustomerReport(filters, user);
        break;
      case "loyalty":
        data = await this.getLoyaltyReport(filters, user);
        break;
      case "audit":
        data = await this.getAuditLogReport(filters, user);
        break;
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    // Format for export
    let exportData;
    if (format === "csv") {
      // Flatten data for CSV
      const rows = [];
      // Determine headers based on report type
      // @ts-ignore
      let headers = [];
      if (reportType === "sales") {
        headers = ["Date", "Count", "Revenue", "Items"];
        rows.push(
          // @ts-ignore
          ...data.data.map((item) => [
            item.date || item.month,
            item.count,
            item.revenue,
            item.items,
          ]),
        );
      } else if (reportType === "inventory") {
        headers = ["Product ID", "SKU", "Name", "Price", "Stock", "Active"];
        rows.push(
          // @ts-ignore
          ...data.products.map((p) => [
            p.id,
            p.sku,
            p.name,
            p.price,
            p.stockQty,
            p.isActive,
          ]),
        );
      } else if (reportType === "customer") {
        headers = [
          "Customer ID",
          "Name",
          "Contact",
          "Purchases",
          "Total Spent",
          "Points Balance",
        ];
        rows.push(
          // @ts-ignore
          ...data.data.map((c) => [
            c.customerId,
            c.name,
            c.contactInfo,
            c.purchaseCount,
            c.totalSpent,
            c.loyaltyPointsBalance,
          ]),
        );
      } else if (reportType === "loyalty") {
        headers = [
          "Transaction ID",
          "Customer",
          "Points Change",
          "Timestamp",
          "Notes",
          "Sale ID",
        ];
        rows.push(
          // @ts-ignore
          ...data.transactions.map((tx) => [
            tx.id,
            tx.customerName,
            tx.pointsChange,
            tx.timestamp,
            tx.notes,
            tx.saleId,
          ]),
        );
      } else if (reportType === "audit") {
        headers = ["ID", "Action", "Entity", "Entity ID", "User", "Timestamp"];
        rows.push(
          // @ts-ignore
          ...data.logs.map((log) => [
            log.id,
            log.action,
            log.entity,
            log.entityId,
            log.user,
            log.timestamp,
          ]),
        );
      }
      const csvContent = [
        // @ts-ignore
        headers.join(","),
        ...rows.map((row) => row.join(",")),
      ].join("\n");
      exportData = {
        format: "csv",
        data: csvContent,
        filename: `${reportType}_report_${new Date().toISOString().split("T")[0]}.csv`,
      };
    } else {
      exportData = {
        format: "json",
        data: data,
        filename: `${reportType}_report_${new Date().toISOString().split("T")[0]}.json`,
      };
    }

    // @ts-ignore
    await auditLogger.logExport(reportType, format, filters, user);
    console.log(`Exported ${reportType} report in ${format} format`);
    return exportData;
  }
}

// Singleton instance
const reportService = new ReportService();
module.exports = reportService;
