// src/main/ipc/inventoryReports/index.ipc.js
// Inventory Reports Handler (Read-Only)

const { ipcMain } = require("electron");
const { logger } = require("../../../../utils/logger");
const Product = require("../../../../entities/Product");
const { AppDataSource } = require("../../../db/dataSource");
const InventoryMovement = require("../../../../entities/InventoryMovement");
const { withErrorHandling } = require("../../../../middlewares/errorHandler");

class InventoryReportsHandler {
  constructor() {
    this.initializeHandlers();
  }

  initializeHandlers() {
    // All methods defined in class
  }

  /**
   * Main IPC request handler
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {{ method: string; params: object }} payload
   */
  // @ts-ignore
  async handleRequest(event, payload) {
    try {
      const { method, params = {} } = payload;

      if (logger) {
        // @ts-ignore
        logger.info(`InventoryReportsHandler: ${method}`, {
          params: this.sanitizeParams(params),
        });
      }

      switch (method) {
        // 📦 BASIC INVENTORY READ OPERATIONS
        case "getInventorySummary":
          return await this.getInventorySummary(params);
        case "getStockLevels":
          return await this.getStockLevels(params);
        case "getLowStockAlerts":
          return await this.getLowStockAlerts(params);
        case "getOutOfStock":
          return await this.getOutOfStock(params);

        // 🔄 INVENTORY MOVEMENTS
        case "getInventoryMovements":
          return await this.getInventoryMovements(params);
        case "getProductStockHistory":
          return await this.getProductStockHistory(params);

        // 📊 STATISTICS & REPORTS
        case "getInventoryStats":
          return await this.getInventoryStats(params);
        case "exportInventoryReport":
          return await this.exportInventoryReport(params);
        case "generateInventoryReport":
          return await this.generateInventoryReport(params);

        default:
          return {
            status: false,
            message: `Unknown inventory reports method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      console.error("InventoryReportsHandler error:", error);
      // @ts-ignore
      if (logger) logger.error("InventoryReportsHandler error:", error);
      return {
        status: false,
        // @ts-ignore
        message: error.message || "Internal server error",
        data: null,
      };
    }
  }

  // @ts-ignore
  sanitizeParams(params) {
    const safe = { ...params };
    // No sensitive data typically in inventory reports
    return safe;
  }

  async getProductRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(Product);
  }

  async getMovementRepository() {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return AppDataSource.getRepository(InventoryMovement);
  }

  /**
   * Build product query with filters
   */
  async buildProductQuery(params = {}) {
    const repo = await this.getProductRepository();
    const qb = repo
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.category", "category")
      .leftJoinAndSelect("product.supplier", "supplier");

    // @ts-ignore
    if (params.categoryId) {
      qb.andWhere("product.categoryId = :categoryId", {
        // @ts-ignore
        categoryId: params.categoryId,
      });
    }
    // @ts-ignore
    if (params.supplierId) {
      qb.andWhere("product.supplierId = :supplierId", {
        // @ts-ignore
        supplierId: params.supplierId,
      });
    }
    // @ts-ignore
    if (params.isActive !== undefined) {
      qb.andWhere("product.isActive = :isActive", {
        // @ts-ignore
        isActive: params.isActive,
      });
    }
    // @ts-ignore
    if (params.searchTerm) {
      qb.andWhere(
        "(product.name LIKE :search OR product.sku LIKE :search OR product.description LIKE :search)",
        // @ts-ignore
        { search: `%${params.searchTerm}%` },
      );
    }
    // @ts-ignore
    if (params.minStock !== undefined) {
      qb.andWhere("product.stockQty >= :minStock", {
        // @ts-ignore
        minStock: params.minStock,
      });
    }
    // @ts-ignore
    if (params.maxStock !== undefined) {
      qb.andWhere("product.stockQty <= :maxStock", {
        // @ts-ignore
        maxStock: params.maxStock,
      });
    }

    // Default order
    qb.orderBy("product.name", "ASC");

    // Pagination
    // @ts-ignore
    if (params.page && params.limit) {
      // @ts-ignore
      const skip = (params.page - 1) * params.limit;
      // @ts-ignore
      qb.skip(skip).take(params.limit);
    // @ts-ignore
    } else if (params.limit) {
      // @ts-ignore
      qb.take(params.limit);
    }

    return qb;
  }

  /**
   * Build inventory movements query with filters
   */
  async buildMovementsQuery(params = {}) {
    const repo = await this.getMovementRepository();
    const qb = repo
      .createQueryBuilder("movement")
      .leftJoinAndSelect("movement.product", "product")
      .leftJoinAndSelect("movement.sale", "sale");

    // @ts-ignore
    if (params.productId) {
      qb.andWhere("movement.productId = :productId", {
        // @ts-ignore
        productId: params.productId,
      });
    }
    // @ts-ignore
    if (params.movementType) {
      qb.andWhere("movement.movementType = :movementType", {
        // @ts-ignore
        movementType: params.movementType,
      });
    }
    // @ts-ignore
    if (params.startDate && params.endDate) {
      qb.andWhere("movement.timestamp BETWEEN :startDate AND :endDate", {
        // @ts-ignore
        startDate: params.startDate,
        // @ts-ignore
        endDate: params.endDate,
      });
    // @ts-ignore
    } else if (params.startDate) {
      qb.andWhere("movement.timestamp >= :startDate", {
        // @ts-ignore
        startDate: params.startDate,
      });
    // @ts-ignore
    } else if (params.endDate) {
      qb.andWhere("movement.timestamp <= :endDate", {
        // @ts-ignore
        endDate: params.endDate,
      });
    }

    // Default order: newest first
    qb.orderBy("movement.timestamp", "DESC");

    // Pagination
    // @ts-ignore
    if (params.page && params.limit) {
      // @ts-ignore
      const skip = (params.page - 1) * params.limit;
      // @ts-ignore
      qb.skip(skip).take(params.limit);
    // @ts-ignore
    } else if (params.limit) {
      // @ts-ignore
      qb.take(params.limit);
    }

    return qb;
  }

  // ------------------------------------------------------------------------
  // HANDLER IMPLEMENTATIONS
  // ------------------------------------------------------------------------

  // @ts-ignore
  async getInventorySummary(params) {
    const repo = await this.getProductRepository();

    // Total products (active)
    const totalProducts = await repo.count({ where: { isActive: true } });

    // Total stock quantity
    const stockResult = await repo
      .createQueryBuilder("product")
      .select("SUM(product.stockQty)", "totalStock")
      .where("product.isActive = :active", { active: true })
      .getRawOne();
    const totalStockQty = stockResult?.totalStock || 0;

    // Total inventory value (stock * price) - approximate
    const valueResult = await repo
      .createQueryBuilder("product")
      .select("SUM(product.stockQty * product.price)", "totalValue")
      .where("product.isActive = :active", { active: true })
      .getRawOne();
    const totalValue = valueResult?.totalValue || 0;

    // Low stock count (stockQty <= reorderLevel)
    const lowStockCount = await repo
      .createQueryBuilder("product")
      .where("product.stockQty <= product.reorderLevel")
      .andWhere("product.isActive = :active", { active: true })
      .getCount();

    // Out of stock count
    const outOfStockCount = await repo
      .createQueryBuilder("product")
      .where("product.stockQty = 0")
      .andWhere("product.isActive = :active", { active: true })
      .getCount();

    return {
      status: true,
      data: {
        totalProducts,
        totalStockQty,
        totalValue,
        lowStockCount,
        outOfStockCount,
      },
    };
  }

  // @ts-ignore
  async getStockLevels(params) {
    const qb = await this.buildProductQuery(params);
    const [data, total] = await qb.getManyAndCount();

    return {
      status: true,
      data,
      total,
      page: params.page || 1,
      limit: params.limit || data.length,
    };
  }

  // @ts-ignore
  async getLowStockAlerts(params) {
    const repo = await this.getProductRepository();
    const qb = repo
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.category", "category")
      .leftJoinAndSelect("product.supplier", "supplier")
      .where("product.stockQty <= product.reorderLevel")
      .andWhere("product.isActive = :active", { active: true });

    if (params.categoryId) {
      qb.andWhere("product.categoryId = :categoryId", {
        categoryId: params.categoryId,
      });
    }
    if (params.supplierId) {
      qb.andWhere("product.supplierId = :supplierId", {
        supplierId: params.supplierId,
      });
    }

    qb.orderBy("product.stockQty", "ASC");

    // Pagination
    if (params.page && params.limit) {
      const skip = (params.page - 1) * params.limit;
      qb.skip(skip).take(params.limit);
    } else if (params.limit) {
      qb.take(params.limit);
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      status: true,
      data,
      total,
      page: params.page || 1,
      limit: params.limit || data.length,
    };
  }

  // @ts-ignore
  async getOutOfStock(params) {
    const repo = await this.getProductRepository();
    const qb = repo
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.category", "category")
      .leftJoinAndSelect("product.supplier", "supplier")
      .where("product.stockQty = 0")
      .andWhere("product.isActive = :active", { active: true });

    if (params.categoryId) {
      qb.andWhere("product.categoryId = :categoryId", {
        categoryId: params.categoryId,
      });
    }
    if (params.supplierId) {
      qb.andWhere("product.supplierId = :supplierId", {
        supplierId: params.supplierId,
      });
    }

    // Pagination
    if (params.page && params.limit) {
      const skip = (params.page - 1) * params.limit;
      qb.skip(skip).take(params.limit);
    } else if (params.limit) {
      qb.take(params.limit);
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      status: true,
      data,
      total,
      page: params.page || 1,
      limit: params.limit || data.length,
    };
  }

  // @ts-ignore
  async getInventoryMovements(params) {
    const qb = await this.buildMovementsQuery(params);
    const [data, total] = await qb.getManyAndCount();

    return {
      status: true,
      data,
      total,
      page: params.page || 1,
      limit: params.limit || data.length,
    };
  }

  // @ts-ignore
  async getProductStockHistory(params) {
    const { productId, ...rest } = params;
    if (!productId) {
      return { status: false, message: "Missing productId", data: null };
    }

    const qb = await this.buildMovementsQuery({ ...rest, productId });
    const [data, total] = await qb.getManyAndCount();

    return {
      status: true,
      data,
      total,
      page: rest.page || 1,
      limit: rest.limit || data.length,
    };
  }

  // @ts-ignore
  async getInventoryStats(params) {
    // Additional stats: top moving products, slow movers, etc.
    const connection = AppDataSource;
    if (!connection.isInitialized) await connection.initialize();

    // Top moving products by quantity change (sale movements)
    const topSelling = await connection
      .getRepository(InventoryMovement)
      .createQueryBuilder("movement")
      .leftJoin("movement.product", "product")
      .select("product.id", "productId")
      .addSelect("product.name", "productName")
      .addSelect("SUM(movement.qtyChange)", "totalSold")
      .where("movement.movementType = 'sale'")
      .andWhere("movement.qtyChange < 0") // sales are negative
      .groupBy("product.id")
      .orderBy("totalSold", "ASC") // most negative = most sold
      .limit(10)
      .getRawMany();

    // Convert totalSold to positive numbers
    topSelling.forEach(
      (item) => (item.totalSold = Math.abs(parseFloat(item.totalSold))),
    );

    // Most returned products
    const topReturned = await connection
      .getRepository(InventoryMovement)
      .createQueryBuilder("movement")
      .leftJoin("movement.product", "product")
      .select("product.id", "productId")
      .addSelect("product.name", "productName")
      .addSelect("SUM(movement.qtyChange)", "totalReturned")
      .where("movement.movementType = 'refund'")
      .andWhere("movement.qtyChange > 0") // refunds add stock
      .groupBy("product.id")
      .orderBy("totalReturned", "DESC")
      .limit(10)
      .getRawMany();

    // Movement summary by type
    const movementsByType = await connection
      .getRepository(InventoryMovement)
      .createQueryBuilder("movement")
      .select("movement.movementType", "type")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(movement.qtyChange)", "totalQtyChange")
      .groupBy("movement.movementType")
      .getRawMany();

    return {
      status: true,
      data: {
        topSelling,
        topReturned,
        movementsByType,
      },
    };
  }

  // @ts-ignore
  async exportInventoryReport(params) {
    // For CSV export, we can provide stock levels as flat array
    const qb = await this.buildProductQuery(params);
    qb.skip(undefined).take(undefined); // no limit for export
    const products = await qb.getMany();

    const flatData = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      // @ts-ignore
      category: p.category?.name || "",
      // @ts-ignore
      supplier: p.supplier?.name || "",
      price: p.price,
      stockQty: p.stockQty,
      reorderLevel: p.reorderLevel,
      reorderQty: p.reorderQty,
      isActive: p.isActive,
      createdAt: p.createdAt,
    }));

    return {
      status: true,
      data: flatData,
      format: "csv",
    };
  }

  // @ts-ignore
  async generateInventoryReport(params) {
    const summary = await this.getInventorySummary(params);
    const lowStock = await this.getLowStockAlerts(params);
    const outOfStock = await this.getOutOfStock(params);
    const movements = await this.getInventoryMovements({
      ...params,
      limit: 50,
    }); // recent 50
    const stats = await this.getInventoryStats(params);

    return {
      status: true,
      data: {
        summary: summary.data,
        lowStock: lowStock.data,
        outOfStock: outOfStock.data,
        recentMovements: movements.data,
        stats: stats.data,
        generatedAt: new Date().toISOString(),
        filters: params,
      },
    };
  }
}

// Register IPC handler
const inventoryReportsHandler = new InventoryReportsHandler();

ipcMain.handle(
  "inventoryReports",
  withErrorHandling(
    // @ts-ignore
    inventoryReportsHandler.handleRequest.bind(inventoryReportsHandler),
    "IPC:inventoryReports",
  ),
);

module.exports = { InventoryReportsHandler, inventoryReportsHandler };
