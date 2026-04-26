// utils/categoryUtils.js


/**
 * Validate category data
 * @param {Object} data - Category data to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCategoryData(data) {
  const errors = [];

  // @ts-ignore
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push('Category name is required and must be a non-empty string');
  // @ts-ignore
  } else if (data.name.length > 100) {
    errors.push('Category name must not exceed 100 characters');
  }

  // @ts-ignore
  if (data.description !== undefined && data.description !== null) {
    // @ts-ignore
    if (typeof data.description !== 'string') {
      errors.push('Description must be a string');
    // @ts-ignore
    } else if (data.description.length > 500) {
      errors.push('Description must not exceed 500 characters');
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
  validateCategoryData,
};