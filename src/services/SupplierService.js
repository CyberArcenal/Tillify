// services/SupplierService.js
const auditLogger = require("../utils/auditLogger");
const { validateSupplierData } = require("../utils/supplierUtils");

class SupplierService {
  constructor() {
    this.supplierRepository = null;
    this.productRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/dataSource");
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
   * Create a new supplier
   * @param {Object} supplierData - Supplier data
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async create(supplierData, user = "system", qr = null) {
    const { saveDb } = require("../utils/dbUtils/dbActions");
    const Supplier = require("../entities/Supplier");
    const supplierRepo = this._getRepo(qr, Supplier);

    try {
      const validation = validateSupplierData(supplierData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        name,
        contactInfo = null,
        email = null,
        phone = null,
        address = null,
        isActive = true,
      } = supplierData;

      console.log(`Creating supplier: Name ${name}`);

      const existing = await supplierRepo.findOne({ where: { name } });
      if (existing) {
        throw new Error(`Supplier with name "${name}" already exists`);
      }

      const supplier = supplierRepo.create({
        name,
        contactInfo,
        email,
        phone,
        address,
        isActive,
        createdAt: new Date(),
      });

      const savedSupplier = await saveDb(supplierRepo, supplier);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "CREATE",
          entity: "Supplier",
          entityId: savedSupplier.id,
          user,
          description: `Created supplier ${savedSupplier.name}`,
        });
      } else {
        await auditLogger.logCreate(
          "Supplier",
          savedSupplier.id,
          savedSupplier,
          user
        );
      }

