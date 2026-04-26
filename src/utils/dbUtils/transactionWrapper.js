

const { AppDataSource } = require("../../main/db/dataSource");

class TransactionError extends Error {
  /**
   * @param {string | undefined} message
   */
  constructor(message, originalError = null) {
    super(message);
    this.name = "TransactionError";
    /**
     * @type {null}
     */
    // @ts-ignore
    this.originalError = originalError;
  }
}

/**
 * Wraps database operations in a transaction using TypeORM
 * @param {Function} operation - Async function containing database operations
 * @param {Object} options - Transaction options
 * @param {string} options.name - Name of the transaction for logging
 * @param {boolean} options.autoRollbackOnError - Whether to automatically rollback on error
 * @param {number} options.timeout - Transaction timeout in milliseconds
 * @returns {Promise<any>} Result of the operation
 */
// @ts-ignore
async function withTransaction(operation, options = {}) {
  const {
    name = "unnamed_transaction",
    autoRollbackOnError = true,
    timeout = 30000,
  } = options;

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let transactionTimeout = null;
  console.log(`[Transaction] Starting transaction: ${name}`);

  try {
    // Set transaction timeout
    if (timeout > 0) {
      transactionTimeout = setTimeout(async () => {
        console.warn(`[Transaction] Timeout reached for transaction: ${name}`);
        await queryRunner.rollbackTransaction();
      }, timeout);
    }

    // Execute the operation with query runner
    const result = await operation(queryRunner);

    // Commit transaction
    await queryRunner.commitTransaction();
    if (transactionTimeout) clearTimeout(transactionTimeout);

    console.log(`[Transaction] Successfully committed: ${name}`);
    return result;
  } catch (error) {
    console.error(`[Transaction] Error in transaction ${name}:`, error);

    // Rollback if autoRollbackOnError is true
    if (autoRollbackOnError) {
      try {
        await queryRunner.rollbackTransaction();
        console.log(`[Transaction] Rolled back: ${name}`);
      } catch (rollbackError) {
        console.error(
          `[Transaction] Failed to rollback ${name}:`,
          rollbackError
        );
      }
    }

    if (transactionTimeout) clearTimeout(transactionTimeout);
    throw error;
  } finally {
    // Always release the query runner
    await queryRunner.release();
  }
}

/**
 * Creates a transactional handler for IPC methods
 * @param {Function} handlerMethod - The handler method to wrap
 * @param {Object} options - Transaction options
 * @returns {Function} Wrapped handler function
 */
function createTransactionalHandler(handlerMethod, options = {}) {
  // @ts-ignore
  return async function (/** @type {any} */ eventOrPayload, /** @type {any} */ payload) {
    // @ts-ignore
    const transactionName = options.name || handlerMethod.name || "ipc_handler";
    
    // 确定哪个参数是真正的 payload
    const actualPayload = payload !== undefined ? payload : eventOrPayload;
    
    return await withTransaction(
      async (/** @type {any} */ queryRunner) => {
        const result = await handlerMethod(actualPayload, queryRunner);
        
        if (result && result.status === false) {
          throw new TransactionError(
            `Transaction "${transactionName}" failed: status=false`
          );
        }
        
        return result;
      },
      // @ts-ignore
      { ...options, name: transactionName }
    );
  // @ts-ignore
  }.bind(this);
}

/**
 * Higher-order function to create transactional class methods for TypeORM
 * @param {Array<string>} methodNames - Names of methods to wrap
 * @param {Object} options - Transaction options
 * @returns {Function} Class decorator
 */
function transactionalMethods(methodNames, options = {}) {
  return function (/** @type {{ prototype: { [x: string]: (...args: any[]) => Promise<any>; }; name: any; }} */ target) {
    methodNames.forEach((methodName) => {
      const originalMethod = target.prototype[methodName];

      if (typeof originalMethod === "function") {
        target.prototype[methodName] = async function (/** @type {any} */ ...args) {
          const transactionName =
            // @ts-ignore
            options.name || `${target.name}.${methodName}`;

          return await withTransaction(
            async (/** @type {any} */ queryRunner) => {
              // Pass queryRunner as additional argument
              return await originalMethod.apply(this, [...args, queryRunner]);
            },
            // @ts-ignore
            {
              ...options,
              name: transactionName,
            }
          );
        };
      }
    });

    return target;
  };
}

/**
 * Utility to check if currently in a transaction
 * @returns {boolean} True if in transaction
 */
