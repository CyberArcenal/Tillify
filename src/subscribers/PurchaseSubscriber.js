
const Purchase = require("../entities/Purchase");
const {
  PurchaseStateTransitionService,
} = require("../StateTransitionServices/Purchase");
const { AppDataSource } = require("../main/db/dataSource");

console.log("[Subscriber] Loading PurchaseSubscriber");

class PurchaseSubscriber {
  listenTo() {
    return Purchase;
  }

  /**
   * @param {import("../entities/Purchase")} entity
   */
  async afterInsert(entity) {
    if (!entity) return;

    console.log("[PurchaseSubscriber] afterInsert:", {
      // @ts-ignore
      id: entity.id,
      // @ts-ignore
      status: entity.status,
    });

    // @ts-ignore
    if (entity.status !== "pending") {
      const purchaseRepo = AppDataSource.getRepository(Purchase);
      const fullPurchase = await purchaseRepo.findOne({
        // @ts-ignore
        where: { id: entity.id },
        relations: ["purchaseItems", "purchaseItems.product", "supplier"],
      });

      const transitionService = new PurchaseStateTransitionService(
        AppDataSource,
      );

      // @ts-ignore
      switch (entity.status) {
        case "completed":
          // @ts-ignore
          await transitionService.onComplete(fullPurchase);
          break;
        case "cancelled":
          // @ts-ignore
          await transitionService.onCancel(fullPurchase, "pending");
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

    console.log("[PurchaseSubscriber] afterUpdate:", {
      id: entity.id,
      oldStatus: databaseEntity?.status,
      newStatus: entity.status,
    });

    if (databaseEntity && databaseEntity.status === entity.status) {
      return;
    }

    const purchaseRepo = AppDataSource.getRepository(Purchase);
    const fullPurchase = await purchaseRepo.findOne({
      where: { id: entity.id },
      relations: ["purchaseItems", "purchaseItems.product", "supplier"],
    });

    const transitionService = new PurchaseStateTransitionService(AppDataSource);

    switch (entity.status) {
      case "approved":
        // @ts-ignore
        await transitionService.onApprove(fullPurchase);
        break;
      case "completed":
        // @ts-ignore
        await transitionService.onComplete(fullPurchase);
        break;
      case "cancelled":
        // @ts-ignore
        await transitionService.onCancel(fullPurchase, databaseEntity.status);
        break;
    }
  }

  /**
   * @param {import("../entities/Purchase")} entity
   */
  beforeInsert(entity) {
    console.log("[PurchaseSubscriber] beforeInsert:", {
      // @ts-ignore
      referenceNo: entity?.referenceNo,
      // @ts-ignore
      supplier: entity?.supplier?.name,
      // @ts-ignore
      status: entity?.status,
    });
  }

  /**
   * @param {import("../entities/Purchase")} entity
   */
  beforeUpdate(entity) {
    console.log("[PurchaseSubscriber] beforeUpdate:", {
      // @ts-ignore
      id: entity?.id,
      // @ts-ignore
      status: entity?.status,
    });
  }

  /**
   * @param {import("../entities/Purchase")} entity
   */
  beforeRemove(entity) {
    console.log("[PurchaseSubscriber] beforeRemove:", {
      // @ts-ignore
      id: entity?.id,
    });
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  afterRemove(event) {
    console.log("[PurchaseSubscriber] afterRemove:", {
      id: event.entityId,
    });
  }
}

module.exports = PurchaseSubscriber;
