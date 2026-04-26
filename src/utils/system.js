

// @ts-ignore
// @ts-ignore
const path = require("path");

// @ts-ignore
// @ts-ignore
const Decimal = require("decimal.js");
const { logger } = require("./logger");
const { SystemSetting, SettingType } = require("../entities/systemSettings");


// ============================================================
// 📊 CORE GETTER FUNCTIONS
// ============================================================

/**
 * Get setting value
 * @param {string} key
 * @param {string} settingType
 */
async function getValue(key, settingType, defaultValue = null) {
  const { AppDataSource } = require("../main/db/dataSource");
  try {
    // console.log(
    //   `[DB DEBUG] getValue called for key: "${key}", type: "${settingType}"`
    // );
    if (typeof key !== "string" || !key.trim()) {
      logger.debug(`[DB] Invalid key: ${key}`);
      return defaultValue;
    }

    const repository = AppDataSource.getRepository(SystemSetting);
    if (!repository) {
      logger.debug(
        `[DB] Repository not available for key: ${key}, using default: ${defaultValue}`,
      );
      return defaultValue;
    }

    const query = repository
      .createQueryBuilder("setting")
      .where("setting.key = :key", { key: key.toLowerCase() })
      .andWhere("setting.is_deleted = :is_deleted", { is_deleted: false });

    if (settingType) {
      query.andWhere("setting.setting_type = :settingType", { settingType });
    }

    const setting = await query.getOne();

    // logger.debug(`[DB] Query result for key="${key}":`, {
    //   found: !!setting,
    //   value: setting ? setting.value : "NOT FOUND",
    //   keyInDB: setting ? setting.key : "N/A",
    // });

    if (!setting || setting.value === null || setting.value === undefined) {
      logger.debug(
        `[DB] Setting ${key} not found, using default: ${defaultValue}`,
      );
      return defaultValue;
    }

    return String(setting.value).trim();
  } catch (error) {
    logger.warn(
      // @ts-ignore
      `[DB] Error fetching setting ${key}: ${error.message}, using default: ${defaultValue}`,
    );
    return defaultValue;
  }
}

/**
 * Get boolean setting
 * @param {string} key
 * @param {string} settingType
 */
async function getBool(key, settingType, defaultValue = false) {
  try {
    const raw = await getValue(
      key,
      settingType,

      // @ts-ignore
      defaultValue ? "true" : "false",
    );
    if (raw === null) {
      return defaultValue;
    }

    const normalized = String(raw).trim().toLowerCase();
    if (
      ["true", "1", "yes", "y", "on", "enabled", "active"].includes(normalized)
    ) {
      return true;
    }
    if (
      ["false", "0", "no", "n", "off", "disabled", "inactive"].includes(
        normalized,
      )
    ) {
      return false;
    }

    const num = parseFloat(normalized);
    if (!isNaN(num)) {
      return num > 0;
    }

    logger.warn(
      `Unrecognized boolean for key='${key}': '${raw}' → using default=${defaultValue}`,
    );
    return defaultValue;
  } catch (error) {
    logger.error(
      // @ts-ignore
      `Error in getBool for ${key}: ${error.message}, using default: ${defaultValue}`,
    );
    return defaultValue;
  }
}

/**
 * Get integer setting
 * @param {string} key
 * @param {string} settingType
 */
async function getInt(key, settingType, defaultValue = 0) {
  try {
    // @ts-ignore
    const raw = await getValue(key, settingType, defaultValue.toString());
    if (raw === null) {
      return defaultValue;
    }

    const result = parseInt(String(raw).trim(), 10);
    return isNaN(result) ? defaultValue : result;
  } catch (error) {
    logger.warn(
      // @ts-ignore
      `Invalid int for key='${key}': '${error.message}' – using default=${defaultValue}`,
    );
    return defaultValue;
  }
}

/**
 * Get array setting
 * @param {string} key
 * @param {string} settingType
 */

