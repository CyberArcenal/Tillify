// src/utils/dbActions.js
// @ts-check
const auditLogger = require("../auditLogger");
const { loadSubscribers } = require("./subscriberRegistry");
const subscribers = loadSubscribers();

/**
 * Kunin ang pangalan ng entity mula sa repository target.
 * @param {Function|Object} target
 * @returns {string}
 */
function getEntityName(target) {
  // @ts-ignore
  return target.options?.name || target.name || "Unknown";
}

/**
 * Hanapin ang subscriber na naka‑listen sa isang entity class.
 *
 * @param {Function} entityClass - Ang entity class (hal. Sale, Product, etc.)
 * @returns {any | undefined} - Ang subscriber instance kung meron, undefined kung wala.
 */
function findSubscriber(entityClass) {
  return subscribers.find((sub) => sub.listenTo() === entityClass);
}

/**
 * I-save ang entity sa database gamit ang repository at i-trigger ang subscriber lifecycle.
 *
 * @template T
 * @param {{ target: Function; save: (entity: T) => Promise<T>; findOne: (opts: any) => Promise<T | null> }} repo - TypeORM repository object.
 * @param {T} entity - Ang entity object na ipe-persist.
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.skipSignal=false] - Kung true, hindi ita-trigger ang subscriber methods.
 * @returns {Promise<T>} - Ang na-save na entity mula sa database.
 */
async function saveDb(repo, entity, options = {}) {
  try {
    const subscriber = findSubscriber(repo.target);
    const { skipSignal = false } = options;

    if (!skipSignal && subscriber?.beforeInsert) {
      await subscriber.beforeInsert(entity);
    }

    const result = await repo.save(entity);

    if (!skipSignal && subscriber?.afterInsert) {
      await subscriber.afterInsert(result);
    }

    return result;
  } catch (error) {
    // Log the error to audit trail
    const entityName = getEntityName(repo.target);
    await auditLogger
      .log({
        action: "CREATE_FAILED",
        entity: entityName,
        // @ts-ignore
        newData: entity, // data na sinubukang i-save
        // @ts-ignore
        description: error.message,
      })
      .catch((logErr) =>
        console.error("Failed to log audit error (saveDb):", logErr)
      );
    throw error;
  }
}

/**
 * I-update ang entity sa database at i-trigger ang subscriber lifecycle.
 *
 * @template T
 * @param {{ target: Function; save: (entity: T) => Promise<T>; findOne: (opts: any) => Promise<T | null> }} repo - TypeORM repository object.
 * @param {T} entity - Ang entity object na ipe-persist (dapat may `id`).
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.skipSignal=false] - Kung true, hindi ita-trigger ang subscriber methods.
 * @returns {Promise<T>} - Ang updated na entity mula sa database.
 */
async function updateDb(repo, entity, options = {}) {
  let oldEntity = null;
  try {
    const subscriber = findSubscriber(repo.target);
    const { skipSignal = false } = options;

    // Fetch old snapshot from DB for internal use
    // @ts-ignore
    oldEntity = await repo.findOne({ where: { id: entity.id } });

    if (!skipSignal && subscriber?.beforeUpdate) {
      await subscriber.beforeUpdate(entity);
    }

    const result = await repo.save(entity);

    if (!skipSignal && subscriber?.afterUpdate) {
      await subscriber.afterUpdate({ databaseEntity: oldEntity, entity: result });
    }

    return result;
  } catch (error) {
    // Log the error to audit trail
    const entityName = getEntityName(repo.target);
    await auditLogger
      .log({
        action: "UPDATE_FAILED",
        entity: entityName,
        // @ts-ignore
        entityId: entity.id,
        // @ts-ignore
        oldData: oldEntity, // maaaring undefined kung error bago ma-fetch
        // @ts-ignore
        newData: entity,
        // @ts-ignore
        description: error.message,
      })
      .catch((logErr) =>
        console.error("Failed to log audit error (updateDb):", logErr)
      );
    throw error;
  }
}

/**
 * I-remove ang entity sa database at i-trigger ang subscriber lifecycle.
 *
 * @template T
 * @param {{ target: Function; remove: (entity: T) => Promise<T>; findOne: (opts: any) => Promise<T | null> }} repo - TypeORM repository object.
 * @param {T} entity - Ang entity object na ipe-persist (dapat may `id`).
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.skipSignal=false] - Kung true, hindi ita-trigger ang subscriber methods.
 * @returns {Promise<T>} - Ang na-remove na entity mula sa database.
 */
async function removeDb(repo, entity, options = {}) {
  let oldEntity = null;
  try {
    const subscriber = findSubscriber(repo.target);
    const { skipSignal = false } = options;

    if (!skipSignal && subscriber?.beforeRemove) {
      await subscriber.beforeRemove(entity);
    }

    // @ts-ignore
    oldEntity = await repo.findOne({ where: { id: entity.id } });

    const result = await repo.remove(entity);

    if (!skipSignal && subscriber?.afterRemove) {
      // @ts-ignore
      await subscriber.afterRemove({ databaseEntity: oldEntity, entityId: result.id });
    }

    return result;
  } catch (error) {
    // Log the error to audit trail
    const entityName = getEntityName(repo.target);
    await auditLogger
      .log({
        action: "DELETE_FAILED",
        entity: entityName,
        // @ts-ignore
        entityId: entity.id,
        // @ts-ignore
        oldData: entity, // data na sinubukang i-delete
        // @ts-ignore
        description: error.message,
      })
      .catch((logErr) =>
        console.error("Failed to log audit error (removeDb):", logErr)
      );
    throw error;
  }
}

module.exports = { saveDb, updateDb, removeDb };