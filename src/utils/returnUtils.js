// utils/returnUtils.js


/**
 * Validate return/refund data
 * @param {Object} data - Return data to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateReturnData(data) {
  const errors = [];

  // Validate sale
  // @ts-ignore
  if (!data.saleId || typeof data.saleId !== 'number' || data.saleId <= 0) {
    errors.push('Sale ID is required and must be a positive number');
  }

  // Validate customer
  // @ts-ignore
  if (!data.customerId || typeof data.customerId !== 'number' || data.customerId <= 0) {
    errors.push('Customer ID is required and must be a positive number');
  }

  // Validate reference (optional)
  // @ts-ignore
  if (data.referenceNo !== undefined && data.referenceNo !== null) {
    // @ts-ignore
    if (typeof data.referenceNo !== 'string') {
      errors.push('Reference number must be a string');
    // @ts-ignore
    } else if (data.referenceNo.length > 50) {
      errors.push('Reference number must not exceed 50 characters');
    }
  }

  // Validate refund method
  // @ts-ignore
  if (!data.refundMethod || typeof data.refundMethod !== 'string') {
    errors.push('Refund method is required');
  // @ts-ignore
  } else if (!['Cash', 'Card', 'Store Credit'].includes(data.refundMethod)) {
    errors.push('Refund method must be one of: Cash, Card, Store Credit');
  }

  // Validate status
  // @ts-ignore
  if (data.status && !['pending', 'processed', 'cancelled'].includes(data.status)) {
    errors.push('Status must be one of: pending, processed, cancelled');
  }

  // Validate items
  // @ts-ignore
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push('At least one return item is required');
  } else {
    // @ts-ignore
    data.items.forEach((item, index) => {
      if (!item.productId || typeof item.productId !== 'number' || item.productId <= 0) {
        errors.push(`Item ${index + 1}: Product ID is required and must be a positive number`);
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors.push(`Item ${index + 1}: Quantity must be a positive number`);
      }
      if (!item.unitPrice || typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
        errors.push(`Item ${index + 1}: Unit price must be a positive number`);
      }
      // Reason is optional
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateReturnData,
};