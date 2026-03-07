// services/ProductService.js
//@ts-check

const auditLogger = require("../utils/auditLogger");

const { validateProductData } = require("../utils/productUtils");

class ProductService {
  constructor() {
    this.productRepository = null;
    this.inventoryMovementRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    const Product = require("../entities/Product");
    const InventoryMovement = require("../entities/InventoryMovement");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.productRepository = AppDataSource.getRepository(Product);
    this.inventoryMovementRepository =
      AppDataSource.getRepository(InventoryMovement);
    console.log("ProductService initialized");
  }

  async getRepositories() {
    if (!this.productRepository) {
      await this.initialize();
    }
    return {
      product: this.productRepository,
      inventoryMovement: this.inventoryMovementRepository,
    };
  }

  /**
   * Create a new product
   * @param {Object} productData - Product data
   * @param {string} user - User performing the action
   */
  async create(productData, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb, removeDb } = require("../utils/dbUtils/dbActions");
    const { product: productRepo } = await this.getRepositories();

    // Kunin ang category at supplier repositories kung kailangan mong i-validate ang existence
    const { AppDataSource } = require("../main/db/datasource");
    const Category = require("../entities/Category");
    const Supplier = require("../entities/Supplier");
    const categoryRepo = AppDataSource.getRepository(Category);
    const supplierRepo = AppDataSource.getRepository(Supplier);

