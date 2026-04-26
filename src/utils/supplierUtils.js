// utils/supplierUtils.js


/**
 * Validate supplier data
 * @param {Object} data - Supplier data to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSupplierData(data) {
  const errors = [];

  // @ts-ignore
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push('Supplier name is required and must be a non-empty string');
  // @ts-ignore
  } else if (data.name.length > 100) {
    errors.push('Supplier name must not exceed 100 characters');
  }

  // @ts-ignore
  if (data.contactInfo !== undefined && data.contactInfo !== null) {
    // @ts-ignore
    if (typeof data.contactInfo !== 'string') {
      errors.push('Contact info must be a string');
    // @ts-ignore
    } else if (data.contactInfo.length > 200) {
      errors.push('Contact info must not exceed 200 characters');
    }
  }

  // @ts-ignore
  if (data.address !== undefined && data.address !== null) {
    // @ts-ignore
    if (typeof data.address !== 'string') {
      errors.push('Address must be a string');
    // @ts-ignore
    } else if (data.address.length > 500) {
      errors.push('Address must not exceed 500 characters');
    }
  }

  // @ts-ignore
  if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
    errors.push('isActive must be a boolean value');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateSupplierData,
};