      console.log(
        `Supplier created: #${savedSupplier.id} - ${savedSupplier.name}`
      );
      return savedSupplier;
    } catch (error) {
      console.error("Failed to create supplier:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing supplier
   * @param {number} id - Supplier ID
   * @param {Object} supplierData - Updated fields
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async update(id, supplierData, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Supplier = require("../entities/Supplier");
    const supplierRepo = this._getRepo(qr, Supplier);

    try {
      const existingSupplier = await supplierRepo.findOne({ where: { id } });
      if (!existingSupplier) {
        throw new Error(`Supplier with ID ${id} not found`);
      }

      const oldData = { ...existingSupplier };

      if (supplierData.name && supplierData.name !== existingSupplier.name) {
        const nameExists = await supplierRepo.findOne({
          where: { name: supplierData.name },
        });
        if (nameExists) {
          throw new Error(
            `Supplier with name "${supplierData.name}" already exists`
          );
        }
      }

      Object.assign(existingSupplier, supplierData);
      existingSupplier.updatedAt = new Date();

      const savedSupplier = await updateDb(supplierRepo, existingSupplier);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "UPDATE",
          entity: "Supplier",
          entityId: id,
          user,
          description: `Updated supplier #${id}`,
        });
      } else {
        await auditLogger.logUpdate(
          "Supplier",
          id,
          oldData,
          savedSupplier,
          user
        );
      }

      console.log(`Supplier updated: #${id}`);
      return savedSupplier;
    } catch (error) {
      console.error("Failed to update supplier:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a supplier (set isActive = false)
   * @param {number} id - Supplier ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async delete(id, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Supplier = require("../entities/Supplier");
    const supplierRepo = this._getRepo(qr, Supplier);

    try {
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

      const savedSupplier = await updateDb(supplierRepo, supplier);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "DELETE",
          entity: "Supplier",
          entityId: id,
          user,
          description: `Deactivated supplier #${id}`,
        });
      } else {
        await auditLogger.logDelete("Supplier", id, oldData, user);
      }

      console.log(`Supplier deactivated: #${id}`);
      return savedSupplier;
    } catch (error) {
      console.error("Failed to delete supplier:", error.message);
      throw error;
    }
  }

  /**
   * Hard delete a supplier – removes from DB (only if no products linked)
   * @param {number} id - Supplier ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async permanentlyDelete(id, user = "system", qr = null) {
    const { removeDb } = require("../utils/dbUtils/dbActions");
    const Supplier = require("../entities/Supplier");
    const Product = require("../entities/Product");

    const supplierRepo = this._getRepo(qr, Supplier);
    const productRepo = this._getRepo(qr, Product);

    const supplier = await supplierRepo.findOne({ where: { id } });
    if (!supplier) {
      throw new Error(`Supplier with ID ${id} not found`);
    }

    // Check if any products reference this supplier
    const productCount = await productRepo.count({
      where: { supplier: { id } },
    });
    if (productCount > 0) {
      throw new Error(
        `Cannot delete supplier #${id} because it is used by ${productCount} product(s)`
      );
    }

    await removeDb(supplierRepo, supplier);

    if (qr) {
      const auditRepo = qr.manager.getRepository("AuditLog");
      await auditRepo.save({
        action: "DELETE",
        entity: "Supplier",
        entityId: id,
        user,
        description: `Permanently deleted supplier #${id}`,
      });
    } else {
      await auditLogger.logDelete("Supplier", id, supplier, user);
    }

    console.log(`Supplier #${id} permanently deleted`);
  }

  /**
   * Find supplier by ID
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findById(id, qr = null) {
    const Supplier = require("../entities/Supplier");
    const supplierRepo = this._getRepo(qr, Supplier);

    try {
      const supplier = await supplierRepo.findOne({ where: { id } });
      if (!supplier) {
        throw new Error(`Supplier with ID ${id} not found`);
      }
      await auditLogger.logView("Supplier", id, "system");
      return supplier;
    } catch (error) {
      console.error("Failed to find supplier:", error.message);
      throw error;
    }
  }

  /**
   * Find all suppliers with optional filters
   * @param {Object} options - Filter options
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findAll(options = {}, qr = null) {
    const Supplier = require("../entities/Supplier");
    const supplierRepo = this._getRepo(qr, Supplier);

    try {
      const queryBuilder = supplierRepo.createQueryBuilder("supplier");

      if (options.isActive !== undefined) {
        queryBuilder.andWhere("supplier.isActive = :isActive", {
          isActive: options.isActive,
        });
      }

      if (options.search) {
        queryBuilder.andWhere(
          "(supplier.name LIKE :search OR supplier.contactInfo LIKE :search OR supplier.address LIKE :search)",
          { search: `%${options.search}%` }
        );
      }

      const sortBy = options.sortBy || "createdAt";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`supplier.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStatistics(qr = null) {
    const Supplier = require("../entities/Supplier");
    const Product = require("../entities/Product");
    const supplierRepo = this._getRepo(qr, Supplier);
    const productRepo = this._getRepo(qr, Product);

    try {
      const totalActive = await supplierRepo.count({
        where: { isActive: true },
      });
      const totalInactive = await supplierRepo.count({
        where: { isActive: false },
      });

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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportSuppliers(
    format = "json",
    filters = {},
    user = "system",
    qr = null
  ) {
    try {
      const suppliers = await this.findAll(filters, qr);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Name",
          "Contact Info",
          "Email",
          "Phone",
          "Address",
          "Active",
          "Created At",
        ];
        const rows = suppliers.map((s) => [
          s.id,
          s.name,
          s.contactInfo || "",
          s.email || "",
          s.phone || "",
          s.address || "",
          s.isActive ? "Yes" : "No",
          new Date(s.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `suppliers_export_${
            new Date().toISOString().split("T")[0]
          }.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: suppliers,
          filename: `suppliers_export_${
            new Date().toISOString().split("T")[0]
          }.json`,
        };
      }

      await auditLogger.logExport("Supplier", format, filters, user);
      console.log(`Exported ${suppliers.length} suppliers in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export suppliers:", error);
      throw error;
    }
  }

  /**
   * Bulk create multiple suppliers
   * @param {Array<Object>} suppliersArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(suppliersArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const supData of suppliersArray) {
      try {
        const saved = await this.create(supData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ supplier: supData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Bulk update multiple suppliers
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
   * Import suppliers from a CSV file
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
        const supplierData = {
          name: record.name,
          contactInfo: record.contactInfo || null,
          email: record.email || null,
          phone: record.phone || null,
          address: record.address || null,
          isActive: record.isActive !== "false",
        };
        const validation = validateSupplierData(supplierData);
        if (!validation.valid) throw new Error(validation.errors.join(", "));
        const saved = await this.create(supplierData, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }
}

// Singleton instance
const supplierService = new SupplierService();
module.exports = supplierService;
