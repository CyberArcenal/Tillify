
const Supplier = require("../entities/Supplier");
const { AppDataSource } = require("../main/db/datasource");

console.log("[Subscriber] Loading SupplierSubscriber");

class SupplierSubscriber {
  listenTo() {
    return Supplier;
  }

  /**
   * @param {import("../entities/Supplier")} entity
   */
  beforeInsert(entity) {
    console.log("[SupplierSubscriber] beforeInsert:", {
      // @ts-ignore
      id: entity?.id,
      // @ts-ignore
      name: entity?.name,
      // @ts-ignore
      isActive: entity?.isActive,
    });
  }

  /**
   * @param {import("../entities/Supplier")} entity
   */
  async afterInsert(entity) {
    if (!entity) return;
    console.log("[SupplierSubscriber] afterInsert:", {
      // @ts-ignore
      id: entity.id,
      // @ts-ignore
      name: entity.name,
      // @ts-ignore
      isActive: entity.isActive,
    });

    // Example: reload full supplier with relations if needed
    const supplierRepo = AppDataSource.getRepository(Supplier);
    // @ts-ignore
    const fullSupplier = await supplierRepo.findOne({
      // @ts-ignore
      where: { id: entity.id },
      relations: ["products"], // adjust relations as needed
    });

    // Add any post-insert logic here (notifications, caching, etc.)
  }

  /**
   * @param {{ databaseEntity: any; entity: any }} event
   */
  async afterUpdate(event) {
    const { entity, databaseEntity } = event;
    if (!entity) return;

    console.log("[SupplierSubscriber] afterUpdate:", {
      id: entity.id,
      oldName: databaseEntity?.name,
      newName: entity.name,
      oldStatus: databaseEntity?.isActive,
      newStatus: entity.isActive,
    });

    if (databaseEntity && databaseEntity.isActive !== entity.isActive) {
      // Example: handle activation/deactivation transitions
      if (entity.isActive) {
        console.log(`[SupplierSubscriber] Supplier ${entity.name} activated`);
      } else {
        console.log(`[SupplierSubscriber] Supplier ${entity.name} deactivated`);
      }
    }
  }

  /**
   * @param {import("../entities/Supplier")} entity
   */
  beforeUpdate(entity) {
    console.log("[SupplierSubscriber] beforeUpdate:", {
      // @ts-ignore
      id: entity?.id,
      // @ts-ignore
      name: entity?.name,
      // @ts-ignore
      isActive: entity?.isActive,
    });
  }

  /**
   * @param {import("../entities/Supplier")} entity
   */
  beforeRemove(entity) {
    console.log("[SupplierSubscriber] beforeRemove:", {
      // @ts-ignore
      id: entity?.id,
      // @ts-ignore
      name: entity?.name,
    });
  }

  /**
   * @param {{ databaseEntity?: any; entityId: any }} event
   */
  afterRemove(event) {
    console.log("[SupplierSubscriber] afterRemove:", {
      id: event.entityId,
    });
  }
}

module.exports = SupplierSubscriber;
