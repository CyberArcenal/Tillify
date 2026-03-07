// services/LoyaltyTransactionService.js
//@ts-check

const auditLogger = require("../utils/auditLogger");

const { validateLoyaltyTransaction } = require("../utils/loyaltyUtils");

class LoyaltyTransactionService {
  constructor() {
    this.transactionRepository = null;
    this.customerRepository = null;
    this.saleRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const Customer = require("../entities/Customer");
    const Sale = require("../entities/Sale");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.transactionRepository =
      AppDataSource.getRepository(LoyaltyTransaction);
    this.customerRepository = AppDataSource.getRepository(Customer);
    this.saleRepository = AppDataSource.getRepository(Sale);
    console.log("LoyaltyTransactionService initialized");
  }

  async getRepositories() {
    if (!this.transactionRepository) {
      await this.initialize();
    }
    return {
      transaction: this.transactionRepository,
      customer: this.customerRepository,
      sale: this.saleRepository,
    };
  }

  /**
   * Create a manual loyalty transaction (adjustment)
   * @param {Object} data - Transaction data
   * @param {number} data.customerId - Customer ID
   * @param {number} data.pointsChange - Positive (earn) or negative (redeem)
   * @param {string} data.notes - Reason for adjustment
   * @param {number|null} data.saleId - Optional sale reference
   * @param {string} user - User performing the action
   */
  async createManual(data, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const {
      transaction: txRepo,
      customer: customerRepo,
      sale: saleRepo,
    } = await this.getRepositories();

    try {
      // Validate transaction data
      const validation = validateLoyaltyTransaction(data);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const { customerId, pointsChange, notes, saleId } = data;

      // Fetch customer

      // @ts-ignore
      const customer = await customerRepo.findOne({
        where: { id: customerId },
      });
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found`);
      }

      // Check sufficient balance for redemption
      if (
        pointsChange < 0 &&
        // @ts-ignore
        customer.loyaltyPointsBalance + pointsChange < 0
      ) {
        throw new Error(
          `Insufficient loyalty points. Available: ${customer.loyaltyPointsBalance}, Requested: ${-pointsChange}`,
        );
      }

      // Fetch sale if provided
      let sale = null;
      if (saleId) {
        // @ts-ignore
        sale = await saleRepo.findOne({ where: { id: saleId } });
        if (!sale) {
          throw new Error(`Sale with ID ${saleId} not found`);
        }
      }

      // Record old balance for audit
      const oldBalance = customer.loyaltyPointsBalance;

      // Update customer balance

      // @ts-ignore
      customer.loyaltyPointsBalance += pointsChange;
      customer.updatedAt = new Date();

      // @ts-ignore
      const updatedCustomer = await updateDb(customerRepo, customer);

      // Create transaction record

      // @ts-ignore
      const transaction = txRepo.create({
        pointsChange,
        notes,
        customer: updatedCustomer,
        sale: sale || null,
        timestamp: new Date(),
      });

      // @ts-ignore
      const savedTx = await saveDb(txRepo, transaction);

      // Audit logs
      await auditLogger.logUpdate(
        "Customer",
        customerId,
        { loyaltyPointsBalance: oldBalance },
        { loyaltyPointsBalance: updatedCustomer.loyaltyPointsBalance },
        user,
      );
      await auditLogger.logCreate(
        "LoyaltyTransaction",
        savedTx.id,
        savedTx,
        user,
      );

      console.log(
        `Manual loyalty transaction created: ${pointsChange > 0 ? "+" : ""}${pointsChange} points for customer #${customerId}`,
      );
      return savedTx;
    } catch (error) {
      console.error(
        "Failed to create manual loyalty transaction:",

        // @ts-ignore
        error.message,
      );
      throw error;
    }
  }

  /**
   * Find a transaction by ID with relations
   * @param {number} id
   */
  async findById(id) {
    const { transaction: txRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const transaction = await txRepo.findOne({
        where: { id },
        relations: ["customer", "sale"],
      });
      if (!transaction) {
        throw new Error(`Loyalty transaction with ID ${id} not found`);
      }

      // @ts-ignore
      await auditLogger.logView("LoyaltyTransaction", id, "system");
      return transaction;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find loyalty transaction:", error.message);
      throw error;
    }
  }

  /**
   * Find all transactions with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { transaction: txRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = txRepo
        .createQueryBuilder("tx")
        .leftJoinAndSelect("tx.customer", "customer")
        .leftJoinAndSelect("tx.sale", "sale");

      // Filter by customer

      // @ts-ignore
      if (options.customerId) {
        queryBuilder.andWhere("tx.customerId = :customerId", {
          // @ts-ignore
          customerId: options.customerId,
        });
      }

      // Filter by sale

      // @ts-ignore
      if (options.saleId) {
        queryBuilder.andWhere("tx.saleId = :saleId", {
          // @ts-ignore
          saleId: options.saleId,
        });
      }

      // Filter by date range

      // @ts-ignore
      if (options.startDate) {
        queryBuilder.andWhere("tx.timestamp >= :startDate", {
          // @ts-ignore
          startDate: options.startDate,
        });
      }

      // @ts-ignore
      if (options.endDate) {
        queryBuilder.andWhere("tx.timestamp <= :endDate", {
          // @ts-ignore
          endDate: options.endDate,
        });
      }

      // Filter by points direction (earn/redeem)

      // @ts-ignore
      if (options.type === "earn") {
        queryBuilder.andWhere("tx.pointsChange > 0");
      // @ts-ignore
      } else if (options.type === "redeem") {
        queryBuilder.andWhere("tx.pointsChange < 0");
      }

      // Search in notes

      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere("tx.notes LIKE :search", {
          // @ts-ignore
          search: `%${options.search}%`,
        });
      }

      // Sorting

      // @ts-ignore
      const sortBy = options.sortBy || "timestamp";

      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`tx.${sortBy}`, sortOrder);

      // Pagination

      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;

        // @ts-ignore
        queryBuilder.skip(offset).take(options.limit);
      }

      const transactions = await queryBuilder.getMany();

      await auditLogger.logView("LoyaltyTransaction", null, "system");
      return transactions;
    } catch (error) {
      console.error("Failed to fetch loyalty transactions:", error);
      throw error;
    }
  }

  /**
   * Get statistics about loyalty transactions
   */
  async getStatistics() {
    const { transaction: txRepo } = await this.getRepositories();

    try {
      // Total points earned (sum of positive changes)

      // @ts-ignore
      const earnedResult = await txRepo
        .createQueryBuilder("tx")
        .select("SUM(tx.pointsChange)", "total")
        .where("tx.pointsChange > 0")
        .getRawOne();
      const totalEarned = parseFloat(earnedResult.total) || 0;

      // Total points redeemed (sum of absolute negative changes)

      // @ts-ignore
      const redeemedResult = await txRepo
        .createQueryBuilder("tx")
        .select("SUM(ABS(tx.pointsChange))", "total")
        .where("tx.pointsChange < 0")
        .getRawOne();
      const totalRedeemed = parseFloat(redeemedResult.total) || 0;

      // Count of transactions by type

      // @ts-ignore
      const earnCount = await txRepo.count({
        where: { pointsChange: { $gt: 0 } },
      }); // typeorm syntax may differ; using query builder

      // @ts-ignore
      const redeemCount = await txRepo.count({
        where: { pointsChange: { $lt: 0 } },
      });

      // Most active customers (by transaction count)

      // @ts-ignore
      const topCustomers = await txRepo
        .createQueryBuilder("tx")
        .select("tx.customerId", "customerId")
        .addSelect("COUNT(*)", "transactionCount")
        .addSelect("SUM(tx.pointsChange)", "netPoints")
        .groupBy("tx.customerId")
        .orderBy("transactionCount", "DESC")
        .limit(5)
        .getRawMany();

      // Transactions per month (last 6 months)

      // @ts-ignore
      const monthly = await txRepo
        .createQueryBuilder("tx")
        .select([
          "strftime('%Y-%m', tx.timestamp) as month",
          "COUNT(*) as count",
          "SUM(CASE WHEN tx.pointsChange > 0 THEN tx.pointsChange ELSE 0 END) as earned",
          "SUM(CASE WHEN tx.pointsChange < 0 THEN ABS(tx.pointsChange) ELSE 0 END) as redeemed",
        ])
        .where("tx.timestamp >= date('now', '-6 months')")
        .groupBy("strftime('%Y-%m', tx.timestamp)")
        .orderBy("month", "DESC")
        .getRawMany();

      return {
        totalEarned,
        totalRedeemed,
        netPoints: totalEarned - totalRedeemed,
        transactionCounts: {
          earn: earnCount,
          redeem: redeemCount,
        },
        topCustomers,
        monthlyTrends: monthly,
      };
    } catch (error) {
      console.error("Failed to get loyalty transaction statistics:", error);
      throw error;
    }
  }

  /**
   * Export transactions to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters (same as findAll)
   * @param {string} user
   */
  async exportTransactions(format = "json", filters = {}, user = "system") {
    try {
      const transactions = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Customer",
          "Sale ID",
          "Points Change",
          "Type",
          "Notes",
          "Timestamp",
        ];
        const rows = transactions.map((tx) => [
          tx.id,

          // @ts-ignore
          tx.customer?.name || "N/A",

          // @ts-ignore
          tx.sale?.id || "",
          tx.pointsChange,

          // @ts-ignore
          tx.pointsChange > 0
            ? "Earn"
            // @ts-ignore
            : tx.pointsChange < 0
              ? "Redeem"
              : "Zero",
          tx.notes || "",

          // @ts-ignore
          new Date(tx.timestamp).toLocaleString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `loyalty_transactions_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: transactions,
          filename: `loyalty_transactions_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      // @ts-ignore
      await auditLogger.logExport("LoyaltyTransaction", format, filters, user);
      console.log(
        `Exported ${transactions.length} loyalty transactions in ${format} format`,
      );
      return exportData;
    } catch (error) {
      console.error("Failed to export loyalty transactions:", error);
      throw error;
    }
  }
}

// Singleton instance
const loyaltyTransactionService = new LoyaltyTransactionService();
module.exports = loyaltyTransactionService;
