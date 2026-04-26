// services/CategoryService.js
const auditLogger = require("../utils/auditLogger");
const { validateCategoryData } = require("../utils/categoryUtils");

class CategoryService {
  constructor() {
    this.categoryRepository = null;
    this.productRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/dataSource");
    const Category = require("../entities/Category");
    const Product = require("../entities/Product");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.categoryRepository = AppDataSource.getRepository(Category);
    this.productRepository = AppDataSource.getRepository(Product);
    console.log("CategoryService initialized");
  }

  async getRepositories() {
    if (!this.categoryRepository) {
      await this.initialize();
    }
    return {
      category: this.categoryRepository,
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
   * Create a new category
   * @param {Object} categoryData - Category data
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async create(categoryData, user = "system", qr = null) {
    const { saveDb } = require("../utils/dbUtils/dbActions");
    const Category = require("../entities/Category");

    const categoryRepo = this._getRepo(qr, Category);

    try {
      const validation = validateCategoryData(categoryData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        name,
        description = null,
        isActive = true,
      } = categoryData;

      console.log(`Creating category: Name ${name}`);

      // Check name uniqueness
      const existing = await categoryRepo.findOne({ where: { name } });
      if (existing) {
        throw new Error(`Category with name "${name}" already exists`);
      }

      const category = categoryRepo.create({
        name,
        description,
        isActive,
        createdAt: new Date(),
      });

      const savedCategory = await saveDb(categoryRepo, category);

      await auditLogger.logCreate(
        "Category",
        savedCategory.id,
        savedCategory,
        user
      );

      console.log(
        `Category created: #${savedCategory.id} - ${savedCategory.name}`
      );
      return savedCategory;
    } catch (error) {
      console.error("Failed to create category:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing category
   * @param {number} id - Category ID
   * @param {Object} categoryData - Updated fields
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async update(id, categoryData, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Category = require("../entities/Category");

    const categoryRepo = this._getRepo(qr, Category);

    try {
      const existingCategory = await categoryRepo.findOne({ where: { id } });
      if (!existingCategory) {
        throw new Error(`Category with ID ${id} not found`);
      }

      const oldData = { ...existingCategory };

      if (categoryData.name && categoryData.name !== existingCategory.name) {
        const nameExists = await categoryRepo.findOne({
          where: { name: categoryData.name },
        });
        if (nameExists) {
          throw new Error(
            `Category with name "${categoryData.name}" already exists`
          );
        }
      }

      Object.assign(existingCategory, categoryData);
      existingCategory.updatedAt = new Date();

      const savedCategory = await updateDb(categoryRepo, existingCategory);

      await auditLogger.logUpdate("Category", id, oldData, savedCategory, user);

      console.log(`Category updated: #${id}`);
      return savedCategory;
    } catch (error) {
      console.error("Failed to update category:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a category (set isActive = false)
   * @param {number} id - Category ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async delete(id, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Category = require("../entities/Category");

    const categoryRepo = this._getRepo(qr, Category);

    try {
      const category = await categoryRepo.findOne({ where: { id } });
      if (!category) {
        throw new Error(`Category with ID ${id} not found`);
      }

      if (!category.isActive) {
        throw new Error(`Category #${id} is already inactive`);
      }

      const oldData = { ...category };
      category.isActive = false;
      category.updatedAt = new Date();

      const savedCategory = await updateDb(categoryRepo, category);

      await auditLogger.logDelete("Category", id, oldData, user);

      console.log(`Category deactivated: #${id}`);
      return savedCategory;
    } catch (error) {
      console.error("Failed to delete category:", error.message);
      throw error;
    }
  }

  /**
   * Hard delete a category – removes from DB (only if no products linked)
   * @param {number} id - Category ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async permanentlyDelete(id, user = "system", qr = null) {
    const { removeDb } = require("../utils/dbUtils/dbActions");
    const Category = require("../entities/Category");
    const Product = require("../entities/Product");

    const categoryRepo = this._getRepo(qr, Category);
    const productRepo = this._getRepo(qr, Product);

    const category = await categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new Error(`Category with ID ${id} not found`);
    }

    // Check if any products reference this category
    const productCount = await productRepo.count({
      where: { category: { id } },
    });
    if (productCount > 0) {
      throw new Error(
        `Cannot delete category #${id} because it is used by ${productCount} product(s)`
      );
    }

    await removeDb(categoryRepo, category);
    await auditLogger.logDelete("Category", id, category, user);
    console.log(`Category #${id} permanently deleted`);
  }

  /**
   * Find category by ID
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findById(id, qr = null) {
    const Category = require("../entities/Category");
    const categoryRepo = this._getRepo(qr, Category);

    try {
      const category = await categoryRepo.findOne({ where: { id } });
      if (!category) {
        throw new Error(`Category with ID ${id} not found`);
      }

      await auditLogger.logView("Category", id, "system");
      return category;
    } catch (error) {
      console.error("Failed to find category:", error.message);
      throw error;
    }
  }

  /**
   * Find all categories with optional filters
   * @param {Object} options - Filter options
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findAll(options = {}, qr = null) {
    const Category = require("../entities/Category");
    const categoryRepo = this._getRepo(qr, Category);

    try {
      const queryBuilder = categoryRepo.createQueryBuilder("category");

      if (options.isActive !== undefined) {
        queryBuilder.andWhere("category.isActive = :isActive", {
          isActive: options.isActive,
        });
      }

      if (options.search) {
        queryBuilder.andWhere("category.name LIKE :search", {
          search: `%${options.search}%`,
        });
      }

      const sortBy = options.sortBy || "createdAt";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`category.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
        queryBuilder.skip(offset).take(options.limit);
      }

      const categories = await queryBuilder.getMany();

      await auditLogger.logView("Category", null, "system");
      return categories;
    } catch (error) {
      console.error("Failed to fetch categories:", error);
      throw error;
    }
  }

  /**
   * Get category statistics
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async getStatistics(qr = null) {
    const Category = require("../entities/Category");
    const Product = require("../entities/Product");
    const categoryRepo = this._getRepo(qr, Category);
    const productRepo = this._getRepo(qr, Product);

    try {
      const totalActive = await categoryRepo.count({
        where: { isActive: true },
      });

      const totalInactive = await categoryRepo.count({
        where: { isActive: false },
      });

      const categoriesWithProductCount = await categoryRepo
        .createQueryBuilder("category")
        .leftJoin("category.products", "product")
        .select("category.id", "id")
        .addSelect("category.name", "name")
        .addSelect("COUNT(product.id)", "productCount")
        .where("category.isActive = :isActive", { isActive: true })
        .groupBy("category.id")
        .orderBy("productCount", "DESC")
        .getRawMany();

      return {
        totalActive,
        totalInactive,
        categoriesWithProductCount,
      };
    } catch (error) {
      console.error("Failed to get category statistics:", error);
      throw error;
    }
  }

  /**
   * Export categories to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async exportCategories(format = "json", filters = {}, user = "system", qr = null) {
    try {
      const categories = await this.findAll(filters, qr);

      let exportData;
      if (format === "csv") {
        const headers = ["ID", "Name", "Description", "Active", "Created At"];
        const rows = categories.map((c) => [
          c.id,
          c.name,
          c.description || "",
          c.isActive ? "Yes" : "No",
          new Date(c.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `categories_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: categories,
          filename: `categories_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      await auditLogger.logExport("Category", format, filters, user);
      console.log(
        `Exported ${categories.length} categories in ${format} format`
      );
      return exportData;
    } catch (error) {
      console.error("Failed to export categories:", error);
      throw error;
    }
  }

  /**
   * Bulk create multiple categories
   * @param {Array<Object>} categoriesArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(categoriesArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const catData of categoriesArray) {
      try {
        const saved = await this.create(catData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ category: catData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Bulk update multiple categories
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
   * Import categories from a CSV file
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
        const categoryData = {
          name: record.name,
          description: record.description || null,
          isActive: record.isActive !== "false",
        };
        const validation = validateCategoryData(categoryData);
        if (!validation.valid) throw new Error(validation.errors.join(", "));
        const saved = await this.create(categoryData, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
  }
}

// Singleton instance
const categoryService = new CategoryService();
module.exports = categoryService;