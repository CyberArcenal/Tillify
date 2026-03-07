// services/CategoryService.js
// @ts-check

const auditLogger = require("../utils/auditLogger");
const { validateCategoryData } = require("../utils/categoryUtils");

class CategoryService {
  constructor() {
    this.categoryRepository = null;
    this.productRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
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
   * Create a new category
   * @param {Object} categoryData - Category data
   * @param {string} user - User performing the action
   */
  async create(categoryData, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { category: categoryRepo } = await this.getRepositories();

    try {
      // Validate category data
      const validation = validateCategoryData(categoryData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        // @ts-ignore
        name,

        // @ts-ignore
        description = null,

        // @ts-ignore
        isActive = true,
      } = categoryData;

      console.log(`Creating category: Name ${name}`);

      // Check name uniqueness

      // @ts-ignore
      const existing = await categoryRepo.findOne({ where: { name } });
      if (existing) {
        throw new Error(`Category with name "${name}" already exists`);
      }

      // Create category entity

      // @ts-ignore
      const category = categoryRepo.create({
        name,
        description,
        isActive,
        createdAt: new Date(),
      });

      // @ts-ignore
      const savedCategory = await saveDb(categoryRepo, category);

      await auditLogger.logCreate(
        "Category",
        savedCategory.id,
        savedCategory,
        user,
      );

      console.log(
        `Category created: #${savedCategory.id} - ${savedCategory.name}`,
      );
      return savedCategory;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create category:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing category
   * @param {number} id - Category ID
   * @param {Object} categoryData - Updated fields
   * @param {string} user - User performing the action
   */
  async update(id, categoryData, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { category: categoryRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const existingCategory = await categoryRepo.findOne({ where: { id } });
      if (!existingCategory) {
        throw new Error(`Category with ID ${id} not found`);
      }

      const oldData = { ...existingCategory };

      // If name is being changed, check uniqueness

      // @ts-ignore
      if (categoryData.name && categoryData.name !== existingCategory.name) {
        // @ts-ignore
        const nameExists = await categoryRepo.findOne({
          // @ts-ignore
          where: { name: categoryData.name },
        });
        if (nameExists) {
          throw new Error(
            // @ts-ignore
            `Category with name "${categoryData.name}" already exists`,
          );
        }
      }

      // Update fields
      Object.assign(existingCategory, categoryData);
      existingCategory.updatedAt = new Date();

      // @ts-ignore
      const savedCategory = await updateDb(categoryRepo, existingCategory);

      await auditLogger.logUpdate("Category", id, oldData, savedCategory, user);

      console.log(`Category updated: #${id}`);
      return savedCategory;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to update category:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a category (set isActive = false)
   * @param {number} id - Category ID
   * @param {string} user - User performing the action
   */
  async delete(id, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const { category: categoryRepo } = await this.getRepositories();

    try {
      // @ts-ignore
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

      // @ts-ignore
      const savedCategory = await updateDb(categoryRepo, category);

      await auditLogger.logDelete("Category", id, oldData, user);

      console.log(`Category deactivated: #${id}`);
      return savedCategory;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to delete category:", error.message);
      throw error;
    }
  }

  /**
   * Find category by ID
   * @param {number} id
   */
  async findById(id) {
    const { category: categoryRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const category = await categoryRepo.findOne({ where: { id } });
      if (!category) {
        throw new Error(`Category with ID ${id} not found`);
      }

      // @ts-ignore
      await auditLogger.logView("Category", id, "system");
      return category;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find category:", error.message);
      throw error;
    }
  }

  /**
   * Find all categories with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { category: categoryRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = categoryRepo.createQueryBuilder("category");

      // Filter by active status

      // @ts-ignore
      if (options.isActive !== undefined) {
        queryBuilder.andWhere("category.isActive = :isActive", {
          // @ts-ignore
          isActive: options.isActive,
        });
      }

      // Search by name

      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere("category.name LIKE :search", {
          // @ts-ignore
          search: `%${options.search}%`,
        });
      }

      // Sorting

      // @ts-ignore
      const sortBy = options.sortBy || "createdAt";

      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`category.${sortBy}`, sortOrder);

      // Pagination

      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;

        // @ts-ignore
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
   */
  async getStatistics() {
    // @ts-ignore
    const { category: categoryRepo, product: productRepo } =
      await this.getRepositories();

    try {
      // Total active categories

      // @ts-ignore
      const totalActive = await categoryRepo.count({
        where: { isActive: true },
      });

      // Total inactive categories

      // @ts-ignore
      const totalInactive = await categoryRepo.count({
        where: { isActive: false },
      });

      // Categories with product counts

      // @ts-ignore
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
   */
  async exportCategories(format = "json", filters = {}, user = "system") {
    try {
      const categories = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = ["ID", "Name", "Description", "Active", "Created At"];
        const rows = categories.map((c) => [
          c.id,
          c.name,
          c.description || "",
          c.isActive ? "Yes" : "No",

          // @ts-ignore
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

      // @ts-ignore
      await auditLogger.logExport("Category", format, filters, user);
      console.log(
        `Exported ${categories.length} categories in ${format} format`,
      );
      return exportData;
    } catch (error) {
      console.error("Failed to export categories:", error);
      throw error;
    }
  }
}

// Singleton instance
const categoryService = new CategoryService();
module.exports = categoryService;
