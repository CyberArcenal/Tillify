// src/main/license/licenseService.js


const LicenseCache = require("../entities/LicenseCache");
const crypto = require("crypto");
const os = require("os");

// DeviceInfo class moved here
class DeviceInfo {
  static async getMachineId() {
    try {
      const interfaces = os.networkInterfaces();
      let macAddress = "";

      for (const ifaceName in interfaces) {
        const iface = interfaces[ifaceName];
        // @ts-ignore
        for (const entry of iface) {
          if (
            !entry.internal &&
            entry.mac &&
            entry.mac !== "00:00:00:00:00:00"
          ) {
            macAddress = entry.mac;
            break;
          }
        }
        if (macAddress) break;
      }

      const machineInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        macAddress: macAddress,
        totalMem: os.totalmem(),
        cpus: os.cpus().length,
      };

      const hash = crypto.createHash("sha256");
      hash.update(JSON.stringify(machineInfo));
      return hash.digest("hex").substring(0, 32);
    } catch (error) {
      return crypto.randomBytes(16).toString("hex");
    }
  }

  static async getDeviceFingerprint() {
    try {
      const machineId = await this.getMachineId();
      const interfaces = os.networkInterfaces();
      let macAddress = "";

      for (const ifaceName in interfaces) {
        const iface = interfaces[ifaceName];
        // @ts-ignore
        for (const entry of iface) {
          if (
            !entry.internal &&
            entry.mac &&
            entry.mac !== "00:00:00:00:00:00"
          ) {
            macAddress = entry.mac;
            break;
          }
        }
        if (macAddress) break;
      }

      return {
        deviceId: machineId,
        deviceName: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        macAddress: macAddress,
        serialNumber: null,
        cpuId: null,
      };
    } catch (error) {
      // @ts-ignore
      throw new Error(`Failed to get device fingerprint: ${error.message}`);
    }
  }
}

// Main License Service
class LicenseService {
  constructor() {
    const { AppDataSource } = require("../main/db/datasource");
    const { activationClient } = require("../utils/activationClient");
    this.repository = AppDataSource.getRepository(LicenseCache);
    this.client = activationClient;
  }

  async getRepository() {
    const { AppDataSource } = require("../main/db/datasource");
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    return this.repository;
  }

  async getStatus() {
    try {
      const repo = await this.getRepository();
      const deviceId = await DeviceInfo.getMachineId();

      // Check for existing license for this device
      const license = await repo.findOne({
        where: { device_id: deviceId },
      });

      if (!license) {
        // Check if trial already consumed globally
        const trialExists = await repo.findOne({
          where: {
            license_type: "trial",
            trial_consumed: false,
          },
        });

        if (trialExists) {
          return {
            status: false,
            message: "Trial already consumed",
            data: null,
          };
        }

        // Create trial if no license exists
        return await this.createTrial();
      }

      // Parse JSON fields
      let features = [];
      let limits = {};
      // @ts-ignore
      let serverResponse = {};

      try {
        // @ts-ignore
        features = JSON.parse(license.features || "[]");
        // @ts-ignore
        limits = JSON.parse(license.limits || "{}");
        // @ts-ignore
        serverResponse = JSON.parse(license.server_response || "{}");
      } catch (e) {
        console.warn("Failed to parse license data:", e);
      }

      const now = new Date();
      // @ts-ignore
      const expiresAt = new Date(license.expires_at);
      // @ts-ignore
      const daysRemaining = Math.max(
        0,
        // @ts-ignore
        Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)),
      );

      let status = license.status;
      if (now > expiresAt) {
        const graceEnd = new Date(expiresAt);
        // @ts-ignore
        graceEnd.setDate(graceEnd.getDate() + (license.grace_period_days || 7));
        status = now <= graceEnd ? "grace_period" : "expired";
      }

