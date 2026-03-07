// services/CustomerService.js
//@ts-check

const auditLogger = require("../utils/auditLogger");
const { validateCustomerData } = require("../utils/customerUtils");

class CustomerService {
  constructor() {
    this.customerRepository = null;
    this.loyaltyTransactionRepository = null;
    this.saleRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
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
   * Create a new customer
   * @param {Object} customerData - Customer data
   * @param {string} user - User performing the action
   */
  async create(customerData, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { customer: customerRepo } = await this.getRepositories();

    try {
      // Validate customer data
      const validation = validateCustomerData(customerData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        // @ts-ignore
        name,

        // @ts-ignore
        contactInfo = null,

        // @ts-ignore
        loyaltyPointsBalance = 0,
      } = customerData;

      console.log(`Creating customer: ${name}`);

      // Create customer entity

      // @ts-ignore
      const customer = customerRepo.create({
        name,
        contactInfo,
        loyaltyPointsBalance,
        createdAt: new Date(),
      });

      // @ts-ignore
      const savedCustomer = await saveDb(customerRepo, customer);

      await auditLogger.logCreate(
        "Customer",
        savedCustomer.id,
        savedCustomer,
        user,
      );

      console.log(
        `Customer created: #${savedCustomer.id} - ${savedCustomer.name}`,
      );
      return savedCustomer;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create customer:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing customer
   * @param {number} id - Customer ID
   * @param {Object} customerData - Updated fields
   * @param {string} user - User performing the action
   */
  async update(id, customerData, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { customer: customerRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const existingCustomer = await customerRepo.findOne({ where: { id } });
      if (!existingCustomer) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      const oldData = { ...existingCustomer };

      // Update fields
      Object.assign(existingCustomer, customerData);
      existingCustomer.updatedAt = new Date();

      // @ts-ignore
      const savedCustomer = await updateDb(customerRepo, existingCustomer);

      await auditLogger.logUpdate("Customer", id, oldData, savedCustomer, user);

      console.log(`Customer updated: #${id}`);
      return savedCustomer;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to update customer:", error.message);
      throw error;
    }
  }

  /**
   * Note: Hard delete is not provided to maintain referential integrity.
   * Customers are retained for historical sales and loyalty records.
   * If deactivation is needed, consider adding an `isActive` field in a future migration.
   */

  /**
   * Find customer by ID
   * @param {number} id
   */
  async findById(id) {
    const { customer: customerRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const customer = await customerRepo.findOne({ where: { id } });
      if (!customer) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      // @ts-ignore
      await auditLogger.logView("Customer", id, "system");
      return customer;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find customer:", error.message);
      throw error;
    }
  }

  /**
   * Find all customers with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { customer: customerRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = customerRepo.createQueryBuilder("customer");

      // Search by name or contact info

      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere(
          "(customer.name LIKE :search OR customer.contactInfo LIKE :search)",

          // @ts-ignore
          { search: `%${options.search}%` },
        );
      }

      // Filter by loyalty points range

      // @ts-ignore
      if (options.minPoints !== undefined) {
        queryBuilder.andWhere("customer.loyaltyPointsBalance >= :minPoints", {
          // @ts-ignore
          minPoints: options.minPoints,
        });
      }

      // @ts-ignore
      if (options.maxPoints !== undefined) {
        queryBuilder.andWhere("customer.loyaltyPointsBalance <= :maxPoints", {
          // @ts-ignore
          maxPoints: options.maxPoints,
        });
      }

      // Sorting

      // @ts-ignore
      const sortBy = options.sortBy || "createdAt";

      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`customer.${sortBy}`, sortOrder);

      // Pagination

      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;

        // @ts-ignore
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
   */
  async addLoyaltyPoints(
    customerId,
    points,

    // @ts-ignore
    notes = null,
    saleId = null,
    user = "system",
  ) {
    if (points <= 0) throw new Error("Points must be positive");
    return this._adjustLoyaltyPoints(customerId, points, notes, saleId, user);
  }

  /**
   * Redeem loyalty points from a customer
   * @param {number} customerId
   * @param {number} points - Positive integer
   * @param {string} notes - Reason (e.g., "Redemption")
   * @param {number|null} saleId - Optional sale ID
   * @param {string} user
   */
  async redeemLoyaltyPoints(
    customerId,
    points,

    // @ts-ignore
    notes = null,
    saleId = null,
    user = "system",
  ) {
    if (points <= 0) throw new Error("Points must be positive");
    return this._adjustLoyaltyPoints(customerId, -points, notes, saleId, user);
  }

  /**
   * Internal method to adjust loyalty points
   * @private
   */

  // @ts-ignore
  async _adjustLoyaltyPoints(customerId, pointsChange, notes, saleId, user) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { customer: customerRepo, loyaltyTransaction: loyaltyRepo } =
      await this.getRepositories();

    try {
      // @ts-ignore
      const customer = await customerRepo.findOne({
        where: { id: customerId },
      });
      if (!customer)
        throw new Error(`Customer with ID ${customerId} not found`);

      // Check sufficient balance for redemption
      if (
        pointsChange < 0 &&
        customer.loyaltyPointsBalance + pointsChange < 0
      ) {
        throw new Error(
          `Insufficient loyalty points. Available: ${customer.loyaltyPointsBalance}, Requested: ${-pointsChange}`,
        );
      }

      const oldBalance = customer.loyaltyPointsBalance;
      customer.loyaltyPointsBalance += pointsChange;
      customer.updatedAt = new Date();

      // @ts-ignore
      const updatedCustomer = await updateDb(customerRepo, customer);

      // Create loyalty transaction

      // @ts-ignore
      const transaction = loyaltyRepo.create({
        pointsChange,
        notes,
        customer: updatedCustomer,
        sale: saleId ? { id: saleId } : null,
        timestamp: new Date(),
      });

      // @ts-ignore
      await saveDb(loyaltyRepo, transaction);

      await auditLogger.logUpdate(
        "Customer",
        customerId,
        { loyaltyPointsBalance: oldBalance },
        { loyaltyPointsBalance: updatedCustomer.loyaltyPointsBalance },
        user,
      );
      await auditLogger.logCreate(
        "LoyaltyTransaction",
        transaction.id,
        transaction,
        user,
      );

      console.log(
        `Loyalty points adjusted for customer #${customerId}: ${pointsChange > 0 ? "+" : ""}${pointsChange} → new balance ${updatedCustomer.loyaltyPointsBalance}`,
      );
      return { customer: updatedCustomer, transaction };
    } catch (error) {
      // @ts-ignore
      console.error("Failed to adjust loyalty points:", error.message);
      throw error;
    }
  }

  /**
   * Get loyalty transaction history for a customer
   * @param {number} customerId
   * @param {Object} options - Pagination/sorting
   */
  async getLoyaltyHistory(customerId, options = {}) {
    const { loyaltyTransaction: loyaltyRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = loyaltyRepo
        .createQueryBuilder("tx")
        .leftJoinAndSelect("tx.sale", "sale")
        .where("tx.customerId = :customerId", { customerId });

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
      return transactions;
    } catch (error) {
      console.error("Failed to fetch loyalty history:", error);
      throw error;
    }
  }

  /**
   * Get customer statistics
   */
  async getStatistics() {
    const { customer: customerRepo, sale: saleRepo } =
      await this.getRepositories();

    try {
      // Total customers

      // @ts-ignore
      const totalCustomers = await customerRepo.count();

      // Customers with loyalty points

      // @ts-ignore
      const withPoints = await customerRepo
        .createQueryBuilder("customer")
        .where("customer.loyaltyPointsBalance > 0")
        .getCount();

      // Average loyalty points

      // @ts-ignore
      const avgPointsResult = await customerRepo
        .createQueryBuilder("customer")
        .select("AVG(customer.loyaltyPointsBalance)", "average")
        .getRawOne();
      const averagePoints = parseFloat(avgPointsResult.average) || 0;

      // Top 5 customers by points

      // @ts-ignore
      const topCustomers = await customerRepo
        .createQueryBuilder("customer")
        .orderBy("customer.loyaltyPointsBalance", "DESC")
        .limit(5)
        .getMany();

      // Customers with sales (distinct)

      // @ts-ignore
      const customersWithSales = await saleRepo
        .createQueryBuilder("sale")
        .select("sale.customerId")
        .distinct(true)
        .where("sale.customerId IS NOT NULL")
        .getRawMany();
      const activeCustomerCount = customersWithSales.length;

      return {
        totalCustomers,
        customersWithLoyaltyPoints: withPoints,
        averageLoyaltyPoints: averagePoints,
        topCustomers: topCustomers.map((c) => ({
          id: c.id,
          name: c.name,
          points: c.loyaltyPointsBalance,
        })),
        activeCustomers: activeCustomerCount,
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
   */
  async exportCustomers(format = "json", filters = {}, user = "system") {
    try {
      const customers = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Name",
          "Contact Info",
          "Loyalty Points",
          "Created At",
          "Updated At",
        ];
        const rows = customers.map((c) => [
          c.id,
          c.name,
          c.contactInfo || "",
          c.loyaltyPointsBalance,

          // @ts-ignore
          new Date(c.createdAt).toLocaleDateString(),

          // @ts-ignore
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

      // @ts-ignore
      await auditLogger.logExport("Customer", format, filters, user);
      console.log(`Exported ${customers.length} customers in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export customers:", error);
      throw error;
    }
  }
}

// Singleton instance
const customerService = new CustomerService();
module.exports = customerService;
