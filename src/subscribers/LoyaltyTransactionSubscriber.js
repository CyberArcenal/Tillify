// src/subscribers/LoyaltyTransactionSubscriber.js

const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
const { logger } = require("../utils/logger");

console.log("[Subscriber] Loading LoyaltyTransactionSubscriber");

class LoyaltyTransactionSubscriber {
  listenTo() {
    return LoyaltyTransaction;
  }

  /**
   * @param {any} entity
   */
  async beforeInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[LoyaltyTransactionSubscriber] beforeInsert", {
        id: entity.id,
        pointsChange: entity.pointsChange,
        timestamp: entity.timestamp,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[LoyaltyTransactionSubscriber] beforeInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async afterInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[LoyaltyTransactionSubscriber] afterInsert", {
        id: entity.id,
        pointsChange: entity.pointsChange,
        timestamp: entity.timestamp,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[LoyaltyTransactionSubscriber] afterInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeUpdate(entity) {
    try {
      // @ts-ignore
      logger.info("[LoyaltyTransactionSubscriber] beforeUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[LoyaltyTransactionSubscriber] beforeUpdate error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entity: any }} event
   */
  async afterUpdate(event) {
    try {
      const { entity } = event;
      // @ts-ignore
      logger.info("[LoyaltyTransactionSubscriber] afterUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[LoyaltyTransactionSubscriber] afterUpdate error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeRemove(entity) {
    try {
      // @ts-ignore
      logger.info("[LoyaltyTransactionSubscriber] beforeRemove", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[LoyaltyTransactionSubscriber] beforeRemove error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  async afterRemove(event) {
    try {
      // @ts-ignore
      logger.info("[LoyaltyTransactionSubscriber] afterRemove", {
        id: event.entityId,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[LoyaltyTransactionSubscriber] afterRemove error", err);
    }
  }
}

module.exports = LoyaltyTransactionSubscriber;