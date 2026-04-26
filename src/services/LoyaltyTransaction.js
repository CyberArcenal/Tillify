// services/LoyaltyTransactionService.js
const auditLogger = require("../utils/auditLogger");
const { validateLoyaltyTransaction } = require("../utils/loyaltyUtils");

class LoyaltyTransactionService {
  constructor() {
    this.transactionRepository = null;
    this.customerRepository = null;
    this.saleRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/dataSource");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const Customer = require("../entities/Customer");
    const Sale = require("../entities/Sale");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.transactionRepository = AppDataSource.getRepository(LoyaltyTransaction);
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
   * Helper: get a repository (transactional if queryRunner provided)
   * @param {import("typeorm").QueryRunner | null} qr
   * @param {Function} entityClass
   * @returns {import("typeorm").Repository<any>}
   */
  _getRepo(qr, entityClass) {
    if (qr) {
      return qr.manager.getRepository(entityClass);
    }
    const { AppDataSource } = require("../main/db/dataSource");
    return AppDataSource.getRepository(entityClass);
  }

  /**
   * Create a manual loyalty transaction (adjustment)
   * @param {Object} data - Transaction data
   * @param {number} data.customerId - Customer ID
   * @param {number} data.pointsChange - Positive (earn) or negative (redeem)
   * @param {string} data.notes - Reason for adjustment
   * @param {number|null} data.saleId - Optional sale reference
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async createManual(data, user = "system", qr = null) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const Customer = require("../entities/Customer");
    const Sale = require("../entities/Sale");

    const txRepo = this._getRepo(qr, LoyaltyTransaction);
    const customerRepo = this._getRepo(qr, Customer);
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const validation = validateLoyaltyTransaction(data);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const { customerId, pointsChange, notes, saleId } = data;

      const customer = await customerRepo.findOne({ where: { id: customerId } });
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found`);
      }

      if (pointsChange < 0 && customer.loyaltyPointsBalance + pointsChange < 0) {
        throw new Error(
          `Insufficient loyalty points. Available: ${customer.loyaltyPointsBalance}, Requested: ${-pointsChange}`
        );
      }

      let sale = null;
      if (saleId) {
        sale = await saleRepo.findOne({ where: { id: saleId } });
        if (!sale) {
          throw new Error(`Sale with ID ${saleId} not found`);
        }
      }

      const oldBalance = customer.loyaltyPointsBalance;
      customer.loyaltyPointsBalance += pointsChange;
      customer.updatedAt = new Date();

      const updatedCustomer = await updateDb(customerRepo, customer);

      const transaction = txRepo.create({
        pointsChange,
        notes,
        customer: updatedCustomer,
        sale: sale || null,
        timestamp: new Date(),
      });

      const savedTx = await saveDb(txRepo, transaction);

      // Audit logs
      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save([
          {
            action: "UPDATE",
            entity: "Customer",
            entityId: customerId,
            user,
            description: `Loyalty points changed from ${oldBalance} to ${updatedCustomer.loyaltyPointsBalance}`,
          },
          {
            action: "CREATE",
            entity: "LoyaltyTransaction",
            entityId: savedTx.id,
            user,
            description: `Loyalty transaction recorded: ${pointsChange > 0 ? "+" : ""}${pointsChange}`,
          },
        ]);
      } else {
        await auditLogger.logUpdate(
          "Customer",
          customerId,
          { loyaltyPointsBalance: oldBalance },
          { loyaltyPointsBalance: updatedCustomer.loyaltyPointsBalance },
          user
        );
        await auditLogger.logCreate(
          "LoyaltyTransaction",
          savedTx.id,
          savedTx,
          user
        );
      }

      console.log(
        `Manual loyalty transaction created: ${pointsChange > 0 ? "+" : ""}${pointsChange} points for customer #${customerId}`
      );
      return savedTx;
    } catch (error) {
      console.error("Failed to create manual loyalty transaction:", error.message);
      throw error;
    }
  }

  /**
   * Find a transaction by ID with relations
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findById(id, qr = null) {
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const txRepo = this._getRepo(qr, LoyaltyTransaction);

    try {
      const transaction = await txRepo.findOne({
        where: { id },
        relations: ["customer", "sale"],
      });
      if (!transaction) {
        throw new Error(`Loyalty transaction with ID ${id} not found`);
      }

      await auditLogger.logView("LoyaltyTransaction", id, "system");
      return transaction;
    } catch (error) {
      console.error("Failed to find loyalty transaction:", error.message);
      throw error;
    }
  }

  /**
   * Find all transactions with optional filters
   * @param {Object} options - Filter options
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findAll(options = {}, qr = null) {
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const txRepo = this._getRepo(qr, LoyaltyTransaction);

    try {
      const queryBuilder = txRepo
        .createQueryBuilder("tx")
        .leftJoinAndSelect("tx.customer", "customer")
        .leftJoinAndSelect("tx.sale", "sale");

      if (options.customerId) {
        queryBuilder.andWhere("tx.customerId = :customerId", {
          customerId: options.customerId,
        });
      }

      if (options.saleId) {
        queryBuilder.andWhere("tx.saleId = :saleId", {
          saleId: options.saleId,
        });
      }

      if (options.startDate) {
        queryBuilder.andWhere("tx.timestamp >= :startDate", {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        queryBuilder.andWhere("tx.timestamp <= :endDate", {
          endDate: options.endDate,
        });
      }

      if (options.type === "earn") {
        queryBuilder.andWhere("tx.pointsChange > 0");
      } else if (options.type === "redeem") {
        queryBuilder.andWhere("tx.pointsChange < 0");
      }

      if (options.search) {
        queryBuilder.andWhere("tx.notes LIKE :search", {
          search: `%${options.search}%`,
        });
      }

      const sortBy = options.sortBy || "timestamp";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`tx.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStatistics(qr = null) {
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const txRepo = this._getRepo(qr, LoyaltyTransaction);

    try {
      const earnedResult = await txRepo
        .createQueryBuilder("tx")
        .select("SUM(tx.pointsChange)", "total")
        .where("tx.pointsChange > 0")
        .getRawOne();
      const totalEarned = parseFloat(earnedResult.total) || 0;

      const redeemedResult = await txRepo
        .createQueryBuilder("tx")
        .select("SUM(ABS(tx.pointsChange))", "total")
        .where("tx.pointsChange < 0")
        .getRawOne();
      const totalRedeemed = parseFloat(redeemedResult.total) || 0;

      const earnCount = await txRepo
        .createQueryBuilder("tx")
        .where("tx.pointsChange > 0")
        .getCount();
      const redeemCount = await txRepo
        .createQueryBuilder("tx")
        .where("tx.pointsChange < 0")
        .getCount();

      const topCustomers = await txRepo
        .createQueryBuilder("tx")
        .select("tx.customerId", "customerId")
        .addSelect("COUNT(*)", "transactionCount")
        .addSelect("SUM(tx.pointsChange)", "netPoints")
        .groupBy("tx.customerId")
        .orderBy("transactionCount", "DESC")
        .limit(5)
        .getRawMany();

      // Monthly trends (SQLite syntax, adjust for other DBs if needed)
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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportTransactions(format = "json", filters = {}, user = "system", qr = null) {
    try {
      const transactions = await this.findAll(filters, qr);

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
          tx.customer?.name || "N/A",
          tx.sale?.id || "",
          tx.pointsChange,
          tx.pointsChange > 0 ? "Earn" : tx.pointsChange < 0 ? "Redeem" : "Zero",
          tx.notes || "",
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

      await auditLogger.logExport("LoyaltyTransaction", format, filters, user);
      console.log(
        `Exported ${transactions.length} loyalty transactions in ${format} format`
      );
      return exportData;
    } catch (error) {
      console.error("Failed to export loyalty transactions:", error);
      throw error;
    }
  }

  /**
   * Bulk create manual loyalty transactions
   * @param {Array<Object>} transactionsArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(transactionsArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const txData of transactionsArray) {
      try {
        const saved = await this.createManual(txData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ transaction: txData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Import loyalty transactions from a CSV file
   * @param {string} filePath
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async importFromCSV(filePath, user = "system", qr = null) {
    const fs = require("fs").promises;
    const csv = require("csv-parse/sync");
    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = { imported: [], errors: [] };
    for (const record of records) {
      try {
        const txData = {
          customerId: parseInt(record.customerId, 10),
          pointsChange: parseInt(record.pointsChange, 10),
          notes: record.notes || null,
          saleId: record.saleId ? parseInt(record.saleId, 10) : null,
        };
        const validation = validateLoyaltyTransaction(txData);
        if (!validation.valid) throw new Error(validation.errors.join(", "));
        const saved = await this.createManual(txData, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }
}

// Singleton instance
const loyaltyTransactionService = new LoyaltyTransactionService();
module.exports = loyaltyTransactionService;