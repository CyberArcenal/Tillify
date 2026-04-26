// services/PurchaseService.js
const auditLogger = require("../utils/auditLogger");
const { validatePurchaseData } = require("../utils/purchaseUtils");

// 🔧 SETTINGS INTEGRATION: import needed settings getters
const {
  getNotifySupplierOnConfirmedWithEmail,
  getNotifySupplierOnConfirmedWithSms,
  getNotifySupplierOnCompleteWithEmail,
  getNotifySupplierOnCompleteWithSms,
  inventorySyncEnabled,
} = require("../utils/system");

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
   * Helper: get a repository (transactional if queryRunner provided)
   * @param {import("typeorm").QueryRunner | null} qr
   * @param {Function} entityClass
   * @returns {import("typeorm").Repository<any>}
   */
  _getRepo(qr, entityClass) {
    if (qr) {
      return qr.manager.getRepository(entityClass);
    }
    const { AppDataSource } = require("../main/db/datasource");
    return AppDataSource.getRepository(entityClass);
  }

  /**
   * Create a new purchase with items
   * @param {Object} purchaseData - Purchase data including items
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async create(purchaseData, user = "system", qr = null) {
    const { saveDb } = require("../utils/dbUtils/dbActions");
    const Purchase = require("../entities/Purchase");
    const Supplier = require("../entities/Supplier");
    const Product = require("../entities/Product");

    const purchaseRepo = this._getRepo(qr, Purchase);
    const supplierRepo = this._getRepo(qr, Supplier);
    const productRepo = this._getRepo(qr, Product);

    try {
      const validation = validatePurchaseData(purchaseData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "));
      }

      const {
        referenceNo,
        supplierId,
        orderDate = new Date(),
        status = "pending",
        items = [],
        notes,
      } = purchaseData;

      console.log(`Creating purchase: Reference ${referenceNo}`);

      const supplier = await supplierRepo.findOne({
        where: { id: supplierId },
      });
      if (!supplier) {
        throw new Error(`Supplier with ID ${supplierId} not found`);
      }

      if (referenceNo) {
        const existing = await purchaseRepo.findOne({ where: { referenceNo } });
        if (existing) {
          throw new Error(
            `Purchase with reference "${referenceNo}" already exists`
          );
        }
      }

      const purchaseItems = [];
      let totalAmount = 0;
      for (const item of items) {
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

      const savedPurchase = await saveDb(purchaseRepo, purchase);

      // Audit log (if inside transaction, use qr.manager)
      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "CREATE",
          entity: "Purchase",
          entityId: savedPurchase.id,
          user,
          description: `Created purchase ${savedPurchase.referenceNo}`,
        });
      } else {
        await auditLogger.logCreate(
          "Purchase",
          savedPurchase.id,
          savedPurchase,
          user
        );
      }

      console.log(
        `Purchase created: #${savedPurchase.id} - ${savedPurchase.referenceNo}`
      );

      // 🔧 SETTINGS INTEGRATION: Log if notifications would be sent
      if (status === "confirmed") {
        const emailNotif = await getNotifySupplierOnConfirmedWithEmail();
        const smsNotif = await getNotifySupplierOnConfirmedWithSms();
        console.log(
          `[SETTINGS] Would send confirmed notifications: email=${emailNotif}, sms=${smsNotif}`
        );
      }

      return savedPurchase;
    } catch (error) {
      console.error("Failed to create purchase:", error.message);
      throw error;
    }
  }

  /**
   * Update an existing purchase
   * @param {number} id - Purchase ID
   * @param {Object} purchaseData - Updated fields (items not allowed if completed)
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async update(id, purchaseData, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Purchase = require("../entities/Purchase");
    const Supplier = require("../entities/Supplier");
    const Product = require("../entities/Product");

    const purchaseRepo = this._getRepo(qr, Purchase);
    const supplierRepo = this._getRepo(qr, Supplier);
    const productRepo = this._getRepo(qr, Product);

    try {
      const existingPurchase = await purchaseRepo.findOne({
        where: { id },
        relations: ["supplier", "purchaseItems", "purchaseItems.product"],
      });
      if (!existingPurchase) {
        throw new Error(`Purchase with ID ${id} not found`);
      }

      if (existingPurchase.status === "completed") {
        throw new Error("Cannot update a completed purchase");
      }
      if (existingPurchase.status === "cancelled") {
        throw new Error("Cannot update a cancelled purchase");
      }

      const oldData = { ...existingPurchase };
      const oldStatus = existingPurchase.status;

      // Handle supplier change
      if (
        purchaseData.supplierId &&
        purchaseData.supplierId !== existingPurchase.supplier.id
      ) {
        const supplier = await supplierRepo.findOne({
          where: { id: purchaseData.supplierId },
        });
        if (!supplier) {
          throw new Error(
            `Supplier with ID ${purchaseData.supplierId} not found`
          );
        }
        existingPurchase.supplier = supplier;
      }

      // Handle reference change uniqueness
      if (
        purchaseData.referenceNo &&
        purchaseData.referenceNo !== existingPurchase.referenceNo
      ) {
        const existing = await purchaseRepo.findOne({
          where: { referenceNo: purchaseData.referenceNo },
        });
        if (existing) {
          throw new Error(
            `Purchase with reference "${purchaseData.referenceNo}" already exists`
          );
        }
        existingPurchase.referenceNo = purchaseData.referenceNo;
      }

      // Handle items update (only allowed for pending purchases)
      if (purchaseData.items) {
        if (existingPurchase.status !== "pending") {
          throw new Error("Can only update items for pending purchases");
        }

        const validation = validatePurchaseData({ items: purchaseData.items });
        if (!validation.valid) {
          throw new Error(validation.errors.join(", "));
        }

        // Remove old items
        if (
          existingPurchase.purchaseItems &&
          existingPurchase.purchaseItems.length > 0
        ) {
          existingPurchase.purchaseItems = [];
        }

        const newItems = [];
        let totalAmount = 0;
        for (const item of purchaseData.items) {
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

        existingPurchase.purchaseItems = newItems;
        existingPurchase.totalAmount = totalAmount;
      }

      if (purchaseData.orderDate)
        existingPurchase.orderDate = purchaseData.orderDate;
      if (purchaseData.notes !== undefined)
        existingPurchase.notes = purchaseData.notes;

      // Handle status change
      const newStatus = purchaseData.status;
      if (newStatus && newStatus !== oldStatus) {
        if (oldStatus === "cancelled") {
          throw new Error("Cannot change status of cancelled purchase");
        }
        if (oldStatus === "completed" && newStatus !== "completed") {
          throw new Error("Cannot revert completed purchase");
        }

        existingPurchase.status = newStatus;

        if (newStatus === "confirmed") {
          const emailNotif = await getNotifySupplierOnConfirmedWithEmail();
          const smsNotif = await getNotifySupplierOnConfirmedWithSms();
          console.log(
            `[SETTINGS] Would send confirmed notifications: email=${emailNotif}, sms=${smsNotif}`
          );
        }

        if (newStatus === "completed") {
          const syncEnabled = await inventorySyncEnabled();
          console.log(
            `[SETTINGS] Inventory sync enabled: ${syncEnabled}. Would update stock for ${existingPurchase.purchaseItems.length} items.`
          );

          const emailNotif = await getNotifySupplierOnCompleteWithEmail();
          const smsNotif = await getNotifySupplierOnCompleteWithSms();
          console.log(
            `[SETTINGS] Would send completed notifications: email=${emailNotif}, sms=${smsNotif}`
          );
        }
      }

      existingPurchase.updatedAt = new Date();
      const savedPurchase = await updateDb(purchaseRepo, existingPurchase);

      // Audit log
      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "UPDATE",
          entity: "Purchase",
          entityId: id,
          user,
          description: `Updated purchase #${id}`,
        });
      } else {
        await auditLogger.logUpdate(
          "Purchase",
          id,
          oldData,
          savedPurchase,
          user
        );
      }

      console.log(`Purchase updated: #${id}`);
      return savedPurchase;
    } catch (error) {
      console.error("Failed to update purchase:", error.message);
      throw error;
    }
  }

  /**
   * Soft delete a purchase (set status to cancelled)
   * @param {number} id - Purchase ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async delete(id, user = "system", qr = null) {
    const { updateDb } = require("../utils/dbUtils/dbActions");
    const Purchase = require("../entities/Purchase");
    const purchaseRepo = this._getRepo(qr, Purchase);

    try {
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

      const savedPurchase = await updateDb(purchaseRepo, purchase);

      if (qr) {
        const auditRepo = qr.manager.getRepository("AuditLog");
        await auditRepo.save({
          action: "DELETE",
          entity: "Purchase",
          entityId: id,
          user,
          description: `Cancelled purchase #${id}`,
        });
      } else {
        await auditLogger.logDelete("Purchase", id, oldData, user);
      }

      console.log(`Purchase cancelled: #${id}`);
      return savedPurchase;
    } catch (error) {
      console.error("Failed to delete purchase:", error.message);
      throw error;
    }
  }

  /**
   * Hard delete a purchase – only allowed if not yet completed or if no inventory impact?
   * @param {number} id - Purchase ID
   * @param {string} user - User performing the action
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async permanentlyDelete(id, user = "system", qr = null) {
    const { removeDb } = require("../utils/dbUtils/dbActions");
    const Purchase = require("../entities/Purchase");
    const purchaseRepo = this._getRepo(qr, Purchase);

    const purchase = await purchaseRepo.findOne({
      where: { id },
      relations: ["purchaseItems"],
    });
    if (!purchase) {
      throw new Error(`Purchase with ID ${id} not found`);
    }

    // Prevent hard delete if completed (because inventory may have been updated)
    if (purchase.status === "completed") {
      throw new Error("Cannot permanently delete a completed purchase");
    }

    await removeDb(purchaseRepo, purchase);

    if (qr) {
      const auditRepo = qr.manager.getRepository("AuditLog");
      await auditRepo.save({
        action: "DELETE",
        entity: "Purchase",
        entityId: id,
        user,
        description: `Permanently deleted purchase #${id}`,
      });
    } else {
      await auditLogger.logDelete("Purchase", id, purchase, user);
    }

    console.log(`Purchase #${id} permanently deleted`);
  }

  /**
   * Find purchase by ID
   * @param {number} id
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findById(id, qr = null) {
    const Purchase = require("../entities/Purchase");
    const purchaseRepo = this._getRepo(qr, Purchase);

    try {
      const purchase = await purchaseRepo.findOne({
        where: { id },
        relations: ["supplier", "purchaseItems", "purchaseItems.product"],
      });
      if (!purchase) {
        throw new Error(`Purchase with ID ${id} not found`);
      }

      await auditLogger.logView("Purchase", id, "system");
      return purchase;
    } catch (error) {
      console.error("Failed to find purchase:", error.message);
      throw error;
    }
  }

  /**
   * Find all purchases with optional filters
   * @param {Object} options - Filter options
   * @param {import("typeorm").QueryRunner | null} qr - Optional transaction query runner
   */
  async findAll(options = {}, qr = null) {
    const Purchase = require("../entities/Purchase");
    const purchaseRepo = this._getRepo(qr, Purchase);

    try {
      const queryBuilder = purchaseRepo
        .createQueryBuilder("purchase")
        .leftJoinAndSelect("purchase.supplier", "supplier")
        .leftJoinAndSelect("purchase.purchaseItems", "purchaseItems")
        .leftJoinAndSelect("purchaseItems.product", "product");

      if (options.status) {
        queryBuilder.andWhere("purchase.status = :status", {
          status: options.status,
        });
      }

      if (options.supplierId) {
        queryBuilder.andWhere("supplier.id = :supplierId", {
          supplierId: options.supplierId,
        });
      }

      if (options.startDate) {
        queryBuilder.andWhere("purchase.orderDate >= :startDate", {
          startDate: options.startDate,
        });
      }

      if (options.endDate) {
        queryBuilder.andWhere("purchase.orderDate <= :endDate", {
          endDate: options.endDate,
        });
      }

      if (options.search) {
        queryBuilder.andWhere("purchase.referenceNo LIKE :search", {
          search: `%${options.search}%`,
        });
      }

      const sortBy = options.sortBy || "orderDate";
      const sortOrder = options.sortOrder === "ASC" ? "ASC" : "DESC";
      queryBuilder.orderBy(`purchase.${sortBy}`, sortOrder);

      if (options.page && options.limit) {
        const offset = (options.page - 1) * options.limit;
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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async getStatistics(qr = null) {
    const Purchase = require("../entities/Purchase");
    const purchaseRepo = this._getRepo(qr, Purchase);

    try {
      const statusCounts = await purchaseRepo
        .createQueryBuilder("purchase")
        .select("purchase.status", "status")
        .addSelect("COUNT(purchase.id)", "count")
        .groupBy("purchase.status")
        .getRawMany();

      const totalCompleted = await purchaseRepo
        .createQueryBuilder("purchase")
        .select("SUM(purchase.totalAmount)", "total")
        .where("purchase.status = :status", { status: "completed" })
        .getRawOne();

      const avgAmount = await purchaseRepo
        .createQueryBuilder("purchase")
        .select("AVG(purchase.totalAmount)", "average")
        .where("purchase.status = :status", { status: "completed" })
        .getRawOne();

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
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async exportPurchases(
    format = "json",
    filters = {},
    user = "system",
    qr = null
  ) {
    try {
      const purchases = await this.findAll(filters, qr);

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
          p.supplier?.name || "",
          new Date(p.orderDate).toLocaleDateString(),
          p.status,
          p.totalAmount,
          p.notes || "",
          new Date(p.createdAt).toLocaleDateString(),
        ]);
        exportData = {
          format: "csv",
          data: [headers, ...rows].map((row) => row.join(",")).join("\n"),
          filename: `purchases_export_${
            new Date().toISOString().split("T")[0]
          }.csv`,
        };
      } else {
        exportData = {
          format: "json",
          data: purchases,
          filename: `purchases_export_${
            new Date().toISOString().split("T")[0]
          }.json`,
        };
      }

      await auditLogger.logExport("Purchase", format, filters, user);
      console.log(`Exported ${purchases.length} purchases in ${format} format`);
      return exportData;
    } catch (error) {
      console.error("Failed to export purchases:", error);
      throw error;
    }
  }

  /**
   * Bulk create multiple purchases
   * @param {Array<Object>} purchasesArray
   * @param {string} user
   * @param {import("typeorm").QueryRunner | null} qr
   */
  async bulkCreate(purchasesArray, user = "system", qr = null) {
    const results = { created: [], errors: [] };
    for (const purchaseData of purchasesArray) {
      try {
        const saved = await this.create(purchaseData, user, qr);
        results.created.push(saved);
      } catch (err) {
        results.errors.push({ purchase: purchaseData, error: err.message });
      }
    }
    return results;
  }

  /**
   * Bulk update multiple purchases
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
   * Import purchases from a CSV file
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
        // Parse items from a JSON string in CSV (e.g., "[{\"productId\":1,\"quantity\":10,\"unitPrice\":5.00}]")
        let items = [];
        if (record.items) {
          items = JSON.parse(record.items);
        }
        const purchaseData = {
          referenceNo: record.referenceNo || undefined,
          supplierId: parseInt(record.supplierId, 10),
          orderDate: record.orderDate ? new Date(record.orderDate) : new Date(),
          status: record.status || "pending",
          items: items,
          notes: record.notes || null,
        };
        const validation = validatePurchaseData(purchaseData);
        if (!validation.valid) throw new Error(validation.errors.join(", "));
        const saved = await this.create(purchaseData, user, qr);
        results.imported.push(saved);
      } catch (err) {
        results.errors.push({ row: record, error: err.message });
      }
    }
    return results;
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
