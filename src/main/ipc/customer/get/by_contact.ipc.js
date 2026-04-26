
const { AppDataSource } = require("../../../db/dataSource");
const Customer = require("../../../../entities/Customer");

/**
 * Find customer by contact info (email/phone)
 * @param {Object} params
 * @param {string} params.contact - Contact info to search
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { contact } = params;
    if (!contact || typeof contact !== "string") {
      throw new Error("Contact info is required");
    }

    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(Customer);

    const customer = await repo.findOne({
      where: { contactInfo: contact },
    });

    if (!customer) {
      return {
        status: false,
        message: "Customer not found with that contact info",
        data: null,
      };
    }

    return {
      status: true,
      message: "Customer retrieved successfully",
      data: customer,
    };
  } catch (error) {
    console.error("Error in getCustomerByContact:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to retrieve customer",
      data: null,
    };
  }
};
