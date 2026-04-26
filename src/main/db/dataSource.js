// src/main/db/datasource.js

const fs = require("fs");
const path = require("path");
const { DataSource } = require("typeorm");
const { getDatabaseConfig } = require("./database");

// Import Entity constants

const { AuditLog } = require("../../entities/AuditLog");
const Customer = require("../../entities/Customer");
const InventoryMovement = require("../../entities/InventoryMovement");
const LicenseCache = require("../../entities/LicenseCache");
const LoyaltyTransaction = require("../../entities/LoyaltyTransaction");
const Product = require("../../entities/Product");
const Sale = require("../../entities/Sale");
const SaleItem = require("../../entities/SaleItem");
const { SystemSetting } = require("../../entities/systemSettings");
const Category = require("../../entities/Category");
const NotificationLog = require("../../entities/NotificationLog");
const Purchase = require("../../entities/Purchase");
const PurchaseItem = require("../../entities/PurchaseItem");
const ReturnRefund = require("../../entities/ReturnRefund");
const ReturnRefundItem = require("../../entities/ReturnRefundItem");
const Supplier = require("../../entities/Supplier");
const Notification = require("../../entities/Notification");

const config = getDatabaseConfig();

const entities = [
  AuditLog,
  Customer,
  InventoryMovement,
  LicenseCache,
  LoyaltyTransaction,
  Product,
  Sale,
  SaleItem,
  SystemSetting,
  Category,
  NotificationLog,
  Purchase,
  PurchaseItem,
  ReturnRefund,
  ReturnRefundItem,
  Supplier,
  Notification,
];

const dataSourceOptions = {
  ...config,
  entities,
  migrations: Array.isArray(config.migrations)
    ? config.migrations
    : [config.migrations],
};

// @ts-ignore
const AppDataSource = new DataSource(dataSourceOptions);

module.exports = { AppDataSource };
