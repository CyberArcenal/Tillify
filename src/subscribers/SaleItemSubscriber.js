// src/subscribers/SaleItemSubscriber.js

const SaleItem = require("../entities/SaleItem");
const { logger } = require("../utils/logger");

console.log("[Subscriber] Loading SaleItemSubscriber");

class SaleItemSubscriber {
  listenTo() {
    return SaleItem;
  }

  /**
   * @param {any} entity
   */
  async beforeInsert(entity) {
    console.log("[SaleItemSubscriber] beforeInsert:", { entity });
  }

  /**
   * @param {any} entity
   */
  async afterInsert(entity) {
    console.log("[SaleItemSubscriber] afterInsert:", { entity });
  }

  /**
   * @param {any} entity
   */
  async beforeUpdate(entity) {
    console.log("[SaleItemSubscriber] beforeUpdate:", { id: entity.id });
  }

  /**
   * @param {{ databaseEntity?: any; entity: any }} event
   */
  async afterUpdate(event) {
    console.log("[SaleItemSubscriber] afterUpdate:", {
      id: event.entity?.id,
    });
  }

  /**
   * @param {any} entity
   */
  async beforeRemove(entity) {
    console.log("[SaleItemSubscriber] beforeRemove:", { id: entity.id });
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  async afterRemove(event) {
    console.log("[SaleItemSubscriber] afterRemove:", {
      id: event.entityId,
    });
  }
}

module.exports = SaleItemSubscriber;