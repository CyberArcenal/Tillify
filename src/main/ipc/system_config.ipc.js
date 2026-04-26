// electron-app/main/ipc/handlers/systemConfig.js

const { ipcMain } = require("electron");
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
const path = require("path");
const { logger } = require("../../utils/logger");
const { SystemSetting, SettingType } = require("../../entities/systemSettings");
const { AppDataSource } = require("../db/datasource");

class SystemConfigHandler {
  constructor() {
    this._settingsCache = null;
    this._lastCacheUpdate = null;
    this._CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    this.systemSettingRepository = null;
    this.initializeRepository();
  }

  async initializeRepository() {
    try {
      this.systemSettingRepository = AppDataSource.getRepository(SystemSetting);
      console.log("✅ SystemConfigHandler repository initialized");
    } catch (error) {
      console.error("❌ Failed to initialize repository:", error);
    }
  }

  // ✅ Normalize boolean value to 0/1 for database
  /**
   * @param {{ toString: () => string; } | null | undefined} value
   */
  normalizeBoolean(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") return value ? 1 : 0;
    if (typeof value === "string") {
      const str = value.toString().toLowerCase().trim();
      if (str === "true" || str === "1" || str === "yes") return 1;
      if (str === "false" || str === "0" || str === "no") return 0;
    }
    return 0;
  }