// @ts-ignore
async function getArray(key, settingType, defaultValue = []) {
  try {
    // @ts-ignore
    const raw = await getValue(key, settingType, JSON.stringify(defaultValue));
    if (raw === null) {
      return defaultValue;
    }

    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return defaultValue;
      }
    }

    return defaultValue;
  } catch (error) {
    logger.warn(
      // @ts-ignore
      `Error getting array setting ${key}: ${error.message}, using default`,
    );
    return defaultValue;
  }
}

// ============================================================
// 🏢 GENERAL SETTINGS
// ============================================================

async function companyName() {
  return getValue(
    "company_name",
    SettingType.GENERAL,

    // @ts-ignore
    "Tillify",
  );
}

async function companyLocation() {
  // @ts-ignore
  return getValue("store_location", SettingType.GENERAL, "N/A");
}

// ✅ RENAME: from 'timezone' to 'defaultTimezone' (para hindi malito)
async function defaultTimezone() {
  // @ts-ignore
  return getValue("default_timezone", SettingType.GENERAL, "Asia/Manila");
}

async function language() {
  // @ts-ignore
  return getValue("language", SettingType.GENERAL, "en");
}

// ✅ NEW: para sa actual na "timezone" key (id 11)
async function timezone() {
  // @ts-ignore
  return getValue("timezone", SettingType.GENERAL, "Asia/Manila");
}

// Additional general settings from interface
async function currency() {
  // @ts-ignore
  return getValue("currency", SettingType.GENERAL, "PHP");
}

async function receiptFooterMessage() {
  // @ts-ignore
  return getValue("receipt_footer_message", SettingType.GENERAL, "");
}

async function autoLogoutMinutes() {
  return getInt("auto_logout_minutes", SettingType.GENERAL, 30);
}

// ============================================================
// 🔔 NOTIFICATION SETTINGS (original)
// ============================================================

async function enableEmailAlerts() {
  // @ts-ignore
  return getValue("enable_email_alerts", SettingType.NOTIFICATION, "false");
}

async function enableSmsAlerts() {
  // @ts-ignore
  return getValue("enable_sms_alerts", SettingType.NOTIFICATION, "false");
}

async function reminderIntervalHours() {
  // @ts-ignore
  return getValue("reminder_interval_hours", SettingType.NOTIFICATION, "24");
}

async function smtpHost() {
  // @ts-ignore
  return getValue("smtp_host", SettingType.NOTIFICATION, "smtp.gmail.com");
}

async function smtpPort() {
  return getInt("smtp_port", SettingType.NOTIFICATIONS, 587);
}

async function smtpUsername() {
  // @ts-ignore
  return getValue("smtp_username", SettingType.NOTIFICATION, "");
}

async function smtpPassword() {
  // @ts-ignore
  return getValue("smtp_password", SettingType.NOTIFICATION, "");
}

async function smtpUseSsl() {
  // @ts-ignore
  return getValue("smtp_use_ssl", SettingType.NOTIFICATION, "true");
}

async function smtpFromEmail() {
  // @ts-ignore
  return getValue("smtp_from_email", SettingType.NOTIFICATION, "");
}

async function smtpFromName() {
  // @ts-ignore
  return getValue("smtp_from_name", SettingType.NOTIFICATION, "");
}

// 📱 TWILIO SMS SETTINGS (NEW)
async function twilioAccountSid() {
  // @ts-ignore
  return getValue("twilio_account_sid", SettingType.NOTIFICATION, "");
}

async function twilioAuthToken() {
  // @ts-ignore
  return getValue("twilio_auth_token", SettingType.NOTIFICATION, "");
}

async function twilioPhoneNumber() {
  // @ts-ignore
  return getValue("twilio_phone_number", SettingType.NOTIFICATION, "");
}

async function twilioMessagingServiceSid() {
  // @ts-ignore
  return getValue("twilio_messaging_service_sid", SettingType.NOTIFICATION, "");
}

