
const ReturnRefund = require("../entities/ReturnRefund");
const {
  ReturnRefundStateTransitionService,
} = require("../StateTransitionServices/ReturnRefund");
const { AppDataSource } = require("../main/db/dataSource");

console.log("[Subscriber] Loading ReturnRefundSubscriber");

class ReturnRefundSubscriber {
  listenTo() {
    return ReturnRefund;
  }

  /**
   * @param {import("../entities/ReturnRefund")} entity
   */
  async afterInsert(entity) {
    if (!entity) return;

    console.log("[ReturnRefundSubscriber] afterInsert:", {
      // @ts-ignore
      id: entity.id,
      // @ts-ignore
      status: entity.status,
    });

    // @ts-ignore
    if (entity.status !== "pending") {
      const returnRepo = AppDataSource.getRepository(ReturnRefund);
      const fullReturn = await returnRepo.findOne({
        // @ts-ignore
        where: { id: entity.id },
        relations: ["items", "items.product", "sale", "customer"],
      });

      const transitionService = new ReturnRefundStateTransitionService(
        AppDataSource,
      );

      // @ts-ignore
      switch (entity.status) {
        case "processed":
          // @ts-ignore
          await transitionService.onProcess(fullReturn);
          break;
        case "cancelled":
          // @ts-ignore
          await transitionService.onCancel(fullReturn, "pending");
          break;
      }
    }
  }

  /**
   * @param {{ databaseEntity: any; entity: any }} event
   */
  async afterUpdate(event) {
    const { entity, databaseEntity } = event;
    if (!entity) return;

    console.log("[ReturnRefundSubscriber] afterUpdate:", {
      id: entity.id,
      oldStatus: databaseEntity?.status,
      newStatus: entity.status,
    });

    if (databaseEntity && databaseEntity.status === entity.status) {
      return;
    }

    const returnRepo = AppDataSource.getRepository(ReturnRefund);
    const fullReturn = await returnRepo.findOne({
      where: { id: entity.id },
      relations: ["items", "items.product", "sale", "customer"],
    });

    const transitionService = new ReturnRefundStateTransitionService(
      AppDataSource,
    );

    switch (entity.status) {
      case "processed":
        // @ts-ignore
        await transitionService.onProcess(fullReturn);
        break;
      case "cancelled":
        // @ts-ignore
        await transitionService.onCancel(fullReturn, databaseEntity.status);
        break;
    }
  }

  /**
   * @param {import("../entities/ReturnRefund")} entity
   */
  beforeInsert(entity) {
    console.log("[ReturnRefundSubscriber] beforeInsert:", {
      // @ts-ignore
      saleId: entity?.sale?.id,
      // @ts-ignore
      status: entity?.status,
    });
  }

  /**
   * @param {import("../entities/ReturnRefund")} entity
   */
  beforeUpdate(entity) {
    console.log("[ReturnRefundSubscriber] beforeUpdate:", {
      // @ts-ignore
      id: entity?.id,
      // @ts-ignore
      status: entity?.status,
    });
  }

  /**
   * @param {import("../entities/ReturnRefund")} entity
   */
  beforeRemove(entity) {
    console.log("[ReturnRefundSubscriber] beforeRemove:", {
      // @ts-ignore
      id: entity?.id,
    });
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  afterRemove(event) {
    console.log("[ReturnRefundSubscriber] afterRemove:", {
      id: event.entityId,
    });
  }
}

module.exports = ReturnRefundSubscriber;
