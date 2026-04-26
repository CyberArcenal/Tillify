// seedData.js
// Tillify System Seeder - Food/Restaurant/Fastfood Edition
// Run with: npm run seed [options]

const { DataSource } = require("typeorm");
const { AppDataSource } = require("../main/db/dataSource");

// Existing entities
const Customer = require("../entities/Customer");
const Product = require("../entities/Product");
const Sale = require("../entities/Sale");
const SaleItem = require("../entities/SaleItem");
const InventoryMovement = require("../entities/InventoryMovement");
const LoyaltyTransaction = require("../entities/LoyaltyTransaction");
const { AuditLog } = require("../entities/AuditLog");
const { SystemSetting } = require("../entities/systemSettings");

// New entities
const Category = require("../entities/Category");
const Supplier = require("../entities/Supplier");
const Purchase = require("../entities/Purchase");
const PurchaseItem = require("../entities/PurchaseItem");
const ReturnRefund = require("../entities/ReturnRefund");
const ReturnRefundItem = require("../entities/ReturnRefundItem");
const NotificationLog = require("../entities/NotificationLog");

// ========== CONFIGURATION ==========
const DEFAULT_CONFIG = {
  productCount: 60,      // more products for a diverse menu
  customerCount: 30,
  saleCount: 100,
  inventoryMovementCount: 150,
  loyaltyTransactionCount: 80,
  auditLogCount: 60,
  categoryCount: 6,
  supplierCount: 8,
  purchaseCount: 30,
  returnRefundCount: 20,
  notificationLogCount: 50,
  clearOnly: false,
  skipProducts: false,
  skipCustomers: false,
  skipSales: false,
  skipInventoryMovements: false,
  skipLoyaltyTransactions: false,
  skipAuditLogs: false,
  skipSystemSettings: false,
  skipCategories: false,
  skipSuppliers: false,
  skipPurchases: false,
  skipReturnRefunds: false,
  skipNotificationLogs: false,
};