async function getSmtpConfig() {
  const [host, port, username, password, useSsl, fromEmail, fromName] =
    await Promise.all([
      smtpHost(),
      smtpPort(),
      smtpUsername(),
      smtpPassword(),
      smtpUseSsl(),
      smtpFromEmail(),
      smtpFromName(),
    ]);

  return {
    host,

    // @ts-ignore
    port: parseInt(port, 10),
    username,
    password,
    secure: useSsl === "true" || useSsl === "1" || useSsl === "yes",
    from: {
      email: fromEmail,
      name: fromName,
    },
  };
}

async function getTwilioConfig() {
  const [accountSid, authToken, phoneNumber, messagingServiceSid] =
    await Promise.all([
      twilioAccountSid(),
      twilioAuthToken(),
      twilioPhoneNumber(),
      twilioMessagingServiceSid(),
    ]);

  return {
    accountSid,
    authToken,
    phoneNumber,
    messagingServiceSid,
  };
}

// ============================================================
// ⚙️ SYSTEM SETTINGS
// ============================================================

async function debugMode() {
  // @ts-ignore
  return getValue("debug_mode", SettingType.SYSTEM, "false");
}

async function environment() {
  // @ts-ignore
  return getValue("environment", SettingType.SYSTEM, "development");
}

async function auditTrailEnabled() {
  // @ts-ignore
  return getValue("audit_trail_enabled", SettingType.SYSTEM, "true");
}

async function getLoyaltyPointRate() {
  return getInt("loyalty_points_rate", SettingType.SALES, 100);
}

// ============================================================
// 📦 INVENTORY SETTINGS (new)
// ============================================================

async function autoReorderEnabled() {
  return getBool("auto_reorder_enabled", SettingType.INVENTORY, false);
}

async function reorderLevelDefault() {
  return getInt("reorder_level_default", SettingType.INVENTORY, 10);
}

async function reorderQtyDefault() {
  return getInt("reorder_qty_default", SettingType.INVENTORY, 20);
}

async function stockAlertThreshold() {
  return getInt("stock_alert_threshold", SettingType.INVENTORY, 5);
}

async function allowNegativeStock() {
  return getBool("allow_negative_stock", SettingType.INVENTORY, false);
}

async function inventorySyncEnabled() {
  return getBool("inventory_sync_enabled", SettingType.INVENTORY, false);
}

// ============================================================
// 💰 SALES SETTINGS (new)
// ============================================================

async function taxRate() {
  return getInt("tax_rate", SettingType.SALES, 0);
}

async function discountEnabled() {
  return getBool("discount_enabled", SettingType.SALES, true);
}

async function maxDiscountPercent() {
  return getInt("max_discount_percent", SettingType.SALES, 50);
}

async function allowRefunds() {
  return getBool("allow_refunds", SettingType.SALES, true);
}

async function refundWindowDays() {
  return getInt("refund_window_days", SettingType.SALES, 30);
}

async function loyaltyPointsEnabled() {
  return getBool("loyalty_points_enabled", SettingType.SALES, false);
}

// ============================================================
// 🧾 CASHIER SETTINGS (new)
// ============================================================

async function enableCashDrawer() {
  return getBool("enable_cash_drawer", SettingType.CASHIER, true);
}

async function drawerOpenCode() {
  // @ts-ignore
  return getValue("drawer_open_code", SettingType.CASHIER, "");
}

async function enableReceiptPrinting() {
  return getBool("enable_receipt_printing", SettingType.CASHIER, true);
}

async function receiptPrinterType() {
  // @ts-ignore
  return getValue("receipt_printer_type", SettingType.CASHIER, "thermal");
}

async function enableBarcodeScanning() {
  return getBool("enable_barcode_scanning", SettingType.CASHIER, true);
}

async function enableTouchscreenMode() {
  return getBool("enable_touchscreen_mode", SettingType.CASHIER, true);
}

async function quickSaleEnabled() {
  return getBool("quick_sale_enabled", SettingType.CASHIER, true);
}

// ============================================================
// 📬 NOTIFICATIONS SETTINGS (extended, new keys)
// ============================================================

async function emailEnabled() {
  return getBool("email_enabled", SettingType.NOTIFICATIONS, false);
}

