// src/main/ipc/inventory/generate_report.ipc.js


const inventoryMovementService = require("../../../services/InventoryMovement");
const productService = require("../../../services/Product");


/**
 * Generate a comprehensive inventory report with summary and movements.
 * @param {Object} params
 * @param {string} [params.startDate] - ISO date.
 * @param {string} [params.endDate] - ISO date.
 * @param {string} [params.user="system"]
 * @param {import("typeorm").QueryRunner} [queryRunner]
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params, queryRunner) => {
  try {
    const { startDate, endDate, user = "system" } = params;

    // Product summary using ProductService (read-only, no transaction needed)
    const products = await productService.findAll({ isActive: true });
    const productSummary = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      currentStock: p.stockQty,
      price: p.price,
    }));

    // Movement summary within date range using InventoryMovementService
    const movements = await inventoryMovementService.findAll(
      { startDate, endDate },
      queryRunner
    );

    // Group by type
    const byType = movements.reduce((acc, m) => {
      acc[m.movementType] = acc[m.movementType] || { count: 0, totalChange: 0 };
      acc[m.movementType].count++;
      acc[m.movementType].totalChange += m.qtyChange;
      return acc;
    }, {});

    // Top 5 moved products
    const productMovementCount = {};
    movements.forEach((m) => {
      if (m.product) {
        const pid = m.product.id;
        productMovementCount[pid] = productMovementCount[pid] || { count: 0, netChange: 0, name: m.product.name };
        productMovementCount[pid].count++;
        productMovementCount[pid].netChange += m.qtyChange;
      }
    });
    const topProducts = Object.values(productMovementCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const report = {
      generatedAt: new Date().toISOString(),
      dateRange: { startDate, endDate },
      productSummary,
      movementSummary: {
        totalMovements: movements.length,
        byType,
      },
      topProducts,
      recentMovements: movements.slice(0, 50),
    };

    return {
      status: true,
      message: "Report generated",
      data: report,
    };
  } catch (error) {
    console.error("Error in generateInventoryReport:", error);
    return {
      status: false,
      message: error.message || "Report generation failed",
      data: null,
    };
  }
};