// ========== RANDOM HELPERS (with food theme) ==========
const random = {
  int: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  float: (min, max, decimals = 2) =>
    +(Math.random() * (max - min) + min).toFixed(decimals),
  date: (start, end) =>
    new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime()),
    ),
  pastDate: () => random.date(new Date(2024, 0, 1), new Date()),
  futureDate: () => random.date(new Date(), new Date(2026, 11, 31)),
  element: (arr) => arr[Math.floor(Math.random() * arr.length)],
  boolean: (probability = 0.5) => Math.random() < probability,
  sku: (usedSet) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let sku;
    do {
      sku = Array.from(
        { length: 8 },
        () => chars[random.int(0, chars.length - 1)],
      ).join("");
    } while (usedSet.has(sku));
    usedSet.add(sku);
    return sku;
  },
  barcode: (usedSet) => {
    let barcode;
    do {
      barcode = Array.from({ length: 13 }, () => random.int(0, 9)).join("");
    } while (usedSet.has(barcode));
    usedSet.add(barcode);
    return barcode;
  },
  phone: () => `+63${random.int(900000000, 999999999)}`,
  email: (prefix) => `${prefix}${random.int(1, 999)}@example.com`,
  name: () => {
    const first = [
      "John", "Jane", "Michael", "Sarah", "David", "Maria", "James", "Patricia", "Robert", "Jennifer",
      "Marco", "Angela", "Ramon", "Luz", "Eduardo", "Teresa"
    ];
    const last = [
      "Smith", "Doe", "Johnson", "Brown", "Davis", "Garcia", "Rodriguez", "Wilson", "Martinez", "Taylor",
      "Santos", "Reyes", "Cruz", "Aquino", "Gonzales"
    ];
    return `${random.element(first)} ${random.element(last)}`;
  },
  
  // ---------- Food-specific product names ----------
  productName: () => {
    const items = {
      burgers: [
        "Cheeseburger", "Double Cheeseburger", "Bacon Burger", "Chicken Burger", 
        "Veggie Burger", "Mushroom Swiss Burger", "BBQ Burger", "Teri Burger",
        "Angus Beef Burger", "Spicy Chicken Burger"
      ],
      fries: [
        "French Fries", "Curly Fries", "Sweet Potato Fries", "Garlic Fries", 
        "Cheese Fries", "Chili Cheese Fries", "Wedges"
      ],
      drinks: [
        "Coca-Cola", "Pepsi", "Sprite", "Royal", "Iced Tea", "Lemonade", 
        "Mango Shake", "Buko Juice", "Calamansi Juice", "Bottled Water"
      ],
      desserts: [
        "Sundae", "Chocolate Ice Cream", "Strawberry Shake", "Apple Pie", 
        "Brownie", "Churros", "Leche Flan", "Halo-Halo"
      ],
      rice_meals: [
        "Chicken Adobo Rice Meal", "Pork Sinigang Rice Meal", "Beef Tapa Rice Meal",
        "Longganisa Rice Meal", "Tocino Rice Meal", "Fried Chicken Rice Meal",
        "Bangus Rice Meal", "Pork Sisig Rice Meal", "Lechon Kawali Rice Meal"
      ],
      breakfast: [
        "Bacon & Eggs", "Sausage & Eggs", "Corned Beef & Rice", "Pancakes",
        "Garlic Rice with Tapa", "Daing na Bangus Breakfast"
      ],
      snacks: [
        "Burger Steak", "Spaghetti", "Lasagna", "Macaroni Soup", "Carbonara",
        "Siomai Rice", "Lumpiang Shanghai", "Pizza Slice"
      ]
    };
    const categories = Object.keys(items);
    const cat = random.element(categories);
    return random.element(items[cat]);
  },
  
  description: () => {
    const descs = [
      "Freshly prepared with quality ingredients.",
      "Served hot and delicious.",
      "Customer favorite!",
      "Best paired with rice or fries.",
      "Made from scratch daily.",
      "Authentic recipe, guaranteed satisfaction.",
      "Perfect for your meal break.",
      "Recommended by our chef."
    ];
    return random.boolean(0.6) ? random.element(descs) : null;
  },
  
  voucherCode: () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return `VOUCH-${Array.from({ length: 6 }, () => chars[random.int(0, chars.length - 1)]).join("")}`;
  },
  
  // Food price range (PHP)
  foodPrice: () => random.float(45, 350),
  
  // Category names (food themed)
  foodCategoryName: (index) => {
    const names = [
      "Burgers", "Fries & Sides", "Beverages", "Desserts", 
      "Rice Meals", "Breakfast", "Snacks & Pasta"
    ];
    return names[index % names.length];
  },
  
  // Supplier names for food distributors
  supplierName: () => {
    const names = [
      "Puregold Supply Corp.", "SM Food Service", "Monde Nissin Distributor",
      "Coca-Cola Beverages PH", "San Miguel Foods", "Universal Robina",
      "Jollibee Commissary", "McDonald's Logistics", "KFC Supplier PH",
      "Local Farm Produce", "Meat Depot Inc.", "Fresh Seafoods Traders"
    ];
    return random.element(names);
  }
};