async function smsEnabled() {
  return getBool("sms_enabled", SettingType.NOTIFICATIONS, false);
}

async function smsProvider() {
  // @ts-ignore
  return getValue("sms_provider", SettingType.NOTIFICATIONS, "");
}

async function pushNotificationsEnabled() {
  return getBool(
    "push_notifications_enabled",
    SettingType.NOTIFICATIONS,
    false,
  );
}

async function lowStockAlertEnabled() {
  return getBool("low_stock_alert_enabled", SettingType.NOTIFICATIONS, true);
}

async function dailySalesSummaryEnabled() {
  return getBool(
    "daily_sales_summary_enabled",
    SettingType.NOTIFICATIONS,
    false,
  );
}

// ============================================================
// 📊 DATA & REPORTS SETTINGS (new)
// ============================================================

async function exportFormats() {
  return getArray("export_formats", SettingType.DATA_REPORTS, [
    "CSV",
    "Excel",
    "PDF",
  ]);
}

async function defaultExportFormat() {
  // @ts-ignore
  return getValue("default_export_format", SettingType.DATA_REPORTS, "CSV");
}

async function autoBackupEnabled() {
  return getBool("auto_backup_enabled", SettingType.DATA_REPORTS, false);
}

async function backupSchedule() {
  // @ts-ignore
  return getValue("backup_schedule", SettingType.DATA_REPORTS, "daily");
}

async function backupLocation() {
  // @ts-ignore
  return getValue("backup_location", SettingType.DATA_REPORTS, "");
}

async function dataRetentionDays() {
  return getInt("data_retention_days", SettingType.DATA_REPORTS, 365);
}

// ============================================================
// 🔗 INTEGRATIONS SETTINGS (new)
// ============================================================

async function accountingIntegrationEnabled() {
  return getBool(
    "accounting_integration_enabled",
    SettingType.INTEGRATIONS,
    false,
  );
}

async function accountingApiUrl() {
  // @ts-ignore
  return getValue("accounting_api_url", SettingType.INTEGRATIONS, "");
}

async function accountingApiKey() {
  // @ts-ignore
  return getValue("accounting_api_key", SettingType.INTEGRATIONS, "");
}

async function paymentGatewayEnabled() {
  return getBool("payment_gateway_enabled", SettingType.INTEGRATIONS, false);
}

async function paymentGatewayProvider() {
  // @ts-ignore
  return getValue("payment_gateway_provider", SettingType.INTEGRATIONS, "");
}

async function paymentGatewayApiKey() {
  // @ts-ignore
  return getValue("payment_gateway_api_key", SettingType.INTEGRATIONS, "");
}

async function webhooksEnabled() {
  return getBool("webhooks_enabled", SettingType.INTEGRATIONS, false);
}

async function webhooks() {
  return getArray("webhooks", SettingType.INTEGRATIONS, []);
}

// ============================================================
// 🔒 AUDIT & SECURITY SETTINGS (new)
// ============================================================

async function auditLogEnabled() {
  return getBool("audit_log_enabled", SettingType.AUDIT_SECURITY, true);
}

async function logRetentionDays() {
  return getInt("log_retention_days", SettingType.AUDIT_SECURITY, 90);
}

async function logEvents() {
  return getArray("log_events", SettingType.AUDIT_SECURITY, []);
}

async function forceHttps() {
  return getBool("force_https", SettingType.AUDIT_SECURITY, false);
}

async function sessionEncryptionEnabled() {
  return getBool(
    "session_encryption_enabled",
    SettingType.AUDIT_SECURITY,
    true,
  );
}

async function gdprComplianceEnabled() {
  return getBool("gdpr_compliance_enabled", SettingType.AUDIT_SECURITY, false);
}

// ============================================================
// 📦 CATEGORY-LEVEL CONVENIENCE FUNCTIONS
// ============================================================

// ============================================================
//  ADDED
// ============================================================

async function getNotifySupplierOnConfirmedWithSms() {
  return getBool("notify_supplier_with_sms", SettingType.NOTIFICATIONS, true);
}

