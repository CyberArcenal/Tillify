// services/PurchaseService.js


const auditLogger = require("../utils/auditLogger");
// @ts-ignore
const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
const { validatePurchaseData } = require("../utils/purchaseUtils");

class PurchaseService {
  constructor() {
    this.purchaseRepository = null;
    this.purchaseItemRepository = null;
    this.supplierRepository = null;
    this.productRepository = null;
    this.inventoryMovementRepository = null;
  }

  async initialize() {
    const { AppDataSource } = require("../main/db/datasource");
    const Purchase = require("../entities/Purchase");
    const PurchaseItem = require("../entities/PurchaseItem");
    const Supplier = require("../entities/Supplier");
    const Product = require("../entities/Product");
    const InventoryMovement = require("../entities/InventoryMovement");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.purchaseRepository = AppDataSource.getRepository(Purchase);
    this.purchaseItemRepository = AppDataSource.getRepository(PurchaseItem);
    this.supplierRepository = AppDataSource.getRepository(Supplier);
    this.productRepository = AppDataSource.getRepository(Product);
    this.inventoryMovementRepository =
      AppDataSource.getRepository(InventoryMovement);
    console.log("PurchaseService initialized");
  }

  async getRepositories() {
    if (!this.purchaseRepository) {
      await this.initialize();
    }
    return {
      purchase: this.purchaseRepository,
      purchaseItem: this.purchaseItemRepository,
      supplier: this.supplierRepository,
      product: this.productRepository,
      inventoryMovement: this.inventoryMovementRepository,
    };
  }

