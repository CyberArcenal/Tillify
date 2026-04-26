
const { AppDataSource } = require("../../../db/datasource");
const Customer = require("../../../../entities/Customer");
const Sale = require("../../../../entities/Sale");

/**
 * Get active customers (those with at least one sale)
 * @param {Object} params
 * @param {number} [params.limit] - Max number of results
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { limit } = params;

    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const customerRepo = AppDataSource.getRepository(Customer);

    // Using subquery to find customers with at least one sale
    const queryBuilder = customerRepo
      .createQueryBuilder("customer")
      .where((qb) => {
        const subQuery = qb
          .subQuery()
          .select("sale.customerId")
          .from(Sale, "sale")
          .where("sale.customerId IS NOT NULL")
          .getQuery();
        return "customer.id IN " + subQuery;
      });

    if (limit) {
      queryBuilder.take(Number(limit));
    }

    const customers = await queryBuilder.getMany();

    return {
      status: true,
      message: "Active customers retrieved successfully",
      data: customers,
    };
  } catch (error) {
    console.error("Error in getActiveCustomers:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to retrieve active customers",
      data: null,
    };
  }
};