// ========== SEEDER CLASS ==========
class POSSeeder {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataSource = null;
    this.queryRunner = null;
    this.usedSkus = new Set();
    this.usedBarcodes = new Set();
    this.productPriceCache = new Map();
  }

  async init() {
    console.log("⏳ Initializing database connection...");
    this.dataSource = await AppDataSource.initialize();
    this.queryRunner = this.dataSource.createQueryRunner();
    console.log("✅ Database connected");
  }

  async destroy() {
    if (this.queryRunner) await this.queryRunner.release();
    if (this.dataSource) await this.dataSource.destroy();
    console.log("🔒 Connection closed");
  }

  async clearData() {
    console.log("🧹 Clearing old data...");
    await this.queryRunner.query("PRAGMA foreign_keys = OFF;");
    try {
      await this.queryRunner.clearTable("return_refund_items");
      await this.queryRunner.clearTable("return_refunds");
      await this.queryRunner.clearTable("purchase_items");
      await this.queryRunner.clearTable("purchases");
      await this.queryRunner.clearTable("sale_items");
      await this.queryRunner.clearTable("inventory_movements");
      await this.queryRunner.clearTable("loyalty_transactions");
      await this.queryRunner.clearTable("sales");
      await this.queryRunner.clearTable("customers");
      await this.queryRunner.clearTable("products");
      await this.queryRunner.clearTable("suppliers");
      await this.queryRunner.clearTable("categories");
      await this.queryRunner.clearTable("notification_logs");
      await this.queryRunner.clearTable("audit_logs");
      await this.queryRunner.clearTable("system_settings");
    } finally {
      await this.queryRunner.query("PRAGMA foreign_keys = ON;");
    }
    console.log("✅ All tables cleared");
  }

  async seedCategories() {
    console.log(`📂 Seeding ${this.config.categoryCount} food categories...`);
    const categories = [];
    const uniqueNames = new Set();
    for (let i = 0; i < this.config.categoryCount; i++) {
      let name = random.foodCategoryName(i);
      if (uniqueNames.has(name)) name = `Food ${i+1}`;
      uniqueNames.add(name);
      categories.push({
        name: name,
        description: `${name} category - delicious menu items`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: null,
      });
    }
    const repo = this.dataSource.getRepository(Category);
    const saved = await repo.save(categories);
    console.log(`✅ ${saved.length} categories saved`);
    return saved;
  }

  async seedSuppliers() {
    console.log(`🏭 Seeding ${this.config.supplierCount} suppliers...`);
    const suppliers = [];
    for (let i = 0; i < this.config.supplierCount; i++) {
      suppliers.push({
        name: random.supplierName(),
        contactInfo: random.boolean(0.8) ? random.phone() : null,
        email: random.email("supplier"),
        phone: random.boolean(0.8) ? random.phone() : null,
        address: random.boolean(0.6) ? `${random.int(1, 999)} Food Hub St` : null,
        isActive: random.boolean(0.9),
        createdAt: random.pastDate(),
        updatedAt: random.boolean(0.2) ? random.pastDate() : null,
      });
    }
    const repo = this.dataSource.getRepository(Supplier);
    const saved = await repo.save(suppliers);
    console.log(`✅ ${saved.length} suppliers saved`);
    return saved;
  }

  async seedProducts(categories, suppliers) {
    console.log(`🍔 Seeding ${this.config.productCount} food products...`);
    const products = [];
    for (let i = 0; i < this.config.productCount; i++) {
      const price = random.foodPrice();
      const stockQty = random.int(10, 200);
      products.push({
        sku: random.sku(this.usedSkus),
        barcode: random.barcode(this.usedBarcodes),
        name: random.productName(),
        description: random.description(),
        price: price,
        stockQty: stockQty,
        reorderLevel: random.int(5, 30),
        reorderQty: random.int(20, 100),
        isActive: random.boolean(0.95),
        createdAt: random.pastDate(),
        updatedAt: random.boolean(0.3) ? random.pastDate() : null,
        category: random.element(categories),
        supplier: random.element(suppliers),
      });
    }
    const repo = this.dataSource.getRepository(Product);
    const saved = await repo.save(products);
    saved.forEach((p) => this.productPriceCache.set(p.id, parseFloat(p.price)));
    console.log(`✅ ${saved.length} food products saved`);
    return saved;
  }

  async seedCustomers() {
    console.log(`👥 Seeding ${this.config.customerCount} customers...`);
    const customers = [];
    const statuses = ["regular", "vip", "elite"];
    for (let i = 0; i < this.config.customerCount; i++) {
      const pointsBalance = random.int(0, 800);
      customers.push({
        name: random.name(),
        contactInfo: random.boolean(0.7) ? random.phone() : null,
        email: random.email("customer"),
        phone: random.boolean(0.7) ? random.phone() : null,
        loyaltyPointsBalance: pointsBalance,
        lifetimePointsEarned: pointsBalance + random.int(0, 300),
        status: random.element(statuses),
        createdAt: random.pastDate(),
        updatedAt: random.boolean(0.2) ? random.pastDate() : null,
      });
    }
    const repo = this.dataSource.getRepository(Customer);
    const saved = await repo.save(customers);
    console.log(`✅ ${saved.length} customers saved`);
    return saved;
  }

  async seedSales(products, customers) {
    console.log(`🧾 Seeding ${this.config.saleCount} food sales with items...`);
    const saleRepo = this.dataSource.getRepository(Sale);
    const saleItemRepo = this.dataSource.getRepository(SaleItem);

    const statuses = ["initiated", "paid", "refunded", "voided"];
    const paymentMethods = ["cash", "card", "wallet"];

    const sales = [];
    const saleItems = [];

    for (let i = 0; i < this.config.saleCount; i++) {
      const customer = random.boolean(0.6) ? random.element(customers) : null;
      const status = random.element(statuses);
      const isPast = random.boolean(0.7);
      const saleDate = isPast ? random.pastDate() : random.futureDate();
      const paymentMethod = random.element(paymentMethods);
      const itemCount = random.int(1, 5);
      let totalAmount = 0;

      const usedLoyalty = random.boolean(0.3);
      const loyaltyRedeemed = usedLoyalty ? random.int(10, 200) : 0;
      const usedDiscount = random.boolean(0.4);
      const totalDiscount = usedDiscount ? random.float(5, 50) : 0;
      const usedVoucher = random.boolean(0.2);
      const voucherCode = usedVoucher ? random.voucherCode() : null;

      const sale = {
        timestamp: saleDate,
        status: status,
        paymentMethod: paymentMethod,
        totalAmount: 0,
        usedLoyalty,
        loyaltyRedeemed,
        usedDiscount,
        totalDiscount,
        usedVoucher,
        voucherCode,
        pointsEarn: 0,
        notes: random.boolean(0.2) ? "Takeout order" : null,
        createdAt: saleDate,
        updatedAt: random.boolean(0.1) ? random.pastDate() : null,
        customer: customer ? { id: customer.id } : null,
      };

      const savedSale = await saleRepo.save(sale);
      sales.push(savedSale);

      for (let j = 0; j < itemCount; j++) {
        const product = random.element(products);
        const quantity = random.int(1, 4);
        const unitPrice = this.productPriceCache.get(product.id) || random.foodPrice();
        const discount = random.boolean(0.3) ? random.float(0, unitPrice * 0.2) : 0;
        const tax = random.boolean(0.5) ? random.float(0, unitPrice * 0.12) : 0;
        const lineTotal = quantity * unitPrice - discount + tax;
        totalAmount += lineTotal;

        saleItems.push({
          quantity: quantity,
          unitPrice: unitPrice,
          discount: discount,
          tax: tax,
          lineTotal: lineTotal,
          createdAt: savedSale.createdAt,
          updatedAt: random.boolean(0.1) ? random.pastDate() : null,
          sale: { id: savedSale.id },
          product: { id: product.id },
        });
      }

      savedSale.totalAmount = totalAmount;
      savedSale.pointsEarn = totalAmount;
      await saleRepo.save(savedSale);
    }

    const savedItems = await saleItemRepo.save(saleItems);
    console.log(`✅ ${sales.length} sales with ${savedItems.length} items saved`);
    return { sales, saleItems: savedItems };
  }

  async seedPurchases(products, suppliers) {
    console.log(`📥 Seeding ${this.config.purchaseCount} purchases with items...`);
    const purchaseRepo = this.dataSource.getRepository(Purchase);
    const purchaseItemRepo = this.dataSource.getRepository(PurchaseItem);

    const purchases = [];
    const purchaseItems = [];

    for (let i = 0; i < this.config.purchaseCount; i++) {
      const supplier = random.element(suppliers);
      const status = random.element(["pending", "approved", "completed", "cancelled"]);
      const orderDate = random.pastDate();
      const itemCount = random.int(1, 5);
      let totalAmount = 0;

      const purchase = {
        referenceNo: `PO-${Date.now()}-${i}-${random.int(1000, 9999)}`,
        orderDate: orderDate,
        status: status,
        totalAmount: 0,
        createdAt: orderDate,
        updatedAt: random.boolean(0.2) ? random.pastDate() : null,
        supplier: { id: supplier.id },
      };

      const savedPurchase = await purchaseRepo.save(purchase);
      purchases.push(savedPurchase);

      for (let j = 0; j < itemCount; j++) {
        const product = random.element(products);
        const quantity = random.int(10, 80);
        const unitPrice = this.productPriceCache.get(product.id) || random.foodPrice();
        const subtotal = quantity * unitPrice;
        totalAmount += subtotal;

        purchaseItems.push({
          quantity: quantity,
          unitPrice: unitPrice,
          subtotal: subtotal,
          createdAt: savedPurchase.createdAt,
          purchase: { id: savedPurchase.id },
          product: { id: product.id },
        });
      }

      savedPurchase.totalAmount = totalAmount;
      await purchaseRepo.save(savedPurchase);
    }

    const savedItems = await purchaseItemRepo.save(purchaseItems);
    console.log(`✅ ${purchases.length} purchases with ${savedItems.length} items saved`);
    return { purchases, purchaseItems: savedItems };
  }

  async seedReturnRefunds(products, customers, sales) {
    console.log(`🔄 Seeding ${this.config.returnRefundCount} return refunds with items...`);
    const returnRepo = this.dataSource.getRepository(ReturnRefund);
    const returnItemRepo = this.dataSource.getRepository(ReturnRefundItem);

    const returns = [];
    const returnItems = [];

    for (let i = 0; i < this.config.returnRefundCount; i++) {
      const sale = random.element(sales);
      const customer = sale.customer ? { id: sale.customer.id } : random.element(customers);
      const refundMethod = random.element(["Cash", "Card", "Store Credit"]);
      const status = random.element(["processed", "pending", "cancelled"]);
      const createdAt = random.pastDate();
      const itemCount = random.int(1, 3);
      let totalAmount = 0;

      const returnRefund = {
        referenceNo: `RET-${Date.now()}-${i}-${random.int(1000, 9999)}`,
        reason: random.boolean(0.7) ? "Customer not satisfied with food" : null,
        refundMethod: refundMethod,
        totalAmount: 0,
        status: status,
        createdAt: createdAt,
        updatedAt: random.boolean(0.2) ? random.pastDate() : null,
        sale: { id: sale.id },
        customer: { id: customer.id },
      };

      const savedReturn = await returnRepo.save(returnRefund);
      returns.push(savedReturn);

      for (let j = 0; j < itemCount; j++) {
        const product = random.element(products);
        const quantity = random.int(1, 2);
        const unitPrice = this.productPriceCache.get(product.id) || random.foodPrice();
        const subtotal = quantity * unitPrice;
        totalAmount += subtotal;

        returnItems.push({
          quantity: quantity,
          unitPrice: unitPrice,
          subtotal: subtotal,
          reason: random.boolean(0.3) ? "Wrong order / spoiled" : null,
          createdAt: savedReturn.createdAt,
          returnRefund: { id: savedReturn.id },
          product: { id: product.id },
        });
      }

      savedReturn.totalAmount = totalAmount;
      await returnRepo.save(savedReturn);
    }

    const savedItems = await returnItemRepo.save(returnItems);
    console.log(`✅ ${returns.length} return refunds with ${savedItems.length} items saved`);
    return { returns, returnItems: savedItems };
  }

  async seedInventoryMovements(products, sales, saleItems) {
    console.log(`📦 Seeding ${this.config.inventoryMovementCount} inventory movements...`);
    const movementRepo = this.dataSource.getRepository(InventoryMovement);
    const movementTypes = ["sale", "refund", "adjustment", "purchase"];
    const movements = [];

    for (const item of saleItems) {
      if (random.boolean(0.8)) {
        movements.push({
          movementType: "sale",
          qtyChange: -item.quantity,
          timestamp: item.createdAt,
          notes: `Sale #${item.sale.id} - food item`,
          updatedAt: random.boolean(0.1) ? random.pastDate() : null,
          product: { id: item.product.id },
          sale: { id: item.sale.id },
        });
      }
    }

    while (movements.length < this.config.inventoryMovementCount) {
      const product = random.element(products);
      const sale = random.boolean(0.3) ? random.element(sales) : null;
      const movementType = random.element(movementTypes);
      let qtyChange;
      if (movementType === "sale") qtyChange = -random.int(1, 10);
      else if (movementType === "refund") qtyChange = random.int(1, 5);
      else if (movementType === "purchase") qtyChange = random.int(20, 120);
      else qtyChange = random.int(-15, 25);

      movements.push({
        movementType: movementType,
        qtyChange: qtyChange,
        timestamp: random.pastDate(),
        notes: movementType === "purchase" ? "Restocked ingredients" : random.boolean(0.2) ? "Manual adjustment" : null,
        updatedAt: random.boolean(0.1) ? random.pastDate() : null,
        product: { id: product.id },
        sale: sale ? { id: sale.id } : null,
      });
    }

    if (movements.length > this.config.inventoryMovementCount) {
      movements.length = this.config.inventoryMovementCount;
    }

    const saved = await movementRepo.save(movements);
    console.log(`✅ ${saved.length} inventory movements saved`);
    return saved;
  }

  async seedLoyaltyTransactions(customers, sales) {
    console.log(`💳 Seeding ${this.config.loyaltyTransactionCount} loyalty transactions...`);
    const transactionRepo = this.dataSource.getRepository(LoyaltyTransaction);
    const transactions = [];

    for (let i = 0; i < this.config.loyaltyTransactionCount; i++) {
      const customer = random.element(customers);
      const sale = random.boolean(0.4) ? random.element(sales) : null;
      const pointsChange = random.boolean(0.7) ? random.int(10, 200) : -random.int(5, 50);
      const timestamp = sale ? sale.timestamp : random.pastDate();
      const transactionType = pointsChange > 0 ? "earn" : "redeem";

      transactions.push({
        transactionType,
        pointsChange: pointsChange,
        timestamp: timestamp,
        notes: pointsChange > 0 ? "Earned from food purchase" : "Redeemed reward",
        updatedAt: random.boolean(0.1) ? random.pastDate() : null,
        customer: { id: customer.id },
        sale: sale ? { id: sale.id } : null,
      });
    }

    const saved = await transactionRepo.save(transactions);
    console.log(`✅ ${saved.length} loyalty transactions saved`);
    return saved;
  }

  async seedAuditLogs() {
    console.log(`📝 Seeding ${this.config.auditLogCount} audit logs...`);
    const actions = ["CREATE", "UPDATE", "DELETE", "VIEW", "LOGIN", "LOGOUT"];
    const entities = [
      "Product", "Customer", "Sale", "InventoryMovement", "LoyaltyTransaction",
      "SystemSetting", "Category", "Supplier", "Purchase", "ReturnRefund", "NotificationLog"
    ];

    const logs = [];
    for (let i = 0; i < this.config.auditLogCount; i++) {
      logs.push({
        action: random.element(actions),
        entity: random.element(entities),
        entityId: random.int(1, 100),
        timestamp: random.pastDate(),
        user: random.element(["admin", "cashier1", "manager", "system"]),
      });
    }

    const repo = this.dataSource.getRepository(AuditLog);
    await repo.save(logs);
    console.log(`✅ ${this.config.auditLogCount} audit logs saved`);
  }

  async seedSystemSettings() {
    console.log("⚙️ Seeding system settings...");
    const settings = [
      { key: "store_name", value: "Tillify Fastfood", setting_type: "general", description: "Store display name", is_public: true, is_deleted: false },
      { key: "currency", value: "PHP", setting_type: "general", description: "Currency used for pricing", is_public: true, is_deleted: false },
      { key: "tax_rate", value: "12", setting_type: "general", description: "VAT percentage", is_public: false, is_deleted: false },
      { key: "loyalty_points_per_currency", value: "1", setting_type: "general", description: "Points earned per peso spent", is_public: false, is_deleted: false },
      { key: "enable_inventory_sync", value: "true", setting_type: "general", description: "Enable external inventory sync", is_public: false, is_deleted: false },
      { key: "default_payment_method", value: "cash", setting_type: "general", description: "Default payment method", is_public: true, is_deleted: false },
      { key: "receipt_footer", value: "Thank you for dining with us!", setting_type: "general", description: "Receipt footer message", is_public: true, is_deleted: false },
    ];
    const repo = this.dataSource.getRepository(SystemSetting);
    await repo.save(settings);
    console.log(`✅ ${settings.length} system settings saved`);
    return settings;
  }

  async seedNotificationLogs() {
    console.log(`📧 Seeding ${this.config.notificationLogCount} notification logs...`);
    const repo = this.dataSource.getRepository(NotificationLog);
    const logs = [];
    const statuses = ["queued", "sent", "failed", "resend"];

    for (let i = 0; i < this.config.notificationLogCount; i++) {
      const status = random.element(statuses);
      const sentAt = status === "sent" ? random.pastDate() : null;
      const lastErrorAt = status === "failed" ? random.pastDate() : null;
      logs.push({
        recipient_email: random.email("customer"),
        subject: random.boolean(0.7) ? "Your food order is ready" : null,
        payload: random.boolean(0.5) ? JSON.stringify({ orderId: random.int(1000, 9999) }) : null,
        status: status,
        error_message: status === "failed" ? "SMTP error" : null,
        retry_count: status === "failed" ? random.int(1, 3) : 0,
        resend_count: status === "resend" ? random.int(1, 2) : 0,
        sent_at: sentAt,
        last_error_at: lastErrorAt,
        created_at: random.pastDate(),
        updated_at: random.pastDate(),
      });
    }

    await repo.save(logs);
    console.log(`✅ ${this.config.notificationLogCount} notification logs saved`);
  }

  async run() {
    try {
      await this.init();
      await this.queryRunner.startTransaction();

      if (!this.config.clearOnly) {
        await this.clearData();
      }

      if (this.config.clearOnly) {
        console.log("🧹 Clear only mode – no seeding performed.");
        await this.queryRunner.commitTransaction();
        return;
      }

      let categories = [];
      let suppliers = [];
      let products = [];
      let customers = [];
      let sales = [], saleItems = [];
      let purchases = [], purchaseItems = [];
      let returns = [], returnItems = [];

      if (!this.config.skipCategories) categories = await this.seedCategories();
      if (!this.config.skipSuppliers) suppliers = await this.seedSuppliers();

      if (!this.config.skipProducts && categories.length && suppliers.length) {
        products = await this.seedProducts(categories, suppliers);
      }

      if (!this.config.skipCustomers) customers = await this.seedCustomers();

      if (!this.config.skipSales && products.length && customers.length) {
        const result = await this.seedSales(products, customers);
        sales = result.sales;
        saleItems = result.saleItems;
      }

      if (!this.config.skipPurchases && products.length && suppliers.length) {
        const result = await this.seedPurchases(products, suppliers);
        purchases = result.purchases;
        purchaseItems = result.purchaseItems;
      }

      if (!this.config.skipReturnRefunds && products.length && customers.length && sales.length) {
        const result = await this.seedReturnRefunds(products, customers, sales);
        returns = result.returns;
        returnItems = result.returnItems;
      }

      if (!this.config.skipInventoryMovements && products.length) {
        await this.seedInventoryMovements(products, sales, saleItems);
      }

      if (!this.config.skipLoyaltyTransactions && customers.length) {
        await this.seedLoyaltyTransactions(customers, sales);
      }

      if (!this.config.skipAuditLogs) {
        await this.seedAuditLogs();
      }

      if (!this.config.skipSystemSettings) {
        await this.seedSystemSettings();
      }

      if (!this.config.skipNotificationLogs) {
        await this.seedNotificationLogs();
      }

      await this.queryRunner.commitTransaction();

      console.log("\n🎉 SEED COMPLETED SUCCESSFULLY!");
      console.log(`   Categories: ${categories.length}`);
      console.log(`   Suppliers: ${suppliers.length}`);
      console.log(`   Products: ${products.length}`);
      console.log(`   Customers: ${customers.length}`);
      console.log(`   Sales: ${sales.length}`);
      console.log(`   Sale Items: ${saleItems.length}`);
      console.log(`   Purchases: ${purchases.length}`);
      console.log(`   Purchase Items: ${purchaseItems.length}`);
      console.log(`   Return Refunds: ${returns.length}`);
      console.log(`   Return Items: ${returnItems.length}`);
      console.log(`   Inventory Movements: ${Math.min(this.config.inventoryMovementCount, saleItems.length + (this.config.inventoryMovementCount - saleItems.length))}`);
      console.log(`   Loyalty Transactions: ${this.config.loyaltyTransactionCount}`);
      console.log(`   Audit Logs: ${this.config.auditLogCount}`);
      console.log(`   Notification Logs: ${this.config.notificationLogCount}`);
      console.log(`   System Settings: 7`);
    } catch (error) {
      console.error("\n❌ Seeding failed – rolling back...", error);
      if (this.queryRunner) await this.queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await this.destroy();
    }
  }
}

