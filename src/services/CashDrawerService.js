// src/services/CashDrawerService.js

const auditLogger = require("../utils/auditLogger");
const {
  enableCashDrawer,
  drawerOpenCode,
  cashDrawerConnectionType,
} = require("../utils/system");


class CashDrawerService {
  constructor() {
    this.driver = null;
    this.isOpen = false;
  }

  async _loadDriver() {
    const connectionType = await cashDrawerConnectionType(); // 'printer' or 'usb'

    if (connectionType === "printer") {
      // Reuse the thermal printer driver (which can send drawer commands)
      const ThermalDriver = require("../drivers/thermalDriver");
      return new ThermalDriver();
    } else if (connectionType === "usb") {
      // Dedicated USB cash drawer driver (e.g., via serial or HID)
      // You need to implement this driver based on your hardware
      const UsbDrawerDriver = require("../drivers/usbDrawerDriver");
      return new UsbDrawerDriver();
    } else {
      throw new Error(
        `Unsupported cash drawer connection type: ${connectionType}`,
      );
    }
  }

  async _getDriver() {
    if (!this.driver) {
      this.driver = await this._loadDriver();
    }
    return this.driver;
  }

  /**
   * Open the cash drawer if enabled.
   * @param {string} reason - Reason for opening (e.g., "sale", "refund", "test")
   * @returns {Promise<boolean>}
   */
  async openDrawer(reason = "sale") {
    const notificationService = require("./NotificationService");
    const drawerEnabled = await enableCashDrawer();
    if (!drawerEnabled) {
      console.log("[CashDrawerService] Cash drawer is disabled in settings");
      throw new Error("Cash drawer is disabled in settings");
    }

    try {
      const driver = await this._getDriver();
      // Check if driver supports openDrawer
      if (typeof driver.openDrawer !== "function") {
        console.warn(
          "[CashDrawerService] Current driver does not support openDrawer",
        );
        throw new Error("Current driver does not support openDrawer");
      }

      const code = await drawerOpenCode(); // e.g., "0" or "1"
      let pin = 0;
      if (code) {
        const parsed = parseInt(code.trim(), 10);
        if (!isNaN(parsed)) pin = parsed;
      }

      await driver.openDrawer(pin);
      this.isOpen = true;

      await auditLogger.logCreate(
        "CashDrawerEvent",
        null,
        { action: "openDrawer", reason },
        "system",
      );
      console.log(`[CashDrawerService] Drawer opened (${reason})`);
      return true;
    } catch (err) {
      // @ts-ignore
      console.error("[CashDrawerService] Failed to open drawer:", err.message);
      this.isOpen = false;

      try {
        await notificationService.create(
          {
            userId: 1,
            title: "Cash Drawer Error",
            // @ts-ignore
            message: `Failed to open cash drawer (${reason}): ${err.message}`,
            type: "error",
            metadata: {
              reason,
              // @ts-ignore
              error: err.message,
              // @ts-ignore
              stack: err.stack,
            },
          },
          "system",
        );
      } catch (notifErr) {
        console.error(
          "Failed to send error notification for cash drawer",
          notifErr,
        );
      }
      throw err;
    }
  }

  getStatus() {
    return {
      driverLoaded: !!this.driver,
      isOpen: this.isOpen,
    };
  }

  isAvailable() {
    return !!this.driver;
  }
}

module.exports = CashDrawerService;
