
const https = require("https");
const http = require("http");
const { URL } = require("url");
require("dotenv").config();

class ActivationClient {
  constructor() {
    // Get server URL from environment or use default Django port
    this.baseURL = process.env.ACTIVATION_SERVER_URL || "http://127.0.0.1:8000";
    this.timeout = 15000; // 15 seconds timeout for Django
  }

  /**
   * Make HTTP request to Django backend
   * @param {string} endpoint
   * @param {Object} data
   * @param {string} method
   * @returns {Promise<Object>}
   */
  async request(endpoint, data, method = "POST") {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(`${this.baseURL}${endpoint}`);
        const postData = JSON.stringify(data);

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname,
          method: method,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
            "User-Agent": "Inventory-Pro-Client/1.0",
            "X-App-Version": require("electron").app.getVersion(),
            Accept: "application/json",
          },
          timeout: this.timeout,
        };

        const protocol = url.protocol === "https:" ? https : http;

        const req = protocol.request(options, (res) => {
          let body = "";

          res.on("data", (chunk) => {
            body += chunk;
          });

          res.on("end", () => {
            try {
              // Django typically returns JSON
              const response = JSON.parse(body);

              // @ts-ignore
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(response);
              } else {
                // Django error response format
                reject(
                  new Error(
                    response.detail ||
                      response.message ||
                      `HTTP ${res.statusCode}`,
                  ),
                );
              }
            } catch (error) {
              // Non-JSON response or invalid JSON
              reject(
                new Error(`Invalid JSON response: ${body.substring(0, 100)}`),
              );
            }
          });
        });

        req.on("error", (error) => {
          reject(new Error(`Network error: ${error.message}`));
        });

        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timeout (15s)"));
        });

        if (method === "POST" || method === "PUT") {
          req.write(postData);
        }
        req.end();
      } catch (error) {
        // @ts-ignore
        reject(new Error(`Request setup error: ${error.message}`));
      }
    });
  }

  /**
   * Activate license on Django server
   * REQUEST TO DJANGO:
   * POST /api/v1/licensing/activate/
   * {
   *   "activation_key": "XXXX-XXXX-XXXX-XXXX",
   *   "device_id": "string",
   *   "device_info": { ... }
   * }
   *
   * EXPECTED DJANGO RESPONSE:
   * {
   *   "success": true,
   *   "license_key": "XXXX-XXXX-XXXX-XXXX",
   *   "license_type": "pro|enterprise|standard|trial",
   *   "expires_at": "2024-12-31T23:59:59Z",
   *   "days_remaining": 365,
   *   "features": ["feature1", "feature2"],
   *   "limits": {
   *     "max_warehouses": 10,
   *     "max_users": 20
   *   },
   *   "max_devices": 5,
   *   "current_devices": 1,
   *   "activation_id": "uuid",
   *   "grace_period_days": 7
   * }
   * @param {string} activationKey
   * @param {string} deviceId
   */
  async activate(activationKey, deviceId, deviceInfo = {}) {
    try {
      const response = await this.request("/api/v1/licensing/activate/", {
        license_key: activationKey,
        device_id: deviceId,
        device_info: deviceInfo,
        app_version: require("electron").app.getVersion(),
        timestamp: new Date().toISOString(),
      });

      console.log("Django Response: ", response);

      // Normalize success flag
      // @ts-ignore
      const isSuccess = response.status === true || response.status === "true";

      if (isSuccess) {
        return {
          status: true,
          data: {
            // @ts-ignore
            license_key: response.license_key || activationKey,
            // @ts-ignore
            license_type: response.license_type || "standard",
            // @ts-ignore
            expires_at: response.expires_at ?? this.calculateDefaultExpiry(),
            // @ts-ignore
            days_remaining: response.days_remaining ?? 365,
            // @ts-ignore
            max_devices: response.max_devices ?? 5,
            // @ts-ignore
            current_devices: response.current_devices ?? 1,
            // @ts-ignore
            features: response.features ?? this.getDefaultFeatures(),
            // @ts-ignore
            limits: response.limits ?? this.getDefaultLimits(),
            // @ts-ignore
            activation_id: response.activation_id || null,
            // @ts-ignore
            grace_period_days: response.grace_period_days ?? 7,
            server_timestamp:
              // @ts-ignore
              response.server_timestamp || new Date().toISOString(),
          },
        };
      } else {
        return {
          status: false,
          // @ts-ignore
          message: response.message || response.detail || "Activation failed",
          // @ts-ignore
          code: response.code || "activation_failed",
        };
      }
    } catch (error) {
      // @ts-ignore
      console.warn("Server activation failed:", error.message);

      return {
        status: false,
        // @ts-ignore
        message: error.message || "Activation failed due to server error",
        code: "server_unreachable",
      };
    }
  }

  /**
   * Validate license with Django server (for background sync)
   * REQUEST TO DJANGO:
   * POST /api/v1/licensing/validate/
   * {
   *   "activation_key": "XXXX-XXXX-XXXX-XXXX",
   *   "device_id": "string"
   * }
   *
   * EXPECTED DJANGO RESPONSE:
   * {
   *   "success": true,
   *   "valid": true,
   *   "license_key": "XXXX-XXXX-XXXX-XXXX",
   *   "license_type": "pro",
   *   "expires_at": "2024-12-31T23:59:59Z",
   *   "days_remaining": 150,
   *   "features": ["feature1", "feature2"],
   *   "limits": {
   *     "max_warehouses": 10,
   *     "max_users": 20
   *   },
   *   "status": "active|expired|grace_period"
   * }
   * @param {string} activationKey
   * @param {string} deviceId
   */
  async validate(activationKey, deviceId) {
    try {
      const response = await this.request("/api/v1/licensing/validate/", {
        license_key: activationKey,
        device_id: deviceId,
        timestamp: new Date().toISOString(),
      });

      // Normalize success flag (accepts boolean or string "true")
      const isSuccess =
        // @ts-ignore
        response.status === true || response.status === "true";

      if (isSuccess) {
        return {
          status: true,
          data: {
            // @ts-ignore
            license_key: response.license_key || activationKey,
            // @ts-ignore
            license_type: response.license_type || "standard",
            // @ts-ignore
            expires_at: response.expires_at || this.calculateDefaultExpiry(),
            // @ts-ignore
            days_remaining: response.days_remaining ?? 0,
            // @ts-ignore
            features: Array.isArray(response.features)
              ? // @ts-ignore
                response.features
              : this.getDefaultFeatures(),
            limits:
              // @ts-ignore
              typeof response.limits === "object"
                ? // @ts-ignore
                  response.limits
                : this.getDefaultLimits(),
            // @ts-ignore
            status: response.status || "active",
            server_timestamp:
              // @ts-ignore
              response.server_timestamp || new Date().toISOString(),
            last_validated: new Date().toISOString(),
          },
        };
      } else {
        return {
          status: false,
          // @ts-ignore
          message: response.message || response.detail || "Validation failed",
          // @ts-ignore
          code: response.code || "validation_failed",
          data: null,
        };
      }
    } catch (error) {
      // @ts-ignore
      console.warn("Server validation failed:", error.message);

      // Grace mode: allow temporary usage if last known license exists
      // @ts-ignore
      const cached = await this.objects.get({ device_id: deviceId });
      if (cached) {
        return {
          status: true,
          data: {
            ...cached,
            status: "grace",
            grace_note: "Using cached license until next sync",
            last_validated: new Date().toISOString(),
          },
        };
      }

      return {
        status: false,
        message: "Validation failed due to server error",
        code: "server_unreachable",
        data: null,
      };
    }
  }

  /**
   * Check license status (lightweight check)
   * REQUEST TO DJANGO:
   * GET /api/v1/licensing/check-status/?activation_key=XXXX&device_id=YYYY
   *
   * EXPECTED DJANGO RESPONSE:
   * {
   *   "success": true,
   *   "status": "active",
   *   "expires_at": "2024-12-31T23:59:59Z",
   *   "days_remaining": 150
   * }
   * @param {string | number | boolean} activationKey
   * @param {string | number | boolean} deviceId
   */
  async checkStatus(activationKey, deviceId) {
    try {
      const response = await this.request(
        `/api/v1/licensing/check-status/?activation_key=${encodeURIComponent(activationKey)}&device_id=${encodeURIComponent(deviceId)}`,
        {},
        "GET",
      );

      // Normalize success flag
      // @ts-ignore
      const isSuccess = response.status === true || response.status === "true";

      if (isSuccess) {
        return {
          status: true,
          // @ts-ignore
          status: response.status || "active",
          // @ts-ignore
          expires_at: response.expires_at || this.calculateDefaultExpiry(),
          // @ts-ignore
          days_remaining: response.days_remaining ?? 0,
          last_checked: new Date().toISOString(),
        };
      } else {
        return {
          status: false,
          // @ts-ignore
          message: response.message || response.detail || "Status check failed",
          // @ts-ignore
          code: response.code || "status_failed",
        };
      }
    } catch (error) {
      // @ts-ignore
      console.warn("Status check failed:", error.message);
      return {
        status: false,
        message: "Unable to reach licensing server",
        code: "server_unreachable",
      };
    }
  }

  /**
   * Send telemetry/heartbeat to Django
   * REQUEST TO DJANGO:
   * POST /api/v1/licensing/telemetry/
   * {
   *   "device_id": "string",
   *   "app_version": "1.0.0",
   *   "os": "windows|mac|linux",
   *   "event": "app_start|feature_used|error",
   *   "data": { ... }
   * }
   * @param {string} deviceId
   */
  async sendTelemetry(deviceId, telemetryData = {}) {
    try {
      await this.request("/api/v1/licensing/telemetry/", {
        device_id: deviceId,
        app_version: require("electron").app.getVersion(),
        os: process.platform,
        timestamp: new Date().toISOString(),
        ...telemetryData,
      });
      return true;
    } catch (error) {
      // Silent fail for telemetry - don't show to user
      return false;
    }
  }

  /**
   * Deactivate license on server
   * REQUEST TO DJANGO:
   * POST /api/v1/licensing/deactivate/
   * {
   *   "activation_key": "XXXX-XXXX-XXXX-XXXX",
   *   "device_id": "string"
   * }
   * @param {any} activationKey
   * @param {any} deviceId
   */
  async deactivate(activationKey, deviceId) {
    try {
      const response = await this.request("/api/v1/licensing/deactivate/", {
        license_key: activationKey,
        device_id: deviceId,
      });

      // Normalize success flag
      // @ts-ignore
      const isSuccess = response.status === true || response.status === "true";

      if (isSuccess) {
        return {
          status: true,
          // @ts-ignore
          message: response.message || "Deactivated successfully",
          // @ts-ignore
          code: response.code || "deactivation_success",
          last_deactivated: new Date().toISOString(),
        };
      } else {
        return {
          status: false,
          // @ts-ignore
          message: response.message || response.detail || "Deactivation failed",
          // @ts-ignore
          code: response.code || "deactivation_failed",
        };
      }
    } catch (error) {
      // @ts-ignore
      console.warn("Server deactivation failed:", error.message);
      return {
        status: false,
        message: "Unable to reach licensing server",
        code: "server_unreachable",
      };
    }
  }

  /**
   * Get device activations from server
   * REQUEST TO DJANGO:
   * GET /api/v1/licensing/device-activations/?device_id=XXXX
   * @param {string | number | boolean} deviceId
   */
  async getDeviceActivations(deviceId) {
    try {
      const response = await this.request(
        `/api/v1/licensing/device-activations/?device_id=${encodeURIComponent(deviceId)}`,
        {},
        "GET",
      );

      // Normalize success flag
      // @ts-ignore
      const isSuccess = response.status === true || response.status === "true";

      if (isSuccess) {
        return {
          status: true,
          // @ts-ignore
          activations: Array.isArray(response.activations)
            ? // @ts-ignore
              response.activations
            : [],
          last_checked: new Date().toISOString(),
        };
      } else {
        return {
          status: false,
          activations: [],
          // @ts-ignore
          message: response.message || "Failed to fetch activations",
          // @ts-ignore
          code: response.code || "fetch_failed",
        };
      }
    } catch (error) {
      // @ts-ignore
      console.warn("Failed to get device activations:", error.message);
      return {
        status: false,
        activations: [],
        message: "Unable to reach licensing server",
        code: "server_unreachable",
      };
    }
  }

  /**
   * Default expiry (1 year from now)
   */
  calculateDefaultExpiry() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString();
  }

  /**
   * Default features for offline activation
   */
  getDefaultFeatures() {
    return [
      "inventory",
      "reports",
      "export",
      "multi_warehouse",
      "supplier_management",
      "purchase_orders",
      "sales_orders",
    ];
  }

  /**
   * Minimal features for offline fallback
   */
  getMinimalFeatures() {
    return ["inventory", "reports", "export"];
  }

  /**
   * Default limits for offline activation
   */
  getDefaultLimits() {
    return {
      max_warehouses: 3,
      max_users: 5,
      max_products: 1000,
      max_suppliers: 50,
    };
  }

  /**
   * Minimal limits for offline fallback
   */
  getMinimalLimits() {
    return {
      max_warehouses: 1,
      max_users: 1,
      max_products: 100,
      max_suppliers: 10,
    };
  }

  /**
   * Test Django server connection
   */
  async testConnection() {
    try {
      const response = await this.request(
        "/api/v1/licensing/health/",
        {},
        "GET",
      );

      // @ts-ignore
      return response.status === "ok";
    } catch (error) {
      // @ts-ignore
      console.warn("Server connection test failed:", error.message);
      return false;
    }
  }

  /**
   * Get server time (for clock skew detection)
   */
  async getServerTime() {
    try {
      const response = await this.request("/api/v1/licensing/time/", {}, "GET");
      return {
        status: true,

        // @ts-ignore
        server_time: response.server_time,
        client_time: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: false,
        server_time: null,
        client_time: new Date().toISOString(),
      };
    }
  }
}

// Create singleton instance
const activationClient = new ActivationClient();

module.exports = { activationClient };
