// index.js placeholder
// src/main/index.js
// @ts-check
/**
 * @file Main entry point for retail Tillify System
 * @version 0.0.0
 * @author CyberArcenal
 * @description Electron main process with TypeORM, SQLite, and React integration
 */

// ===================== CORE IMPORTS =====================
const {
  app,
  ipcMain,
  screen,
  dialog,
  shell,
  // @ts-ignore
  BrowserWindow,
} = require("electron");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const url = require("url");

// TypeORM and Database
require("reflect-metadata");
const MigrationManager = require("../utils/dbUtils/migrationManager");
const PrinterService = require("../services/PrinterService");
const CashDrawerService = require("../services/CashDrawerService");

// ===================== TYPE DEFINITIONS =====================
/**
 * @typedef {import('electron').BrowserWindow} BrowserWindow
 * @typedef {import('typeorm').DataSource} DataSource
 */

/**
 * @typedef {Object} AppConfig
 * @property {boolean} isDev - Development mode flag
 * @property {string} appName - Application name
 * @property {string} version - App version
 * @property {string} userDataPath - Path to user data directory
 */

/**
 * @typedef {Object} MigrationResult
 * @property {boolean} success - Migration success status
 * @property {string} message - Result message
 * @property {Error} [error] - Error object if any
 */

/**
 * @typedef {Object} WindowConfig
 * @property {number} width - Window width
 * @property {number} height - Window height
 * @property {number} [x] - Window x position
 * @property {number} [y] - Window y position
 * @property {boolean} [center] - Center window flag
 */

// ===================== GLOBAL STATE =====================
/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {BrowserWindow | null} */
let splashWindow = null;

/** @type {boolean} */
let isDatabaseInitialized = false;

/** @type {boolean} */
let isShuttingDown = false;

/** @type {MigrationManager | null} */
let migrationManager = null;

/** @type {AppConfig} */
const APP_CONFIG = {
  isDev: process.env.NODE_ENV === "development" || !app.isPackaged,
  appName: "Tillify",
  version: app.getVersion(),
  userDataPath: app.getPath("userData"),
};

// ===================== LOGGING SERVICE =====================
/**
 * Log levels for consistent logging
 * @enum {string}
 */
const LogLevel = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  SUCCESS: "SUCCESS",
};

/**
 * Enhanced logging utility with file writing capability
 * @param {LogLevel} level - Log level
 * @param {string} message - Log message
 * @param {any} [data] - Optional data to log
 * @param {boolean} [writeToFile=false] - Write to log file
 */