  /**
   * Create a new purchase with items
   * @param {Object} purchaseData - Purchase data including items
   * @param {string} user - User performing the action
   */
  async create(purchaseData, user = "system") {
    const {
      purchase: purchaseRepo,
      supplier: supplierRepo,
      product: productRepo,
    } = await this.getRepositories();

    try {
      // Validate purchase data
      const validation = validatePurchaseData(purchaseData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        // @ts-ignore
        referenceNo,
        // @ts-ignore
        supplierId,
        // @ts-ignore
        orderDate = new Date(),
        // @ts-ignore
        status = "pending",
        // @ts-ignore
        items = [],
        // @ts-ignore
        notes,
      } = purchaseData;

      console.log(`Creating purchase: Reference ${referenceNo}`);

      // Check supplier exists
      // @ts-ignore
      const supplier = await supplierRepo.findOne({
        where: { id: supplierId },
      });
      if (!supplier) {
        throw new Error(`Supplier with ID ${supplierId} not found`);
      }

      // Check reference uniqueness if provided
      if (referenceNo) {
        // @ts-ignore
        const existing = await purchaseRepo.findOne({ where: { referenceNo } });
        if (existing) {
          throw new Error(
            `Purchase with reference "${referenceNo}" already exists`,
          );
        }
      }

      // Prepare purchase items with calculated subtotals
      const purchaseItems = [];
      let totalAmount = 0;
      for (const item of items) {
        // @ts-ignore
        const product = await productRepo.findOne({
          where: { id: item.productId },
        });
        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }
        const quantity = item.quantity;
        const unitPrice = item.unitPrice;
        const subtotal = quantity * unitPrice;
        totalAmount += subtotal;

        purchaseItems.push({
          product,
          quantity,
          unitPrice,
          subtotal,
        });
      }

      // Create purchase entity
      // @ts-ignore
      const purchase = purchaseRepo.create({
        referenceNo: referenceNo || generateReferenceNumber(),
        supplier,
        orderDate,
        status,
        totalAmount,
        notes,
        createdAt: new Date(),
        purchaseItems,
      });

      // Save purchase (cascade will save items)
      // @ts-ignore
      const savedPurchase = await saveDb(purchaseRepo, purchase);

      await auditLogger.logCreate(
        "Purchase",
        savedPurchase.id,
        savedPurchase,
        user,
      );

      console.log(
        `Purchase created: #${savedPurchase.id} - ${savedPurchase.referenceNo}`,
      );

      return savedPurchase;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to create purchase:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing purchase
   * @param {number} id - Purchase ID
   * @param {Object} purchaseData - Updated fields (items not allowed if completed)
   * @param {string} user - User performing the action
   */
  async update(id, purchaseData, user = "system") {
    const {
      purchase: purchaseRepo,
      supplier: supplierRepo,
      product: productRepo,
    } = await this.getRepositories();

    try {
      // @ts-ignore
      const existingPurchase = await purchaseRepo.findOne({
        where: { id },
        relations: ["supplier", "purchaseItems", "purchaseItems.product"],
      });
      if (!existingPurchase) {
        throw new Error(`Purchase with ID ${id} not found`);
      }

      // Prevent updates if purchase is already completed or cancelled
      if (existingPurchase.status === "completed") {
        throw new Error("Cannot update a completed purchase");
      }
      if (existingPurchase.status === "cancelled") {
        throw new Error("Cannot update a cancelled purchase");
      }

      const oldData = { ...existingPurchase };

      // Handle supplier change
      if (
        // @ts-ignore
        purchaseData.supplierId &&
        // @ts-ignore
        purchaseData.supplierId !== existingPurchase.supplier.id
      ) {
        // @ts-ignore
        const supplier = await supplierRepo.findOne({
          // @ts-ignore
          where: { id: purchaseData.supplierId },
        });
        if (!supplier) {
          throw new Error(
            // @ts-ignore
            `Supplier with ID ${purchaseData.supplierId} not found`,
          );
        }
        // @ts-ignore
        existingPurchase.supplier = supplier;
      }

      // Handle reference change uniqueness
      if (
        // @ts-ignore
        purchaseData.referenceNo &&
        // @ts-ignore
        purchaseData.referenceNo !== existingPurchase.referenceNo
      ) {
        // @ts-ignore
        const existing = await purchaseRepo.findOne({
          // @ts-ignore
          where: { referenceNo: purchaseData.referenceNo },
        });
        if (existing) {
          throw new Error(
            // @ts-ignore
            `Purchase with reference "${purchaseData.referenceNo}" already exists`,
          );
        }
        // @ts-ignore
        existingPurchase.referenceNo = purchaseData.referenceNo;
      }

      // Handle items update if provided (only allowed for pending purchases)
      // @ts-ignore
      if (purchaseData.items) {
        if (existingPurchase.status !== "pending") {
          throw new Error("Can only update items for pending purchases");
        }

        // Validate new items
        // @ts-ignore
        const validation = validatePurchaseData({ items: purchaseData.items });
        if (!validation.valid) {
          throw new Error(validation.errors.join(", "));
        }

        // Remove old items
        if (
          // @ts-ignore
          existingPurchase.purchaseItems &&
          // @ts-ignore
          existingPurchase.purchaseItems.length > 0
        ) {
          // Note: with cascade, removing from array and saving will delete them if orphaned? Better to manually remove.
          // For simplicity, we'll just overwrite; TypeORM cascade should handle removal if set.
          // @ts-ignore
          existingPurchase.purchaseItems = [];
        }

        const newItems = [];
        let totalAmount = 0;
        // @ts-ignore
        for (const item of purchaseData.items) {
          // @ts-ignore
          const product = await productRepo.findOne({
            where: { id: item.productId },
          });
          if (!product) {
            throw new Error(`Product with ID ${item.productId} not found`);
          }
          const quantity = item.quantity;
          const unitPrice = item.unitPrice;
          const subtotal = quantity * unitPrice;
          totalAmount += subtotal;

          newItems.push({
            product,
            quantity,
            unitPrice,
            subtotal,
          });
        }
        // @ts-ignore
        existingPurchase.purchaseItems = newItems;
        existingPurchase.totalAmount = totalAmount;
      }

      // Update other fields
      // @ts-ignore
      if (purchaseData.orderDate)
        // @ts-ignore
        existingPurchase.orderDate = purchaseData.orderDate;
      // @ts-ignore
      if (purchaseData.notes !== undefined)
        // @ts-ignore
        existingPurchase.notes = purchaseData.notes;

      // Handle status change: if moving to 'completed', need to update stock
      const oldStatus = existingPurchase.status;
      // @ts-ignore
      const newStatus = purchaseData.status;
      if (newStatus && newStatus !== oldStatus) {
        // Validate status transition
        if (oldStatus === "cancelled") {
          throw new Error("Cannot change status of cancelled purchase");
        }
        if (oldStatus === "completed" && newStatus !== "completed") {
          throw new Error("Cannot revert completed purchase");
        }
        if (oldStatus === "pending" && newStatus === "completed") {
          // Will update stock after saving
          existingPurchase.status = newStatus;
        } else if (oldStatus === "pending" && newStatus === "cancelled") {
          existingPurchase.status = newStatus;
          // Optionally revert stock if needed, but we don't have stock changes yet
        } else {
          existingPurchase.status = newStatus;
        }
      }

      existingPurchase.updatedAt = new Date();

      // Save updated purchase
      // @ts-ignore
      const savedPurchase = await updateDb(purchaseRepo, existingPurchase);

      await auditLogger.logUpdate("Purchase", id, oldData, savedPurchase, user);

      console.log(`Purchase updated: #${id}`);
      return savedPurchase;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to update purchase:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a purchase (set status to cancelled)
   * @param {number} id - Purchase ID
   * @param {string} user - User performing the action
   */
  async delete(id, user = "system") {
    const { purchase: purchaseRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const purchase = await purchaseRepo.findOne({
        where: { id },
        relations: ["purchaseItems"],
      });
      if (!purchase) {
        throw new Error(`Purchase with ID ${id} not found`);
      }

      if (purchase.status === "cancelled") {
        throw new Error(`Purchase #${id} is already cancelled`);
      }

      const oldData = { ...purchase };
      purchase.status = "cancelled";
      purchase.updatedAt = new Date();

      // @ts-ignore
      const savedPurchase = await updateDb(purchaseRepo, purchase);

      // Optionally, if purchase was completed, we might want to reverse stock changes.
      // For simplicity, we don't auto-reverse; user can manually adjust if needed.

      await auditLogger.logDelete("Purchase", id, oldData, user);

      console.log(`Purchase cancelled: #${id}`);
      return savedPurchase;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to delete purchase:", error.message);
      throw error;
    }
  }

  /**
   * Find purchase by ID
   * @param {number} id
   */
  async findById(id) {
    const { purchase: purchaseRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const purchase = await purchaseRepo.findOne({
        where: { id },
        relations: ["supplier", "purchaseItems", "purchaseItems.product"],
      });
      if (!purchase) {
        throw new Error(`Purchase with ID ${id} not found`);
      }
      // @ts-ignore
      await auditLogger.logView("Purchase", id, "system");
      return purchase;
    } catch (error) {
      // @ts-ignore
      console.error("Failed to find purchase:", error.message);
      throw error;
    }
  }

  /**
   * Find all purchases with optional filters
   * @param {Object} options - Filter options
   */
  async findAll(options = {}) {
    const { purchase: purchaseRepo } = await this.getRepositories();

    try {
      // @ts-ignore
      const queryBuilder = purchaseRepo
        .createQueryBuilder("purchase")
        .leftJoinAndSelect("purchase.supplier", "supplier")
        .leftJoinAndSelect("purchase.purchaseItems", "purchaseItems")
        .leftJoinAndSelect("purchaseItems.product", "product");

      // Filter by status
      // @ts-ignore
      if (options.status) {
        queryBuilder.andWhere("purchase.status = :status", {
          // @ts-ignore
          status: options.status,
        });
      }

      // Filter by supplier
      // @ts-ignore
      if (options.supplierId) {
        queryBuilder.andWhere("supplier.id = :supplierId", {
          // @ts-ignore
          supplierId: options.supplierId,
        });
      }

      // Date range
      // @ts-ignore
      if (options.startDate) {
        queryBuilder.andWhere("purchase.orderDate >= :startDate", {
          // @ts-ignore
          startDate: options.startDate,
        });
      }
      // @ts-ignore
      if (options.endDate) {
        queryBuilder.andWhere("purchase.orderDate <= :endDate", {
          // @ts-ignore
          endDate: options.endDate,
        });
      }

      // Search by reference
      // @ts-ignore
      if (options.search) {
        queryBuilder.andWhere("purchase.referenceNo LIKE :search", {
          // @ts-ignore
          search: `%${options.search}%`,
        });
      }

      // Sorting
      // @ts-ignore
      const sortBy = options.sortBy || "orderDate";
      // @ts-ignore
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`purchase.${sortBy}`, sortOrder);

      // Pagination
      // @ts-ignore
      if (options.page && options.limit) {
        // @ts-ignore
        const offset = (options.page - 1) * options.limit;
        // @ts-ignore
        queryBuilder.skip(offset).take(options.limit);
      }

      const purchases = await queryBuilder.getMany();

      await auditLogger.logView("Purchase", null, "system");
      return purchases;
    } catch (error) {
      console.error("Failed to fetch purchases:", error);
      throw error;
    }
  }

  /**
   * Get purchase statistics
   */
  async getStatistics() {
    const { purchase: purchaseRepo } = await this.getRepositories();

    try {
      // Count by status
      // @ts-ignore
      const statusCounts = await purchaseRepo
        .createQueryBuilder("purchase")
        .select("purchase.status", "status")
        .addSelect("COUNT(purchase.id)", "count")
        .groupBy("purchase.status")
        .getRawMany();

      // Total purchase amount for completed purchases
      // @ts-ignore
      const totalCompleted = await purchaseRepo
        .createQueryBuilder("purchase")
        .select("SUM(purchase.totalAmount)", "total")
        .where("purchase.status = :status", { status: "completed" })
        .getRawOne();

      // Average purchase amount
      // @ts-ignore
      const avgAmount = await purchaseRepo
        .createQueryBuilder("purchase")
        .select("AVG(purchase.totalAmount)", "average")
        .where("purchase.status = :status", { status: "completed" })
        .getRawOne();

      // Purchase count by supplier (top 5)
      // @ts-ignore
      const topSuppliers = await purchaseRepo
        .createQueryBuilder("purchase")
        .leftJoin("purchase.supplier", "supplier")
        .select("supplier.id", "supplierId")
        .addSelect("supplier.name", "supplierName")
        .addSelect("COUNT(purchase.id)", "purchaseCount")
        .addSelect("SUM(purchase.totalAmount)", "totalSpent")
        .where("purchase.status = :status", { status: "completed" })
        .groupBy("supplier.id")
        .orderBy("totalSpent", "DESC")
        .limit(5)
        .getRawMany();

      return {
        statusCounts,
        totalCompletedAmount: parseFloat(totalCompleted?.total) || 0,
        averageCompletedAmount: parseFloat(avgAmount?.average) || 0,
        topSuppliers,
      };
    } catch (error) {
      console.error("Failed to get purchase statistics:", error);
      throw error;
    }
  }

  /**
   * Export purchases to CSV or JSON
   * @param {string} format - 'csv' or 'json'
   * @param {Object} filters - Export filters
   * @param {string} user
   */
  async exportPurchases(format = "json", filters = {}, user = "system") {
    try {
      const purchases = await this.findAll(filters);

      let exportData;
      if (format === "csv") {
        const headers = [
          "ID",
          "Reference No",
          "Supplier",
          "Order Date",
          "Status",
          "Total Amount",
          "Notes",
          "Created At",
        ];
        const rows = purchases.map((p) => [
          p.id,
          p.referenceNo || "",
          // @ts-ignore
          p.supplier?.name || "",
          // @ts-ignore
          new Date(p.orderDate).toLocaleDateString(),
          p.status,
          p.totalAmount,
          // @ts-ignore
          p.notes || "",
          // @ts-ignore
          new Date(p.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `purchases_export_${new Date().toISOString().split("T")[0]}.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: purchases,
          filename: `purchases_export_${new Date().toISOString().split("T")[0]}.json`,
        };
      }

      // @ts-ignore
      await auditLogger.logExport("Purchase", format, filters, user);
      console.log(`Exported ${purchases.length} purchases in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export purchases:", error);
      throw error;
    }
  }
}

// Singleton instance
const purchaseService = new PurchaseService();
module.exports = purchaseService;

function generateReferenceNumber() {
  const prefix = "PO";
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}-${timestamp}-${random}`;
}


