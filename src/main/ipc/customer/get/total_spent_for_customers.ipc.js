// src/main/ipc/customer/get/total_spent_for_customers.ipc.js

const { AppDataSource } = require("../../../db/datasource");
const Sale = require("../../../../entities/Sale");

/**
 * Get total amount spent for multiple customers (batch request)
 * @param {{ customerIds: number[] }} params
 * @returns {Promise<{ status: boolean; message: string; data: Record<number, number> }>}
 */
module.exports = async (params) => {
  try {
    const { customerIds } = params;

    if (
      !customerIds ||
      !Array.isArray(customerIds) ||
      customerIds.length === 0
    ) {
      return {
        status: true,
        message: "No customer IDs provided",
        data: {},
      };
    }

    const saleRepository = AppDataSource.getRepository(Sale);

    // Use QueryBuilder to get total spent per customer (only paid sales)
    const result = await saleRepository
      .createQueryBuilder("sale")
      .select("sale.customerId", "customerId")
      .addSelect("SUM(sale.totalAmount)", "totalSpent")
      .where("sale.customerId IN (:...customerIds)", { customerIds })
      .andWhere("sale.status = :status", { status: "paid" }) // Only count paid sales
      .groupBy("sale.customerId")
      .getRawMany();

    // Convert array to Record<number, number>
    const totalsMap = {};
    result.forEach((row) => {
      // @ts-ignore
      totalsMap[row.customerId] = parseFloat(row.totalSpent) || 0;
    });

    // Include customers with zero spent (optional, but good for completeness)
    customerIds.forEach((id) => {
      // @ts-ignore
      if (!totalsMap[id]) {
        // @ts-ignore
        totalsMap[id] = 0;
      }
    });

    return {
      status: true,
      message: "Total spent retrieved successfully",
      // @ts-ignore
      data: totalsMap,
    };
  } catch (error) {
    console.error("Error in getTotalSpentForCustomers:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to retrieve total spent",
      data: {},
    };
  }
};
