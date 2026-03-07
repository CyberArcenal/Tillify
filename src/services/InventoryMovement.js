// services/InventoryMovementService.js
//@ts-check

const auditLogger = require("../utils/auditLogger");

const { validateInventoryMovement } = require("../utils/inventoryUtils");

class InventoryMovementService {
  constructor() {
    this.movementRepository = null;
    this.productRepository = null;
    this.saleRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    const InventoryMovement = require("../entities/InventoryMovement");
    const Product = require("../entities/Product");
    const Sale = require("../entities/Sale");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.movementRepository = AppDataSource.getRepository(InventoryMovement);
    this.productRepository = AppDataSource.getRepository(Product);
    this.saleRepository = AppDataSource.getRepository(Sale);
    console.log("InventoryMovementService initialized");
  }

  async getRepositories() {
    if (!this.movementRepository) {
      await this.initialize();
    }
    return {
      movement: this.movementRepository,
      product: this.productRepository,
      sale: this.saleRepository,
    };
  }

  /**
   * Create a manual inventory adjustment movement
   * This will also update the product's stock quantity.
   * @param {Object} data - Movement data
   * @param {number} data.productId - Product ID
   * @param {number} data.qtyChange - Positive (increase) or negative (decrease)
   * @param {string} data.movementType - 'adjustment' (sale/refund are typically auto-created)
   * @param {string|null} data.notes - Reason for adjustment
   * @param {number|null} data.saleId - Optional sale reference
   * @param {string} user - User performing the action
   */
  async createAdjustment(data, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const {
      movement: movementRepo,
      product: productRepo,
      sale: saleRepo,
    } = await this.getRepositories();

    try {
      // Validate movement data
      const validation = validateInventoryMovement(data);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const { productId, qtyChange, movementType, notes, saleId } = data;

      // Fetch product

      // @ts-ignore
      const product = await productRepo.findOne({ where: { id: productId } });
      if (!product) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      // Check stock sufficiency if decreasing

      // @ts-ignore
      if (qtyChange < 0 && product.stockQty + qtyChange < 0) {
        throw new Error(
          `Insufficient stock. Available: ${product.stockQty}, Requested change: ${qtyChange}`,
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

      // Record old stock for audit
      const oldStock = product.stockQty;

      // Update product stock

      // @ts-ignore
      product.stockQty += qtyChange;
      product.updatedAt = new Date();

      // @ts-ignore
      const updatedProduct = await updateDb(productRepo, product);

      // Create movement record

      // @ts-ignore
      const movement = movementRepo.create({
        movementType,
        qtyChange,
        notes,
        product: updatedProduct,
        sale: sale || null,
        timestamp: new Date(),
      });

      // @ts-ignore
      const savedMovement = await saveDb(movementRepo, movement);

      // Audit logs
      await auditLogger.logUpdate(
        "Product",
        productId,
        { stockQty: oldStock },
        { stockQty: updatedProduct.stockQty },
        user,
      );
      await auditLogger.logCreate(
        "InventoryMovement",
        savedMovement.id,
        savedMovement,
        user,
      );

      console.log(
        `Inventory adjustment created: ${qtyChange > 0 ? "+" : ""}${qtyChange} units for product #${productId}`,
      );
      return savedMovement;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create inventory adjustment:", error.message);
      throw error;
    }
  }

  /**
   * Find a movement by ID with relations
   * @param {number} id
   */
  async findById(id) {
    const { movement: movementRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const movement = await movementRepo.findOne({
        where: { id },
        relations: ["product", "sale"],
      });
      if (!movement) {
        throw new Error(`Inventory movement with ID ${id} not found`);
      }

      // @ts-ignore
      await auditLogger.logView("InventoryMovement", id, "system");
      return movement;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find inventory movement:", error.message);
      throw error;
    }
  }

  /**
   * Find all movements with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { movement: movementRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = movementRepo
        .createQueryBuilder("movement")
        .leftJoinAndSelect("movement.product", "product")
        .leftJoinAndSelect("movement.sale", "sale");

      // Filter by product

      // @ts-ignore
      if (options.productId) {
        queryBuilder.andWhere("movement.productId = :productId", {
          // @ts-ignore
          productId: options.productId,
        });
      }

      // Filter by sale

      // @ts-ignore
      if (options.saleId) {
        queryBuilder.andWhere("movement.saleId = :saleId", {
          // @ts-ignore
          saleId: options.saleId,
        });
      }

      // Filter by movement type

      // @ts-ignore
      if (options.movementType) {
        queryBuilder.andWhere("movement.movementType = :movementType", {
          // @ts-ignore
          movementType: options.movementType,
        });
      }

      // @ts-ignore
      if (options.movementTypes && options.movementTypes.length) {
        queryBuilder.andWhere("movement.movementType IN (:...movementTypes)", {
          // @ts-ignore
          movementTypes: options.movementTypes,
        });
      }

      // Filter by date range

      // @ts-ignore
      if (options.startDate) {
        queryBuilder.andWhere("movement.timestamp >= :startDate", {
          // @ts-ignore
          startDate: options.startDate,
        });
      }

      // @ts-ignore
      if (options.endDate) {
        queryBuilder.andWhere("movement.timestamp <= :endDate", {
          // @ts-ignore
          endDate: options.endDate,
        });
      }

      // Filter by direction (increase/decrease)

      // @ts-ignore
      if (options.direction === "increase") {
        queryBuilder.andWhere("movement.qtyChange > 0");
      // @ts-ignore
      } else if (options.direction === "decrease") {
        queryBuilder.andWhere("movement.qtyChange < 0");
      }

      // Search in notes

      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere("movement.notes LIKE :search", {
          // @ts-ignore
          search: `%${options.search}%`,
        });
      }

      // Sorting

      // @ts-ignore
      const sortBy = options.sortBy || "timestamp";

      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`movement.${sortBy}`, sortOrder);

      // Pagination

      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;

        // @ts-ignore
        queryBuilder.skip(offset).take(options.limit);
      }

      const movements = await queryBuilder.getMany();

      await auditLogger.logView("InventoryMovement", null, "system");
      return movements;
    } catch (error) {
      console.error("Failed to fetch inventory movements:", error);
      throw error;
    }
  }

  /**
   * Get inventory movement statistics
   */
  async getStatistics() {
    const { movement: movementRepo } = await this.getRepositories();

    try {
      // Total quantity changes by type

      // @ts-ignore
      const byType = await movementRepo
        .createQueryBuilder("movement")
        .select("movement.movementType", "type")
        .addSelect("SUM(movement.qtyChange)", "totalChange")
        .addSelect("COUNT(*)", "count")
        .groupBy("movement.movementType")
        .getRawMany();

      // Total increases and decreases

      // @ts-ignore
      const totalIncrease = await movementRepo
        .createQueryBuilder("movement")
        .select("SUM(movement.qtyChange)", "total")
        .where("movement.qtyChange > 0")
        .getRawOne();

      // @ts-ignore
      const totalDecrease = await movementRepo
        .createQueryBuilder("movement")
        .select("SUM(ABS(movement.qtyChange))", "total")
        .where("movement.qtyChange < 0")
        .getRawOne();

      // Movements per product (top 5)

      // @ts-ignore
      const topProducts = await movementRepo
        .createQueryBuilder("movement")
        .select("movement.productId", "productId")
        .addSelect("SUM(movement.qtyChange)", "netChange")
        .addSelect("COUNT(*)", "movementCount")
        .groupBy("movement.productId")
        .orderBy("movementCount", "DESC")
        .limit(5)
        .getRawMany();

      // Monthly trends

      // @ts-ignore
      const monthly = await movementRepo
        .createQueryBuilder("movement")
        .select([
          "strftime('%Y-%m', movement.timestamp) as month",
          "COUNT(*) as count",
          "SUM(CASE WHEN movement.qtyChange > 0 THEN movement.qtyChange ELSE 0 END) as totalIncrease",
          "SUM(CASE WHEN movement.qtyChange < 0 THEN ABS(movement.qtyChange) ELSE 0 END) as totalDecrease",
        ])
        .where("movement.timestamp >= date('now', '-6 months')")
        .groupBy("strftime('%Y-%m', movement.timestamp)")
        .orderBy("month", "DESC")
        .getRawMany();

      return {
        byType,
        totals: {
          totalIncrease: parseFloat(totalIncrease.total) || 0,
          totalDecrease: parseFloat(totalDecrease.total) || 0,
        },
        topProducts,
        monthlyTrends: monthly,
      };
    } catch (error) {
      console.error("Failed to get inventory movement statistics:", error);
      throw error;
    }
  }

  /**
   * Export movements to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters (same as findAll)
   * @param {string} user
   */
  async exportMovements(format = "json", filters = {}, user = "system") {
    try {
      const movements = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Product",
          "SKU",
          "Movement Type",
          "Quantity Change",
          "Direction",
          "Sale ID",
          "Notes",
          "Timestamp",
        ];
        const rows = movements.map((m) => [
          m.id,

          // @ts-ignore
          m.product?.name || "N/A",

          // @ts-ignore
          m.product?.sku || "N/A",
          m.movementType,
          m.qtyChange,

          // @ts-ignore
          m.qtyChange > 0 ? "Increase" : m.qtyChange < 0 ? "Decrease" : "Zero",

          // @ts-ignore
          m.sale?.id || "",
          m.notes || "",

          // @ts-ignore
          new Date(m.timestamp).toLocaleString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `inventory_movements_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: movements,
          filename: `inventory_movements_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      // @ts-ignore
      await auditLogger.logExport("InventoryMovement", format, filters, user);
      console.log(
        `Exported ${movements.length} inventory movements in ${format} format`,
      );
      return exportData;
    } catch (error) {
      console.error("Failed to export inventory movements:", error);
      throw error;
    }
  }
}

// Singleton instance
const inventoryMovementService = new InventoryMovementService();
module.exports = inventoryMovementService;
