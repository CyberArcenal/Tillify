// // src/main/ipc/product/update_stock.ipc
// 

// src/main/ipc/product/update_stock.ipc
const productService = require("../../../services/Product");

module.exports = async (params, queryRunner) => {
  const { productId, quantityChange, movementType, notes, saleId, user = "system" } = params;

  if (!productId || typeof productId !== "number") {
    return { status: false, message: "Valid productId is required", data: null };
  }
  if (typeof quantityChange !== "number" || quantityChange === 0) {
    return { status: false, message: "quantityChange must be a non-zero number", data: null };
  }
  const validMovements = ["sale", "refund", "adjustment"];
  if (!validMovements.includes(movementType)) {
    return { status: false, message: `movementType must be one of: ${validMovements.join(", ")}`, data: null };
  }

  try {
    const result = await productService.updateStock(
      productId,
      quantityChange,
      movementType,
      notes || null,
      user,
      saleId || null,
      queryRunner
    );
    return {
      status: true,
      message: "Stock updated successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error in updateProductStock:", error);
    return {
      status: false,
      message: error.message || "Failed to update stock",
      data: null,
    };
  }
};


// /**
//  * @param {Object} params
//  * @param {number} params.productId
//  * @param {number} params.quantityChange - positive for increase, negative for decrease
//  * @param {string} params.movementType - 'sale', 'refund', 'adjustment'
//  * @param {string} [params.notes]
//  * @param {number} [params.saleId]
//  * @param {string} [params.user]
//  * @param {import("typeorm").QueryRunner} queryRunner
//  * @returns {Promise<{status: boolean, message: string, data: any}>}
//  */
// module.exports = async (params, queryRunner) => {
//   const { productId, quantityChange, movementType, notes, saleId, user = "system" } = params;

//   if (!productId || typeof productId !== "number") {
//     return { status: false, message: "Valid productId is required", data: null };
//   }
//   if (typeof quantityChange !== "number" || quantityChange === 0) {
//     return { status: false, message: "quantityChange must be a non-zero number", data: null };
//   }
//   const validMovements = ["sale", "refund", "adjustment"];
//   if (!validMovements.includes(movementType)) {
//     return { status: false, message: `movementType must be one of: ${validMovements.join(", ")}`, data: null };
//   }

//   try {
//     const productRepo = queryRunner.manager.getRepository("Product");
//     const movementRepo = queryRunner.manager.getRepository("InventoryMovement");

//     const product = await productRepo.findOne({ where: { id: productId } });
//     if (!product) {
//       return { status: false, message: `Product with ID ${productId} not found`, data: null };
//     }

//     const oldStock = product.stockQty;
//     const newStock = oldStock + quantityChange;
//     if (newStock < 0) {
//       return {
//         status: false,
//         message: `Insufficient stock. Current: ${oldStock}, requested change: ${quantityChange}`,
//         data: null,
//       };
//     }

//     // Update product stock
//     product.stockQty = newStock;
//     product.updatedAt = new Date();
//     const updatedProduct = await productRepo.save(product);

//     // Create inventory movement
//     const movement = movementRepo.create({
//       movementType,
//       qtyChange: quantityChange,
//       notes,
//       product: updatedProduct,
//       sale: saleId ? { id: saleId } : null,
//       timestamp: new Date(),
//     });
//     const savedMovement = await movementRepo.save(movement);

//     // Audit logs
//     const auditRepo = queryRunner.manager.getRepository("AuditLog");
//     await auditRepo.save([
//       {
//         action: "UPDATE",
//         entity: "Product",
//         entityId: productId,
//         user,
//         timestamp: new Date(),
//         description: `Stock changed from ${oldStock} to ${newStock} (${movementType})`,
//       },
//       {
//         action: "CREATE",
//         entity: "InventoryMovement",
//         entityId: savedMovement.id,
//         user,
//         timestamp: new Date(),
//         description: `Inventory movement recorded: ${movementType} ${quantityChange}`,
//       },
//     ]);

//     return {
//       status: true,
//       message: "Stock updated successfully",
//       data: { product: updatedProduct, movement: savedMovement },
//     };
//   } catch (error) {
//     console.error("Error in updateProductStock:", error);
//     return {
//       status: false,
//       // @ts-ignore
//       message: error.message || "Failed to update stock",
//       data: null,
//     };
//   }
// };