async function getNotifySupplierOnConfirmedWithEmail() {
  return getBool("notify_supplier_with_email", SettingType.NOTIFICATIONS, true);
}

// Notifications settings (extended)
async function getNotifySupplierOnCompleteWithEmail() {
  return getBool(
    "notify_supplier_on_complete_email",
    SettingType.NOTIFICATIONS,
    true,
  );
}

async function getNotifySupplierOnCompleteWithSms() {
  return getBool(
    "notify_supplier_on_complete_sms",
    SettingType.NOTIFICATIONS,
    false,
  );
}
async function getNotifySupplierOnCancelWithEmail() {
  return getBool(
    "notify_supplier_on_cancel_email",
    SettingType.NOTIFICATIONS,
    true,
  );
}

async function getNotifySupplierOnCancelWithSms() {
  return getBool(
    "notify_supplier_on_cancel_sms",
    SettingType.NOTIFICATIONS,
    false,
  );
}

// Notifications for Return/Refund
async function notifyCustomerOnReturnProcessedWithEmail() {
  return getBool(
    "notify_customer_return_processed_email",
    SettingType.NOTIFICATIONS,
    true,
  );
}

async function notifyCustomerOnReturnProcessedWithSms() {
  return getBool(
    "notify_customer_return_processed_sms",
    SettingType.NOTIFICATIONS,
    false,
  );
}

async function notifyCustomerOnReturnCancelledWithEmail() {
  return getBool(
    "notify_customer_return_cancelled_email",
    SettingType.NOTIFICATIONS,
    true,
  );
}

async function notifyCustomerOnReturnCancelledWithSms() {
  return getBool(
    "notify_customer_return_cancelled_sms",
    SettingType.NOTIFICATIONS,
    false,
  );
}

// Cash drawer connection type: 'printer' or 'usb' (or 'serial')
async function cashDrawerConnectionType() {
  // @ts-ignore
  return getValue("cash_drawer_connection", SettingType.CASHIER, "printer");
}

// If using USB drawer, you might need a separate setting for the device path
// @ts-ignore
async function cashDrawerDevicePath() {
  // @ts-ignore
  return getValue("cash_drawer_device_path", SettingType.CASHIER, "");
}

// Sa system.js (kung gusto mo)
async function autoUpdateStockOnReturnProcessed() {
  return getBool("auto_update_stock_on_return", SettingType.INVENTORY, true);
}

async function autoReverseStockOnReturnCancel() {
  return getBool(
    "auto_reverse_stock_on_return_cancel",
    SettingType.INVENTORY,
    true,
  );
}

async function getGeneralSettings() {
  const [
    company_name,
    store_location,
    default_timezone,
    currency_val,
    language_val,
    receipt_footer_message,
    auto_logout_minutes,
  ] = await Promise.all([
    companyName(),
    companyLocation(),
    defaultTimezone(),
    currency(),
    language(),
    receiptFooterMessage(),
    autoLogoutMinutes(),
  ]);

  return {
    company_name,
    store_location,
    default_timezone,
    currency: currency_val,
    language: language_val,
    receipt_footer_message,
    auto_logout_minutes,
  };
}

async function getInventorySettings() {
  const [
    auto_reorder_enabled,
    reorder_level_default,
    reorder_qty_default,
    stock_alert_threshold,
    allow_negative_stock,
    inventory_sync_enabled,
  ] = await Promise.all([
    autoReorderEnabled(),
    reorderLevelDefault(),
    reorderQtyDefault(),
    stockAlertThreshold(),
    allowNegativeStock(),
    inventorySyncEnabled(),
  ]);

  return {
    auto_reorder_enabled,
    reorder_level_default,
    reorder_qty_default,
    stock_alert_threshold,
    allow_negative_stock,
    inventory_sync_enabled,
  };
}

