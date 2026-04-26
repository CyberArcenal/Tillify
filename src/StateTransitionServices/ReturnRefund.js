// src/services/ReturnRefundStateTransitionService.js

const Product = require("../entities/Product");
const InventoryMovement = require("../entities/InventoryMovement");
const auditLogger = require("../utils/auditLogger");
const { logger } = require("../utils/logger");
const emailSender = require("../channels/email.sender");
const smsSender = require("../channels/sms.sender");
const {
  companyName,
  enableSmsAlerts,
  notifyCustomerOnReturnProcessedWithEmail,
  notifyCustomerOnReturnProcessedWithSms,
  notifyCustomerOnReturnCancelledWithEmail,
  notifyCustomerOnReturnCancelledWithSms,
  // 🔧 SETTINGS INTEGRATION: bagong settings para sa stock updates
  autoUpdateStockOnReturnProcessed,
  autoReverseStockOnReturnCancel,
} = require("../utils/system");
const ReturnRefund = require("../entities/ReturnRefund");

class ReturnRefundStateTransitionService {
  /**
   * @param {{ getRepository: (arg0: import("typeorm").EntitySchema<{ id: unknown; sku: unknown; name: unknown; description: unknown; price: unknown; stockQty: unknown; reorderLevel: unknown; reorderQty: unknown; isActive: unknown; createdAt: unknown; updatedAt: unknown; }> | import("typeorm").EntitySchema<{ id: unknown; movementType: unknown; qtyChange: unknown; timestamp: unknown; notes: unknown; updatedAt: unknown; }>) => any; }} dataSource
   */
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.productRepo = dataSource.getRepository(Product);
    this.movementRepo = dataSource.getRepository(InventoryMovement);
  }

  /**
   * Handle side effects when a return is processed (stock increase, inventory movement)
   * @param {Object} returnRefund - Full return entity with items, product, sale, customer relations
   * @param {string} user
   */
  async onProcess(returnRefund, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    // @ts-ignore
    logger.info(`[Transition] Processing return #${returnRefund.id}`);

    // Ensure we have full relations (just in case)
    let fullReturn = returnRefund;
    // @ts-ignore
    if (!fullReturn.customer || !fullReturn.items) {
      fullReturn = await this.dataSource.getRepository(ReturnRefund).findOne({
        // @ts-ignore
        where: { id: returnRefund.id },
        relations: ["customer", "items", "items.product", "sale"],
      });
    }

    if (!fullReturn) {
      logger.error(
        // @ts-ignore
        `[Transition] Return #${returnRefund.id} not found – cannot process`,
      );
      return;
    }

    // 🔧 SETTINGS INTEGRATION: suriin kung pinapayagan ang auto stock update
    const shouldUpdateStock = await autoUpdateStockOnReturnProcessed();

    // --- Stock updates and inventory movements (kung pinapayagan) ---
    if (shouldUpdateStock) {
      // @ts-ignore
      for (const item of fullReturn.items) {
        const product = item.product;
        const oldStock = product.stockQty;
        const newStock = oldStock + item.quantity;

        product.stockQty = newStock;
        product.updatedAt = new Date();
        await updateDb(this.productRepo, product);

        const movement = this.movementRepo.create({
          movementType: "refund",
          qtyChange: item.quantity,
          // @ts-ignore
          notes: `Return #${fullReturn.id} - ${fullReturn.referenceNo}`,
          product,
          // @ts-ignore
          sale: fullReturn.sale,
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
    } else {
      logger.info(
        // @ts-ignore
        `[Transition] Stock update skipped for return #${fullReturn.id} (disabled by settings)`,
      );
    }

    // --- Notify customer about processed return (laging ginagawa, kontrolado ng settings) ---
    // @ts-ignore
    if (fullReturn.customer) {
      await this._notifyCustomer(fullReturn, "processed");
    } else {
      logger.warn(
        // @ts-ignore
        `[Transition] No customer info for return #${fullReturn.id} – cannot send notification`,
      );
    }

    // @ts-ignore
    logger.info(`[Transition] Completed return #${fullReturn.id}`);
  }

  /**
   * Handle side effects when a return is cancelled
   * If it was previously processed, reverse the stock (subtract) – kung pinapayagan ng settings
   * @param {Object} returnRefund - Full return entity
   * @param {string} oldStatus - Previous status
   * @param {string} user
   */
  async onCancel(returnRefund, oldStatus, user = "system") {
    const { saveDb, updateDb } = require("../utils/dbUtils/dbActions");
    logger.info(
      // @ts-ignore
      `[Transition] Cancelling return #${returnRefund.id}, old status: ${oldStatus}`,
    );

    // Ensure we have full relations
    let fullReturn = returnRefund;
    // @ts-ignore
    if (!fullReturn.customer || !fullReturn.items) {
      fullReturn = await this.dataSource.getRepository(ReturnRefund).findOne({
        // @ts-ignore
        where: { id: returnRefund.id },
        relations: ["customer", "items", "items.product", "sale"],
      });
    }

    if (!fullReturn) {
      logger.error(
        // @ts-ignore
        `[Transition] Return #${returnRefund.id} not found – cannot cancel`,
      );
      return;
    }

    // 🔧 SETTINGS INTEGRATION: suriin kung pinapayagan ang auto stock reversal
    const shouldReverseStock = await autoReverseStockOnReturnCancel();

    // --- Reverse stock if the return was previously processed at pinapayagan ng settings ---
    if (oldStatus === "processed" && shouldReverseStock) {
      // @ts-ignore
      for (const item of fullReturn.items) {
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
          notes: `Cancelled return #${fullReturn.id} - reversal of processed return`,
          product,
          // @ts-ignore
          sale: fullReturn.sale,
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
    } else if (oldStatus === "processed" && !shouldReverseStock) {
      logger.info(
        // @ts-ignore
        `[Transition] Stock reversal skipped for return #${fullReturn.id} (disabled by settings)`,
      );
    }

    // --- Notify customer about cancellation (laging ginagawa, kontrolado ng settings) ---
    // @ts-ignore
    if (fullReturn.customer) {
      // @ts-ignore
      await this._notifyCustomer(fullReturn, "cancelled", oldStatus);
    } else {
      logger.warn(
        // @ts-ignore
        `[Transition] No customer info for return #${fullReturn.id} – cannot send cancellation notification`,
      );
    }

    logger.info(
      // @ts-ignore
      `[Transition] Completed cancellation of return #${fullReturn.id}`,
    );
  }

  /**
   * Send email/SMS notification to the customer
   *
   * @param {Object} returnRefund
   * @param {string} action
   */
  async _notifyCustomer(returnRefund, action, oldStatus = null) {
    // @ts-ignore
    const customer = returnRefund.customer;
    const company = await companyName();

    // Determine which settings to use based on action
    let notifyEmail, notifySms;
    if (action === "processed") {
      notifyEmail = await notifyCustomerOnReturnProcessedWithEmail();
      notifySms = await notifyCustomerOnReturnProcessedWithSms();
    } else {
      notifyEmail = await notifyCustomerOnReturnCancelledWithEmail();
      notifySms = await notifyCustomerOnReturnCancelledWithSms();
    }

    // Build email content
    const subject =
      action === "processed"
        // @ts-ignore
        ? `Return Processed – ${returnRefund.referenceNo}`
        // @ts-ignore
        : `Return Cancelled – ${returnRefund.referenceNo}`;

    // @ts-ignore
    const itemsList = returnRefund.items
      .map(
        (
          /** @type {{ product: { name: any; }; quantity: any; unitPrice: any; }} */ item,
        ) => `${item.product.name} – Qty: ${item.quantity} @ ${item.unitPrice}`,
      )
      .join("\n");

    let textBody;
    if (action === "processed") {
      textBody = `Dear ${customer.name},

We have processed your return (ref. #${returnRefund.
// @ts-ignore
referenceNo}).

Returned items:
${itemsList}

Total refund amount: ${returnRefund.
// @ts-ignore
totalAmount}
Refund method: ${returnRefund.
// @ts-ignore
refundMethod}

The amount will be credited according to your selected refund method.

Thank you for shopping with us,
${company}`;
    } else {
      textBody = `Dear ${customer.name},

Your return request (ref. #${returnRefund.
// @ts-ignore
referenceNo}) has been cancelled.
Previous status: ${oldStatus || returnRefund.
// @ts-ignore
status}

Cancelled items:
${itemsList}

If you have any questions, please contact our support.

Regards,
${company}`;
    }

    const htmlBody = textBody.replace(/\n/g, "<br>");

    // Send email if enabled and customer has email
    if (notifyEmail && customer.email) {
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
          // @ts-ignore
          `[Return] ${action} email queued for customer ${customer.email} (return #${returnRefund.id})`,
        );
      } catch (error) {
        logger.error(
          // @ts-ignore
          `[Return] Failed to queue ${action} email for return #${returnRefund.id}`,
          // @ts-ignore
          error,
        );
      }
    }

    // Send SMS if enabled and customer has phone
    if (notifySms) {
      const smsEnabled = await enableSmsAlerts();
      if (smsEnabled && customer.phone) {
        try {
          const smsMessage =
            action === "processed"
              // @ts-ignore
              ? `Return #${returnRefund.referenceNo} processed. Refund: ${returnRefund.totalAmount}. Check email for details.`
              // @ts-ignore
              : `Return #${returnRefund.referenceNo} cancelled. Check email for details.`;
          await smsSender.send(customer.phone, smsMessage);
        } catch (error) {
          logger.error(
            `[Return] SMS failed for customer ${customer.phone}`,
            // @ts-ignore
            error,
          );
        }
      }
    }
  }
}

module.exports = { ReturnRefundStateTransitionService };