// src/services/SaleStateTransitionService.js

const Product = require("../entities/Product");
const Customer = require("../entities/Customer");
const InventoryMovement = require("../entities/InventoryMovement");
const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
const auditLogger = require("../utils/auditLogger");
const Sale = require("../entities/Sale");
// @ts-ignore
// @ts-ignore
// @ts-ignore
const { SystemSetting, SettingType } = require("../entities/systemSettings");
const PrinterService = require("../services/PrinterService");
const CashDrawerService = require("../services/CashDrawerService");
const PurchaseItem = require("../entities/PurchaseItem");
const Purchase = require("../entities/Purchase");
// 🔧 SETTINGS INTEGRATION: import all needed settings
const {
  getLoyaltyPointRate,
  loyaltyPointsEnabled,
  enableReceiptPrinting,
  enableCashDrawer,
  autoReorderEnabled,
  // Maaaring magdagdag ng settings para sa customer status thresholds at lifetime rate
  // loyaltyLifetimeRate, vipThreshold, eliteThreshold
} = require("../utils/system");
const { logger } = require("../utils/logger"); // ipagpalagay na may logger
const notificationService = require("../services/NotificationService");

class SaleStateTransitionService {
  /**
   * @param {{ getRepository: (arg0: import("typeorm").EntitySchema<{ id: unknown; sku: unknown; name: unknown; description: unknown; price: unknown; stockQty: unknown; reorderLevel: unknown; reorderQty: unknown; isActive: unknown; createdAt: unknown; updatedAt: unknown; }> | import("typeorm").EntitySchema<{ id: unknown; name: unknown; contactInfo: unknown; loyaltyPointsBalance: unknown; createdAt: unknown; updatedAt: unknown; }> | import("typeorm").EntitySchema<{ id: unknown; movementType: unknown; qtyChange: unknown; timestamp: unknown; notes: unknown; updatedAt: unknown; }> | import("typeorm").EntitySchema<{ id: unknown; pointsChange: unknown; timestamp: unknown; notes: unknown; updatedAt: unknown; }>) => any; }} dataSource
   */
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.productRepo = dataSource.getRepository(Product);
    this.customerRepo = dataSource.getRepository(Customer);
    this.movementRepo = dataSource.getRepository(InventoryMovement);
    this.loyaltyRepo = dataSource.getRepository(LoyaltyTransaction);
  }

  /**
   * Handle side effects when a sale becomes 'paid'
   * @param {Sale} sale - The sale entity (already persisted)
   */
  async onPay(sale) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const saleRepo = this.dataSource.getRepository(Sale);

    // Reload sale with items and products
    const hydratedSale = await saleRepo.findOne({
      // @ts-ignore
      where: { id: sale.id },
      relations: ["saleItems", "saleItems.product", "customer"],
    });

    if (!hydratedSale) {
      // @ts-ignore
      throw new Error(`Sale #${sale.id} not found for hydration`);
    }

    logger.info(`[Transition] Processing paid sale #${hydratedSale.id}`);

    // Audit sale status change
    await auditLogger.logUpdate(
      "Sale",
      hydratedSale.id,
      { status: "initiated" },
      { status: "paid" },
      "system",
    );

    // 1. Decrease stock for each sold item
    for (const item of hydratedSale.saleItems) {
      const product = item.product;
      const oldStock = product.stockQty;
      product.stockQty -= item.quantity;
      product.updatedAt = new Date();
      await updateDb(this.productRepo, product);

      const movement = this.movementRepo.create({
        movementType: "sale",
        qtyChange: -item.quantity,
        notes: `Sale #${hydratedSale.id}`,
        product,
        sale: hydratedSale,
        timestamp: new Date(),
      });
      await saveDb(this.movementRepo, movement);

      await auditLogger.logUpdate(
        "Product",
        product.id,
        { stockQty: oldStock },
        { stockQty: product.stockQty },
        "system",
      );
    }

    // 🔧 SETTINGS INTEGRATION: Auto-reorder kung enabled
    const autoReorder = await autoReorderEnabled();
    if (autoReorder) {
      for (const item of hydratedSale.saleItems) {
        const product = item.product;
        // Kung ang stock ay umabot o bumaba sa reorder level, mag-create ng purchase
        if (product.stockQty <= product.reorderLevel) {
          await this.reOrder(product);
        }

        if (product.stockQty <= product.reorderLevel) {
          // Mag-notify ng low stock (kung hindi pa nagawa sa ibang pagkakataon)
          await this.notifyLowStock(product, item.quantity);
        }
      }
    }

    // 2. Handle loyalty points (kung enabled)
    // 🔧 SETTINGS INTEGRATION: suriin kung enabled ang loyalty
    const loyaltyEnabled = await loyaltyPointsEnabled();
    if (loyaltyEnabled && hydratedSale.customer) {
      const rate = await getLoyaltyPointRate();
      // 🔧 SETTINGS INTEGRATION: lifetime rate ay pwedeng gawing setting
      // Para sa ngayon, panatilihin muna ang hardcoded value
      const lifetimeRate = 50; // 1 point per ₱50 spend
      const subtotal = hydratedSale.saleItems.reduce(
        // @ts-ignore
        (sum, item) => sum + item.lineTotal,
        0,
      );

      // Only earn points on net cash portion
      const netCashSpend = subtotal - (hydratedSale.loyaltyRedeemed || 0);
      const pointsEarned = Math.floor(netCashSpend / rate);
      const lifetimePointsEarned = Math.floor(netCashSpend / lifetimeRate);
      hydratedSale.pointsEarn = pointsEarned;
      hydratedSale.updatedAt = new Date();
      await updateDb(saleRepo, hydratedSale);

      if (pointsEarned > 0) {
        const customer = await this.customerRepo.findOne({
          where: { id: hydratedSale.customer.id },
        });
        if (customer) {
          const oldBalance = customer.loyaltyPointsBalance;
          customer.loyaltyPointsBalance += pointsEarned;
          customer.lifetimePointsEarned += lifetimePointsEarned;
          customer.status = this.determineCustomerStatus(customer);
          customer.updatedAt = new Date();
          await updateDb(this.customerRepo, customer);

          const loyaltyTx = this.loyaltyRepo.create({
            pointsChange: pointsEarned,
            transactionType: "earn",
            notes: `Sale #${hydratedSale.id}`,
            customer,
            sale: hydratedSale,
            timestamp: new Date(),
          });
          await saveDb(this.loyaltyRepo, loyaltyTx);

          await auditLogger.logUpdate(
            "Customer",
            customer.id,
            { loyaltyPointsBalance: oldBalance },
            { loyaltyPointsBalance: customer.loyaltyPointsBalance },
            "system",
          );
        }
      }
    }

    // 3. Check and deduct loyalty (kung may na-redeem)
    await this.checkAndDeductLoyalty(hydratedSale);

    // 4. Print receipt (kung enabled)
    // 🔧 SETTINGS INTEGRATION: suriin kung enabled ang receipt printing
    const printEnabled = await enableReceiptPrinting();
    if (printEnabled) {
      try {
        const printer = new PrinterService();
        await printer.printReceipt(hydratedSale.id);

        // @ts-ignore
        await auditLogger.log({
          action: "EVENT",
          entity: "Printer",
          entityId: hydratedSale.id,
          description: "Receipt printed successfully",
          user: "system",
        });
      } catch (err) {
        // @ts-ignore
        await auditLogger.log({
          action: "EVENT",
          entity: "Printer",
          entityId: hydratedSale.id,
          // @ts-ignore
          description: `Receipt print failed: ${err.message}`,
          user: "system",
        });
      }
    }

    // 5. Open cash drawer (kung cash payment at enabled)
    // 🔧 SETTINGS INTEGRATION: suriin kung enabled ang cash drawer
    const drawerEnabled = await enableCashDrawer();
    if (drawerEnabled && hydratedSale.paymentMethod === "cash") {
      try {
        const drawer = new CashDrawerService();
        await drawer.openDrawer("sale");

        // @ts-ignore
        await auditLogger.log({
          action: "EVENT",
          entity: "CashDrawer",
          entityId: hydratedSale.id,
          description: "Cash drawer opened successfully",
          user: "system",
        });
      } catch (err) {
        // @ts-ignore
        await auditLogger.log({
          action: "EVENT",
          entity: "CashDrawer",
          entityId: hydratedSale.id,
          // @ts-ignore
          description: `Cash drawer open failed: ${err.message}`,
          user: "system",
        });
      }
    }

    logger.info(`[Transition] Completed paid sale #${hydratedSale.id}`);
  }

  /**
   * Handle side effects when a sale is refunded
   * @param {Sale} sale
   */
  async onRefund(sale) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    // @ts-ignore
    logger.info(`[Transition] Processing refunded sale #${sale.id}`);

    // 1. Restore stock for each sold item
    // @ts-ignore
    for (const item of sale.saleItems) {
      const product = item.product;
      const oldStock = product.stockQty;
      product.stockQty += item.quantity;
      product.updatedAt = new Date();
      await updateDb(this.productRepo, product);

      const movement = this.movementRepo.create({
        movementType: "refund",
        qtyChange: item.quantity,
        // @ts-ignore
        notes: `Refund sale #${sale.id}`,
        product,
        sale,
        timestamp: new Date(),
      });
      await saveDb(this.movementRepo, movement);

      await auditLogger.logUpdate(
        "Product",
        product.id,
        { stockQty: oldStock },
        { stockQty: product.stockQty },
        "system",
      );
    }

    // 2. Reverse loyalty points if any (kung enabled)
    // 🔧 SETTINGS INTEGRATION: suriin kung enabled ang loyalty bago mag-reverse
    const loyaltyEnabled = await loyaltyPointsEnabled();
    // @ts-ignore
    if (loyaltyEnabled && sale.customer) {
      const loyaltyTxs = await this.loyaltyRepo.find({
        // @ts-ignore
        where: { sale: { id: sale.id } },
      });
      for (const tx of loyaltyTxs) {
        const customer = await this.customerRepo.findOne({
          // @ts-ignore
          where: { id: sale.customer.id },
        });
        if (customer) {
          const oldBalance = customer.loyaltyPointsBalance;
          customer.loyaltyPointsBalance -= tx.pointsChange;
          customer.updatedAt = new Date();
          await updateDb(this.customerRepo, customer);

          // Record reversal
          const reversal = this.loyaltyRepo.create({
            pointsChange: -tx.pointsChange,
            transactionType: "refund",
            // @ts-ignore
            notes: `Reversal of refunded sale #${sale.id}`,
            customer,
            sale,
            timestamp: new Date(),
          });
          await saveDb(this.loyaltyRepo, reversal);

          await auditLogger.logUpdate(
            "Customer",
            customer.id,
            { loyaltyPointsBalance: oldBalance },
            { loyaltyPointsBalance: customer.loyaltyPointsBalance },
            "system",
          );
        }
      }
    }

    // @ts-ignore
    logger.info(`[Transition] Completed refunded sale #${sale.id}`);
  }

  /**
   * Handle side effects when a sale is voided/cancelled
   * @param {Sale} sale
   */
  async onCancel(sale) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    // @ts-ignore
    logger.info(`[Transition] Processing voided sale #${sale.id}`);

    // Restore stock and record adjustment
    // @ts-ignore
    for (const item of sale.saleItems) {
      const product = item.product;
      const oldStock = product.stockQty;
      product.stockQty += item.quantity;
      product.updatedAt = new Date();
      await updateDb(this.productRepo, product);

      const movement = this.movementRepo.create({
        movementType: "adjustment",
        qtyChange: item.quantity,
        // @ts-ignore
        notes: `Void sale #${sale.id}`,
        product,
        sale,
        timestamp: new Date(),
      });
      await saveDb(this.movementRepo, movement);

      await auditLogger.logUpdate(
        "Product",
        product.id,
        { stockQty: oldStock },
        { stockQty: product.stockQty },
        "system",
      );
    }

    // Reverse loyalty if any (kung enabled)
    // 🔧 SETTINGS INTEGRATION: suriin kung enabled ang loyalty
    const loyaltyEnabled = await loyaltyPointsEnabled();
    // @ts-ignore
    if (loyaltyEnabled && sale.customer) {
      const loyaltyTxs = await this.loyaltyRepo.find({
        // @ts-ignore
        where: { sale: { id: sale.id } },
      });
      for (const tx of loyaltyTxs) {
        const customer = await this.customerRepo.findOne({
          // @ts-ignore
          where: { id: sale.customer.id },
        });
        if (customer) {
          const oldBalance = customer.loyaltyPointsBalance;
          customer.loyaltyPointsBalance -= tx.pointsChange;
          customer.updatedAt = new Date();
          await updateDb(this.customerRepo, customer);

          const reversal = this.loyaltyRepo.create({
            pointsChange: -tx.pointsChange,
            transactionType: "void",
            // @ts-ignore
            notes: `Reversal of voided sale #${sale.id}`,
            customer,
            sale,
            timestamp: new Date(),
          });
          await saveDb(this.loyaltyRepo, reversal);

          await auditLogger.logUpdate(
            "Customer",
            customer.id,
            { loyaltyPointsBalance: oldBalance },
            { loyaltyPointsBalance: customer.loyaltyPointsBalance },
            "system",
          );
        }
      }
    }

    // @ts-ignore
    logger.info(`[Transition] Completed voided sale #${sale.id}`);
  }

  /**
   * Auto-create purchase if stock reaches reorder level
   * @param {{ supplier: any; reorderLevel: number; reorderQty: number; stockQty: number; id: any; price: any; sku: any; }} product
   */
  async reOrder(product) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    // 🔧 SETTINGS INTEGRATION: suriin muli kung enabled ang auto reorder (redundant pero safe)
    const autoReorder = await autoReorderEnabled();
    if (!autoReorder) return;

    try {
      const purchaseRepo = this.dataSource.getRepository(Purchase);
      const purchaseItemRepo = this.dataSource.getRepository(PurchaseItem);

      // Only proceed if product has a supplier, reorderLevel > 0, and reorderQty > 0
      if (
        product.supplier &&
        product.reorderLevel > 0 &&
        product.reorderQty > 0 &&
        product.stockQty <= product.reorderLevel
      ) {
        // Check if there's already a pending purchase for this product
        const existingPending = await purchaseRepo
          .createQueryBuilder("purchase")
          .innerJoin("purchase.purchaseItems", "item")
          .where("purchase.status = :status", { status: "pending" })
          .andWhere("item.productId = :productId", { productId: product.id })
          .getOne();

        if (!existingPending) {
          // Generate a simple reference number (you may replace with a more robust generator)
          const referenceNo = `PO-${Date.now()}-${product.id}`;

          // Create purchase entity
          const purchase = purchaseRepo.create({
            referenceNo,
            supplier: product.supplier,
            status: "pending",
            orderDate: new Date(),
            totalAmount: 0, // will update after item is added
          });

          // Save purchase first to get an ID
          const savedPurchase = await saveDb(purchaseRepo, purchase);

          // Create purchase item
          const unitPrice = product.price; // using current selling price; adjust if you have cost price
          const subtotal = unitPrice * product.reorderQty;

          const purchaseItem = purchaseItemRepo.create({
            quantity: product.reorderQty,
            unitPrice,
            subtotal,
            purchase: savedPurchase,
            product,
          });

          await saveDb(purchaseItemRepo, purchaseItem);

          // Update purchase totalAmount
          savedPurchase.totalAmount = subtotal;
          await updateDb(purchaseRepo, savedPurchase);

          logger.info(
            `[AutoPurchase] Created purchase #${savedPurchase.id} for product ${product.sku} (Qty: ${product.reorderQty})`,
          );

          try {
            // TODO: palitan ang userId ng actual na user IDs (e.g., lahat ng admin)
            await notificationService.create(
              {
                userId: 1, // pansamantala
                title: "Auto‑Reorder Created",
                // @ts-ignore
                message: `Product "${product.name}" (SKU: ${product.sku}) has reached reorder level. A new purchase order #${savedPurchase.referenceNo} has been automatically created.`,
                type: "purchase", // puwedeng gumamit ng "warning" o "info"
                metadata: {
                  productId: product.id,
                  purchaseId: savedPurchase.id,
                  referenceNo: savedPurchase.referenceNo,
                  reorderQty: product.reorderQty,
                },
              },
              "system",
            );
          } catch (notifError) {
            logger.error(
              `Failed to create in-app notification for auto-reorder of product ${product.id}`,
              // @ts-ignore
              notifError,
            );
          }
        } else {
          logger.info(
            `[AutoPurchase] Pending purchase already exists for product ${product.sku}, skipping.`,
          );
        }
      }
    } catch (purchaseError) {
      // Log error but do not interrupt the sale transition
      logger.error(
        `[AutoPurchase] Failed to create purchase for product ${product.id}:`,
        // @ts-ignore
        purchaseError,
      );
      // @ts-ignore
      throw new Error("Unable To Create Order.");
    }
  }

  /**
   * @param {{ usedLoyalty: any; loyaltyRedeemed: number; customer: { id: any; }; id: any; }} hydratedSale
   */
  async checkAndDeductLoyalty(hydratedSale) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    // 🔧 SETTINGS INTEGRATION: suriin kung enabled ang loyalty
    const loyaltyEnabled = await loyaltyPointsEnabled();
    if (!loyaltyEnabled) return;

    if (hydratedSale.usedLoyalty && hydratedSale.loyaltyRedeemed > 0) {
      const customer = await this.customerRepo.findOne({
        where: { id: hydratedSale.customer.id },
      });
      if (customer) {
        const oldBalance = customer.loyaltyPointsBalance;
        customer.loyaltyPointsBalance -= hydratedSale.loyaltyRedeemed;
        await updateDb(this.customerRepo, customer);

        const loyaltyTx = this.loyaltyRepo.create({
          pointsChange: -hydratedSale.loyaltyRedeemed,
          transactionType: "redeem",
          notes: `Redeemed on Sale #${hydratedSale.id}`,
          customer,
          sale: hydratedSale,
          timestamp: new Date(),
        });
        await saveDb(this.loyaltyRepo, loyaltyTx);

        await auditLogger.logUpdate(
          "Customer",
          customer.id,
          { loyaltyPointsBalance: oldBalance },
          { loyaltyPointsBalance: customer.loyaltyPointsBalance },
          "system",
        );
      }
    }
  }
  // @ts-ignore
  async notifyLowStock(product, soldQty) {
    // @ts-ignore
    // Pero kung gusto mo talaga ng low stock alert, gawin ito.
    try {
      await notificationService.create(
        {
          userId: 1,
          title: "Low Stock Alert",
          message: `Product "${product.name}" (SKU: ${product.sku}) is now low on stock. Current stock: ${product.stockQty}, Reorder level: ${product.reorderLevel}.`,
          type: "warning",
          metadata: {
            productId: product.id,
            currentStock: product.stockQty,
            reorderLevel: product.reorderLevel,
          },
        },
        "system",
      );
    } catch (err) {
      logger.error(
        `Low stock notification failed for product ${product.id}`,
        // @ts-ignore
        err,
      );
    }
  }
  /**
   * @param {{ lifetimePointsEarned: number; }} customer
   */
  determineCustomerStatus(customer) {
    // 🔧 SETTINGS INTEGRATION: ang thresholds ay pwedeng gawing settings
    // Para sa ngayon, panatilihin muna ang hardcoded values
    if (customer.lifetimePointsEarned > 5000) return "elite";
    if (customer.lifetimePointsEarned > 1000) return "vip";
    return "regular";
  }
}

module.exports = { SaleStateTransitionService };