async function getSalesSettings() {
  const [
    tax_rate,
    discount_enabled,
    max_discount_percent,
    allow_refunds,
    refund_window_days,
    loyalty_points_enabled,
    loyalty_points_rate,
  ] = await Promise.all([
    taxRate(),
    discountEnabled(),
    maxDiscountPercent(),
    allowRefunds(),
    refundWindowDays(),
    loyaltyPointsEnabled(),
    getLoyaltyPointRate(),
  ]);

  return {
    tax_rate,
    discount_enabled,
    max_discount_percent,
    allow_refunds,
    refund_window_days,
    loyalty_points_enabled,
    loyalty_points_rate,
  };
}

async function getCashierSettings() {
  const [
    enable_cash_drawer,
    drawer_open_code,
    enable_receipt_printing,
    receipt_printer_type,
    enable_barcode_scanning,
    enable_touchscreen_mode,
    quick_sale_enabled,
  ] = await Promise.all([
    enableCashDrawer(),
    drawerOpenCode(),
    enableReceiptPrinting(),
    receiptPrinterType(),
    enableBarcodeScanning(),
    enableTouchscreenMode(),
    quickSaleEnabled(),
  ]);

  return {
    enable_cash_drawer,
    drawer_open_code,
    enable_receipt_printing,
    receipt_printer_type,
    enable_barcode_scanning,
    enable_touchscreen_mode,
    quick_sale_enabled,
  };
}

async function getNotificationsSettings() {
  const [
    email_enabled,
    smtp_host,
    smtp_port,
    smtp_username,
    smtp_password,
    smtp_use_ssl,
    email_from_address,
    email_from_name,
    sms_enabled,
    sms_provider,
    push_notifications_enabled,
    low_stock_alert_enabled,
    daily_sales_summary_enabled,
    twilio_account_sid,
    twilio_auth_token,
    twilio_phone_number,
    twilio_messaging_service_sid,
  ] = await Promise.all([
    emailEnabled(),
    smtpHost(),
    smtpPort(),
    smtpUsername(),
    smtpPassword(),
    smtpUseSsl(),
    smtpFromEmail(),
    smtpFromName(),
    smsEnabled(),
    smsProvider(),
    pushNotificationsEnabled(),
    lowStockAlertEnabled(),
    dailySalesSummaryEnabled(),
    twilioAccountSid(),
    twilioAuthToken(),
    twilioPhoneNumber(),
    twilioMessagingServiceSid(),
  ]);

  return {
    email_enabled,
    smtp_host,
    smtp_port,
    smtp_username,
    smtp_password,
    smtp_use_ssl,
    email_from_address,
    email_from_name,
    sms_enabled,
    sms_provider,
    push_notifications_enabled,
    low_stock_alert_enabled,
    daily_sales_summary_enabled,
    twilio_account_sid,
    twilio_auth_token,
    twilio_phone_number,
    twilio_messaging_service_sid,
  };
}

async function getDataReportsSettings() {
  const [
    export_formats,
    default_export_format,
    auto_backup_enabled,
    backup_schedule,
    backup_location,
    data_retention_days,
  ] = await Promise.all([
    exportFormats(),
    defaultExportFormat(),
    autoBackupEnabled(),
    backupSchedule(),
    backupLocation(),
    dataRetentionDays(),
  ]);

  return {
    export_formats,
    default_export_format,
    auto_backup_enabled,
    backup_schedule,
    backup_location,
    data_retention_days,
  };
}

async function getIntegrationsSettings() {
  const [
    accounting_integration_enabled,
    accounting_api_url,
    accounting_api_key,
    payment_gateway_enabled,
    payment_gateway_provider,
    payment_gateway_api_key,
    webhooks_enabled,
    webhooks_array,
  ] = await Promise.all([
    accountingIntegrationEnabled(),
    accountingApiUrl(),
    accountingApiKey(),
    paymentGatewayEnabled(),
    paymentGatewayProvider(),
    paymentGatewayApiKey(),
    webhooksEnabled(),
    webhooks(),
  ]);

  return {
    accounting_integration_enabled,
    accounting_api_url,
    accounting_api_key,
    payment_gateway_enabled,
    payment_gateway_provider,
    payment_gateway_api_key,
    webhooks_enabled,
    webhooks: webhooks_array,
  };
}