      return {
        status: true,
        data: {
          status,
          // @ts-ignore
          isActivated: ["active", "trial", "grace_period"].includes(status),
          isTrial: license.license_type === "trial",
          isGracePeriod: status === "grace_period",
          licenseType: license.license_type,
          licenseKey: license.license_key,
          expiresAt: license.expires_at,
          remainingDays: daysRemaining,
          activatedAt: license.activated_at,
          features: features,
          limits: limits,
          deviceId: license.device_id,
        },
      };
    } catch (error) {
      console.error("Get status error:", error);
      return {
        status: false,
        message: "Failed to check license status",
        // @ts-ignore
        error: error.message,
      };
    }
  }

  async getLocalLicense() {
    try {
      const statusResult = await this.getStatus();

      if (!statusResult.status) {
        return null;
      }

      return {
        // @ts-ignore
        id: statusResult.data.deviceId, // You might want to get actual ID from DB
        // @ts-ignore
        license_key: statusResult.data.licenseKey,
        // @ts-ignore
        license_type: statusResult.data.licenseType,
        // @ts-ignore
        status: statusResult.data.status,
        // @ts-ignore
        expires_at: statusResult.data.expiresAt,
        // @ts-ignore
        activated_at: statusResult.data.activatedAt,
        // @ts-ignore
        remaining_days: statusResult.data.remainingDays,
        // @ts-ignore
        features: statusResult.data.features,
        // @ts-ignore
        limits: statusResult.data.limits,
        max_devices: 1, // Default
        current_devices: 1, // Default
        // @ts-ignore
        device_id: statusResult.data.deviceId,
        // @ts-ignore
        trial_consumed: statusResult.data.isTrial,
        grace_period_days: 7,
        // @ts-ignore
        offline_activation: !statusResult.data.licenseKey, // Assuming offline if no key
        last_sync: new Date(),
        next_sync_due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        server_response: JSON.stringify(statusResult.data),
      };
    } catch (error) {
      console.error("Error getting local license:", error);
      return null;
    }
  }

  /**
   * @param {any} key
   */
  async activate(key, isOnline = true) {
    try {
      // Validate key format
      if (!this.validateKeyFormat(key)) {
        return {
          status: false,
          message: "Invalid key format. Must be: XXXX-XXXX-XXXX-XXXX",
        };
      }

      const deviceId = await DeviceInfo.getMachineId();
      const repo = await this.getRepository();

      // Check if already activated with this key
      const existing = await repo.findOne({
        where: {
          device_id: deviceId,
          license_key: key,
        },
      });

      if (existing && existing.status === "active") {
        return {
          status: true,
          message: "Already activated with this key",
        };
      }

      let activationResult;
      if (isOnline) {
        activationResult = await this.callServer(key, deviceId);
      } else {
        activationResult = await this.offlineActivation(key);
      }

      if (!activationResult.status) {
        return activationResult;
      }

      // Save to database
      await this.saveLicense(deviceId, activationResult.data);

      return {
        status: true,
        message: isOnline
          ? "Activation successful"
          : "Offline activation completed",
        data: activationResult.data,
      };
    } catch (error) {
      console.error("Activation error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Activation failed: ${error.message}`,
      };
    }
  }

  /**
   * @param {any} activationKey
   */
  async activateWithServer(activationKey) {
    return this.activate(activationKey, true);
  }

  /**
   * @param {any} activationKey
   */
  async activateOffline(activationKey) {
    return this.activate(activationKey, false);
  }

  /**
   * @param {string} key
   * @param {string} deviceId
   */
  async callServer(key, deviceId) {
    try {
      console.log(`Calling Django server for key: ${key}, device: ${deviceId}`);

      const deviceInfo = await this.getDeviceInfo();
      const result = await this.client.activate(key, deviceId, deviceInfo);

      if (!result.status) {
        return {
          status: false,
          message: "Network Error.",
        };
      }

      return {
        status: true,
        data: {
          license_key: result.data?.license_key || key,
          license_type: result.data?.license_type || "standard",
          expires_at: result.data?.expires_at || this.calculateDefaultExpiry(),
          days_remaining: result.data?.days_remaining || 365,
          features: result.data?.features || [
            "inventory",
            "reports",
            "export",
            "advanced_features",
          ],
          limits: result.data?.limits || { max_warehouses: 10, max_users: 5 },
          max_devices: result.data?.max_devices || 1,
          current_devices: result.data?.current_devices || 1,
          activation_id: result.data?.activation_id || null,
          grace_period_days: result.data?.grace_period_days || 7,
          server_timestamp:
            result.data?.server_timestamp || new Date().toISOString(),
          // @ts-ignore
          offline_activation: result.data?.offline_activation || false,
        },
      };
    } catch (error) {
      console.error("Server call error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Server communication failed: ${error.message}`,
      };
    }
  }

  /**
   * @param {string} deviceId
   * @param {{ license_key: any; license_type: any; expires_at: any; days_remaining: any; features: any; limits: any; max_devices: any; current_devices: any; activation_id: any; grace_period_days: any; server_timestamp: any; offline_activation: any; } | { license_key: any; license_type: string; expires_at: string; days_remaining: number; features: string[]; limits: { max_warehouses: number; max_users: number; }; max_devices: number; current_devices: number; activation_id: null; grace_period_days: number; server_timestamp: string; offline_activation: boolean; } | undefined} data
   */
  async saveLicense(deviceId, data) {
    const repo = await this.getRepository();
    const now = new Date();
    const nextSync = new Date(now);
    nextSync.setDate(nextSync.getDate() + 30);

    const licenseData = {
      device_id: deviceId,
      // @ts-ignore
      license_key: data.license_key,
      // @ts-ignore
      license_type: data.license_type,
      status: "active",
      // @ts-ignore
      expires_at: data.expires_at,
      activated_at: now,
      // @ts-ignore
      days_remaining: data.days_remaining,
      // @ts-ignore
      features: JSON.stringify(data.features || []),
      // @ts-ignore
      limits: JSON.stringify(data.limits || {}),
      usage: JSON.stringify({}),
      last_sync: now,
      next_sync_due: nextSync,
      sync_interval_days: 30,
      server_response: JSON.stringify(data),
      // @ts-ignore
      max_devices: data.max_devices || 1,
      // @ts-ignore
      current_devices: data.current_devices || 1,
      // @ts-ignore
      activation_id: data.activation_id || null,
      // @ts-ignore
      grace_period_days: data.grace_period_days || 7,
      // @ts-ignore
      trial_consumed: data.license_type === "trial" ? 1 : 0,
      // @ts-ignore
      offline_activation: data.offline_activation || false,
    };

    // Check if exists
    const existing = await repo.findOne({
      where: { device_id: deviceId },
    });

    if (existing) {
      // @ts-ignore
      await repo.update(existing.id, {
        ...licenseData,
        updated_at: now,
      });
      console.log(`Updated existing license for device: ${deviceId}`);
    } else {
      const license = repo.create({
        ...licenseData,
        created_at: now,
      });
      await repo.save(license);
      console.log(`Created new license for device: ${deviceId}`);
    }
  }

  async syncWithServer() {
    try {
      const repo = await this.getRepository();
      const deviceId = await DeviceInfo.getMachineId();
      const license = await repo.findOne({
        where: { device_id: deviceId },
      });

      if (!license || !license.license_key) {
        return {
          status: false,
          message: "No license to sync",
        };
      }

      console.log(`Syncing license ${license.license_key} with server...`);
      // @ts-ignore
      const result = await this.client.validate(license.license_key, deviceId);

      if (result.status) {
        const now = new Date();
        // @ts-ignore
        await repo.update(license.id, {
          last_sync: now,
          next_sync_due: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          expires_at: result.data?.expires_at || license.expires_at,
          days_remaining: result.data?.days_remaining || license.days_remaining,
          status: result.data?.status || license.status,
          // @ts-ignore
          features: JSON.stringify(
            // @ts-ignore
            result.data?.features || JSON.parse(license.features || "[]"),
          ),
          // @ts-ignore
          limits: JSON.stringify(
            // @ts-ignore
            result.data?.limits || JSON.parse(license.limits || "{}"),
          ),
          updated_at: now,
        });

        return {
          status: true,
          message: "Sync completed",
          data: result.data,
        };
      } else {
        return {
          status: false,
          message: result.message || "Sync failed",
        };
      }
    } catch (error) {
      console.error("Sync error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Sync failed: ${error.message}`,
      };
    }
  }

  async checkServerStatus() {
    try {
      const repo = await this.getRepository();
      const deviceId = await DeviceInfo.getMachineId();
      const license = await repo.findOne({
        where: { device_id: deviceId },
      });

      if (!license || !license.license_key) {
        return {
          status: false,
          message: "No license to check",
        };
      }

      // @ts-ignore
      const result = await this.client.checkStatus(
        // @ts-ignore
        license.license_key,
        deviceId,
      );

      if (result.status) {
        return {
          status: true,
          expires_at: result.expires_at,
          days_remaining: result.days_remaining,
          last_checked: result.last_checked,
        };
      } else {
        return {
          status: false,
          message: result.message,
        };
      }
    } catch (error) {
      console.error("Status check error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Status check failed: ${error.message}`,
      };
    }
  }

  async deactivateFromServer() {
    try {
      const repo = await this.getRepository();
      const deviceId = await DeviceInfo.getMachineId();
      console.log(
        `[LicenseService] Starting deactivation for device: ${deviceId}`,
      );

      const license = await repo.findOne({
        where: { device_id: deviceId },
      });

      if (!license || !license.license_key) {
        return {
          status: false,
          message: "No license to deactivate",
        };
      }

      console.log(`[LicenseService] Found license record:`, {
        id: license.id,
        key: license.license_key,
        type: license.license_type,
        status: license.status,
      });

      const serverResult = await this.client.deactivate(
        license.license_key,
        deviceId,
      );
      console.log(
        `[LicenseService] Server deactivation response:`,
        serverResult,
      );

      // @ts-ignore
      const isSuccess =
        // @ts-ignore
        serverResult.status === true || serverResult.status === "true";

      if (isSuccess) {
        // Mark as expired instead of deleting
        const now = new Date();
        // @ts-ignore
        await repo.update(license.id, {
          status: "trial",
          trial_consumed: true,
          license_key: null,
          expires_at: null,
          days_remaining: 0,
          features: JSON.stringify([]),
          limits: JSON.stringify({}),
          last_deactivated: now,
          server_response: JSON.stringify(serverResult),
          updated_at: now,
        });

        return {
          status: true,
          message: "Deactivated on server and locally (record retained)",
          serverResponse: serverResult,
        };
      } else {
        return {
          status: false,
          message: serverResult.message || "Server deactivation failed.",
          code: serverResult.code || "server_failed",
          serverResponse: serverResult,
        };
      }
    } catch (error) {
      // @ts-ignore
      console.error(
        // @ts-ignore
        `[LicenseService] Deactivation error: ${error.message}`,
        error,
      );
      return {
        status: false,
        // @ts-ignore
        message: error.message,
        code: "server_unreachable",
      };
    }
  }

  async deleteLocalLicense() {
    try {
      const repo = await this.getRepository();
      const deviceId = await DeviceInfo.getMachineId();

      const license = await repo.findOne({
        where: { device_id: deviceId },
      });

      if (license) {
        await repo.remove(license);
        console.log(
          `[LicenseService] Deleted local license for device: ${deviceId}`,
        );
      }

      return true;
    } catch (error) {
      console.error("Error deleting local license:", error);
      throw error;
    }
  }

  async createTrial() {
    try {
      const deviceId = await DeviceInfo.getMachineId();
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30);

      const trialData = {
        device_id: deviceId,
        license_key: null,
        license_type: "trial",
        status: "trial",
        expires_at: expiresAt,
        activated_at: now,
        days_remaining: 30,
        features: JSON.stringify(["inventory", "reports", "export"]),
        limits: JSON.stringify({ max_warehouses: 1, max_users: 1 }),
        usage: JSON.stringify({}),
        last_sync: now,
        next_sync_due: expiresAt,
        sync_interval_days: 30,
        server_response: JSON.stringify({
          license_type: "trial",
          expires_at: expiresAt.toISOString(),
          days_remaining: 30,
        }),
        max_devices: 1,
        current_devices: 1,
        activation_id: null,
        grace_period_days: 7,
        trial_consumed: false,
        offline_activation: true,
      };

      const repo = await this.getRepository();
      const license = repo.create({
        ...trialData,
        created_at: now,
      });
      await repo.save(license);

      return {
        status: true,
        data: {
          status: "trial",
          isActivated: true,
          isTrial: true,
          isGracePeriod: false,
          licenseType: "trial",
          licenseKey: null,
          expiresAt: expiresAt.toISOString(),
          remainingDays: 30,
          activatedAt: now.toISOString(),
          features: ["inventory", "reports", "export"],
          limits: { max_warehouses: 1, max_users: 1 },
          deviceId: deviceId,
        },
      };
    } catch (error) {
      console.error("Error creating trial:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Trial creation failed: ${error.message}`,
      };
    }
  }

  async startTrial() {
    return this.createTrial();
  }

  /**
   * @param {any} key
   */
  async offlineActivation(key) {
    return {
      status: true,
      data: {
        license_key: key,
        license_type: "offline",
        expires_at: this.calculateDefaultExpiry(),
        days_remaining: 365,
        features: ["inventory", "reports", "export", "advanced_features"],
        limits: { max_warehouses: 10, max_users: 5 },
        max_devices: 1,
        current_devices: 1,
        activation_id: null,
        grace_period_days: 7,
        server_timestamp: new Date().toISOString(),
        offline_activation: true,
      },
    };
  }

  async testConnection() {
    try {
      const connected = await this.client.testConnection();
      return {
        status: true,
        connected,
        serverUrl: this.client.baseURL,
        message: connected
          ? "Connected to Django server"
          : "Cannot connect to Django server",
      };
    } catch (error) {
      return {
        status: false,
        connected: false,
        // @ts-ignore
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  // Helper methods
  /**
   * @param {string} key
   */
  validateKeyFormat(key) {
    return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
  }

  async getDeviceInfo() {
    const os = require("os");
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      total_memory: os.totalmem(),
      free_memory: os.freemem(),
      cpus: os.cpus().length,
      network_interfaces: Object.keys(os.networkInterfaces()).length,
      app_version: require("electron").app.getVersion(),
      node_version: process.version,
    };
  }

  calculateDefaultExpiry() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString();
  }

  // Feature and limit checking (keep existing)
  /**
   * @param {any} feature
   */
  async checkFeature(feature) {
    try {
      const license = await this.getLocalLicense();

      if (!license) {
        return {
          available: false,
          message: "No license found",
        };
      }

      const hasFeature = license.features.includes(feature);

      return {
        available: hasFeature,
        message: hasFeature
          ? "Feature available"
          : "Feature not available in license",
      };
    } catch (error) {
      console.error("Error checking feature:", error);
      return {
        available: false,
        // @ts-ignore
        message: `Feature check error: ${error.message}`,
      };
    }
  }

  /**
   * @param {string | number} limitName
   */
  async checkLimit(limitName, currentCount = 0) {
    try {
      const license = await this.getLocalLicense();

      if (!license) {
        return {
          withinLimit: false,
          message: "No license found",
        };
      }

      // @ts-ignore
      const limit = license.limits[limitName];
      if (limit === undefined) {
        return {
          withinLimit: true,
          message: "No limit specified",
        };
      }

      const withinLimit = currentCount < limit;

      return {
        withinLimit: withinLimit,
        remaining: Math.max(0, limit - currentCount),
        message: withinLimit
          ? `Within limit (${currentCount}/${limit})`
          : `Limit exceeded (${currentCount}/${limit})`,
      };
    } catch (error) {
      console.error("Error checking limit:", error);
      return {
        withinLimit: false,
        // @ts-ignore
        message: `Limit check error: ${error.message}`,
      };
    }
  }
}

module.exports = {
  LicenseService,
  DeviceInfo,
};