async function log(level, message, data = null, writeToFile = false) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${APP_CONFIG.appName} ${level}]`;
  const logMessage = `${prefix} ${message}`;

  // Console output with colors for dev mode
  if (APP_CONFIG.isDev) {
    const colors = {
      [LogLevel.DEBUG]: "\x1b[36m", // Cyan
      [LogLevel.INFO]: "\x1b[34m", // Blue
      [LogLevel.WARN]: "\x1b[33m", // Yellow
      [LogLevel.ERROR]: "\x1b[31m", // Red
      [LogLevel.SUCCESS]: "\x1b[32m", // Green
    };
    console.log(`${colors[level] || ""}${logMessage}\x1b[0m`);
  } else {
    console.log(logMessage);
  }

  if (data) {
    console.dir(data, { depth: 3, colors: APP_CONFIG.isDev });
  }

  // Write to log file if enabled
  if (writeToFile && !APP_CONFIG.isDev) {
    try {
      const logDir = path.join(APP_CONFIG.userDataPath, "logs");
      await fs.mkdir(logDir, { recursive: true });

      const logFile = path.join(
        logDir,
        `POS-${new Date().toISOString().split("T")[0]}.log`,
      );
      const logEntry = `${logMessage}${data ? "\n" + JSON.stringify(data, null, 2) : ""}\n`;

      await fs.appendFile(logFile, logEntry);
    } catch (error) {
      console.error("Failed to write log to file:", error);
    }
  }
}

// ===================== ERROR HANDLING =====================
/**
 * Custom error classes for better error tracking
 */
// @ts-ignore
class DatabaseError extends Error {
  /**
   * @param {string} message
   * @param {Error} [originalError]
   */
  constructor(message, originalError) {
    super(message);
    this.name = "DatabaseError";
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

class WindowError extends Error {
  /**
   * @param {string} message
   * @param {string} windowType
   */
  constructor(message, windowType) {
    super(message);
    this.name = "WindowError";
    this.windowType = windowType;
    this.timestamp = new Date().toISOString();
  }
}

class MigrationError extends Error {
  /**
   * @param {string} message
   */
  // @ts-ignore
  constructor(message, pendingMigrations = []) {
    super(message);
    this.name = "MigrationError";
    this.pendingMigrations = pendingMigrations;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Global error handler for uncaught exceptions
 */
function setupGlobalErrorHandlers() {
  process.on("uncaughtException", (error) => {
    log(
      LogLevel.ERROR,
      "Uncaught Exception:",
      {
        name: error.name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      true,
    );

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app:error", {
        type: "uncaughtException",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    log(
      LogLevel.ERROR,
      "Unhandled Promise Rejection:",
      {
        reason: reason instanceof Error ? reason.message : reason,
        promise: promise.toString(),
        timestamp: new Date().toISOString(),
      },
      true,
    );
  });

  // @ts-ignore
  app.on("renderer-process-crashed", (event, webContents, killed) => {
    log(
      LogLevel.ERROR,
      "Renderer process crashed:",
      {
        killed,
        webContentsId: webContents.id,
        timestamp: new Date().toISOString(),
      },
      true,
    );
  });
}

// ===================== DATABASE SERVICE =====================

async function initializeDatabase() {
  const { AppDataSource } = require("./db/datasource.js");
  try {
    log(LogLevel.INFO, "Initializing database...");

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      log(LogLevel.SUCCESS, "Database connected");
    }

    migrationManager = new MigrationManager(AppDataSource);

    const status = await migrationManager.getMigrationStatus();

    if (status.needsMigration) {
      log(
        LogLevel.INFO,
        `Found ${status.pending} pending migration(s). Running now...`,
      );

      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send("migration:status", {
          status: "running",
          message: "Updating database structure...",
        });
      }

      const result = await migrationManager.runMigrations();

      if (result.success) {
        log(LogLevel.SUCCESS, result.message);
        if (splashWindow) {
          splashWindow.webContents.send("migration:status", {
            status: "completed",
            message: result.message,
          });
        }
      } else {
        log(LogLevel.ERROR, "Migration failed:", result.error);
        dialog.showMessageBoxSync({
          type: "warning",
          title: "Migration Warning",
          message: "Database update had an issue",
          detail: result.message + "\n\nContinuing with current schema.",
          buttons: ["OK"],
        });
      }
    } else {
      log(LogLevel.INFO, "Database is up to date ✅");
    }

    isDatabaseInitialized = true;
    return { success: true };
  } catch (error) {
    log(LogLevel.ERROR, "Database init failed:", error);

    // Last resort fallback
    try {
      await AppDataSource.synchronize(false);
      log(LogLevel.WARN, "Used fallback synchronize");
      isDatabaseInitialized = true;
      return { success: true, fallback: true };
    } catch (e) {
      // @ts-ignore
      return { success: false, error: e.message };
    }
  }
}

/**
 * Safely close database connection
 */
async function safeCloseDatabase() {
  const { AppDataSource } = require("./db/datasource.js");
  if (isShuttingDown) return;

  isShuttingDown = true;

  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      log(LogLevel.INFO, "Database connection closed gracefully");
      isDatabaseInitialized = false;
    }
  } catch (error) {
    log(LogLevel.ERROR, "Error closing database connection:", error);
  }
}

// ===================== WINDOW MANAGEMENT =====================
/**
 * Get icon path based on platform and environment
 * @returns {string}
 */
function getIconPath() {
  const platform = process.platform;
  const iconDir = APP_CONFIG.isDev
    ? path.resolve(__dirname, "..", "..", "build")
    : path.join(process.resourcesPath, "build");

  const iconMap = {
    win32: "icon.ico",
    darwin: "icon.icns",
    linux: "icon.png",
  };

  // @ts-ignore
  const iconFile = iconMap[platform] || "icon.png";
  const iconPath = path.join(iconDir, iconFile);

  // @ts-ignore
  return fsSync.existsSync(iconPath) ? iconPath : null;
}

/**
 * Create splash window
 * @returns {Promise<BrowserWindow>}
 */
async function createSplashWindow() {
  try {
    log(LogLevel.INFO, "Creating splash window...");

    const splashConfig = {
      width: 500,
      height: 400,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      center: true,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    };

    splashWindow = new BrowserWindow(splashConfig);

    // Load splash HTML
    const splashPath = path.join(__dirname, "splash.html");
    if (!fsSync.existsSync(splashPath)) {
      throw new WindowError("Splash HTML file not found", "splash");
    }

    await splashWindow.loadFile(splashPath);
    splashWindow.show();

    log(LogLevel.SUCCESS, "Splash window created");
    return splashWindow;
  } catch (error) {
    throw new WindowError(
      // @ts-ignore
      `Failed to create splash window: ${error.message}`,
      "splash",
    );
  }
}

/**
 * Get application URL for main window
 * @returns {Promise<string>}
 */
async function getAppUrl() {
  if (APP_CONFIG.isDev) {
    const devServerUrl = "http://localhost:5173";
    log(LogLevel.INFO, `Development mode - URL: ${devServerUrl}`);
    return devServerUrl;
  }

  // Production paths to check
  const possiblePaths = [
    path.join(__dirname, "..", "..", "dist", "renderer", "index.html"),
    path.join(process.resourcesPath, "app.asar.unpacked", "dist", "index.html"),
    path.join(process.resourcesPath, "dist", "index.html"),
    path.join(app.getAppPath(), "dist", "index.html"),
  ];

  for (const filePath of possiblePaths) {
    try {
      await fs.access(filePath);
      const fileUrl = url.pathToFileURL(filePath).href;
      log(LogLevel.INFO, `Found production build at: ${filePath}`);
      return fileUrl;
    } catch {
      continue;
    }
  }

  throw new Error(
    `Production build not found. Checked paths:\n${possiblePaths.join("\n")}`,
  );
}

/**
 * Create main application window
 * @returns {Promise<BrowserWindow>}
 */
async function createMainWindow() {
  try {
    log(LogLevel.INFO, "Creating main window...");

    // Calculate window position
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize;
    const windowWidth = Math.min(1366, screenWidth - 100);
    const windowHeight = Math.min(768, screenHeight - 100);
    const x = Math.floor((screenWidth - windowWidth) / 2);
    const y = Math.floor((screenHeight - windowHeight) / 2);

    const windowConfig = {
      width: windowWidth,
      height: windowHeight,
      x,
      y,
      minWidth: 1024,
      minHeight: 768,
      show: false,
      frame: true,
      titleBarStyle: "default",
      backgroundColor: "#ffffff",
      icon: getIconPath(),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: !APP_CONFIG.isDev,
        sandbox: true,
        enableRemoteModule: false,
      },
    };

    // @ts-ignore
    mainWindow = new BrowserWindow(windowConfig);
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setTitle(`${APP_CONFIG.appName} v${APP_CONFIG.version}`);

    // Window event handlers
    mainWindow.on("ready-to-show", () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        setTimeout(() => {
          // @ts-ignore
          splashWindow.close();
          splashWindow = null;
        }, 300);
      }

      // @ts-ignore
      mainWindow.show();
      // @ts-ignore
      mainWindow.focus();
      log(LogLevel.SUCCESS, "Main window ready");

      // Notify renderer that app is ready
      // @ts-ignore
      mainWindow.webContents.send("app:ready", {
        version: APP_CONFIG.version,
        isDev: APP_CONFIG.isDev,
        databaseReady: isDatabaseInitialized,
      });
    });

    // Handle window close with confirmation
    mainWindow.on("close", (event) => {
      log(LogLevel.INFO, "❌ Main window close event triggered", {
        isShuttingDown,
        // @ts-ignore
        fromIPC: event.sender === mainWindow.webContents ? "renderer" : "other",
      });
      if (!APP_CONFIG.isDev && !isShuttingDown) {
        event.preventDefault();

        // @ts-ignore
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          buttons: ["Yes", "No"],
          title: "Confirm",
          message: "Are you sure you want to quit?",
          detail: "Any unsaved changes will be lost.",
        });

        if (choice === 0) {
          isShuttingDown = true;
          // @ts-ignore
          mainWindow.destroy();
        }
      }
    });

    // Load application URL
    const appUrl = await getAppUrl();
    log(LogLevel.INFO, `Loading URL: ${appUrl}`);

    try {
      if (!APP_CONFIG.isDev) {
        await mainWindow.loadURL(appUrl);
      } else {
        await mainWindow.loadURL(appUrl);
        mainWindow.webContents.openDevTools({ mode: "detach" });
      }
      log("SUCCESS", "Main window loaded successfully");
    } catch (error) {
      const errorMessage = APP_CONFIG.isDev
        ? "Dev server not running. Run 'npm run dev' first."
        : "Production build not found or corrupted.";
      throw new Error(errorMessage);
    }

    try {
      const updaterModule = require("./ipc/utils/updater/index.ipc.js");
      updaterModule.setMainWindow(mainWindow);
      log(LogLevel.INFO, "Updater handler attached to main window");
    } catch (e) {
      log(LogLevel.WARN, "Failed to set updater main window", e);
    }

    return mainWindow;
  } catch (error) {
    throw new WindowError(
      // @ts-ignore
      `Failed to create main window: ${error.message}`,
      "main",
    );
  }
}

/**
 * Show error page in window
 * @param {BrowserWindow} window
 * @param {string} title
 * @param {string} message
 * @param {string} [details]
 */
function showErrorPage(window, title, message, details = "") {
  const errorHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} - ${APP_CONFIG.appName}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%);
                    color: #f5f5f5;
                    height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    text-align: center;
                    padding: 40px;
                    margin: 0;
                }
                .error-container {
                    max-width: 600px;
                    background: rgba(212, 175, 55, 0.1); /* subtle gold tint */
                    padding: 40px;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(212, 175, 55, 0.2);
                }
                h1 {
                    margin-bottom: 20px;
                    font-size: 28px;
                    color: #d4af37; /* gold */
                }
                .message {
                    font-size: 16px;
                    line-height: 1.6;
                    margin-bottom: 30px;
                }
                .details {
                    background: rgba(0, 0, 0, 0.4);
                    padding: 15px;
                    border-radius: 10px;
                    font-family: monospace;
                    font-size: 12px;
                    text-align: left;
                    overflow: auto;
                    max-height: 200px;
                    margin: 20px 0;
                    color: #f5f5f5;
                }
                .button-group {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    margin-top: 30px;
                }
                button {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 25px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    min-width: 120px;
                }
                .retry-btn {
                    background: #d4af37; /* gold */
                    color: #000000;
                }
                .retry-btn:hover {
                    background: #b8860b;
                    transform: translateY(-2px);
                }
                .close-btn {
                    background: #ff4c4c;
                    color: #ffffff;
                }
                .close-btn:hover {
                    background: #dc2626;
                    transform: translateY(-2px);
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: #d4af37; /* gold */
                }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="logo">${APP_CONFIG.appName}</div>
                <h1>⚠️ ${title}</h1>
                <div class="message">${message}</div>
                ${details ? `<div class="details">${details}</div>` : ""}
                <div class="button-group">
                    <button class="retry-btn" onclick="window.location.reload()">Retry</button>
                    <button class="close-btn" onclick="window.close()">Close</button>
                </div>
                <div style="margin-top: 20px; font-size: 12px; opacity: 0.8;">
                    v${APP_CONFIG.version} • ${APP_CONFIG.isDev ? "Development" : "Production"}
                </div>
            </div>
        </body>
        </html>
    `;

  window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`,
  );
}

// ===================== IPC HANDLERS =====================
/**
 * Register all IPC handlers
 */
function registerIpcHandlers() {
  log(LogLevel.INFO, "Registering IPC handlers...");
  let printerService = new PrinterService();
  let cashDrawerService = new CashDrawerService();

  // Window Control Handlers
  ipcMain.on("window:minimize", () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on("window:maximize", () => {
    if (mainWindow) {
      mainWindow.isMaximized()
        ? mainWindow.unmaximize()
        : mainWindow.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    log(LogLevel.WARN, "📨 IPC window:close received from renderer");
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on("window:reload", () => {
    if (mainWindow) mainWindow.reload();
  });

  ipcMain.on("window:toggle-devtools", () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Application Handlers
  ipcMain.handle("app:get-info", () => ({
    name: APP_CONFIG.appName,
    version: APP_CONFIG.version,
    isDev: APP_CONFIG.isDev,
    platform: process.platform,
    arch: process.arch,
    userDataPath: APP_CONFIG.userDataPath,
    databaseReady: isDatabaseInitialized,
  }));

  // @ts-ignore
  ipcMain.on("app:open-external", (event, url) => {
    if (typeof url === "string" && url.startsWith("http")) {
      shell.openExternal(url).catch(console.error);
    }
  });

  // Database Handlers
  ipcMain.handle("database:get-status", async () => {
    const { AppDataSource } = require("./db/datasource.js");
    try {
      const isInitialized = AppDataSource.isInitialized;
      let migrationStatus = null;

      if (migrationManager) {
        migrationStatus = await migrationManager.getMigrationStatus();
      }

      return {
        initialized: isInitialized,
        migrationManager: !!migrationManager,
        migrationStatus,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      log(LogLevel.ERROR, "Failed to get database status:", error);
      // @ts-ignore
      return { error: error.message };
    }
  });

  ipcMain.handle("database:backup", async () => {
    try {
      if (!migrationManager) {
        throw new Error("Migration manager not initialized");
      }

      // @ts-ignore
      const backupPath = await migrationManager.createBackup();
      return { success: true, backupPath };
    } catch (error) {
      log(LogLevel.ERROR, "Database backup failed:", error);
      // @ts-ignore
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("printer:get-status", () => printerService.getStatus());
  ipcMain.handle("printer:is-available", () => printerService.isAvailable());
  ipcMain.handle("cashDrawer:get-status", () => cashDrawerService.getStatus());
  ipcMain.handle("cashDrawer:is-available", () =>
    cashDrawerService.isAvailable(),
  );

  ipcMain.handle("printer:reload", () => {
    printerService = new PrinterService();
    return printerService.getStatus();
  });
  ipcMain.handle("cashDrawer:reload", () => {
    cashDrawerService = new CashDrawerService();
    return cashDrawerService.getStatus();
  });

  ipcMain.handle("printer:print", async (event, sale) => {
    return await printerService.printReceipt(sale);
  });
  ipcMain.handle("cashDrawer:open", async (event, reason) => {
    return await cashDrawerService.openDrawer(reason);
  });

  ipcMain.handle("printer:test-print", async () => {
    try {
      const testSale = {
        id: "TEST",
        saleItems: [
          { product: { name: "Test Item" }, quantity: 1, lineTotal: 0 },
        ],
        totalAmount: 0,
        paymentMethod: "N/A",
      };
      // @ts-ignore
      return await printerService.printReceipt(testSale);
    } catch (err) {
      // @ts-ignore
      console.error("[IPC] Test print failed:", err.message);
      return false;
    }
  });

  // Import modular IPC handlers
  try {
    const ipcModules = [
      "./ipc/audit/index.ipc.js",
      "./ipc/customer/index.ipc.js",
      "./ipc/notification_log/index.ipc.js",
      "./ipc/inventory/index.ipc.js",
      "./ipc/loyalty/index.ipc.js",
      "./ipc/product/index.ipc.js",
      "./ipc/sale/index.ipc.js",
      "./ipc/dashboard/index.ipc.js",
      "./ipc/activation.ipc.js",
      "./ipc/system_config.ipc.js",
      "./ipc/windows_control.ipc.js",
      "./ipc/category/index.ipc.js",
      "./ipc/purchase/index.ipc.js",
      "./ipc/returnrefund/index.ipc.js",
      "./ipc/supplier/index.ipc.js",

      "./ipc/analytics/customerInsights/index.ipc.js",
      "./ipc/analytics/dailySales/index.ipc.js",
      "./ipc/analytics/financialReports/index.ipc.js",
      "./ipc/analytics/inventoryReports/index.ipc.js",
      "./ipc/analytics/returnRefund/index.ipc.js",
      "./ipc/analytics/sales/index.ipc.js",
      "./ipc/barcode/index.ipc.js",
      "./ipc/notification/index.ipc.js",
      "./ipc/utils/updater/index.ipc.js",
    ];

    ipcModules.forEach((modulePath) => {
      try {
        const fullPath = path.join(__dirname, modulePath);
        if (fsSync.existsSync(fullPath)) {
          require(fullPath);
          log(LogLevel.DEBUG, `Loaded IPC module: ${modulePath}`);
        } else {
          log(LogLevel.WARN, `IPC module not found: ${modulePath}`);
        }
      } catch (error) {
        log(LogLevel.ERROR, `Failed to load IPC module ${modulePath}:`, error);
      }
    });

    log(LogLevel.SUCCESS, "All IPC handlers registered");
  } catch (error) {
    log(LogLevel.ERROR, "Failed to register IPC handlers:", error);
  }
}

// ===================== MAIN APPLICATION FLOW =====================
/**
 * Main startup sequence
 */
async function startupSequence() {
  try {
    log(
      LogLevel.INFO,
      `🚀 Starting ${APP_CONFIG.appName} v${APP_CONFIG.version}...`,
    );
    log(
      LogLevel.INFO,
      `Environment: ${APP_CONFIG.isDev ? "Development" : "Production"}`,
    );
    log(LogLevel.INFO, `User Data Path: ${APP_CONFIG.userDataPath}`);

    // 1. Setup global error handlers
    setupGlobalErrorHandlers();

    // 2. Create splash window
    await createSplashWindow();

    // 3. Initialize database
    log(LogLevel.INFO, "Initializing database...");
    const dbResult = await initializeDatabase();

    // @ts-ignore
    if (!dbResult.success) {
      // @ts-ignore
      log(LogLevel.ERROR, "Database initialization failed:", dbResult.message);

      const userChoice = dialog.showMessageBoxSync({
        type: "warning",
        title: "Database Warning",
        message: "Database initialization failed",
        // @ts-ignore
        detail: `${dbResult.message}\n\nApplication may have limited functionality.`,
        buttons: ["Continue Anyway", "Quit Application"],
        defaultId: 0,
        cancelId: 1,
      });

      if (userChoice === 1) {
        log(LogLevel.INFO, "User chose to quit due to database error");
        app.quit();
        return;
      }
    }

    // 4. Register IPC handlers
    registerIpcHandlers();

    // 5. Create main window
    log(LogLevel.INFO, "Creating main application window...");
    await createMainWindow();

    log(LogLevel.SUCCESS, `✅ ${APP_CONFIG.appName} started successfully!`);
  } catch (error) {
    log(LogLevel.ERROR, "Startup sequence failed:", error);

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }

    // Create error window
    const errorWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      frame: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
      },
    });

    showErrorPage(
      errorWindow,
      "Startup Failed",
      "The application failed to start properly.",
      // @ts-ignore
      error.message,
    );

    errorWindow.show();
  }
}

// ===================== APPLICATION EVENT HANDLERS =====================
app.on("ready", startupSequence);

app.on("window-all-closed", async () => {
  log(LogLevel.INFO, "All windows closed");
  await safeCloseDatabase();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  log(LogLevel.INFO, "Application activated");

  if (BrowserWindow.getAllWindows().length === 0) {
    await startupSequence();
  }
});

app.on("before-quit", async (event) => {
  log(LogLevel.INFO, "Application quitting...");

  if (!isShuttingDown) {
    event.preventDefault();
    await safeCloseDatabase();
    app.quit();
  }
});

app.on("will-quit", () => {
  log(LogLevel.INFO, "Application will quit");
});

app.on("quit", () => {
  log(LogLevel.INFO, "Application quit");
  process.exit(0);
});

// ===================== EXPORT FOR TESTING =====================
// Only export in development for testing purposes
if (APP_CONFIG.isDev) {
  module.exports = {
    APP_CONFIG,
    getIconPath,
    initializeDatabase,
    createMainWindow,
    safeCloseDatabase,
    log,
  };
}
