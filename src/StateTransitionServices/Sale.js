// src/services/SaleStateTransitionService.js

const Product = require("../entities/Product");
const Customer = require("../entities/Customer");
const InventoryMovement = require("../entities/InventoryMovement");
const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
const auditLogger = require("../utils/auditLogger");
const Sale = require("../entities/Sale");
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
} = require("../utils/system");
const { logger } = require("../utils/logger");
const notificationService = require("../services/NotificationService");
const emailSender = require("../channels/email.sender");
const smsSender = require("../channels/sms.sender");
const { companyName, enableSmsAlerts } = require("../utils/system");

// Constants (maaaring gawing settings sa hinaharap)
const LARGE_SALE_THRESHOLD = 10000; // halagang ituturing na "large"
const BULK_REFUND_ITEM_COUNT = 2; // refund na may 2 o higit pang items

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

        // Low stock alert (optional)
        if (product.stockQty <= product.reorderLevel) {
          await this.notifyLowStock(product, item.quantity);
        }
      }
    }

    // 2. Handle loyalty points (kung enabled)
    const loyaltyEnabled = await loyaltyPointsEnabled();
    if (loyaltyEnabled && hydratedSale.customer) {
      const rate = await getLoyaltyPointRate();
      const lifetimeRate = 50; // 1 point per ₱50 spend (pwedeng gawing setting)
      const subtotal = hydratedSale.saleItems.reduce(
        // @ts-ignore
        (sum, item) => sum + item.lineTotal,
        0,
      );

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
          const oldStatus = customer.status;

          const oldBalance = customer.loyaltyPointsBalance;
          customer.loyaltyPointsBalance += pointsEarned;
          customer.lifetimePointsEarned += lifetimePointsEarned;
          const newStatus = this.determineCustomerStatus(customer);
          customer.status = newStatus;
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

          // 🎉 Loyalty milestone notification
          if (
            oldStatus !== newStatus &&
            (newStatus === "vip" || newStatus === "elite")
          ) {
            await this._notifyCustomerMilestone(customer, oldStatus, newStatus);
          }
        }
      }
    }

    // 3. Check and deduct loyalty (kung may na-redeem)
    await this.checkAndDeductLoyalty(hydratedSale);

    // 4. Large transaction notification (kung lampas sa threshold)
    if (hydratedSale.totalAmount > LARGE_SALE_THRESHOLD) {
      await this._notifyLargeSale(hydratedSale);
    }

    // 5. Print receipt (kung enabled)
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

    // 6. Open cash drawer (kung cash payment at enabled)
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

    // 3. Bulk refund notification (kung maraming items)
    // @ts-ignore
    if (sale.saleItems && sale.saleItems.length >= BULK_REFUND_ITEM_COUNT) {
      await this._notifyBulkRefund(sale);
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
   * @param {{ supplier: any; reorderLevel: number; reorderQty: number; stockQty: number; id: any; price: any; sku: any; name: any; }} product
   */
  async reOrder(product) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    const autoReorder = await autoReorderEnabled();
    if (!autoReorder) return;

    try {
      const purchaseRepo = this.dataSource.getRepository(Purchase);
      const purchaseItemRepo = this.dataSource.getRepository(PurchaseItem);

      if (
        product.supplier &&
        product.reorderLevel > 0 &&
        product.reorderQty > 0 &&
        product.stockQty <= product.reorderLevel
      ) {
        const existingPending = await purchaseRepo
          .createQueryBuilder("purchase")
          .innerJoin("purchase.purchaseItems", "item")
          .where("purchase.status = :status", { status: "pending" })
          .andWhere("item.productId = :productId", { productId: product.id })
          .getOne();

        if (!existingPending) {
          const referenceNo = `PO-${Date.now()}-${product.id}`;

          const purchase = purchaseRepo.create({
            referenceNo,
            supplier: product.supplier,
            status: "pending",
            orderDate: new Date(),
            totalAmount: 0,
          });

          const savedPurchase = await saveDb(purchaseRepo, purchase);

          const unitPrice = product.price;
          const subtotal = unitPrice * product.reorderQty;

          const purchaseItem = purchaseItemRepo.create({
            quantity: product.reorderQty,
            unitPrice,
            subtotal,
            purchase: savedPurchase,
            product,
          });

          await saveDb(purchaseItemRepo, purchaseItem);

          savedPurchase.totalAmount = subtotal;
          await updateDb(purchaseRepo, savedPurchase);

          logger.info(
            `[AutoPurchase] Created purchase #${savedPurchase.id} for product ${product.sku} (Qty: ${product.reorderQty})`,
          );

          try {
            await notificationService.create(
              {
                userId: 1,
                title: "Auto‑Reorder Created",
                message: `Product "${product.name}" (SKU: ${product.sku}) has reached reorder level. A new purchase order #${savedPurchase.referenceNo} has been automatically created.`,
                type: "purchase",
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
      logger.error(
        `[AutoPurchase] Failed to create purchase for product ${product.id}:`,
        // @ts-ignore
        purchaseError,
      );
      throw new Error("Unable To Create Order.");
    }
  }

  /**
   * @param {{ usedLoyalty: any; loyaltyRedeemed: number; customer: { id: any; }; id: any; }} hydratedSale
   */
  async checkAndDeductLoyalty(hydratedSale) {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
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

  /**
   * Magpadala ng low stock alert (opsyonal)
   * @param {any} product
   * @param {number} soldQty
   */
  // @ts-ignore
  async notifyLowStock(product, soldQty) {
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
   * I-notify ang admin (in‑app) at ang customer (email/SMS) kapag umabot ng bagong loyalty level.
   * @param {string} oldStatus
   * @param {string} newStatus
   * @param {{ name: any; id: any; email: string; phone: string; }} customer
   */
  async _notifyCustomerMilestone(customer, oldStatus, newStatus) {
    // 1. In-app notification para sa admin
    try {
      await notificationService.create(
        {
          userId: 1,
          title: "Customer Loyalty Milestone",
          message: `${customer.name} has reached ${newStatus} status!`,
          type: "success",
          metadata: { customerId: customer.id, oldStatus, newStatus },
        },
        "system",
      );
    } catch (err) {
      logger.error(
        `Failed to create in-app milestone notification for customer ${customer.id}`,
        // @ts-ignore
        err,
      );
    }

    // 2. Email sa customer
    const company = await companyName();
    const subject = `Congratulations! You've reached ${newStatus} status!`;
    const textBody = `Dear ${customer.name},

Congratulations! You have reached ${newStatus} status at ${company}.

We appreciate your continued patronage and look forward to serving you with exclusive benefits.

Thank you for being a valued customer!

Best regards,
${company}`;
    const htmlBody = textBody.replace(/\n/g, "<br>");

    if (customer.email) {
      try {
        await emailSender.send(
          customer.email,
          subject,
          htmlBody,
          textBody,
          {},
          true, // async
        );
        logger.info(
          `[Milestone] Email sent to customer ${customer.email} for reaching ${newStatus}`,
        );
      } catch (error) {
        logger.error(
          `[Milestone] Failed to send email to customer ${customer.email}`,
          // @ts-ignore
          error,
        );
      }
    }

    // 3. SMS kung enabled at may phone number
    const smsEnabled = await enableSmsAlerts();
    if (smsEnabled && customer.phone) {
      try {
        const smsMessage = `Congratulations! You've reached ${newStatus} status at ${company}. Thank you for your loyalty!`;
        await smsSender.send(customer.phone, smsMessage);
        logger.info(`[Milestone] SMS sent to customer ${customer.phone}`);
      } catch (error) {
        logger.error(
          `[Milestone] Failed to send SMS to customer ${customer.phone}`,
          // @ts-ignore
          error,
        );
      }
    }
  }

  /**
   * I-notify ang admin at customer para sa large sale.
   * @param {any} sale
   */
  async _notifyLargeSale(sale) {
    // 1. In-app notification para sa admin
    try {
      await notificationService.create(
        {
          userId: 1,
          title: "Large Sale Alert",
          message: `Sale #${sale.referenceNo} amount: ₱${sale.totalAmount.toFixed(2)}`,
          type: "sale",
          metadata: { saleId: sale.id, amount: sale.totalAmount },
        },
        "system",
      );
    } catch (err) {
      logger.error(
        `Failed to create in-app large sale notification for sale #${sale.id}`,
        // @ts-ignore
        err,
      );
    }

    // 2. Email sa customer (kung may customer at may email)
    if (sale.customer && sale.customer.email) {
      const company = await companyName();
      const subject = `Thank you for your large purchase!`;
      const textBody = `Dear ${sale.customer.name},

Thank you for your recent purchase of ₱${sale.totalAmount.toFixed(2)} at ${company}.

We truly appreciate your business and hope you enjoy your items.

Should you have any questions, feel free to contact us.

Best regards,
${company}`;
      const htmlBody = textBody.replace(/\n/g, "<br>");

      try {
        await emailSender.send(
          sale.customer.email,
          subject,
          htmlBody,
          textBody,
          {},
          true,
        );
        logger.info(
          `[LargeSale] Thank‑you email sent to customer ${sale.customer.email}`,
        );
      } catch (error) {
        logger.error(
          `[LargeSale] Failed to send email to customer ${sale.customer.email}`,
          // @ts-ignore
          error,
        );
      }
    }

    // 3. (Optional) SMS kung gusto, pero hindi na muna para iwas spam
  }

  /**
   * I-notify ang admin para sa bulk refund.
   * @param {any} sale
   */
  async _notifyBulkRefund(sale) {
    try {
      await notificationService.create(
        {
          userId: 1,
          title: "Bulk Refund Alert",
          message: `Refund for sale #${sale.referenceNo} contains ${sale.saleItems.length} items.`,
          type: "info",
          metadata: { saleId: sale.id, itemCount: sale.saleItems.length },
        },
        "system",
      );
    } catch (err) {
      logger.error(
        `Failed to create in-app bulk refund notification for sale #${sale.id}`,
        // @ts-ignore
        err,
      );
    }
  }

  /**
   * Tukuyin ang customer status batay sa lifetime points
   * @param {{ lifetimePointsEarned: number; }} customer
   */
  determineCustomerStatus(customer) {
    // 🔧 Puwede itong gawing settings sa hinaharap
    if (customer.lifetimePointsEarned > 5000) return "elite";
    if (customer.lifetimePointsEarned > 1000) return "vip";
    return "regular";
  }
}

module.exports = { SaleStateTransitionService };
