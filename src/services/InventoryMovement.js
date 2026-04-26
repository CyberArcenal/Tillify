// services/InventoryMovementService.js
const auditLogger = require("../utils/auditLogger");
const { validateInventoryMovement } = require("../utils/inventoryUtils");

class InventoryMovementService {
  constructor() {
    this.movementRepository = null;
    this.productRepository = null;
    this.saleRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/dataSource");
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
   * Create a manual inventory adjustment movement
   * This will also update the product's stock quantity.
   * @param {Object} data - Movement data
   * @param {number} data.productId - Product ID
   * @param {number} data.qtyChange - Positive (increase) or negative (decrease)
   * @param {string} data.movementType - 'adjustment' (sale/refund are typically auto-created)
   * @param {string|null} data.notes - Reason for adjustment
   * @param {number|null} data.saleId - Optional sale reference
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async createAdjustment(data, user = "system", qr = null) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const InventoryMovement = require("../entities/InventoryMovement");
    const Product = require("../entities/Product");
    const Sale = require("../entities/Sale");

    const movementRepo = this._getRepo(qr, InventoryMovement);
    const productRepo = this._getRepo(qr, Product);
    const saleRepo = this._getRepo(qr, Sale);

    try {
      const validation = validateInventoryMovement(data);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const { productId, qtyChange, movementType, notes, saleId } = data;

      const product = await productRepo.findOne({ where: { id: productId } });
      if (!product) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      if (qtyChange < 0 && product.stockQty + qtyChange < 0) {
        throw new Error(
          `Insufficient stock. Available: ${product.stockQty}, Requested change: ${qtyChange}`
        );
      }

      let sale = null;
      if (saleId) {
        sale = await saleRepo.findOne({ where: { id: saleId } });
        if (!sale) {
          throw new Error(`Sale with ID ${saleId} not found`);
        }
      }

      const oldStock = product.stockQty;
      product.stockQty += qtyChange;
      product.updatedAt = new Date();

      const updatedProduct = await updateDb(productRepo, product);

      const movement = movementRepo.create({
        movementType,
        qtyChange,
        notes,
        product: updatedProduct,
        sale: sale || null,
        timestamp: new Date(),
      });

      const savedMovement = await saveDb(movementRepo, movement);

      // Audit logs
      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save([
          {
            action: "UPDATE",
            entity: "Product",
            entityId: productId,
            user,
            description: `Stock changed from ${oldStock} to ${updatedProduct.stockQty} (${movementType})`,
          },
          {
            action: "CREATE",
            entity: "InventoryMovement",
            entityId: savedMovement.id,
            user,
            description: `Inventory movement recorded: ${movementType} ${qtyChange}`,
          },
        ]);
      } else {
        await auditLogger.logUpdate(
          "Product",
          productId,
          { stockQty: oldStock },
          { stockQty: updatedProduct.stockQty },
          user
        );
        await auditLogger.logCreate(
          "InventoryMovement",
          savedMovement.id,
          savedMovement,
          user
        );
      }

      console.log(
        `Inventory adjustment created: ${
          qtyChange > 0 ? "+" : ""
        }${qtyChange} units for product #${productId}`
      );
      return savedMovement;
    } catch (error) {
      console.error("Failed to create inventory adjustment:", error.message);
      throw error;
    }
  }

  /**
   * Find a movement by ID with relations
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findById(id, qr = null) {
    const InventoryMovement = require("../entities/InventoryMovement");
    const movementRepo = this._getRepo(qr, InventoryMovement);

    try {
      const movement = await movementRepo.findOne({
        where: { id },
        relations: ["product", "sale"],
      });
      if (!movement) {
        throw new Error(`Inventory movement with ID ${id} not found`);
      }

      await auditLogger.logView("InventoryMovement", id, "system");
      return movement;
    } catch (error) {
      console.error("Failed to find inventory movement:", error.message);
      throw error;
    }
  }

  /**
   * Find all movements with optional filters
   * @param {Object} options - Filter options
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findAll(options = {}, qr = null) {
    const InventoryMovement = require("../entities/InventoryMovement");
    const movementRepo = this._getRepo(qr, InventoryMovement);

    try {
      const queryBuilder = movementRepo
        .createQueryBuilder("movement")
        .leftJoinAndSelect("movement.product", "product")
        .leftJoinAndSelect("movement.sale", "sale");

      if (options.productId) {
        queryBuilder.andWhere("movement.productId = :productId", {
          productId: options.productId,
        });
      }

      if (options.saleId) {
        queryBuilder.andWhere("movement.saleId = :saleId", {
          saleId: options.saleId,
        });
      }

      if (options.movementType) {
        queryBuilder.andWhere("movement.movementType = :movementType", {
          movementType: options.movementType,
        });
      }

      if (options.movementTypes && options.movementTypes.length) {
        queryBuilder.andWhere("movement.movementType IN (:...movementTypes)", {
          movementTypes: options.movementTypes,
        });
      }

      if (options.startDate) {
        queryBuilder.andWhere("movement.timestamp >= :startDate", {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        queryBuilder.andWhere("movement.timestamp <= :endDate", {
          endDate: options.endDate,
        });
      }

      if (options.direction === "increase") {
        queryBuilder.andWhere("movement.qtyChange > 0");
      } else if (options.direction === "decrease") {
        queryBuilder.andWhere("movement.qtyChange < 0");
      }

      if (options.search) {
        queryBuilder.andWhere("movement.notes LIKE :search", {
          search: `%${options.search}%`,
        });
      }

      const sortBy = options.sortBy || "timestamp";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`movement.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStatistics(qr = null) {
    const InventoryMovement = require("../entities/InventoryMovement");
    const movementRepo = this._getRepo(qr, InventoryMovement);

    try {
      const byType = await movementRepo
        .createQueryBuilder("movement")
        .select("movement.movementType", "type")
        .addSelect("SUM(movement.qtyChange)", "totalChange")
        .addSelect("COUNT(*)", "count")
        .groupBy("movement.movementType")
        .getRawMany();

      const totalIncrease = await movementRepo
        .createQueryBuilder("movement")
        .select("SUM(movement.qtyChange)", "total")
        .where("movement.qtyChange > 0")
        .getRawOne();

      const totalDecrease = await movementRepo
        .createQueryBuilder("movement")
        .select("SUM(ABS(movement.qtyChange))", "total")
        .where("movement.qtyChange < 0")
        .getRawOne();

      const topProducts = await movementRepo
        .createQueryBuilder("movement")
        .select("movement.productId", "productId")
        .addSelect("SUM(movement.qtyChange)", "netChange")
        .addSelect("COUNT(*)", "movementCount")
        .groupBy("movement.productId")
        .orderBy("movementCount", "DESC")
        .limit(5)
        .getRawMany();

      // Monthly trends (SQLite syntax, adjust for other DBs if needed)
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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportMovements(
    format = "json",
    filters = {},
    user = "system",
    qr = null
  ) {
    try {
      const movements = await this.findAll(filters, qr);

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
          m.product?.name || "N/A",
          m.product?.sku || "N/A",
          m.movementType,
          m.qtyChange,
          m.qtyChange > 0 ? "Increase" : m.qtyChange < 0 ? "Decrease" : "Zero",
          m.sale?.id || "",
          m.notes || "",
          new Date(m.timestamp).toLocaleString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `inventory_movements_export_${
            new Date().toISOString().split("T")[0]
          }.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: movements,
          filename: `inventory_movements_export_${
            new Date().toISOString().split("T")[0]
          }.json`,
        };
      }

      await auditLogger.logExport("InventoryMovement", format, filters, user);
      console.log(
        `Exported ${movements.length} inventory movements in ${format} format`
      );
      return exportData;
    } catch (error) {
      console.error("Failed to export inventory movements:", error);
      throw error;
    }
  }

  /**
   * Bulk create inventory adjustments
   * @param {Array<Object>} adjustmentsArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreateAdjustments(adjustmentsArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const adjData of adjustmentsArray) {
      try {
        const saved = await this.createAdjustment(adjData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ adjustment: adjData, error: err.message });
      }
    }
    return results;
  }
}

// Singleton instance
const inventoryMovementService = new InventoryMovementService();
module.exports = inventoryMovementService;
