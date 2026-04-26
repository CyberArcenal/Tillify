// src/subscribers/SaleSubscriber.js

const Sale = require("../entities/Sale");
const { AppDataSource } = require("../main/db/dataSource");
const { SaleStateTransitionService } = require("../StateTransitionServices/Sale");
const { logger } = require("../utils/logger");

console.log("[Subscriber] Loading SaleSubscriber");

class SaleSubscriber {
  constructor() {
    this.transitionService = new SaleStateTransitionService(AppDataSource);
  }

  listenTo() {
    return Sale;
  }

  /**
   * @param {any} entity
   */
  async beforeInsert(entity) {
    console.log("[SaleSubscriber] beforeInsert:", { entity });
  }

  /**
   * @param {any} entity
   */
  async afterInsert(entity) {
    console.log("[SaleSubscriber] afterInsert:", { entity });
  }

  /**
   * @param {any} entity
   */
  async beforeUpdate(entity) {
    console.log("[SaleSubscriber] beforeUpdate:", { id: entity.id });
  }

  /**
   * @param {{ databaseEntity?: any; entity: any }} event
   */
  async afterUpdate(event) {
    if (!event.entity) return;
    console.log("[SaleSubscriber] afterUpdate:", { event });

    const oldSale = event.databaseEntity;
    const newSale = event.entity;

    if (oldSale && oldSale.status === newSale.status) {
      return;
    }

    switch (newSale.status) {
      case "paid":
        await this.transitionService.onPay(newSale);
        break;
      case "refunded":
        await this.transitionService.onRefund(newSale);
        break;
      case "voided":
        await this.transitionService.onCancel(newSale);
        break;
      default:
        break;
    }
  }

  /**
   * @param {any} entity
   */
  async beforeRemove(entity) {
    console.log("[SaleSubscriber] beforeRemove:", { id: entity.id });
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  async afterRemove(event) {
    console.log("[SaleSubscriber] afterRemove:", {
      id: event.entityId,
    });
  }
}

module.exports = SaleSubscriber;