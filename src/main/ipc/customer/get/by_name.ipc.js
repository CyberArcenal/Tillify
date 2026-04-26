
const { AppDataSource } = require("../../../db/dataSource");
const Customer = require("../../../../entities/Customer");
const { Like } = require("typeorm");

/**
 * Find customers by name (partial match)
 * @param {Object} params
 * @param {string} params.name - Name to search
 * @param {number} [params.limit] - Max number of results
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { name, limit } = params;
    if (!name || typeof name !== "string") {
      throw new Error("Name is required");
    }

    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(Customer);

    const customers = await repo.find({
      where: { name: Like(`%${name}%`) },
      take: limit ? Number(limit) : undefined,
      order: { name: "ASC" },
    });

    return {
      status: true,
      message: "Customers retrieved successfully",
      data: customers,
    };
  } catch (error) {
    console.error("Error in getCustomersByName:", error);
    return {
      status: false,
      message: error.message || "Failed to retrieve customers",
      data: null,
    };
  }
};
