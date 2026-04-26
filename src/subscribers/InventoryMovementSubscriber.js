// src/subscribers/InventoryMovementSubscriber.js

const InventoryMovement = require("../entities/InventoryMovement");
const { logger } = require("../utils/logger");

console.log("[Subscriber] Loading InventoryMovementSubscriber");

class InventoryMovementSubscriber {
  constructor() {}

  listenTo() {
    return InventoryMovement;
  }

  /**
   * @param {any} entity
   */
  async beforeInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[InventoryMovementSubscriber] beforeInsert", {
        id: entity.id,
        movementType: entity.movementType,
        qtyChange: entity.qtyChange,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[InventoryMovementSubscriber] beforeInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async afterInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[InventoryMovementSubscriber] afterInsert", {
        id: entity.id,
        movementType: entity.movementType,
        qtyChange: entity.qtyChange,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[InventoryMovementSubscriber] afterInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeUpdate(entity) {
    try {
      // @ts-ignore
      logger.info("[InventoryMovementSubscriber] beforeUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[InventoryMovementSubscriber] beforeUpdate error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entity: any }} event
   */
  async afterUpdate(event) {
    try {
      const { entity } = event;
      // @ts-ignore
      logger.info("[InventoryMovementSubscriber] afterUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[InventoryMovementSubscriber] afterUpdate error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeRemove(entity) {
    try {
      // @ts-ignore
      logger.info("[InventoryMovementSubscriber] beforeRemove", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[InventoryMovementSubscriber] beforeRemove error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  async afterRemove(event) {
    try {
      // @ts-ignore
      logger.info("[InventoryMovementSubscriber] afterRemove", {
        id: event.entityId,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[InventoryMovementSubscriber] afterRemove error", err);
    }
  }
}

module.exports = InventoryMovementSubscriber;