async function getAuditSecuritySettings() {
  const [
    audit_log_enabled,
    log_retention_days,
    log_events,
    force_https,
    session_encryption_enabled,
    gdpr_compliance_enabled,
  ] = await Promise.all([
    auditLogEnabled(),
    logRetentionDays(),
    logEvents(),
    forceHttps(),
    sessionEncryptionEnabled(),
    gdprComplianceEnabled(),
  ]);

  return {
    audit_log_enabled,
    log_retention_days,
    log_events,
    force_https,
    session_encryption_enabled,
    gdpr_compliance_enabled,
  };
}

// ============================================================
// 📤 EXPORT ALL FUNCTIONS
// ============================================================

module.exports = {
  autoUpdateStockOnReturnProcessed,
  autoReverseStockOnReturnCancel,

  getNotifySupplierOnConfirmedWithSms,
  getNotifySupplierOnConfirmedWithEmail,
  getNotifySupplierOnCompleteWithEmail,
  getNotifySupplierOnCompleteWithSms,
  getNotifySupplierOnCancelWithEmail,
  getNotifySupplierOnCancelWithSms,

  notifyCustomerOnReturnProcessedWithEmail,
  notifyCustomerOnReturnProcessedWithSms,
  notifyCustomerOnReturnCancelledWithEmail,
  notifyCustomerOnReturnCancelledWithSms,

  cashDrawerConnectionType,

  // Core getters
  getValue,
  getBool,
  getInt,
  getArray,

  // General settings
  companyName,
  companyLocation,
  defaultTimezone,
  language,
  timezone,
  currency,
  receiptFooterMessage,
  autoLogoutMinutes,

  // Inventory settings
  autoReorderEnabled,
  reorderLevelDefault,
  reorderQtyDefault,
  stockAlertThreshold,
  allowNegativeStock,
  inventorySyncEnabled,

  // Sales settings
  taxRate,
  discountEnabled,
  maxDiscountPercent,
  allowRefunds,
  refundWindowDays,
  loyaltyPointsEnabled,
  getLoyaltyPointRate,

  // Cashier settings
  enableCashDrawer,
  drawerOpenCode,
  enableReceiptPrinting,
  receiptPrinterType,
  enableBarcodeScanning,
  enableTouchscreenMode,
  quickSaleEnabled,

  // Notifications settings (original)
  enableEmailAlerts,
  enableSmsAlerts,
  reminderIntervalHours,
  smtpHost,
  smtpPort,
  smtpUsername,
  smtpPassword,
  smtpUseSsl,
  smtpFromEmail,
  smtpFromName,
  getSmtpConfig,
  twilioAccountSid,
  twilioAuthToken,
  twilioPhoneNumber,
  twilioMessagingServiceSid,
  getTwilioConfig,

  // Notifications settings (extended)
  emailEnabled,
  smsEnabled,
  smsProvider,
  pushNotificationsEnabled,
  lowStockAlertEnabled,
  dailySalesSummaryEnabled,

  // Data & Reports settings
  exportFormats,
  defaultExportFormat,
  autoBackupEnabled,
  backupSchedule,
  backupLocation,
  dataRetentionDays,

  // Integrations settings
  accountingIntegrationEnabled,
  accountingApiUrl,
  accountingApiKey,
  paymentGatewayEnabled,
  paymentGatewayProvider,
  paymentGatewayApiKey,
  webhooksEnabled,
  webhooks,

  // Audit & Security settings
  auditLogEnabled,
  logRetentionDays,
  logEvents,
  forceHttps,
  sessionEncryptionEnabled,
  gdprComplianceEnabled,

  // Category-level convenience functions
  getGeneralSettings,
  getInventorySettings,
  getSalesSettings,
  getCashierSettings,
  getNotificationsSettings,
  getDataReportsSettings,
  getIntegrationsSettings,
  getAuditSecuritySettings,

  // System settings
  debugMode,
  environment,
  auditTrailEnabled,
};