  // ✅ Convert database boolean (0/1) to JavaScript boolean
  /**
   * @param {string | number | null | undefined} value
   */
  dbToBoolean(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      return value === "1" || value.toLowerCase() === "true";
    }
    return false;
  }

  /**
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {{ method: any; params: {}; userId?: number; }} payload // MODIFIED: Added userId
   */
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  async handleRequest(event, payload) {
    try {
      const method = payload.method;
      const params = payload.params || {};
      const userId = payload.userId || 1; // ADDED: Get userId from payload

      // @ts-ignore
      logger.info(`SystemConfigHandler: ${method}`, params);

      switch (method) {
        case "getGroupedConfig":
          return await this.getGroupedConfig();
        case "updateGroupedConfig":
          // @ts-ignore
          return await this.updateGroupedConfig(params.configData, userId); // MODIFIED: Pass userId
        case "getSystemInfo":
          return await this.getSystemInfo();
        case "getAllSettings":
          return await this.getAllSettings();
        case "getPublicSettings":
          return await this.getPublicSettings();
        case "getSettingByKey":
          // @ts-ignore
          return await this.getSettingByKey(params.key, params.settingType);
        case "createSetting":
          // @ts-ignore
          return await this.createSetting(params.settingData, userId); // MODIFIED: Pass userId
        case "updateSetting":
          // @ts-ignore
          return await this.updateSetting(
            // @ts-ignore
            params.id,
            // @ts-ignore
            params.settingData,
            userId,
          ); // MODIFIED: Pass userId
        case "deleteSetting":
          // @ts-ignore
          return await this.deleteSetting(params.id, userId); // MODIFIED: Pass userId
        case "getByType":
          // @ts-ignore
          return await this.getByType(params.settingType);
        case "getValueByKey":
          // @ts-ignore
          return await this.getValueByKey(params.key, params.defaultValue);
        case "setValueByKey":
          return await this.setValueByKey(
            // @ts-ignore
            params.key,
            // @ts-ignore
            params.value,
            // @ts-ignore
            params.options,
            userId, // MODIFIED: Pass userId
          );
        case "bulkUpdate":
          // @ts-ignore
          return await this.bulkUpdate(params.settingsData, userId); // MODIFIED: Pass userId
        case "bulkDelete":
          // @ts-ignore
          return await this.bulkDelete(params.ids, userId); // MODIFIED: Pass userId
        case "getSettingsStats":
          return await this.getSettingsStats();
        case "getTaxSettings":
          return await this.getTaxSettings();
        case "getEmailSettings":
          return await this.getEmailSettings();
        case "getSystemInfoForFrontend":
          return await this.getSystemInfoForFrontend();
        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
            data: null,
          };
      }
    } catch (error) {
      // @ts-ignore
      logger.error("SystemConfigHandler error:", error);
      return {
        status: false,
        // @ts-ignore
        message: error.message,
        data: null,
      };
    }
  }
  async getSystemInfoForFrontend() {
    console.log(`🌐 getSystemInfoForFrontend called`);

    try {
      const [publicSettings, systemInfo] = await Promise.all([
        this.getPublicSettings(),
        this.getSystemInfo(),
      ]);

      // Extract only the data properties
      const frontendInfo = {
        system_info: systemInfo.data ? systemInfo.data : {},
        public_settings: publicSettings.data ? publicSettings.data : [],
        cache_timestamp: new Date().toISOString(),
      };

      // Ensure all values are serializable
      const serializedInfo = JSON.parse(JSON.stringify(frontendInfo));

      console.log(`✅ getSystemInfoForFrontend successful`);

      return {
        status: true,
        message: "Frontend system info fetched successfully",
        data: serializedInfo,
      };
    } catch (error) {
      console.error("❌ getSystemInfoForFrontend error:", error);
      // @ts-ignore
      logger.error("getSystemInfoForFrontend error:", error);

      // Return a safe, serializable error response
      return {
        status: false,
        // @ts-ignore
        message: error?.message || "Failed to fetch system info",
        data: {
          system_info: {},
          public_settings: [],
          cache_timestamp: new Date().toISOString(),
        },
      };
    }
  }
  /**
   * Kunin ang lahat ng system configuration na naka-group by category
   */
  async getGroupedConfig() {
    try {
      if (this._isCacheValid()) {
        return {
          status: true,
          message: "System configuration retrieved from cache",
          data: this._settingsCache,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const settings = await this.systemSettingRepository.find({
        where: { is_deleted: false },
      });

      if (!settings || settings.length === 0) {
        return {
          status: true,
          message: "No system settings found",
          data: {
            settings: [],
            grouped_settings: {},
            system_info: await this._getSystemInfo(),
          },
        };
      }

      // I-group ang settings by type with proper boolean conversion
      const groupedSettings =
        await this._groupSettingsWithBooleanConversion(settings);

      // I-serialize ang settings data with proper boolean conversion
      const serializedSettings =
        await this._serializeSettingsWithBooleanConversion(settings);

      const result = {
        settings: serializedSettings,
        grouped_settings: groupedSettings,
        system_info: await this._getSystemInfo(),
      };

      // I-update ang cache
      this._updateCache(result);

      // @ts-ignore
      // logger.info("Get system data", result);

      return {
        status: true,
        message: "System configuration retrieved successfully",
        data: result,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getGroupedConfig error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve system configuration: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * I-update ang grouped system configuration
   * @param {string} configData
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  async updateGroupedConfig(configData, userId = 1) {
    // MODIFIED: Added userId parameter
    try {
      if (typeof configData === "string") {
        try {
          configData = JSON.parse(configData);
        } catch (err) {
          logger.error(
            "Invalid JSON string received in updateGroupedConfig",
            // @ts-ignore
            err,
          );
          return {
            status: false,
            message: "Invalid JSON string format",
            data: null,
          };
        }
      }

      // @ts-ignore
      logger.info("Updating system configuration with data", { configData });

      if (
        !configData ||
        typeof configData !== "object" ||
        Array.isArray(configData)
      ) {
        // @ts-ignore
        logger.warn("Invalid configuration data format", { configData });
        return {
          status: false,
          message: "Invalid configuration data format",
          data: null,
        };
      }

      if (Object.keys(configData).length === 0) {
        // @ts-ignore
        logger.warn("Empty configuration data", { configData });
        return {
          status: false,
          message: "Empty configuration data",
          data: null,
        };
      }

      // Process grouped settings update with boolean normalization
      const updateResult =
        await this._updateGroupedSettingsWithBooleanNormalization(
          configData,
          userId,
        ); // MODIFIED: Pass userId

      // Clear cache + reload system data
      this._clearCache();
      const systemData = await this.getGroupedConfig();

      if (updateResult.errors.length > 0) {
        return {
          status: false,
          message: `System configuration updated with ${updateResult.errors.length} error(s)`,
          data: systemData.data,
          details: {
            updated: updateResult.updatedSettings,
            errors: updateResult.errors,
          },
        };
      }

      // @ts-ignore
      logger.info("System configuration updated successfully", {
        updatedCategories: Object.keys(configData),
        updatedSettingsCount: updateResult.updatedSettings.length,
        errorsCount: updateResult.errors.length,
        cacheCleared: true,
      });

      return {
        status: true,
        message: "System configuration updated successfully",
        data: systemData.data,
        details: { updated: updateResult.updatedSettings, errors: [] },
      };
    } catch (error) {
      // @ts-ignore
      logger.error("updateGroupedConfig error", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to update system configuration: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang system information
   */
  async getSystemInfo() {
    try {
      const systemInfo = await this._getSystemInfo();

      return {
        status: true,
        message: "System information retrieved successfully",
        data: systemInfo,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getSystemInfo error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve system information: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang lahat ng system settings
   */
  async getAllSettings() {
    try {
      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const settings = await this.systemSettingRepository.find({
        where: { is_deleted: false },
      });
      const serializedSettings =
        await this._serializeSettingsWithBooleanConversion(settings);

      return {
        status: true,
        message: "All system settings retrieved successfully",
        data: serializedSettings,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getAllSettings error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve system settings: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang public settings lang
   */
  async getPublicSettings() {
    try {
      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const settings = await this.systemSettingRepository.find({
        where: { is_public: true, is_deleted: false },
      });
      const serializedSettings =
        await this._serializeSettingsWithBooleanConversion(settings);

      return {
        status: true,
        message: "Public system settings retrieved successfully",
        data: serializedSettings,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getPublicSettings error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve public settings: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang specific setting by key at type
   * @param {any} key
   */
  async getSettingByKey(key, settingType = null) {
    try {
      if (!key) {
        return {
          status: false,
          message: "Setting key is required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      const whereClause = { key, is_deleted: false };
      if (settingType) {
        // @ts-ignore
        whereClause.setting_type = settingType;
      }

      // @ts-ignore
      const setting = await this.systemSettingRepository.findOne({
        where: whereClause,
      });

      if (!setting) {
        return {
          status: true,
          message: "Setting not found",
          data: null,
        };
      }

      const serializedSetting =
        await this._serializeSettingWithBooleanConversion(setting);

      return {
        status: true,
        message: "Setting retrieved successfully",
        data: serializedSetting,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getSettingByKey error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve setting: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Gumawa ng bagong system setting
   * @param {import("typeorm").DeepPartial<import("typeorm").ObjectLiteral>[]} settingData
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  async createSetting(settingData, userId = 1) {
    // MODIFIED: Added userId parameter
    try {
      if (!settingData) {
        return {
          status: false,
          message: "Setting data is required",
          data: null,
        };
      }

      // I-validate ang required fields
      // @ts-ignore
      if (!settingData.key || !settingData.setting_type) {
        return {
          status: false,
          message: "Key and setting_type are required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // Normalize boolean fields
      // @ts-ignore
      if (settingData.is_public !== undefined) {
        // @ts-ignore
        settingData.is_public =
          // @ts-ignore
          this.normalizeBoolean(settingData.is_public) === 1;
      }

      // @ts-ignore
      if (settingData.value !== undefined) {
        // @ts-ignore
        settingData.value = this._prepareValueForStorage(settingData.value);
      }

      // @ts-ignore
      if (settingData.is_deleted !== undefined) {
        // @ts-ignore
        settingData.is_deleted =
          // @ts-ignore
          this.normalizeBoolean(settingData.is_deleted) === 1;
      }

      // @ts-ignore
      const newSetting = this.systemSettingRepository.create(settingData);
      // @ts-ignore
      const createdSetting =
        // @ts-ignore
        await this.systemSettingRepository.save(newSetting);

      // I-clear ang cache
      this._clearCache();

      const serializedSetting =
        await this._serializeSettingWithBooleanConversion(createdSetting);

      return {
        status: true,
        message: "Setting created successfully",
        data: serializedSetting,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("createSetting error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to create setting: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * I-update ang existing system setting
   * @param {any} id
   * @param {import("typeorm").DeepPartial<import("typeorm").ObjectLiteral>} settingData
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  async updateSetting(id, settingData, userId = 1) {
    // MODIFIED: Added userId parameter
    try {
      if (!id || !settingData) {
        return {
          status: false,
          message: "ID and setting data are required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // Find existing setting
      // @ts-ignore
      const existingSetting = await this.systemSettingRepository.findOne({
        where: { id, is_deleted: false },
      });

      if (!existingSetting) {
        return {
          status: false,
          message: "Setting not found",
          data: null,
        };
      }

      // Record old values for audit log
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      const oldValues = {
        key: existingSetting.key,
        value: existingSetting.value,
        setting_type: existingSetting.setting_type,
        description: existingSetting.description,
        // @ts-ignore
        is_public: this.dbToBoolean(existingSetting.is_public),
      };
      if (settingData.value !== undefined) {
        settingData.value = this._prepareValueForStorage(settingData.value);
      }
      // Normalize boolean fields
      if (settingData.is_public !== undefined) {
        settingData.is_public =
          this.normalizeBoolean(settingData.is_public) === 1;
      }
      if (settingData.is_deleted !== undefined) {
        settingData.is_deleted =
          this.normalizeBoolean(settingData.is_deleted) === 1;
      }

      // Merge changes
      // @ts-ignore
      this.systemSettingRepository.merge(existingSetting, settingData);
      existingSetting.updated_at = new Date();

      // @ts-ignore
      const updatedSetting =
        // @ts-ignore
        await this.systemSettingRepository.save(existingSetting);

      // I-clear ang cache
      this._clearCache();

      const serializedSetting =
        await this._serializeSettingWithBooleanConversion(updatedSetting);

      return {
        status: true,
        message: "Setting updated successfully",
        data: serializedSetting,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("updateSetting error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to update setting: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * I-delete ang system setting (soft delete)
   * @param {any} id
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  async deleteSetting(id, userId = 1) {
    // MODIFIED: Added userId parameter
    try {
      if (!id) {
        return {
          status: false,
          message: "Setting ID is required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const setting = await this.systemSettingRepository.findOne({
        where: { id, is_deleted: false },
      });

      if (!setting) {
        return {
          status: false,
          message: "Setting not found",
          data: null,
        };
      }

      setting.is_deleted = true;
      setting.updated_at = new Date();
      // @ts-ignore
      await this.systemSettingRepository.save(setting);

      // I-clear ang cache
      this._clearCache();

      return {
        status: true,
        message: "Setting deleted successfully",
        data: null,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("deleteSetting error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to delete setting: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang settings by type
   * @param {any} settingType
   */
  async getByType(settingType) {
    try {
      if (!settingType) {
        return {
          status: false,
          message: "Setting type is required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const settings = await this.systemSettingRepository.find({
        where: { setting_type: settingType, is_deleted: false },
      });
      const serializedSettings =
        await this._serializeSettingsWithBooleanConversion(settings);

      return {
        status: true,
        message: `Settings of type ${settingType} retrieved successfully`,
        data: serializedSettings,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getByType error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve settings by type: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang value by key
   * @param {any} key
   */
  async getValueByKey(key, defaultValue = null) {
    try {
      if (!key) {
        return {
          status: false,
          message: "Key is required",
          data: null,
        };
      }

      const result = await this.getSettingByKey(key);
      if (result.status && result.data) {
        return {
          status: true,
          message: "Value retrieved successfully",
          data: result.data.value,
        };
      }

      return {
        status: true,
        message: "Using default value",
        data: defaultValue,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getValueByKey error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve value: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Set value by key (creates or updates)
   * @param {string} key
   * @param {any} value
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  async setValueByKey(key, value, options = {}, userId = 1) {
    // MODIFIED: Added userId parameter
    try {
      if (!key) {
        return {
          status: false,
          message: "Key is required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // Normalize boolean fields in options
      // @ts-ignore
      if (options.is_public !== undefined) {
        // @ts-ignore
        options.is_public = this.normalizeBoolean(options.is_public) === 1;
      }

      const valueToSave = this._prepareValueForStorage(value);

      // Check if setting exists
      // @ts-ignore
      const existing = await this.systemSettingRepository.findOne({
        where: {
          key,
          // @ts-ignore
          setting_type: options.setting_type || "general",
          is_deleted: false,
        },
      });

      let setting;
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      let action = "update"; // Default action

      if (existing) {
        // Record old value for audit log
        // @ts-ignore
        // @ts-ignore
        // @ts-ignore
        // @ts-ignore
        const oldValue = existing.value;

        // Update existing
        existing.value = valueToSave;
        // @ts-ignore
        if (options.is_public !== undefined) {
          // @ts-ignore
          existing.is_public = options.is_public;
        }
        // @ts-ignore
        if (options.description !== undefined) {
          // @ts-ignore
          existing.description = options.description;
        }
        existing.updated_at = new Date();
        // @ts-ignore
        setting = await this.systemSettingRepository.save(existing);
      } else {
        // Create new
        action = "create";
        // @ts-ignore
        const newSetting = this.systemSettingRepository.create({
          key,
          value: valueToSave,
          // @ts-ignore
          setting_type: options.setting_type || "general",
          // @ts-ignore
          description:
            // @ts-ignore
            options.description || `Auto-generated setting for ${key}`,
          // @ts-ignore
          is_public: options.is_public || false,
          is_deleted: false,
        });
        // @ts-ignore
        setting = await this.systemSettingRepository.save(newSetting);
      }

      // I-clear ang cache
      this._clearCache();

      const serializedSetting = setting
        ? await this._serializeSettingWithBooleanConversion(setting)
        : null;

      return {
        status: true,
        message: "Value set successfully",
        data: serializedSetting,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("setValueByKey error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set value: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Bulk update multiple settings
   * @param {string | any[]} settingsData
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  async bulkUpdate(settingsData, userId = 1) {
    // MODIFIED: Added userId parameter
    try {
      if (
        !settingsData ||
        !Array.isArray(settingsData) ||
        settingsData.length === 0
      ) {
        return {
          status: false,
          message: "Settings data array is required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      const results = [];
      const auditDetails = {
        settings_updated: [],
        settings_created: [],
        errors: [],
      };

      for (const settingData of settingsData) {
        try {
          const valueToSave = this._prepareValueForStorage(settingData.value);

          // Normalize boolean fields in each setting
          const normalizedSetting = {
            ...settingData,
            value: valueToSave,
            is_public:
              settingData.is_public !== undefined
                ? this.normalizeBoolean(settingData.is_public) === 1
                : undefined,
            is_deleted:
              settingData.is_deleted !== undefined
                ? this.normalizeBoolean(settingData.is_deleted) === 1
                : undefined,
          };

          // Check if setting exists by key and type
          // @ts-ignore
          const existing = await this.systemSettingRepository.findOne({
            where: {
              key: normalizedSetting.key,
              setting_type: normalizedSetting.setting_type,
              is_deleted: false,
            },
          });

          if (existing) {
            // Record old values for audit log
            const oldValues = {
              value: existing.value,
              // @ts-ignore
              is_public: this.dbToBoolean(existing.is_public),
              description: existing.description,
            };

            // Update existing
            // @ts-ignore
            this.systemSettingRepository.merge(existing, normalizedSetting);
            existing.updated_at = new Date();
            // @ts-ignore
            await this.systemSettingRepository.save(existing);

            results.push({
              success: true,
              id: existing.id,
              action: "updated",
            });

            // @ts-ignore
            auditDetails.settings_updated.push({
              id: existing.id,
              key: existing.key,
              setting_type: existing.setting_type,
              old_value: oldValues.value,
              new_value: existing.value,
            });
          } else {
            // Create new
            // @ts-ignore
            const newSetting =
              // @ts-ignore
              this.systemSettingRepository.create(normalizedSetting);
            // @ts-ignore
            const created = await this.systemSettingRepository.save(newSetting);

            results.push({
              success: true,
              // @ts-ignore
              id: created.id,
              action: "created",
            });

            // @ts-ignore
            auditDetails.settings_created.push({
              // @ts-ignore
              id: created.id,
              // @ts-ignore
              key: created.key,
              // @ts-ignore
              setting_type: created.setting_type,
              // @ts-ignore
              value: created.value,
            });
          }
        } catch (error) {
          results.push({
            success: false,
            key: settingData.key,
            // @ts-ignore
            error: error.message,
          });

          // @ts-ignore
          auditDetails.errors.push({
            key: settingData.key,
            // @ts-ignore
            error: error.message,
          });
        }
      }

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      // I-clear ang cache
      this._clearCache();

      return {
        status: true,
        message: `Bulk update completed: ${successful} successful, ${failed} failed`,
        data: results,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("bulkUpdate error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to bulk update settings: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Bulk delete settings
   * @param {string | any[]} ids
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  async bulkDelete(ids, userId = 1) {
    // MODIFIED: Added userId parameter
    try {
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
          status: false,
          message: "Setting IDs array is required",
          data: null,
        };
      }

      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      const results = [];
      const deletedSettings = [];

      for (const id of ids) {
        try {
          // @ts-ignore
          const setting = await this.systemSettingRepository.findOne({
            where: { id, is_deleted: false },
          });

          if (setting) {
            // Record setting info for audit log
            deletedSettings.push({
              id: setting.id,
              key: setting.key,
              setting_type: setting.setting_type,
              value: setting.value,
            });

            setting.is_deleted = true;
            setting.updated_at = new Date();
            // @ts-ignore
            await this.systemSettingRepository.save(setting);
            results.push({ success: true, id });
          } else {
            results.push({ success: false, id, error: "Setting not found" });
          }
        } catch (error) {
          // @ts-ignore
          results.push({ success: false, id, error: error.message });
        }
      }

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      // I-clear ang cache
      this._clearCache();

      return {
        status: true,
        message: `Bulk delete completed: ${successful} successful, ${failed} failed`,
        data: results,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("bulkDelete error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to bulk delete settings: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang settings statistics
   */
  async getSettingsStats() {
    try {
      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const total = await this.systemSettingRepository.count({
        where: { is_deleted: false },
      });

      // @ts-ignore
      const byType = await this.systemSettingRepository
        .createQueryBuilder("setting")
        .select("setting.setting_type", "type")
        .addSelect("COUNT(*)", "count")
        .where("setting.is_deleted = :is_deleted", { is_deleted: false })
        .groupBy("setting.setting_type")
        .getRawMany();

      // @ts-ignore
      const publicCount = await this.systemSettingRepository.count({
        where: { is_public: true, is_deleted: false },
      });

      const stats = {
        total,
        by_type: byType.reduce((acc, item) => {
          acc[item.type] = parseInt(item.count);
          return acc;
        }, {}),
        public_count: publicCount,
        private_count: total - publicCount,
        timestamp: new Date().toISOString(),
      };

      return {
        status: true,
        message: "Settings statistics retrieved successfully",
        data: stats,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getSettingsStats error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve settings statistics: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang tax settings with proper boolean conversion
   */
  async getTaxSettings() {
    try {
      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const settings = await this.systemSettingRepository.find({
        where: { setting_type: "tax", is_deleted: false },
      });
      const groupedSettings =
        await this._groupSettingsWithBooleanConversion(settings);

      return {
        status: true,
        message: "Tax settings retrieved successfully",
        // @ts-ignore
        data: groupedSettings.tax || {},
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getTaxSettings error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve tax settings: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Kunin ang email settings with proper boolean conversion
   */
  async getEmailSettings() {
    try {
      if (!this.systemSettingRepository) {
        await this.initializeRepository();
      }

      // @ts-ignore
      const settings = await this.systemSettingRepository.find({
        where: { setting_type: "email", is_deleted: false },
      });
      const groupedSettings =
        await this._groupSettingsWithBooleanConversion(settings);

      return {
        status: true,
        message: "Email settings retrieved successfully",
        // @ts-ignore
        data: groupedSettings.email || {},
      };
    } catch (error) {
      // @ts-ignore
      logger.error("getEmailSettings error:", error);
      return {
        status: false,
        // @ts-ignore
        message: `Failed to retrieve email settings: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * PRIVATE METHODS
   * Group settings with proper boolean conversion
   * @param {any[]} settings
   */
  async _groupSettingsWithBooleanConversion(settings) {
    const grouped = {};

    if (settings && Array.isArray(settings)) {
      settings.forEach((setting) => {
        const type = setting.setting_type;
        const key = setting.key;
        const rawValue = setting.value;

        // @ts-ignore
        if (!grouped[type]) {
          // @ts-ignore
          grouped[type] = {};
        }

        let value = rawValue;

        // Only process if it's a string
        if (typeof rawValue === "string") {
          const trimmed = rawValue.trim().toLowerCase();

          // 1. Boolean strings
          if (trimmed === "true") {
            value = true;
          } else if (trimmed === "false") {
            value = false;
          }
          // 2. Looks like a JSON array or object
          else if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
            try {
              value = JSON.parse(rawValue);
            } catch {
              // keep as string if parsing fails
            }
          }
          // 3. For everything else, keep the original string
        }

        // @ts-ignore
        grouped[type][key] = value;
      });
    }

    return grouped;
  }

  /**
   * Serialize settings with proper boolean conversion
   * @param {import("typeorm").ObjectLiteral[]} settings
   */
  async _serializeSettingsWithBooleanConversion(settings) {
    if (!settings || !Array.isArray(settings)) return [];

    const serialized = [];
    for (const setting of settings) {
      const serializedSetting =
        await this._serializeSettingWithBooleanConversion(setting);
      if (serializedSetting) {
        serialized.push(serializedSetting);
      }
    }
    return serialized;
  }

  /**
   * Serialize single setting with proper boolean conversion
   * @param {import("typeorm").ObjectLiteral | import("typeorm").ObjectLiteral[]} setting
   */
  async _serializeSettingWithBooleanConversion(setting) {
    if (!setting) return null;

    // Convert value if it's a string representing a boolean
    // @ts-ignore
    let value = setting.value;
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (lower === "true") {
        value = true;
      } else if (lower === "false") {
        value = false;
      }
    }

    return {
      // @ts-ignore
      id: setting.id,
      // @ts-ignore
      key: setting.key,
      value: value, // now possibly boolean
      // @ts-ignore
      setting_type: setting.setting_type,
      // @ts-ignore
      description: setting.description || "",
      // @ts-ignore
      is_public: this.dbToBoolean(setting.is_public),
      // @ts-ignore
      is_deleted: this.dbToBoolean(setting.is_deleted),
      // @ts-ignore
      created_at: setting.created_at,
      // @ts-ignore
      updated_at: setting.updated_at,
    };
  }

  /**
   * I-update ang multiple system settings base sa grouped configuration data with boolean normalization
   * @param {ArrayLike<any> | { [s: string]: any; }} configData
   * @param {number} [userId=1] // ADDED: User ID for audit logging
   */
  async _updateGroupedSettingsWithBooleanNormalization(configData, userId = 1) {
    // MODIFIED: Added userId parameter
    const updatedSettings = [];
    const errors = [];

    for (const [category, settingsDict] of Object.entries(configData)) {
      for (const [key, value] of Object.entries(settingsDict)) {
        if (!key || value === undefined || value === null) {
          errors.push({ category, key, error: "Invalid key/value" });
          continue;
        }

        try {
          // Determine the value to save based on type
          let valueToSave = value;

          // If it's a boolean, convert to string "true"/"false" for storage
          if (typeof value === "boolean") {
            valueToSave = value ? "true" : "false";
          }

          const options = {
            setting_type: category,
            description: `Auto-generated ${category} setting for ${key}`,
            is_public: false,
          };

          // Get existing setting to check if it's being updated
          // @ts-ignore
          const existing = await this.systemSettingRepository.findOne({
            where: { key, setting_type: category, is_deleted: false },
          });

          const oldValue = existing ? existing.value : null;

          // MODIFIED: Pass userId to setValueByKey
          const result = await this.setValueByKey(
            key,
            valueToSave,
            options,
            userId,
          );

          if (result.status && result.data) {
            updatedSettings.push({
              id: result.data.id,
              setting_type: category,
              key,
              oldValue,
              newValue: result.data.value,
              created: !existing,
            });
          } else {
            // ❗ Capture the failure
            errors.push({
              category,
              key,
              error: result.message || "Unknown error",
            });
          }

          // @ts-ignore
          logger.info("Setting updated", {
            category,
            key,
            oldValue,
            newValue: valueToSave,
            created: !existing,
          });
        } catch (error) {
          // @ts-ignore
          logger.error(`Failed to update setting ${category}.${key}`, error);
          // @ts-ignore
          errors.push({ category, key, error: error.message });
        }
      }
    }

    return {
      updatedSettings,
      errors,
      summary: {
        totalUpdated: updatedSettings.length,
        categories: [...new Set(updatedSettings.map((s) => s.setting_type))],
      },
    };
  }

  /**
   * Kunin ang system information
   */
  async _getSystemInfo() {
    return {
      version: "0.0.0",
      name: "Electron Tillify System",
      environment: "production",
      debug_mode: process.env.NODE_ENV === "development",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      current_time: new Date().toISOString(),
      setting_types: Object.values(SettingType),
    };
  }

  /**
   * Cache management methods
   */
  _isCacheValid() {
    if (!this._settingsCache || !this._lastCacheUpdate) {
      return false;
    }
    return Date.now() - this._lastCacheUpdate < this._CACHE_DURATION;
  }

  /**
   * @param {{ settings: { id: any; key: any; value: any; setting_type: any; description: any; is_public: boolean; is_deleted: boolean; created_at: any; updated_at: any; }[]; grouped_settings: {}; system_info: { version: string; name: string; environment: string; debug_mode: boolean; timezone: string; current_time: string; setting_types: any[]; }; }} data
   */
  _updateCache(data) {
    this._settingsCache = data;
    this._lastCacheUpdate = Date.now();
  }

  _clearCache() {
    this._settingsCache = null;
    this._lastCacheUpdate = null;
  }

  // Add this helper method inside SystemConfigHandler class
  /**
   * @param {null | undefined} value
   */
  _prepareValueForStorage(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }
}

// I-register ang IPC handler
const systemConfigHandler = new SystemConfigHandler();

// I-check kung available ang ipcMain bago i-register ang handler
if (ipcMain) {
  ipcMain.handle("systemConfig", async (event, payload) => {
    return await systemConfigHandler.handleRequest(event, payload);
  });
} else {
  logger.warn("ipcMain is not available - running in non-Electron environment");
}

module.exports = { SystemConfigHandler, systemConfigHandler };
