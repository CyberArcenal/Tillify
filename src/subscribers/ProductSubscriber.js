// src/subscribers/ProductSubscriber.js

const Product = require("../entities/Product");
const { logger } = require("../utils/logger");

console.log("[Subscriber] Loading ProductSubscriber");

class ProductSubscriber {
  listenTo() {
    return Product;
  }

  /**
   * @param {any} entity
   */
  async beforeInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[ProductSubscriber] beforeInsert", {
        id: entity.id,
        name: entity.name,
        stockQty: entity.stockQty,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[ProductSubscriber] beforeInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async afterInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[ProductSubscriber] afterInsert", {
        id: entity.id,
        name: entity.name,
        stockQty: entity.stockQty,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[ProductSubscriber] afterInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeUpdate(entity) {
    try {
      // @ts-ignore
      logger.info("[ProductSubscriber] beforeUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[ProductSubscriber] beforeUpdate error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entity: any }} event
   */
  async afterUpdate(event) {
    try {
      const { entity } = event;
      // @ts-ignore
      logger.info("[ProductSubscriber] afterUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[ProductSubscriber] afterUpdate error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeRemove(entity) {
    try {
      // @ts-ignore
      logger.info("[ProductSubscriber] beforeRemove", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[ProductSubscriber] beforeRemove error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  async afterRemove(event) {
    try {
      // @ts-ignore
      logger.info("[ProductSubscriber] afterRemove", {
        id: event.entityId,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[ProductSubscriber] afterRemove error", err);
    }
  }
}

module.exports = ProductSubscriber;