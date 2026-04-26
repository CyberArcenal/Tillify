// services/CustomerService.js
const auditLogger = require("../utils/auditLogger");
const { validateCustomerData } = require("../utils/customerUtils");

class CustomerService {
  constructor() {
    this.customerRepository = null;
    this.loyaltyTransactionRepository = null;
    this.saleRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/dataSource");
    const Customer = require("../entities/Customer");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const Sale = require("../entities/Sale");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.customerRepository = AppDataSource.getRepository(Customer);
    this.loyaltyTransactionRepository =
      AppDataSource.getRepository(LoyaltyTransaction);
    this.saleRepository = AppDataSource.getRepository(Sale);
    console.log("CustomerService initialized");
  }

  async getRepositories() {
    if (!this.customerRepository) {
      await this.initialize();
    }
    return {
      customer: this.customerRepository,
      loyaltyTransaction: this.loyaltyTransactionRepository,
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
   * Create a new customer
   * @param {Object} customerData - Customer data
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async create(customerData, user = "system", qr = null) {
    const { saveDb } = require("../utils/dbUtils/dbActions");
    const Customer = require("../entities/Customer");

    const customerRepo = this._getRepo(qr, Customer);

    try {
      const validation = validateCustomerData(customerData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        name,
        contactInfo = null,
        loyaltyPointsBalance = 0,
        isActive = true,
      } = customerData;

      console.log(`Creating customer: ${name}`);

      const customer = customerRepo.create({
        name,
        contactInfo,
        loyaltyPointsBalance,
        isActive,
        createdAt: new Date(),
      });

      const savedCustomer = await saveDb(customerRepo, customer);

      await auditLogger.logCreate(
        "Customer",
        savedCustomer.id,
        savedCustomer,
        user
      );

      console.log(
        `Customer created: #${savedCustomer.id} - ${savedCustomer.name}`
      );
      return savedCustomer;
    } catch (error) {
      console.error("Failed to create customer:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing customer
   * @param {number} id - Customer ID
   * @param {Object} customerData - Updated fields
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async update(id, customerData, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Customer = require("../entities/Customer");

    const customerRepo = this._getRepo(qr, Customer);

    try {
      const existingCustomer = await customerRepo.findOne({ where: { id } });
      if (!existingCustomer) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      const oldData = { ...existingCustomer };

      Object.assign(existingCustomer, customerData);
      existingCustomer.updatedAt = new Date();

      const savedCustomer = await updateDb(customerRepo, existingCustomer);

      await auditLogger.logUpdate("Customer", id, oldData, savedCustomer, user);

      console.log(`Customer updated: #${id}`);
      return savedCustomer;
    } catch (error) {
      console.error("Failed to update customer:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a customer (set isActive = false)
   * @param {number} id - Customer ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async delete(id, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Customer = require("../entities/Customer");

    const customerRepo = this._getRepo(qr, Customer);

    try {
      const customer = await customerRepo.findOne({ where: { id } });
      if (!customer) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      if (!customer.isActive) {
        throw new Error(`Customer #${id} is already inactive`);
      }

      const oldData = { ...customer };
      customer.isActive = false;
      customer.updatedAt = new Date();

      const savedCustomer = await updateDb(customerRepo, customer);

      await auditLogger.logDelete("Customer", id, oldData, user);

      console.log(`Customer deactivated: #${id}`);
      return savedCustomer;
    } catch (error) {
      console.error("Failed to delete customer:", error.message);
      throw error;
    }
  }

  /**
   * Hard delete a customer – removes from DB (only if no sales or loyalty transactions linked)
   * @param {number} id - Customer ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async permanentlyDelete(id, user = "system", qr = null) {
    const { removeDb } = require("../utils/dbUtils/dbActions");
    const Customer = require("../entities/Customer");
    const Sale = require("../entities/Sale");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");

    const customerRepo = this._getRepo(qr, Customer);
    const saleRepo = this._getRepo(qr, Sale);
    const loyaltyRepo = this._getRepo(qr, LoyaltyTransaction);

    const customer = await customerRepo.findOne({ where: { id } });
    if (!customer) {
      throw new Error(`Customer with ID ${id} not found`);
    }

    // Check for existing sales
    const salesCount = await saleRepo.count({ where: { customer: { id } } });
    if (salesCount > 0) {
      throw new Error(
        `Cannot delete customer #${id} because they have ${salesCount} sale(s)`
      );
    }

    // Check for existing loyalty transactions
    const loyaltyCount = await loyaltyRepo.count({
      where: { customer: { id } },
    });
    if (loyaltyCount > 0) {
      throw new Error(
        `Cannot delete customer #${id} because they have ${loyaltyCount} loyalty transaction(s)`
      );
    }

    await removeDb(customerRepo, customer);
    await auditLogger.logDelete("Customer", id, customer, user);
    console.log(`Customer #${id} permanently deleted`);
  }

  /**
   * Find customer by ID
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findById(id, qr = null) {
    const Customer = require("../entities/Customer");
    const customerRepo = this._getRepo(qr, Customer);

    try {
      const customer = await customerRepo.findOne({ where: { id } });
      if (!customer) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      await auditLogger.logView("Customer", id, "system");
      return customer;
    } catch (error) {
      console.error("Failed to find customer:", error.message);
      throw error;
    }
  }

  /**
   * Find all customers with optional filters
   * @param {Object} options - Filter options
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findAll(options = {}, qr = null) {
    const Customer = require("../entities/Customer");
    const customerRepo = this._getRepo(qr, Customer);

    try {
      const queryBuilder = customerRepo.createQueryBuilder("customer");

      // Filter by active status
      if (options.isActive !== undefined) {
        queryBuilder.andWhere("customer.isActive = :isActive", {
          isActive: options.isActive,
        });
      }

      // Search by name or contact info
      if (options.search) {
        queryBuilder.andWhere(
          "(customer.name LIKE :search OR customer.contactInfo LIKE :search)",
          { search: `%${options.search}%` }
        );
      }

      // Filter by loyalty points range
      if (options.minPoints !== undefined) {
        queryBuilder.andWhere("customer.loyaltyPointsBalance >= :minPoints", {
          minPoints: options.minPoints,
        });
      }
      if (options.maxPoints !== undefined) {
        queryBuilder.andWhere("customer.loyaltyPointsBalance <= :maxPoints", {
          maxPoints: options.maxPoints,
        });
      }

      const sortBy = options.sortBy || "createdAt";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`customer.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
        queryBuilder.skip(offset).take(options.limit);
      }

      const customers = await queryBuilder.getMany();

      await auditLogger.logView("Customer", null, "system");
      return customers;
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      throw error;
    }
  }

  /**
   * Add loyalty points to a customer
   * @param {number} customerId
   * @param {number} points - Positive integer
   * @param {string} notes - Reason (e.g., "Purchase", "Promotion")
   * @param {number|null} saleId - Optional sale ID
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async addLoyaltyPoints(
    customerId,
    points,
    notes = null,
    saleId = null,
    user = "system",
    qr = null
  ) {
    if (points <= 0) throw new Error("Points must be positive");
    return this._adjustLoyaltyPoints(
      customerId,
      points,
      notes,
      saleId,
      user,
      qr
    );
  }

  /**
   * Redeem loyalty points from a customer
   * @param {number} customerId
   * @param {number} points - Positive integer
   * @param {string} notes - Reason (e.g., "Redemption")
   * @param {number|null} saleId - Optional sale ID
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async redeemLoyaltyPoints(
    customerId,
    points,
    notes = null,
    saleId = null,
    user = "system",
    qr = null
  ) {
    if (points <= 0) throw new Error("Points must be positive");
    return this._adjustLoyaltyPoints(
      customerId,
      -points,
      notes,
      saleId,
      user,
      qr
    );
  }

  /**
   * Internal method to adjust loyalty points
   * @private
   */
  async _adjustLoyaltyPoints(
    customerId,
    pointsChange,
    notes,
    saleId,
    user,
    qr = null
  ) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const Customer = require("../entities/Customer");
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const Sale = require("../entities/Sale");

    const customerRepo = this._getRepo(qr, Customer);
    const loyaltyRepo = this._getRepo(qr, LoyaltyTransaction);

    try {
      const customer = await customerRepo.findOne({ where: { id: customerId } });
      if (!customer) throw new Error(`Customer with ID ${customerId} not found`);

      // Check sufficient balance for redemption
      if (pointsChange < 0 && customer.loyaltyPointsBalance + pointsChange < 0) {
        throw new Error(
          `Insufficient loyalty points. Available: ${customer.loyaltyPointsBalance}, Requested: ${-pointsChange}`
        );
      }

      const oldBalance = customer.loyaltyPointsBalance;
      customer.loyaltyPointsBalance += pointsChange;
      customer.updatedAt = new Date();

      const updatedCustomer = await updateDb(customerRepo, customer);

      // Create loyalty transaction
      const transaction = loyaltyRepo.create({
        pointsChange,
        notes,
        customer: updatedCustomer,
        sale: saleId ? { id: saleId } : null,
        timestamp: new Date(),
      });
      await saveDb(loyaltyRepo, transaction);

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
            entityId: transaction.id,
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
          transaction.id,
          transaction,
          user
        );
      }

      console.log(
        `Loyalty points adjusted for customer #${customerId}: ${pointsChange > 0 ? "+" : ""}${pointsChange} → new balance ${updatedCustomer.loyaltyPointsBalance}`
      );
      return { customer: updatedCustomer, transaction };
    } catch (error) {
      console.error("Failed to adjust loyalty points:", error.message);
      throw error;
    }
  }

  /**
   * Get loyalty transaction history for a customer
   * @param {number} customerId
   * @param {Object} options - Pagination/sorting
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getLoyaltyHistory(customerId, options = {}, qr = null) {
    const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
    const loyaltyRepo = this._getRepo(qr, LoyaltyTransaction);

    try {
      const queryBuilder = loyaltyRepo
        .createQueryBuilder("tx")
        .leftJoinAndSelect("tx.sale", "sale")
        .where("tx.customerId = :customerId", { customerId });

      const sortBy = options.sortBy || "timestamp";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`tx.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
        queryBuilder.skip(offset).take(options.limit);
      }

      const transactions = await queryBuilder.getMany();
      return transactions;
    } catch (error) {
      console.error("Failed to fetch loyalty history:", error);
      throw error;
    }
  }

  /**
   * Get customer statistics
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStatistics(qr = null) {
    const Customer = require("../entities/Customer");
    const Sale = require("../entities/Sale");
    const customerRepo = this._getRepo(qr, Customer);
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const totalCustomers = await customerRepo.count();

      // Active customers (isActive = true)
      const activeCustomers = await customerRepo.count({
        where: { isActive: true },
      });

      const withPoints = await customerRepo
        .createQueryBuilder("customer")
        .where("customer.loyaltyPointsBalance > 0")
        .getCount();

      const avgPointsResult = await customerRepo
        .createQueryBuilder("customer")
        .select("AVG(customer.loyaltyPointsBalance)", "average")
        .getRawOne();
      const averagePoints = parseFloat(avgPointsResult.average) || 0;

      const topCustomers = await customerRepo
        .createQueryBuilder("customer")
        .orderBy("customer.loyaltyPointsBalance", "DESC")
        .limit(5)
        .getMany();

      const customersWithSales = await saleRepo
        .createQueryBuilder("sale")
        .select("sale.customerId")
        .distinct(true)
        .where("sale.customerId IS NOT NULL")
        .getRawMany();
      const activeCustomerCount = customersWithSales.length;

      return {
        totalCustomers,
        activeCustomers,
        inactiveCustomers: totalCustomers - activeCustomers,
        customersWithLoyaltyPoints: withPoints,
        averageLoyaltyPoints: averagePoints,
        topCustomers: topCustomers.map((c) => ({
          id: c.id,
          name: c.name,
          points: c.loyaltyPointsBalance,
        })),
        activeCustomersWithSales: activeCustomerCount,
      };
    } catch (error) {
      console.error("Failed to get customer statistics:", error);
      throw error;
    }
  }

  /**
   * Export customers to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportCustomers(format = "json", filters = {}, user = "system", qr = null) {
    try {
      const customers = await this.findAll(filters, qr);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Name",
          "Contact Info",
          "Loyalty Points",
          "Active",
          "Created At",
          "Updated At",
        ];
        const rows = customers.map((c) => [
          c.id,
          c.name,
          c.contactInfo || "",
          c.loyaltyPointsBalance,
          c.isActive ? "Yes" : "No",
          new Date(c.createdAt).toLocaleDateString(),
          c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "",
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `customers_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: customers,
          filename: `customers_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      await auditLogger.logExport("Customer", format, filters, user);
      console.log(`Exported ${customers.length} customers in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export customers:", error);
      throw error;
    }
  }

  /**
   * Bulk create multiple customers
   * @param {Array<Object>} customersArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(customersArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const custData of customersArray) {
      try {
        const saved = await this.create(custData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ customer: custData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Bulk update multiple customers
   * @param {Array<{ id: number, updates: Object }>} updatesArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkUpdate(updatesArray, user = "system", qr = null) {
    const results = { updated: [], errors: [] };
    for (const { id, updates } of updatesArray) {
      try {
        const saved = await this.update(id, updates, user, qr);
        results.updated.push(saved);
      } catch (err) {
        results.errors.push({ id, updates, error: err.message });
      }
    }
    return results;
  }

  /**
   * Import customers from a CSV file
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
        const customerData = {
          name: record.name,
          contactInfo: record.contactInfo || null,
          loyaltyPointsBalance: parseInt(record.loyaltyPointsBalance, 10) || 0,
          isActive: record.isActive !== "false",
        };
        const validation = validateCustomerData(customerData);
        if (!validation.valid) throw new Error(validation.errors.join(", "));
        const saved = await this.create(customerData, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }
}

// Singleton instance
const customerService = new CustomerService();
module.exports = customerService;