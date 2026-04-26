// src/main/ipc/supplier/search.ipc

const supplierService = require("../../../services/SupplierService");
const { logger } = require("../../../utils/logger");

/**
 * Search suppliers by term (name, contact, address)
 * @param {Object} params
 * @param {string} params.term - Search term
 * @param {boolean} [params.isActive] - Optional active filter
 * @returns {Promise<{status: boolean, message?: string, data?: any}>}
 */
module.exports = async (params) => {
  const { term, isActive } = params;
  if (!term || typeof term !== "string") {
    return {
      status: false,
      message: "Search term is required",
      data: null,
    };
  }

  try {
    const suppliers = await supplierService.findAll({
      search: term,
      isActive,
    });
    return {
      status: true,
      data: suppliers,
    };
  } catch (error) {
    logger?.error("searchSuppliers error:", error);
    return {
      status: false,
      message: error.message || "Failed to search suppliers",
      data: null,
    };
  }
};