// src/main/ipcHandlers/activationHandlers.js

const { ipcMain, dialog, app, BrowserWindow } = require("electron");
const fs = require("fs").promises;
const path = require("path");
const { LicenseService } = require("../../services/activation");

class ActivationHandlers {
  constructor() {
    this.licenseService = new LicenseService();
    console.log("✅ Activation IPC Handlers Initialized");
  }

  /**
   * @param {Electron.IpcMainInvokeEvent} event
   */
  // @ts-ignore
  // @ts-ignore
  async handleRequest(event, { method, params = {} }) {
    try {
      console.log(`[ActivationIPC] ${method}`, params);

      switch (method) {
        // 🔍 STATUS & CHECKING
        case "check":
          return await this.checkStatus();
        case "requiresActivation":
          return await this.requiresActivation();
        case "validateKeyFormat":
          // @ts-ignore
          return await this.validateKeyFormat(params.key);
        case "getRemainingDays":
          return await this.getRemainingDays();
        case "getInfo":
          return await this.getInfo();
        case "getServerStatus":
          return await this.getServerStatus();

        // 📱 DEVICE INFO
        case "getDeviceInfo":
          return await this.getDeviceInfo();

        // 🔑 ACTIVATION OPERATIONS
        case "activate":
          return await this.activate(params);
        case "activateOffline":
          return await this.activateOffline(params);
        case "deactivate":
          return await this.deactivate();
        case "sync":
          return await this.sync();
        case "validate":
          return await this.validate();

        // 🧪 TRIAL MANAGEMENT
        case "startTrial":
          return await this.startTrial();
        case "checkTrial":
          return await this.checkTrial();

        // ⚙️ FEATURES & LIMITS
        case "checkFeature":
          // @ts-ignore
          return await this.checkFeature(params.feature);
        case "checkLimit":
          // @ts-ignore
          return await this.checkLimit(params.limit, params.count);

        // 🔌 CONNECTION TEST
        case "testConnection":
          return await this.testConnection();

        // 💾 BACKUP & RESTORE
        case "backup":
          return await this.backupLicense();
        case "restore":
          return await this.restoreLicense();
        case "generateRequestFile":
          return await this.generateRequestFile();
        case "importResponseFile":
          return await this.importResponseFile();

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
          };
      }
    } catch (error) {
      console.error("ActivationHandler error:", error);
      return {
        status: false,
        // @ts-ignore
        message: error.message || "Internal error",
      };
    }
  }

  // ============================================
  // 🔍 STATUS & CHECKING METHODS
  // ============================================

  async checkStatus() {
    try {
      return await this.licenseService.getStatus();
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Check failed: ${error.message}`,
      };
    }
  }

  async requiresActivation() {
    try {
      const status = await this.licenseService.getStatus();

      if (!status.status) {
        return {
          status: true,
          data: {
            requiresActivation: true,
            canContinue: false,
            message: "Unable to check license status",
          },
        };
      }

      const licenseData = status.data;
      let requires = false;
      let canContinue = true;
      let message = "License valid";

      // @ts-ignore
      switch (licenseData.status) {
        case "expired":
          requires = true;
          canContinue = false;
          message = "License expired";
          break;
        case "grace_period":
          requires = true;
          canContinue = true;
          // @ts-ignore
          message = `License in grace period (${licenseData.remainingDays} days remaining)`;
          break;
        case "trial":
          // @ts-ignore
          requires = licenseData.remainingDays <= 0;
          // @ts-ignore
          canContinue = licenseData.remainingDays > 0;
          // @ts-ignore
          message =
            // @ts-ignore
            licenseData.remainingDays > 0
              ? // @ts-ignore
                `Trial license (${licenseData.remainingDays} days remaining)`
              : "Trial expired";
          break;
        case "active":
          requires = false;
          canContinue = true;
          message = "License active";
          break;
        default:
          requires = true;
          canContinue = false;
          message = "License not activated";
      }

      return {
        status: true,
        data: {
          requiresActivation: requires,
          canContinue: canContinue,
          message: message,
          // @ts-ignore
          status: licenseData.status,
          // @ts-ignore
          remainingDays: licenseData.remainingDays,
        },
      };
    } catch (error) {
      // Fail open - allow to continue
      return {
        status: true,
        data: {
          requiresActivation: false,
          canContinue: true,
          message: "Unable to check activation status",
        },
      };
    }
  }

  // @ts-ignore
  async validateKeyFormat(key) {
    try {
      const isValid = this.licenseService.validateKeyFormat(key);

      return {
        status: true,
        data: isValid,
        message: isValid
          ? "Valid key format"
          : "Invalid format (XXXX-XXXX-XXXX-XXXX)",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Validation failed: ${error.message}`,
      };
    }
  }

  async getRemainingDays() {
    try {
      const status = await this.licenseService.getStatus();

      if (!status.status) {
        return {
          status: false,
          message: "No license found",
        };
      }

      return {
        status: true,
        data: {
          // @ts-ignore
          remainingDays: status.data.remainingDays || 0,
          // @ts-ignore
          status: status.data.status || "unknown",
          // @ts-ignore
          expiresAt: status.data.expiresAt,
        },
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to get remaining days: ${error.message}`,
      };
    }
  }

  async getInfo() {
    try {
      const status = await this.licenseService.getStatus();

      if (!status.status) {
        return {
          status: false,
          message: "No license found",
        };
      }

      return {
        status: true,
        data: {
          ...status.data,
          appVersion: app.getVersion(),
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to get info: ${error.message}`,
      };
    }
  }

  async getServerStatus() {
    try {
      const serverStatus = await this.licenseService.checkServerStatus();

      return {
        status: true,
        data: serverStatus,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to get server status: ${error.message}`,
      };
    }
  }

  // ============================================
  // 🔑 ACTIVATION OPERATIONS
  // ============================================

  // @ts-ignore
  async activate(params) {
    try {
      const { key, isOnline = true } = params;

      if (!key) {
        return {
          status: false,
          message: "Activation key is required",
        };
      }

      const result = await this.licenseService.activate(key, isOnline);

      if (result.status) {
        // Notify all windows
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("activation:completed", result.data);
          }
        });

        return {
          status: true,
          data: result.data,
          // @ts-ignore
          message: result.message || "Activation successful",
        };
      } else {
        return {
          status: false,
          // @ts-ignore
          message: result.message || "Activation failed",
        };
      }
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Activation failed: ${error.message}`,
      };
    }
  }

  // @ts-ignore
  async activateOffline(params) {
    const { key } = params;
    return await this.activate({ key, isOnline: false });
  }

  async deactivate() {
    try {
      const result = await this.licenseService.deactivateFromServer();

      if (result.status) {
        // Notify all windows
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("activation:deactivated");
          }
        });

        return {
          status: true,
          data: result,
          message: result.message || "License deactivated",
        };
      } else {
        return {
          status: false,
          message: result.message || "Deactivation failed",
        };
      }
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Deactivation failed: ${error.message}`,
      };
    }
  }

  async sync() {
    try {
      const result = await this.licenseService.syncWithServer();

      if (result.status) {
        return {
          status: true,
          data: result.data,
          message: result.message || "Sync completed",
        };
      } else {
        return {
          status: false,
          message: result.message || "Sync failed",
        };
      }
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Sync failed: ${error.message}`,
      };
    }
  }

  async validate() {
    try {
      const status = await this.licenseService.getStatus();

      if (!status.status) {
        return {
          status: true,
          data: {
            valid: false,
            message: "No license found",
          },
        };
      }

      // @ts-ignore
      const isValid = status.data.isActivated;

      return {
        status: true,
        data: {
          valid: isValid,
          // @ts-ignore
          message: status.data.isActivated
            ? "License valid"
            : "License invalid",
          data: status.data,
        },
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Validation failed: ${error.message}`,
      };
    }
  }

  // ============================================
  // 🧪 TRIAL MANAGEMENT
  // ============================================

  async startTrial() {
    try {
      const result = await this.licenseService.startTrial();

      if (result.status) {
        // Notify all windows
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("activation:trial_started", result.data);
          }
        });

        return {
          status: true,
          data: result.data,
          message: result.message || "Trial started",
        };
      } else {
        return {
          status: false,
          message: result.message || "Failed to start trial",
        };
      }
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to start trial: ${error.message}`,
      };
    }
  }

  async checkTrial() {
    try {
      const status = await this.licenseService.getStatus();

      if (!status.status) {
        return {
          status: true,
          data: {
            isTrial: false,
            message: "No license found",
          },
        };
      }

      // @ts-ignore
      const isTrial = status.data.isTrial;

      return {
        status: true,
        data: {
          isTrial: isTrial,
          license: status.data,
          // @ts-ignore
          remainingDays: status.data.remainingDays,
          message: isTrial
            ? // @ts-ignore
              `Trial license (${status.data.remainingDays} days remaining)`
            : "Not a trial license",
        },
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to check trial: ${error.message}`,
      };
    }
  }

  // ============================================
  // ⚙️ FEATURES & LIMITS
  // ============================================

  // @ts-ignore
  async checkFeature(feature) {
    try {
      const result = await this.licenseService.checkFeature(feature);

      return {
        status: true,
        data: result.available,
        message: result.message,
      };
    } catch (error) {
      return {
        status: true,
        data: false,
        message: "Feature check failed, assuming not available",
      };
    }
  }

  // @ts-ignore
  async checkLimit(limitName, count = 0) {
    try {
      const result = await this.licenseService.checkLimit(limitName, count);

      return {
        status: true,
        data: {
          withinLimit: result.withinLimit,
          remaining: result.remaining,
          message: result.message,
        },
      };
    } catch (error) {
      return {
        status: true,
        data: {
          withinLimit: true,
          message: "Limit check failed, assuming within limit",
        },
      };
    }
  }

  // ============================================
  // 📱 DEVICE INFO
  // ============================================

  async getDeviceInfo() {
    try {
      const deviceInfo = await this.licenseService.getDeviceInfo();
      return {
        status: true,
        data: deviceInfo,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to get device info: ${error.message}`,
      };
    }
  }

  // ============================================
  // 🔌 CONNECTION TEST
  // ============================================

  async testConnection() {
    try {
      const result = await this.licenseService.testConnection();
      return {
        status: true,
        data: result,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  // ============================================
  // 💾 BACKUP & RESTORE
  // ============================================

  async backupLicense() {
    try {
      const status = await this.licenseService.getStatus();

      if (!status.status) {
        return {
          status: false,
          message: "No license to backup",
        };
      }

      const desktopPath = app.getPath("desktop");
      const fileName = `license_backup_${Date.now()}.json`;
      const filePath = path.join(desktopPath, fileName);

      await fs.writeFile(filePath, JSON.stringify(status.data, null, 2));

      return {
        status: true,
        data: { filePath },
        message: `License backed up to: ${fileName}`,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Backup failed: ${error.message}`,
      };
    }
  }

  async restoreLicense() {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Select License Backup",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (canceled || !filePaths[0]) {
        return {
          status: false,
          message: "No file selected",
        };
      }

      const content = await fs.readFile(filePaths[0], "utf-8");
      const backup = JSON.parse(content);

      if (!backup.licenseKey && !backup.license_key) {
        return {
          status: false,
          message: "Invalid backup file",
        };
      }

      // If it has a license key, activate it
      const key = backup.licenseKey || backup.license_key;
      if (key && this.licenseService.validateKeyFormat(key)) {
        return await this.activate({ key, isOnline: false });
      }

      // If it's a trial, create trial
      if (backup.licenseType === "trial") {
        return await this.startTrial();
      }

      return {
        status: false,
        message: "Cannot restore from backup file",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Restore failed: ${error.message}`,
      };
    }
  }

  async generateRequestFile() {
    try {
      const deviceInfo = await this.licenseService.getDeviceInfo();

      const requestData = {
        // @ts-ignore
        deviceId: deviceInfo.deviceId || "",
        deviceInfo: deviceInfo,
        timestamp: new Date().toISOString(),
        appVersion: app.getVersion(),
        requestType: "activation",
      };

      const desktopPath = app.getPath("desktop");
      const fileName = `activation_request_${Date.now()}.json`;
      const filePath = path.join(desktopPath, fileName);

      await fs.writeFile(filePath, JSON.stringify(requestData, null, 2));

      return {
        status: true,
        data: { filePath },
        message: `Request saved to: ${fileName}`,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to generate request: ${error.message}`,
      };
    }
  }

  async importResponseFile() {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Select Response File",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (canceled || !filePaths[0]) {
        return {
          status: false,
          message: "No file selected",
        };
      }

      const content = await fs.readFile(filePaths[0], "utf-8");
      const response = JSON.parse(content);

      if (
        !response.activationKey &&
        !response.license_key &&
        !response.licenseKey
      ) {
        return {
          status: false,
          message: "Invalid response file",
        };
      }

      const key =
        response.activationKey || response.license_key || response.licenseKey;

      // Activate with the key (offline since it's from file)
      return await this.activate({ key, isOnline: false });
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Import failed: ${error.message}`,
      };
    }
  }
}

// Initialize and register handlers
const activationHandlers = new ActivationHandlers();

if (ipcMain) {
  ipcMain.handle("activation", (event, payload) =>
    activationHandlers.handleRequest(event, payload),
  );
}

function registerActivationHandlers() {
  console.log("✅ Activation IPC handlers registered");
}

module.exports = {
  ActivationHandlers,
  activationHandlers,
  registerActivationHandlers,
};
