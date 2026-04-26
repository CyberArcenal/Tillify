// src/subscribers/AuditLogSubscriber.js

const { AuditLog } = require("../entities/AuditLog");
const { logger } = require("../utils/logger");

console.log("[Subscriber] Loading AuditLogSubscriber");

class AuditLogSubscriber {
  constructor() {}

  listenTo() {
    return AuditLog;
  }

  /**
   * @param {any} entity
   */
  async beforeInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[AuditLogSubscriber] beforeInsert", {
        id: entity.id,
        entity: entity.entity,
        action: entity.action,
        user: entity.user,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[AuditLogSubscriber] beforeInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async afterInsert(entity) {
    try {
      // @ts-ignore
      logger.info("[AuditLogSubscriber] afterInsert", {
        id: entity.id,
        entity: entity.entity,
        action: entity.action,
        user: entity.user,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[AuditLogSubscriber] afterInsert error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeUpdate(entity) {
    try {
      // @ts-ignore
      logger.info("[AuditLogSubscriber] beforeUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[AuditLogSubscriber] beforeUpdate error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entity: any }} event
   */
  async afterUpdate(event) {
    try {
      const { entity } = event;
      // @ts-ignore
      logger.info("[AuditLogSubscriber] afterUpdate", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[AuditLogSubscriber] afterUpdate error", err);
    }
  }

  /**
   * @param {any} entity
   */
  async beforeRemove(entity) {
    try {
      // @ts-ignore
      logger.info("[AuditLogSubscriber] beforeRemove", {
        id: entity.id,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[AuditLogSubscriber] beforeRemove error", err);
    }
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  async afterRemove(event) {
    try {
      // @ts-ignore
      logger.info("[AuditLogSubscriber] afterRemove", {
        id: event.entityId,
      });
    } catch (err) {
      // @ts-ignore
      logger.error("[AuditLogSubscriber] afterRemove error", err);
    }
  }
}

module.exports = AuditLogSubscriber;