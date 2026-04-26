// src/utils/errorHandler.js


const { safeStringify } = require("../utils/logger");


// Kung wala ang TransactionError, gumawa tayo ng fallback
/**
 * @type {typeof import("../utils/dbUtils/transactionWrapper").TransactionError}
 */
let TransactionError;
try {
  TransactionError = require("../utils/dbUtils/transactionWrapper").TransactionError;
} catch (err) {
  // Fallback class kung hindi available ang transactionWrapper
  // @ts-ignore
  class TransactionError extends Error {
    /**
     * @param {string | undefined} message
     * @param {any} originalError
     */
    constructor(message, originalError) {
      super(message);
      this.name = "TransactionError";
      this.originalError = originalError;
    }
  }
}

/**
 * Normalize any error into a standard ErrorResponse and log it.
 * @param {string} error
 */
function normalizeError(error) {
  let message = "An unexpected error occurred";
  let code = "UNKNOWN_ERROR";
  let details = null;
  let original = null;

  // Check if TransactionError is defined and error is instance of it
  // @ts-ignore
  if (TransactionError && error instanceof TransactionError) {
    message = error.message || "Transaction failed";
    code = "TRANSACTION_ERROR";
    original = error.originalError || null;
    details = original
      ? original.stack || String(original)
      : error.stack || String(error);
  // @ts-ignore
  } else if (error instanceof Error) {
    message = error.message || message;
    code = error.name || "ERROR";
    details = error.stack || message;
    original = error;
  } else if (typeof error === "string") {
    message = error;
    code = "STRING_ERROR";
    details = error;
  } else {
    // Non-standard thrown value (object, number, etc.)
    try {
      details = safeStringify(error);
    } catch {
      details = String(error);
    }
    code = "NON_STANDARD_ERROR";
    original = error;
    message = String(error);
  }

  return { message, code, details, original };
}

/**
 * @param {unknown} error
 * @param {string} context
 */
function handleError(error, context) {
  const ctx = context || "ErrorHandler";
  // @ts-ignore
  const normalized = normalizeError(error);

  // Build meta payload with safe stringify for logging
  const meta = {
    code: normalized.code,
    details: normalized.details || "No details available",
    ...(normalized.original && { original: normalized.original }),
  };

  // Log with context and meta
  // @ts-ignore
  logger.error(normalized.message, {
    context: ctx,
    meta,
  });

  // Return a consistent error response object
  return {
    status: false,
    message: normalized.message,
    code: normalized.code,
    details: normalized.details,
    ...(normalized.original && { original: normalized.original }),
  };
}

/**
 * Wrap async handler functions with error handling
 * Returns the handler result or the normalized error response.
 * @param {{ (arg0: any): any; (arg0: any): any; name: any; }} handler
 * @param {any} context
 */
function withErrorHandling(handler, context) {
  return async (/** @type {any} */ ...args) => {
    try {
      // @ts-ignore
      return await handler(...args);
    } catch (error) {
      // Log and return normalized response
      return handleError(error, context || handler.name || "UnknownHandler");
    }
  };
}

module.exports = {
  handleError,
  withErrorHandling,
  normalizeError,
  // @ts-ignore
  ...(TransactionError && { TransactionError }),
};
