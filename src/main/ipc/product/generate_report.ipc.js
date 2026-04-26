// // src/main/ipc/product/generate_report.ipc
// 
// src/main/ipc/product/generate_report.ipc
const fs = require("fs").promises;
const path = require("path");
const { app } = require("electron");
const productService = require("../../../services/Product");
const { AppDataSource } = require("../../db/datasource");
const SaleItem = require("../../../entities/SaleItem");

module.exports = async (params) => {
  const { startDate, endDate, format = "json", user = "system" } = params;

  try {
    const products = await productService.findAll({ isActive: true });
    const stats = await productService.getStatistics();

    let salesData = [];
    if (startDate && endDate) {
      const saleItemRepo = AppDataSource.getRepository(SaleItem);
      const query = saleItemRepo
        .createQueryBuilder("saleItem")
        .leftJoin("saleItem.sale", "sale")
        .leftJoin("saleItem.product", "product")
        .select([
          "product.id AS productId",
          "product.name AS productName",
          "SUM(saleItem.quantity) AS totalSold",
          "SUM(saleItem.lineTotal) AS revenue",
        ])
        .where("sale.status = :status", { status: "paid" })
        .andWhere("sale.timestamp BETWEEN :start AND :end", {
          start: new Date(startDate),
          end: new Date(endDate),
        })
        .groupBy("product.id");

      salesData = await query.getRawMany();
    }

    const report = {
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      statistics: stats,
      products: products.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        stockQty: p.stockQty,
        isActive: p.isActive,
      })),
      sales: salesData,
    };

    const userDataPath = app.getPath("userData");
    const reportDir = path.join(userDataPath, "reports");
    await fs.mkdir(reportDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let filePath;
    if (format === "csv") {
      const headers = ["ID", "SKU", "Name", "Price", "StockQty"];
      const rows = products.map(p => [p.id, p.sku, p.name, p.price, p.stockQty]);
      const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
      filePath = path.join(reportDir, `product_report_${timestamp}.csv`);
      await fs.writeFile(filePath, csvContent);
    } else {
      filePath = path.join(reportDir, `product_report_${timestamp}.json`);
      await fs.writeFile(filePath, JSON.stringify(report, null, 2));
    }

    // Audit logging for reports is read‑only; logActivity removed
    return {
      status: true,
      message: "Product report generated",
      data: { filePath, report },
    };
  } catch (error) {
    console.error("Error in generateProductReport:", error);
    return {
      status: false,
      message: error.message || "Report generation failed",
      data: null,
    };
  }
};

// const fs = require("fs").promises;
// const path = require("path");
// const { app } = require("electron");
// const productService = require("../../../services/Product");
// const { AppDataSource } = require("../../db/datasource");
// const SaleItem = require("../../../entities/SaleItem");

// /**
//  * @param {Object} params
//  * @param {string} [params.startDate]
//  * @param {string} [params.endDate]
//  * @param {string} [params.format] - 'json' or 'csv' (default 'json')
//  * @param {string} [params.user]
//  * @returns {Promise<{status: boolean, message: string, data: any}>}
//  */
// module.exports = async (params) => {
//   const { startDate, endDate, format = "json", user = "system" } = params;

//   try {
//     // Gather data
//     const products = await productService.findAll({ isActive: true });
//     const stats = await productService.getStatistics();

//     // Sales data for the period
//     let salesData = [];
//     if (startDate && endDate) {
//       const saleItemRepo = AppDataSource.getRepository(SaleItem);
//       const query = saleItemRepo
//         .createQueryBuilder("saleItem")
//         .leftJoin("saleItem.sale", "sale")
//         .leftJoin("saleItem.product", "product")
//         .select([
//           "product.id AS productId",
//           "product.name AS productName",
//           "SUM(saleItem.quantity) AS totalSold",
//           "SUM(saleItem.lineTotal) AS revenue",
//         ])
//         .where("sale.status = :status", { status: "paid" })
//         .andWhere("sale.timestamp BETWEEN :start AND :end", {
//           start: new Date(startDate),
//           end: new Date(endDate),
//         })
//         .groupBy("product.id");

//       salesData = await query.getRawMany();
//     }

//     const report = {
//       generatedAt: new Date().toISOString(),
//       period: { startDate, endDate },
//       statistics: stats,
//       products: products.map(p => ({
//         id: p.id,
//         sku: p.sku,
//         name: p.name,
//         price: p.price,
//         stockQty: p.stockQty,
//         isActive: p.isActive,
//       })),
//       sales: salesData,
//     };

//     // Save report to file
//     const userDataPath = app.getPath("userData");
//     const reportDir = path.join(userDataPath, "reports");
//     await fs.mkdir(reportDir, { recursive: true });
//     const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
//     let filePath;
//     if (format === "csv") {
//       // Simple CSV for products list (you could expand)
//       const headers = ["ID", "SKU", "Name", "Price", "StockQty"];
//       const rows = products.map(p => [p.id, p.sku, p.name, p.price, p.stockQty]);
//       const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
//       filePath = path.join(reportDir, `product_report_${timestamp}.csv`);
//       await fs.writeFile(filePath, csvContent);
//     } else {
//       filePath = path.join(reportDir, `product_report_${timestamp}.json`);
//       await fs.writeFile(filePath, JSON.stringify(report, null, 2));
//     }

//     await productService.logActivity(user, "REPORT", `Generated product report: ${filePath}`);

//     return {
//       status: true,
//       message: "Product report generated",
//       data: { filePath, report },
//     };
//   } catch (error) {
//     console.error("Error in generateProductReport:", error);
//     return {
//       status: false,
//       message: error.message || "Report generation failed",
//       data: null,
//     };
//   }
// };