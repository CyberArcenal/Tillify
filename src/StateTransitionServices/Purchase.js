// src/services/PurchaseStateTransitionService.js

const Product = require("../entities/Product");
const InventoryMovement = require("../entities/InventoryMovement");
const auditLogger = require("../utils/auditLogger");
const Purchase = require("../entities/Purchase");
const {
  companyName,
  enableSmsAlerts,
  getNotifySupplierOnConfirmedWithEmail,
  getNotifySupplierOnConfirmedWithSms,
  getNotifySupplierOnCompleteWithEmail,
  getNotifySupplierOnCompleteWithSms,
  getNotifySupplierOnCancelWithEmail,
  getNotifySupplierOnCancelWithSms,
} = require("../utils/system");
const { logger } = require("../utils/logger");
const emailSender = require("../channels/email.sender");
const smsSender = require("../channels/sms.sender");

class PurchaseStateTransitionService {
  /**
   * @param {{ getRepository: (arg0: import("typeorm").EntitySchema<{ id: unknown; sku: unknown; name: unknown; description: unknown; price: unknown; stockQty: unknown; reorderLevel: unknown; reorderQty: unknown; isActive: unknown; createdAt: unknown; updatedAt: unknown; }> | import("typeorm").EntitySchema<{ id: unknown; movementType: unknown; qtyChange: unknown; timestamp: unknown; notes: unknown; updatedAt: unknown; }>) => any; }} dataSource
   */
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.purchaseRepo = dataSource.getRepository(Purchase);
    this.productRepo = dataSource.getRepository(Product);
    this.movementRepo = dataSource.getRepository(InventoryMovement);
  }

  /**
   * @param {{ id: any; referenceNo: any; purchaseItems: any[]; supplier: { name: any; email: any; }; }} purchase
   */

  // @ts-ignore
  async onApprove(purchase, user = "system") {
    logger.info(`[Transition] Approving purchase #${purchase.id}`);
    const notifySupplierWithEmail =
      await getNotifySupplierOnConfirmedWithEmail();
    const notifySupplierWithSms = await getNotifySupplierOnConfirmedWithSms();

    const fullPurchase = await this.purchaseRepo.findOne({
      where: { id: purchase.id },
      relations: ["supplier", "purchaseItems", "purchaseItems.product"],
    });

    if (!fullPurchase || !fullPurchase.supplier) {
      logger.warn(
        `[Transition] No supplier info for purchase #${purchase.id} – cannot send notification`,
      );
      return;
    }

    const supplier = fullPurchase.supplier;
    const company = await companyName();

    // Build email content
    const subject = `Purchase Request Approved – ${fullPurchase.referenceNo}`;
    const itemsList = fullPurchase.purchaseItems
      .map(
        (/** @type {{ product: { name: any; }; quantity: any; }} */ item) =>
          `${item.product.name} – Qty: ${item.quantity}`,
      )
      .join("\n");

    const textBody = `Dear ${supplier.name},

We have approved a purchase request for your products.

Items requested:
${itemsList}

Please prepare the order accordingly.

Thank you,
${company}`;

    // Convert plain text to simple HTML (optional but good practice)
    const htmlBody = textBody.replace(/\n/g, "<br>");

    // Send email using the robust EmailSender (queued, retried, logged)
    if (notifySupplierWithEmail && supplier.email) {
      try {
        await emailSender.send(
          supplier.email,
          subject,
          htmlBody,
          textBody,
          {}, // no extra options
          true, // asyncMode = true → queues the email
        );
        logger.info(
          `[Transition] Email queued for supplier ${supplier.email} (purchase #${purchase.id})`,
        );
      } catch (error) {
        logger.error(
          `[Transition] Failed to queue email for purchase #${purchase.id}`,

          // @ts-ignore
          error,
        );
      }
    }
    const smsEnabled = await enableSmsAlerts(); // import from system
    if (notifySupplierWithSms && smsEnabled && supplier.phone) {
      // Optional: Send SMS if supplier has phone number and SMS is enabled

      try {
        await smsSender.send(
          supplier.phone,
          `Purchase #${fullPurchase.referenceNo} approved. Please check your email for details.`,
        );
      } catch (error) {
        logger.error(
          `[Transition] SMS failed for supplier ${supplier.phone}`,

          // @ts-ignore
          error,
        );
      }
    }

    logger.info(
      `[Transition] Approved purchase #${purchase.id}, supplier notified`,
    );
  }

  /**
   * Handle side effects when a purchase is completed (stock increase, inventory movement)
   * and notify the supplier that the order has been received.
   * @param {Object} purchase - Purchase entity (preferably with relations loaded)
   * @param {string} user
   */
  async onComplete(purchase, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");

    // @ts-ignore
    logger.info(`[Transition] Completing purchase #${purchase.id}`);

    // Ensure we have full purchase with supplier and items
    let fullPurchase = purchase;

    // @ts-ignore
    if (!fullPurchase.supplier || !fullPurchase.purchaseItems) {
      fullPurchase = await this.purchaseRepo.findOne({
        // @ts-ignore
        where: { id: purchase.id },
        relations: ["supplier", "purchaseItems", "purchaseItems.product"],
      });
    }

    if (!fullPurchase) {
      logger.error(
        // @ts-ignore
        `[Transition] Purchase #${purchase.id} not found – cannot complete`,
      );
      return;
    }

    // --- Stock updates and inventory movements (existing code) ---

    // @ts-ignore
    for (const item of fullPurchase.purchaseItems) {
      const product = item.product;
      const oldStock = product.stockQty;
      const newStock = oldStock + item.quantity;

      product.stockQty = newStock;
      product.updatedAt = new Date();
      await updateDb(this.productRepo, product);

      const movement = this.movementRepo.create({
        movementType: "purchase",
        qtyChange: item.quantity,

        // @ts-ignore
        notes: `Purchase #${fullPurchase.id} - ${fullPurchase.referenceNo}`,
        product,
        timestamp: new Date(),
      });
      await saveDb(this.movementRepo, movement);

      await auditLogger.logUpdate(
        "Product",
        product.id,
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
    }

    // --- Notify supplier that the purchase has been received/completed ---

    // @ts-ignore
    if (fullPurchase.supplier) {
      // @ts-ignore
      const supplier = fullPurchase.supplier;
      const company = await companyName();
      const notifyEmail = await getNotifySupplierOnCompleteWithEmail();
      const notifySms = await getNotifySupplierOnCompleteWithSms();

      // Build email content

      // @ts-ignore
      const subject = `Purchase Order Received – ${fullPurchase.referenceNo}`;

      // @ts-ignore
      const itemsList = fullPurchase.purchaseItems

        // @ts-ignore
        .map((item) => `${item.product.name} – Qty: ${item.quantity}`)
        .join("\n");

      const textBody = `Dear ${supplier.name},

We have received the items for purchase order #${fullPurchase.
// @ts-ignore
referenceNo}.

Items received:
${itemsList}

Thank you for your prompt delivery.

Best regards,
${company}`;

      const htmlBody = textBody.replace(/\n/g, "<br>");

      // Send email if enabled
      if (notifyEmail) {
        try {
          await emailSender.send(
            supplier.email,
            subject,
            htmlBody,
            textBody,
            {},
            true, // async
          );
          logger.info(
            // @ts-ignore
            `[Transition] Completion email queued for supplier ${supplier.email} (purchase #${fullPurchase.id})`,
          );
        } catch (error) {
          logger.error(
            // @ts-ignore
            `[Transition] Failed to queue completion email for purchase #${fullPurchase.id}`,

            // @ts-ignore
            error,
          );
        }
      }

      // Send SMS if enabled and supplier has a phone number
      if (notifySms) {
        const smsEnabled = await enableSmsAlerts();
        if (smsEnabled && supplier.phone) {
          try {
            await smsSender.send(
              supplier.phone,

              // @ts-ignore
              `Purchase #${fullPurchase.referenceNo} received. Please check your email for details.`,
            );
          } catch (error) {
            logger.error(
              `[Transition] Completion SMS failed for supplier ${supplier.phone}`,

              // @ts-ignore
              error,
            );
          }
        }
      }
    } else {
      logger.warn(
        // @ts-ignore
        `[Transition] No supplier info for purchase #${fullPurchase.id} – cannot send completion notification`,
      );
    }

    // @ts-ignore
    logger.info(`[Transition] Completed purchase #${fullPurchase.id}`);
  }

  /**
   * Handle side effects when a purchase is cancelled
   * If it was previously completed, reverse the stock (subtract)
   * @param {Object} purchase - Purchase entity (preferably with relations loaded)
   * @param {string} oldStatus - Previous status
   * @param {string} user
   */
  async onCancel(purchase, oldStatus, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    logger.info(
      // @ts-ignore
      `[Transition] Cancelling purchase #${purchase.id}, old status: ${oldStatus}`,
    );

    // Ensure we have full purchase with supplier and items
    let fullPurchase = purchase;

    // @ts-ignore
    if (!fullPurchase.supplier || !fullPurchase.purchaseItems) {
      fullPurchase = await this.purchaseRepo.findOne({
        // @ts-ignore
        where: { id: purchase.id },
        relations: ["supplier", "purchaseItems", "purchaseItems.product"],
      });
    }

    if (!fullPurchase) {
      logger.error(
        // @ts-ignore
        `[Transition] Purchase #${purchase.id} not found – cannot cancel`,
      );
      return;
    }

    // --- Reverse stock if the purchase was completed ---
    if (oldStatus === "completed") {
      // @ts-ignore
      for (const item of fullPurchase.purchaseItems) {
        const product = item.product;
        const oldStock = product.stockQty;
        const newStock = oldStock - item.quantity;

        product.stockQty = newStock;
        product.updatedAt = new Date();
        await updateDb(this.productRepo, product);

        const movement = this.movementRepo.create({
          movementType: "adjustment",
          qtyChange: -item.quantity,

          // @ts-ignore
          notes: `Cancelled purchase #${fullPurchase.id} - reversal of completed purchase`,
          product,
          timestamp: new Date(),
        });
        await saveDb(this.movementRepo, movement);

        await auditLogger.logUpdate(
          "Product",
          product.id,
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
      }
    }

    if (oldStatus === "pending") return;

    // --- Notify supplier about the cancellation (especially if it was approved/completed) ---

    // @ts-ignore
    if (fullPurchase.supplier) {
      // @ts-ignore
      const supplier = fullPurchase.supplier;
      const company = await companyName();
      const notifyEmail = await getNotifySupplierOnCancelWithEmail();
      const notifySms = await getNotifySupplierOnCancelWithSms();

      // Build email content

      // @ts-ignore
      const subject = `Purchase Order Cancelled – ${fullPurchase.referenceNo}`;

      // @ts-ignore
      const itemsList = fullPurchase.purchaseItems

        // @ts-ignore
        .map((item) => `${item.product.name} – Qty: ${item.quantity}`)
        .join("\n");

      const textBody = `Dear ${supplier.name},

We regret to inform you that purchase order #${
        // @ts-ignore
        fullPurchase.referenceNo
      } has been cancelled.

Order details (cancelled):
${itemsList}

Previous status: ${oldStatus}

Please disregard any earlier instructions regarding this order.

Thank you for your understanding,
${company}`;

      const htmlBody = textBody.replace(/\n/g, "<br>");

      // Send email if enabled
      if (notifyEmail) {
        try {
          await emailSender.send(
            supplier.email,
            subject,
            htmlBody,
            textBody,
            {},
            true, // async
          );
          logger.info(
            // @ts-ignore
            `[Transition] Cancellation email queued for supplier ${supplier.email} (purchase #${fullPurchase.id})`,
          );
        } catch (error) {
          logger.error(
            // @ts-ignore
            `[Transition] Failed to queue cancellation email for purchase #${fullPurchase.id}`,

            // @ts-ignore
            error,
          );
        }
      }

      // Send SMS if enabled and supplier has a phone number
      if (notifySms) {
        const smsEnabled = await enableSmsAlerts(); // global SMS toggle
        if (smsEnabled && supplier.phone) {
          try {
            await smsSender.send(
              supplier.phone,

              // @ts-ignore
              `Purchase #${fullPurchase.referenceNo} has been cancelled. Please check your email for details.`,
            );
          } catch (error) {
            logger.error(
              `[Transition] Cancellation SMS failed for supplier ${supplier.phone}`,

              // @ts-ignore
              error,
            );
          }
        }
      }
    } else {
      logger.warn(
        // @ts-ignore
        `[Transition] No supplier info for purchase #${fullPurchase.id} – cannot send cancellation notification`,
      );
    }

    logger.info(
      // @ts-ignore
      `[Transition] Completed cancellation of purchase #${fullPurchase.id}`,
    );
  }
}

module.exports = { PurchaseStateTransitionService };