    try {
      // Validate product data (dapat i-update din ang validation function)
      const validation = validateProductData(productData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        // @ts-ignore
        sku = generateSKU("PRD"),

        // @ts-ignore
        name,

        // @ts-ignore
        price,

        // @ts-ignore
        stockQty = 0,

        // @ts-ignore
        description = null,

        // @ts-ignore
        isActive = true,

        // @ts-ignore
        categoryId,

        // @ts-ignore
        supplierId,

        // @ts-ignore
        barcode,
      } = productData;

      // Check SKU uniqueness

      // @ts-ignore
      const existing = await productRepo.findOne({ where: { sku } });
      if (existing) {
        throw new Error(`Product with SKU "${sku}" already exists`);
      }

      // @ts-ignore
      const existing_barcode = await productRepo.findOne({
        where: { barcode },
      });
      if (existing_barcode) {
        throw new Error(`Product with barcode "${barcode}" already exists`);
      }

      // I-validate ang category at supplier kung provided
      let category = null;
      if (categoryId) {
        category = await categoryRepo.findOne({ where: { id: categoryId } });
        if (!category)
          throw new Error(`Category with ID ${categoryId} not found`);
      }

      let supplier = null;
      if (supplierId) {
        supplier = await supplierRepo.findOne({ where: { id: supplierId } });
        if (!supplier)
          throw new Error(`Supplier with ID ${supplierId} not found`);
      }

      // Create product entity

      // @ts-ignore
      const product = productRepo.create({
        sku,
        name,
        barcode,
        description,
        price,
        stockQty,
        isActive,
        category, // i-assign ang category entity (o kaya { id: categoryId })
        supplier, // i-assign ang supplier entity
        createdAt: new Date(),
      });

      // @ts-ignore
      const savedProduct = await saveDb(productRepo, product);
      await auditLogger.logCreate(
        "Product",
        savedProduct.id,
        savedProduct,
        user,
      );
      return savedProduct;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create product:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing product
   * @param {number} id - Product ID
   * @param {Object} productData - Updated fields
   * @param {string} user - User performing the action
   */
  async update(id, productData, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb, removeDb } = require("../utils/dbUtils/dbActions");
    const { product: productRepo } = await this.getRepositories();

    const { AppDataSource } = require("../main/db/datasource");
    const Category = require("../entities/Category");
    const Supplier = require("../entities/Supplier");
    const categoryRepo = AppDataSource.getRepository(Category);
    const supplierRepo = AppDataSource.getRepository(Supplier);

    try {
      // @ts-ignore
      const existingProduct = await productRepo.findOne({ where: { id } });
      if (!existingProduct) {
        throw new Error(`Product with ID ${id} not found`);
      }

      const oldData = { ...existingProduct };

      // Handle SKU uniqueness (existing code)

      // @ts-ignore
      if (productData.sku && productData.sku !== existingProduct.sku) {
        // @ts-ignore
        const skuExists = await productRepo.findOne({
          // @ts-ignore
          where: { sku: productData.sku },
        });
        if (skuExists)
          throw new Error(
            // @ts-ignore
            `Product with SKU "${productData.sku}" already exists`,
          );
      }

      // Handle category update

      // @ts-ignore
      if (productData.categoryId !== undefined) {
        // @ts-ignore
        if (productData.categoryId === null) {
          // @ts-ignore
          existingProduct.category = null;
        } else {
          const category = await categoryRepo.findOne({
            // @ts-ignore
            where: { id: productData.categoryId },
          });
          if (!category)
            throw new Error(
              // @ts-ignore
              `Category with ID ${productData.categoryId} not found`,
            );

          // @ts-ignore
          existingProduct.category = category;
        }

        // @ts-ignore
        delete productData.categoryId; // para hindi ma-assign bilang direct property
      }

      // Handle supplier update

      // @ts-ignore
      if (productData.supplierId !== undefined) {
        // @ts-ignore
        if (productData.supplierId === null) {
          // @ts-ignore
          existingProduct.supplier = null;
        } else {
          const supplier = await supplierRepo.findOne({
            // @ts-ignore
            where: { id: productData.supplierId },
          });
          if (!supplier)
            throw new Error(
              // @ts-ignore
              `Supplier with ID ${productData.supplierId} not found`,
            );

          // @ts-ignore
          existingProduct.supplier = supplier;
        }

        // @ts-ignore
        delete productData.supplierId;
      }

      // Update other fields
      Object.assign(existingProduct, productData);
      existingProduct.updatedAt = new Date();

      // @ts-ignore
      const savedProduct = await updateDb(productRepo, existingProduct);
      await auditLogger.logUpdate("Product", id, oldData, savedProduct, user);
      return savedProduct;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to update product:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a product (set isActive = false)
   * @param {number} id - Product ID
   * @param {string} user - User performing the action
   */
  async delete(id, user = "system") {
    // @ts-ignore
    const { saveDb, updateDb, removeDb } = require("../utils/dbUtils/dbActions");
    const { product: productRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const product = await productRepo.findOne({ where: { id } });
      if (!product) {
        throw new Error(`Product with ID ${id} not found`);
      }

      if (!product.isActive) {
        throw new Error(`Product #${id} is already inactive`);
      }

      const oldData = { ...product };
      product.isActive = false;
      product.updatedAt = new Date();

      // @ts-ignore
      const savedProduct = await updateDb(productRepo, product);

      await auditLogger.logDelete("Product", id, oldData, user);

      console.log(`Product deactivated: #${id}`);
      return savedProduct;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to delete product:", error.message);
      throw error;
    }
  }

  /**
   * Find product by ID
   * @param {number} id
   */
  async findById(id) {
    const { product: productRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const product = await productRepo.findOne({ where: { id } });
      if (!product) {
        throw new Error(`Product with ID ${id} not found`);
      }

      // @ts-ignore
      await auditLogger.logView("Product", id, "system");
      return product;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find product:", error.message);
      throw error;
    }
  }

  /**
   * Find all products with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { product: productRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = productRepo
        .createQueryBuilder("product")
        .leftJoinAndSelect("product.category", "category") // kung gusto mong i-include ang category sa result
        .leftJoinAndSelect("product.supplier", "supplier"); // kung gusto mong i-include ang supplier

      // Filter by active status

      // @ts-ignore
      if (options.isActive !== undefined) {
        queryBuilder.andWhere("product.isActive = :isActive", {
          // @ts-ignore
          isActive: options.isActive,
        });
      }

      // Filter by categoryId

      // @ts-ignore
      if (options.categoryId) {
        queryBuilder.andWhere("category.id = :categoryId", {
          // @ts-ignore
          categoryId: options.categoryId,
        });
      }

      // Filter by supplierId

      // @ts-ignore
      if (options.supplierId) {
        queryBuilder.andWhere("supplier.id = :supplierId", {
          // @ts-ignore
          supplierId: options.supplierId,
        });
      }

      // Search by name or SKU

      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere(
          "(product.name LIKE :search OR product.sku LIKE :search OR product.barcode LIKE :search)",

          // @ts-ignore
          { search: `%${options.search}%` },
        );
      }

      // Price range filters

      // @ts-ignore
      if (options.minPrice !== undefined) {
        queryBuilder.andWhere("product.price >= :minPrice", {
          // @ts-ignore
          minPrice: options.minPrice,
        });
      }

      // @ts-ignore
      if (options.maxPrice !== undefined) {
        queryBuilder.andWhere("product.price <= :maxPrice", {
          // @ts-ignore
          maxPrice: options.maxPrice,
        });
      }

      // Sorting

      // @ts-ignore
      const sortBy = options.sortBy || "createdAt";

      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`product.${sortBy}`, sortOrder);

      // Pagination

      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;

        // @ts-ignore
        queryBuilder.skip(offset).take(options.limit);
      }

      const products = await queryBuilder.getMany();
      await auditLogger.logView("Product", null, "system");
      return products;
    } catch (error) {
      console.error("Failed to fetch products:", error);
      throw error;
    }
  }

  /**
   * Update product stock and create an inventory movement
   * @param {number} productId
   * @param {number} quantityChange - Positive for increase, negative for decrease
   * @param {string} movementType - 'sale', 'refund', 'adjustment'
   * @param {string} notes - Optional notes
   * @param {string} user
   * @param {number|null} saleId - Optional sale ID for reference
   */
  async updateStock(
    productId,
    quantityChange,
    movementType,

    // @ts-ignore
    notes = null,
    user = "system",
    saleId = null,
  ) {
    // @ts-ignore
    const { saveDb, updateDb, removeDb } = require("../utils/dbUtils/dbActions");
    const { product: productRepo, inventoryMovement: movementRepo } =
      await this.getRepositories();

    try {
      // @ts-ignore
      const product = await productRepo.findOne({ where: { id: productId } });
      if (!product) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      const oldStock = product.stockQty;

      // @ts-ignore
      const newStock = oldStock + quantityChange;
      if (newStock < 0) {
        throw new Error(
          `Insufficient stock. Current: ${oldStock}, Requested change: ${quantityChange}`,
        );
      }

      // Update product stock
      product.stockQty = newStock;
      product.updatedAt = new Date();

      // @ts-ignore
      const savedProduct = await updateDb(productRepo, product);

      // Create inventory movement record

      // @ts-ignore
      const movement = movementRepo.create({
        movementType,
        qtyChange: quantityChange,
        notes,
        product: savedProduct,
        sale: saleId ? { id: saleId } : null,
        timestamp: new Date(),
      });

      // @ts-ignore
      await saveDb(movementRepo, movement);

      await auditLogger.logUpdate(
        "Product",
        productId,
        { stockQty: oldStock },
        { stockQty: newStock },
        user,
      );
      await auditLogger.logCreate(
        "InventoryMovement",
        movement.id,
        movement,
        user,
      );

      console.log(
        `Stock updated for product #${productId}: ${oldStock} → ${newStock} (${movementType})`,
      );
      return { product: savedProduct, movement };
    } catch (error) {
      // @ts-ignore
      console.error("Failed to update stock:", error.message);
      throw error;
    }
  }

  /**
   * Get products with stock below a certain threshold
   * @param {number} threshold
   */
  async getLowStock(threshold = 5) {
    const { product: productRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const products = await productRepo
        .createQueryBuilder("product")
        .where("product.stockQty <= :threshold", { threshold })
        .andWhere("product.isActive = :isActive", { isActive: true })
        .orderBy("product.stockQty", "ASC")
        .getMany();

      return products;
    } catch (error) {
      console.error("Failed to get low stock products:", error);
      throw error;
    }
  }

  /**
   * Get product statistics
   */
  async getStatistics() {
    const { product: productRepo } = await this.getRepositories();

    try {
      // Total active products

      // @ts-ignore
      const totalActive = await productRepo.count({
        where: { isActive: true },
      });

      // Total inactive products

      // @ts-ignore
      const totalInactive = await productRepo.count({
        where: { isActive: false },
      });

      // Total stock value (active products)

      // @ts-ignore
      const stockValueResult = await productRepo
        .createQueryBuilder("product")
        .select("SUM(product.price * product.stockQty)", "totalValue")
        .where("product.isActive = :isActive", { isActive: true })
        .getRawOne();
      const totalStockValue = parseFloat(stockValueResult.totalValue) || 0;

      // Average product price (active)

      // @ts-ignore
      const avgPriceResult = await productRepo
        .createQueryBuilder("product")
        .select("AVG(product.price)", "averagePrice")
        .where("product.isActive = :isActive", { isActive: true })
        .getRawOne();
      const averagePrice = parseFloat(avgPriceResult.averagePrice) || 0;

      // Count of products with zero stock

      // @ts-ignore
      const zeroStock = await productRepo.count({
        where: { isActive: true, stockQty: 0 },
      });

      return {
        totalActive,
        totalInactive,
        totalStockValue,
        averagePrice,
        zeroStock,
      };
    } catch (error) {
      console.error("Failed to get product statistics:", error);
      throw error;
    }
  }

  /**
   * Export products to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters
   * @param {string} user
   */
  async exportProducts(format = "json", filters = {}, user = "system") {
    try {
      const products = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "SKU",
          "Name",
          "Description",
          "Price",
          "Stock Qty",
          "Active",
          "Created At",
        ];
        const rows = products.map((p) => [
          p.id,
          p.sku,
          p.name,
          p.description || "",
          p.price,
          p.stockQty,
          p.isActive ? "Yes" : "No",

          // @ts-ignore
          new Date(p.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `products_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: products,
          filename: `products_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      // @ts-ignore
      await auditLogger.logExport("Product", format, filters, user);
      console.log(`Exported ${products.length} products in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export products:", error);
      throw error;
    }
  }
}

function generateSKU(prefix = "PRD") {
  const timestamp = Date.now().toString(36); // base36 para mas maikli
  const random = Math.floor(Math.random() * 999)
    .toString()
    .padStart(3, "0");
  return `${prefix}-${timestamp}-${random}`;
}

// Singleton instance
const productService = new ProductService();
module.exports = productService;
