// utils/purchaseUtils.js


/**
 * Validate purchase data
 * @param {Object} data - Purchase data to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePurchaseData(data) {
  const errors = [];

  // Validate supplier
  // @ts-ignore
  if (!data.supplierId || typeof data.supplierId !== 'number' || data.supplierId <= 0) {
    errors.push('Supplier ID is required and must be a positive number');
  }

  // Validate reference (optional but if provided should be string)
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

  // Validate status
  // @ts-ignore
  if (data.status && !['pending', 'completed', 'cancelled'].includes(data.status)) {
    errors.push('Status must be one of: pending, completed, cancelled');
  }

  // Validate items
  // @ts-ignore
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push('At least one purchase item is required');
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
    });
  }

  // Validate orderDate (optional, if provided must be valid date)
  // @ts-ignore
  if (data.orderDate && !(data.orderDate instanceof Date) && isNaN(Date.parse(data.orderDate))) {
    errors.push('Order date must be a valid date');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validatePurchaseData,
};