function isInTransaction() {
  try {
    // This is a simple check. TypeORM doesn't expose an easy way to check if we're in a transaction.
    // In practice, you might need to track this yourself or rely on queryRunner.isTransactionActive
    // However, queryRunner is not globally accessible.
    return false;
  } catch {
    return false;
  }
}

/**
 * Retry utility for transient transaction failures
 * @param {Function} operation - Operation to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Operation result
 */
async function withRetry(operation, options = {}) {
  const {
    // @ts-ignore
    maxRetries = 3,
    // @ts-ignore
    initialDelay = 100,
    // @ts-ignore
    maxDelay = 5000,
    // @ts-ignore
    backoffFactor = 2,
    // @ts-ignore
    retryableErrors = ["TransactionError", "QueryFailedError"],
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const shouldRetry = retryableErrors.some(
        (/** @type {any} */ errorPattern) =>
          // @ts-ignore
          error.message.includes(errorPattern) || error.name === errorPattern
      );

      if (!shouldRetry || attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt - 1),
        maxDelay
      );

      console.log(
        `[Transaction] Retry ${attempt}/${maxRetries} after ${delay}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Batch transaction for bulk operations using TypeORM
 * @param {Array<Function>} operations - Array of async operations
 * @param {Object} options - Batch options
 */
async function batchTransaction(operations, options = {}) {
  const {
    // @ts-ignore
    batchSize = 50,
    // @ts-ignore
    name = "batch_transaction",
    // @ts-ignore
    continueOnError = false,
  } = options;

  const results = [];
  const errors = [];

  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    const batchName = `${name}_batch_${Math.floor(i / batchSize) + 1}`;

    try {
      const batchResults = await withTransaction(
        async (/** @type {any} */ queryRunner) => {
          const batchPromises = batch.map((operation, index) =>
            operation(queryRunner).catch((/** @type {{ message: any; }} */ error) => {
              if (continueOnError) {
                errors.push({
                  operationIndex: i + index,
                  error: error.message,
                });
                return null;
              }
              throw error;
            })
          );

          return await Promise.all(batchPromises);
        },
        // @ts-ignore
        { name: batchName }
      );

      results.push(...batchResults);
    } catch (error) {
      if (!continueOnError) {
        throw error;
      }
      errors.push({
        batchIndex: Math.floor(i / batchSize),
        // @ts-ignore
        error: error.message,
      });
    }
  }

  return {
    results,
    errors: errors.length > 0 ? errors : null,
    totalProcessed: results.filter((r) => r !== null).length,
    totalFailed: errors.length,
  };
}

/**
 * Manual transaction control for complex scenarios
 */
class ManualTransaction {
  constructor() {
    this.queryRunner = null;
    this.transactionActive = false;
  }

  async begin(options = {}) {
    if (this.transactionActive) {
      throw new Error("Transaction already active");
    }

    this.queryRunner = AppDataSource.createQueryRunner();
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();
    this.transactionActive = true;
    
    // @ts-ignore
    console.log(`[ManualTransaction] Started: ${options.name || "unnamed"}`);
  }

  async commit() {
    if (!this.transactionActive) {
      throw new Error("No active transaction to commit");
    }

    // @ts-ignore
    await this.queryRunner.commitTransaction();
    this.transactionActive = false;
    await this.release();
    
    console.log("[ManualTransaction] Committed");
  }

  async rollback() {
    if (!this.transactionActive) {
      throw new Error("No active transaction to rollback");
    }

    // @ts-ignore
    await this.queryRunner.rollbackTransaction();
    this.transactionActive = false;
    await this.release();
    
    console.log("[ManualTransaction] Rolled back");
  }

  async release() {
    if (this.queryRunner) {
      await this.queryRunner.release();
      this.queryRunner = null;
    }
  }

  /**
   * @param {import("typeorm").EntityTarget<import("typeorm").ObjectLiteral>} entity
   */
  getRepository(entity) {
    if (!this.queryRunner || !this.transactionActive) {
      throw new Error("Transaction not active");
    }
    return this.queryRunner.manager.getRepository(entity);
  }

  isActive() {
    return this.transactionActive;
  }
}

module.exports = {
  withTransaction,
  createTransactionalHandler,
  transactionalMethods,
  isInTransaction,
  withRetry,
  batchTransaction,
  TransactionError,
  ManualTransaction,
};