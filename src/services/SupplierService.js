// services/SupplierService.js
// @ts-check

const auditLogger = require("../utils/auditLogger");
// @ts-ignore

const { validateSupplierData } = require("../utils/supplierUtils");

class SupplierService {
  constructor() {
    this.supplierRepository = null;
    this.productRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    const Supplier = require("../entities/Supplier");
    const Product = require("../entities/Product");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.supplierRepository = AppDataSource.getRepository(Supplier);
    this.productRepository = AppDataSource.getRepository(Product);
    console.log("SupplierService initialized");
  }

  async getRepositories() {
    if (!this.supplierRepository) {
      await this.initialize();
    }
    return {
      supplier: this.supplierRepository,
      product: this.productRepository,
    };
  }

  /**
   * Create a new supplier
   * @param {Object} supplierData - Supplier data
   * @param {string} user - User performing the action
   */
  async create(supplierData, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { supplier: supplierRepo } = await this.getRepositories();

    try {
      // Validate supplier data
      const validation = validateSupplierData(supplierData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        // @ts-ignore
        name,
        // @ts-ignore
        contactInfo = null,
        // @ts-ignore
        email = null,
        // @ts-ignore
        phone = null,
        // @ts-ignore
        address = null,
        // @ts-ignore
        isActive = true,
      } = supplierData;

      console.log(`Creating supplier: Name ${name}`);

      // Check name uniqueness (business rule)
      // @ts-ignore
      const existing = await supplierRepo.findOne({ where: { name } });
      if (existing) {
        throw new Error(`Supplier with name "${name}" already exists`);
      }

      // Create supplier entity
      // @ts-ignore
      const supplier = supplierRepo.create({
        name,
        contactInfo,
        email,
        phone,
        address,
        isActive,
        createdAt: new Date(),
      });

      // @ts-ignore
      const savedSupplier = await saveDb(supplierRepo, supplier);

      await auditLogger.logCreate(
        "Supplier",
        savedSupplier.id,
        savedSupplier,
        user,
      );

      console.log(
        `Supplier created: #${savedSupplier.id} - ${savedSupplier.name}`,
      );
      return savedSupplier;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create supplier:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing supplier
   * @param {number} id - Supplier ID
   * @param {Object} supplierData - Updated fields
   * @param {string} user - User performing the action
   */
  async update(id, supplierData, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { supplier: supplierRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const existingSupplier = await supplierRepo.findOne({ where: { id } });
      if (!existingSupplier) {
        throw new Error(`Supplier with ID ${id} not found`);
      }

      const oldData = { ...existingSupplier };

      // If name is being changed, check uniqueness
      // @ts-ignore
      if (supplierData.name && supplierData.name !== existingSupplier.name) {
        // @ts-ignore
        const nameExists = await supplierRepo.findOne({
          // @ts-ignore
          where: { name: supplierData.name },
        });
        if (nameExists) {
          throw new Error(
            // @ts-ignore
            `Supplier with name "${supplierData.name}" already exists`,
          );
        }
      }

      // Update fields
      Object.assign(existingSupplier, supplierData);
      existingSupplier.updatedAt = new Date();

      // @ts-ignore
      const savedSupplier = await updateDb(supplierRepo, existingSupplier);

      await auditLogger.logUpdate("Supplier", id, oldData, savedSupplier, user);

      console.log(`Supplier updated: #${id}`);
      return savedSupplier;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to update supplier:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a supplier (set isActive = false)
   * @param {number} id - Supplier ID
   * @param {string} user - User performing the action
   */
  async delete(id, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { supplier: supplierRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const supplier = await supplierRepo.findOne({ where: { id } });
      if (!supplier) {
        throw new Error(`Supplier with ID ${id} not found`);
      }

      if (!supplier.isActive) {
        throw new Error(`Supplier #${id} is already inactive`);
      }

      const oldData = { ...supplier };
      supplier.isActive = false;
      supplier.updatedAt = new Date();

      // @ts-ignore
      const savedSupplier = await updateDb(supplierRepo, supplier);

      await auditLogger.logDelete("Supplier", id, oldData, user);

      console.log(`Supplier deactivated: #${id}`);
      return savedSupplier;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to delete supplier:", error.message);
      throw error;
    }
  }

  /**
   * Find supplier by ID
   * @param {number} id
   */
  async findById(id) {
    const { supplier: supplierRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const supplier = await supplierRepo.findOne({ where: { id } });
      if (!supplier) {
        throw new Error(`Supplier with ID ${id} not found`);
      }
      // @ts-ignore
      await auditLogger.logView("Supplier", id, "system");
      return supplier;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find supplier:", error.message);
      throw error;
    }
  }

  /**
   * Find all suppliers with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { supplier: supplierRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = supplierRepo.createQueryBuilder("supplier");

      // Filter by active status
      // @ts-ignore
      if (options.isActive !== undefined) {
        queryBuilder.andWhere("supplier.isActive = :isActive", {
          // @ts-ignore
          isActive: options.isActive,
        });
      }

      // Search by name, contactInfo, or address
      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere(
          "(supplier.name LIKE :search OR supplier.contactInfo LIKE :search OR supplier.address LIKE :search)",
          // @ts-ignore
          { search: `%${options.search}%` },
        );
      }

      // Sorting
      // @ts-ignore
      const sortBy = options.sortBy || "createdAt";
      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`supplier.${sortBy}`, sortOrder);

      // Pagination
      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;
        // @ts-ignore
        queryBuilder.skip(offset).take(options.limit);
      }

      const suppliers = await queryBuilder.getMany();

      await auditLogger.logView("Supplier", null, "system");
      return suppliers;
    } catch (error) {
      console.error("Failed to fetch suppliers:", error);
      throw error;
    }
  }

  /**
   * Get supplier statistics
   */
  async getStatistics() {
    const { supplier: supplierRepo, product: productRepo } = await this.getRepositories();

    try {
      // Total active suppliers
      // @ts-ignore
      const totalActive = await supplierRepo.count({
        where: { isActive: true },
      });

      // Total inactive suppliers
      // @ts-ignore
      const totalInactive = await supplierRepo.count({
        where: { isActive: false },
      });

      // Suppliers with product counts
      // @ts-ignore
      const suppliersWithProductCount = await supplierRepo
        .createQueryBuilder("supplier")
        .leftJoin("supplier.products", "product")
        .select("supplier.id", "id")
        .addSelect("supplier.name", "name")
        .addSelect("COUNT(product.id)", "productCount")
        .where("supplier.isActive = :isActive", { isActive: true })
        .groupBy("supplier.id")
        .orderBy("productCount", "DESC")
        .getRawMany();

      // Total products from active suppliers (optional)
      // @ts-ignore
      const totalProducts = await productRepo
        .createQueryBuilder("product")
        .leftJoin("product.supplier", "supplier")
        .where("supplier.isActive = :isActive", { isActive: true })
        .getCount();

      return {
        totalActive,
        totalInactive,
        totalProducts,
        suppliersWithProductCount,
      };
    } catch (error) {
      console.error("Failed to get supplier statistics:", error);
      throw error;
    }
  }

  /**
   * Export suppliers to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters
   * @param {string} user
   */
  async exportSuppliers(format = "json", filters = {}, user = "system") {
    try {
      const suppliers = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Name",
          "Contact Info",
          "Address",
          "Active",
          "Created At",
        ];
        const rows = suppliers.map((s) => [
          s.id,
          s.name,
          s.contactInfo || "",
          s.address || "",
          s.isActive ? "Yes" : "No",
          // @ts-ignore
          new Date(s.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `suppliers_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: suppliers,
          filename: `suppliers_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      // @ts-ignore
      await auditLogger.logExport("Supplier", format, filters, user);
      console.log(`Exported ${suppliers.length} suppliers in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export suppliers:", error);
      throw error;
    }
  }
}

// Singleton instance
const supplierService = new SupplierService();
module.exports = supplierService;