// ========== COMMAND LINE HANDLER ==========
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--clear-only": config.clearOnly = true; break;
      case "--products": config.skipProducts = false; config.productCount = parseInt(args[++i]) || DEFAULT_CONFIG.productCount; break;
      case "--customers": config.skipCustomers = false; config.customerCount = parseInt(args[++i]) || DEFAULT_CONFIG.customerCount; break;
      case "--sales": config.skipSales = false; config.saleCount = parseInt(args[++i]) || DEFAULT_CONFIG.saleCount; break;
      case "--inventory-movements": config.skipInventoryMovements = false; config.inventoryMovementCount = parseInt(args[++i]) || DEFAULT_CONFIG.inventoryMovementCount; break;
      case "--loyalty-transactions": config.skipLoyaltyTransactions = false; config.loyaltyTransactionCount = parseInt(args[++i]) || DEFAULT_CONFIG.loyaltyTransactionCount; break;
      case "--audit-logs": config.skipAuditLogs = false; config.auditLogCount = parseInt(args[++i]) || DEFAULT_CONFIG.auditLogCount; break;
      case "--categories": config.skipCategories = false; config.categoryCount = parseInt(args[++i]) || DEFAULT_CONFIG.categoryCount; break;
      case "--suppliers": config.skipSuppliers = false; config.supplierCount = parseInt(args[++i]) || DEFAULT_CONFIG.supplierCount; break;
      case "--purchases": config.skipPurchases = false; config.purchaseCount = parseInt(args[++i]) || DEFAULT_CONFIG.purchaseCount; break;
      case "--return-refunds": config.skipReturnRefunds = false; config.returnRefundCount = parseInt(args[++i]) || DEFAULT_CONFIG.returnRefundCount; break;
      case "--notification-logs": config.skipNotificationLogs = false; config.notificationLogCount = parseInt(args[++i]) || DEFAULT_CONFIG.notificationLogCount; break;
      case "--skip-products": config.skipProducts = true; break;
      case "--skip-customers": config.skipCustomers = true; break;
      case "--skip-sales": config.skipSales = true; break;
      case "--skip-inventory-movements": config.skipInventoryMovements = true; break;
      case "--skip-loyalty-transactions": config.skipLoyaltyTransactions = true; break;
      case "--skip-audit-logs": config.skipAuditLogs = true; break;
      case "--skip-system-settings": config.skipSystemSettings = true; break;
      case "--skip-categories": config.skipCategories = true; break;
      case "--skip-suppliers": config.skipSuppliers = true; break;
      case "--skip-purchases": config.skipPurchases = true; break;
      case "--skip-return-refunds": config.skipReturnRefunds = true; break;
      case "--skip-notification-logs": config.skipNotificationLogs = true; break;
      case "--help":
        console.log(`
Usage: node seedData.js [options]

Food/Restaurant Seeder Examples:
  node seedData.js --products 40 --sales 80
  node seedData.js --clear-only
  node seedData.js --skip-loyalty-transactions
`);
        process.exit(0);
    }
  }
  return config;
}

if (require.main === module) {
  const config = parseArgs();
  const seeder = new POSSeeder(config);
  seeder.run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { POSSeeder, DEFAULT_CONFIG };