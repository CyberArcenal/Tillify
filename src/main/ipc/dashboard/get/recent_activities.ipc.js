// src/main/ipc/dashboard/get/recent_activities.ipc.js
const { AuditLog } = require("../../../../entities/AuditLog");
const InventoryMovement = require("../../../../entities/InventoryMovement");
const Sale = require("../../../../entities/Sale");
const { AppDataSource } = require("../../../db/dataSource");
const { format } = require("date-fns");

/**
 * Get recent activities (sales, inventory movements, audit logs) – last 10 of each type
 * @param {Object} params - { limit?: number }
 */
module.exports = async (params = {}) => {
  try {
    const limit = params.limit || 10;


    const saleRepo = AppDataSource.getRepository(Sale);
    const invRepo = AppDataSource.getRepository(InventoryMovement);
    const auditRepo = AppDataSource.getRepository(AuditLog);

    // Recent sales (with customer name if available)
    const recentSales = await saleRepo
      .createQueryBuilder("sale")
      .leftJoinAndSelect("sale.customer", "customer")
      .orderBy("sale.timestamp", "DESC")
      .take(limit)
      .getMany();

    const salesFormatted = recentSales.map((s) => ({
      type: "sale",
      id: s.id,
      description: `Sale #${s.id} - ${s.status} - $${s.totalAmount}`,
      customer: s.customer?.name || "Guest",
      timestamp: s.timestamp,
      formattedTime: format(s.timestamp, "yyyy-MM-dd HH:mm"),
    }));

    // Recent inventory movements
    const recentMovements = await invRepo
      .createQueryBuilder("mov")
      .leftJoinAndSelect("mov.product", "product")
      .leftJoinAndSelect("mov.sale", "sale")
      .orderBy("mov.timestamp", "DESC")
      .take(limit)
      .getMany();

    const movementsFormatted = recentMovements.map((m) => ({
      type: "inventory",
      id: m.id,
      description: `${m.movementType} - ${m.qtyChange} x ${m.product?.name || "?"}`,
      product: m.product?.name,
      timestamp: m.timestamp,
      formattedTime: format(m.timestamp, "yyyy-MM-dd HH:mm"),
    }));

    // Recent audit logs
    const recentAudits = await auditRepo
      .createQueryBuilder("audit")
      .orderBy("audit.timestamp", "DESC")
      .take(limit)
      .getMany();

    const auditsFormatted = recentAudits.map((a) => ({
      type: "audit",
      id: a.id,
      description: `${a.action} on ${a.entity} #${a.entityId}`,
      user: a.user,
      timestamp: a.timestamp,
      formattedTime: format(a.timestamp, "yyyy-MM-dd HH:mm"),
    }));

    // Combine, sort by timestamp descending, and limit total
    const allActivities = [...salesFormatted, ...movementsFormatted, ...auditsFormatted]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit * 3); // return up to 30 items

    return {
      status: true,
      message: "Recent activities retrieved",
      data: allActivities,
    };
  } catch (error) {
    console.error("Error in getRecentActivities:", error);
    return {
      status: false,
      message: error.message || "Failed to get recent activities",
      data: null,
    };
  }
};