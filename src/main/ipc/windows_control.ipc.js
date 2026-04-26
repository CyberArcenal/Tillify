// src/main/ipcHandlers/windowControlHandlers.js

const { ipcMain, BrowserWindow } = require("electron");

class WindowControlHandlers {
  constructor() {
    console.log("✅ Window Control IPC Handlers Initialized");
  }

  /**
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {{ method: string, params?: Record<string, any> }} payload
   */
  // @ts-ignore
  async handleRequest(event, { method, params = {} }) {
    try {
      console.log(`[WindowControlIPC] ${method}`, params);

      const window =
        BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

      if (!window) {
        return {
          status: false,
          message: "No window found",
        };
      }

      switch (method) {
        // 🪟 WINDOW STATE CONTROL
        case "minimize":
          return await this.minimize(window);
        case "maximize":
          return await this.maximize(window);
        case "restore":
          return await this.restore(window);
        case "close":
          return await this.close(window);
        case "toggleMaximize":
          return await this.toggleMaximize(window);

        // 📍 WINDOW POSITION & SIZE
        case "setPosition":
          // @ts-ignore
          return await this.setPosition(window, params.x, params.y);
        case "setSize":
          // @ts-ignore
          return await this.setSize(window, params.width, params.height);
        case "getBounds":
          return await this.getBounds(window);
        case "center":
          return await this.center(window);

        // 👁️ VISIBILITY
        case "show":
          return await this.show(window);
        case "hide":
          return await this.hide(window);
        case "toggleVisibility":
          return await this.toggleVisibility(window);

        // 🎯 FOCUS
        case "focus":
          return await this.focus(window);
        case "blur":
          return await this.blur(window);
        case "isFocused":
          return await this.isFocused(window);

        // 🚫 ALWAYS ON TOP
        case "setAlwaysOnTop":
          // @ts-ignore
          return await this.setAlwaysOnTop(window, params.flag, params.level);
        case "getAlwaysOnTop":
          return await this.getAlwaysOnTop(window);

        // 📊 WINDOW STATE INFO
        case "isMaximized":
          return await this.isMaximized(window);
        case "isMinimized":
          return await this.isMinimized(window);
        case "isNormal":
          return await this.isNormal(window);

        // 🔧 ADVANCED CONTROLS
        case "setResizable":
          // @ts-ignore
          return await this.setResizable(window, params.resizable);
        case "setMovable":
          // @ts-ignore
          return await this.setMovable(window, params.movable);
        case "setMinimizable":
          // @ts-ignore
          return await this.setMinimizable(window, params.minimizable);
        case "setClosable":
          // @ts-ignore
          return await this.setClosable(window, params.closable);
        case "setFullScreenable":
          // @ts-ignore
          return await this.setFullScreenable(window, params.fullScreenable);
        case "setFullScreen":
          // @ts-ignore
          return await this.setFullScreen(window, params.fullscreen);

        // 🖥️ MULTI-MONITOR SUPPORT
        case "getDisplayInfo":
          return await this.getDisplayInfo(window);
        case "moveToDisplay":
          // @ts-ignore
          return await this.moveToDisplay(window, params.displayId);

        // 💾 WINDOW STATE PERSISTENCE
        case "saveWindowState":
          return await this.saveWindowState(window);
        case "loadWindowState":
          return await this.loadWindowState(window);

        default:
          return {
            status: false,
            message: `Unknown method: ${method}`,
          };
      }
    } catch (error) {
      console.error("WindowControlHandler error:", error);
      return {
        status: false,
        // @ts-ignore
        message: error.message || "Internal error",
      };
    }
  }

  // ============================================
  // 🪟 WINDOW STATE CONTROL METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   */
  async minimize(window) {
    try {
      window.minimize();
      return {
        status: true,
        message: "Window minimized",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to minimize: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async maximize(window) {
    try {
      window.maximize();
      return {
        status: true,
        message: "Window maximized",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to maximize: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async restore(window) {
    try {
      window.restore();
      return {
        status: true,
        message: "Window restored",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to restore: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async close(window) {
    try {
      window.close();
      return {
        status: true,
        message: "Window closed",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to close: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async toggleMaximize(window) {
    try {
      if (window.isMaximized()) {
        window.restore();
        return {
          status: true,
          message: "Window restored",
          data: { isMaximized: false },
        };
      } else {
        window.maximize();
        return {
          status: true,
          message: "Window maximized",
          data: { isMaximized: true },
        };
      }
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to toggle maximize: ${error.message}`,
      };
    }
  }

  // ============================================
  // 📍 WINDOW POSITION & SIZE METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} x
   * @param {any} y
   */
  async setPosition(window, x, y) {
    try {
      window.setPosition(x, y);
      return {
        status: true,
        message: `Window position set to (${x}, ${y})`,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set position: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} width
   * @param {any} height
   */
  async setSize(window, width, height) {
    try {
      window.setSize(width, height);
      return {
        status: true,
        message: `Window size set to ${width}x${height}`,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set size: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async getBounds(window) {
    try {
      const bounds = window.getBounds();
      return {
        status: true,
        data: bounds,
        message: "Window bounds retrieved",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to get bounds: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async center(window) {
    try {
      window.center();
      return {
        status: true,
        message: "Window centered",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to center: ${error.message}`,
      };
    }
  }

  // ============================================
  // 👁️ VISIBILITY METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   */
  async show(window) {
    try {
      window.show();
      return {
        status: true,
        message: "Window shown",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to show: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async hide(window) {
    try {
      window.hide();
      return {
        status: true,
        message: "Window hidden",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to hide: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async toggleVisibility(window) {
    try {
      if (window.isVisible()) {
        window.hide();
        return {
          status: true,
          message: "Window hidden",
          data: { isVisible: false },
        };
      } else {
        window.show();
        return {
          status: true,
          message: "Window shown",
          data: { isVisible: true },
        };
      }
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to toggle visibility: ${error.message}`,
      };
    }
  }

  // ============================================
  // 🎯 FOCUS METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   */
  async focus(window) {
    try {
      window.focus();
      return {
        status: true,
        message: "Window focused",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to focus: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async blur(window) {
    try {
      window.blur();
      return {
        status: true,
        message: "Window blurred",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to blur: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async isFocused(window) {
    try {
      const isFocused = window.isFocused();
      return {
        status: true,
        data: { isFocused },
        message: isFocused ? "Window is focused" : "Window is not focused",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to check focus: ${error.message}`,
      };
    }
  }

  // ============================================
  // 🚫 ALWAYS ON TOP METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} flag
   */
  async setAlwaysOnTop(window, flag, level = "normal") {
    try {
      // @ts-ignore
      window.setAlwaysOnTop(flag, level);
      return {
        status: true,
        message: flag
          ? "Window set to always on top"
          : "Window normal z-order restored",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set always on top: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async getAlwaysOnTop(window) {
    try {
      const isAlwaysOnTop = window.isAlwaysOnTop();
      return {
        status: true,
        data: { isAlwaysOnTop },
        message: isAlwaysOnTop
          ? "Window is always on top"
          : "Window is not always on top",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to get always on top status: ${error.message}`,
      };
    }
  }

  // ============================================
  // 📊 WINDOW STATE INFO METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   */
  async isMaximized(window) {
    try {
      const isMaximized = window.isMaximized();
      return {
        status: true,
        data: { isMaximized },
        message: isMaximized
          ? "Window is maximized"
          : "Window is not maximized",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to check if maximized: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async isMinimized(window) {
    try {
      const isMinimized = window.isMinimized();
      return {
        status: true,
        data: { isMinimized },
        message: isMinimized
          ? "Window is minimized"
          : "Window is not minimized",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to check if minimized: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async isNormal(window) {
    try {
      const isNormal =
        !window.isMaximized() && !window.isMinimized() && window.isVisible();
      return {
        status: true,
        data: { isNormal },
        message: isNormal
          ? "Window is in normal state"
          : "Window is not in normal state",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to check if normal: ${error.message}`,
      };
    }
  }

  // ============================================
  // 🔧 ADVANCED CONTROL METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} resizable
   */
  async setResizable(window, resizable) {
    try {
      window.setResizable(resizable);
      return {
        status: true,
        message: resizable
          ? "Window is now resizable"
          : "Window is now non-resizable",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set resizable: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} movable
   */
  async setMovable(window, movable) {
    try {
      window.setMovable(movable);
      return {
        status: true,
        message: movable
          ? "Window is now movable"
          : "Window is now non-movable",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set movable: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} minimizable
   */
  async setMinimizable(window, minimizable) {
    try {
      window.setMinimizable(minimizable);
      return {
        status: true,
        message: minimizable
          ? "Window is now minimizable"
          : "Window is now non-minimizable",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set minimizable: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} closable
   */
  async setClosable(window, closable) {
    try {
      window.setClosable(closable);
      return {
        status: true,
        message: closable
          ? "Window is now closable"
          : "Window is now non-closable",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set closable: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} fullScreenable
   */
  async setFullScreenable(window, fullScreenable) {
    try {
      window.setFullScreenable(fullScreenable);
      return {
        status: true,
        message: fullScreenable
          ? "Window can now go fullscreen"
          : "Window cannot go fullscreen",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set fullScreenable: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   * @param {any} fullscreen
   */
  async setFullScreen(window, fullscreen) {
    try {
      window.setFullScreen(fullscreen);
      return {
        status: true,
        message: fullscreen
          ? "Window set to fullscreen"
          : "Window exited fullscreen",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to set fullscreen: ${error.message}`,
      };
    }
  }

  // ============================================
  // 🖥️ MULTI-MONITOR SUPPORT METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   */
  async getDisplayInfo(window) {
    try {
      // @ts-ignore
      const display = window.getDisplayNearestPoint(window.getBounds());
      return {
        status: true,
        data: {
          id: display.id,
          bounds: display.bounds,
          workArea: display.workArea,
          scaleFactor: display.scaleFactor,
          size: display.size,
        },
        message: "Display information retrieved",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to get display info: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   * @param {number} displayId
   */
  async moveToDisplay(window, displayId) {
    try {
      const displays = require("electron").screen.getAllDisplays();
      const targetDisplay = displays.find((d) => d.id === displayId);

      if (!targetDisplay) {
        return {
          status: false,
          message: `Display with ID ${displayId} not found`,
        };
      }

      const bounds = window.getBounds();
      const newX =
        targetDisplay.bounds.x +
        (targetDisplay.bounds.width - bounds.width) / 2;
      const newY =
        targetDisplay.bounds.y +
        (targetDisplay.bounds.height - bounds.height) / 2;

      window.setPosition(newX, newY);

      return {
        status: true,
        message: `Window moved to display ${displayId}`,
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to move to display: ${error.message}`,
      };
    }
  }

  // ============================================
  // 💾 WINDOW STATE PERSISTENCE METHODS
  // ============================================

  /**
   * @param {Electron.BrowserWindow} window
   */
  async saveWindowState(window) {
    try {
      const state = {
        bounds: window.getBounds(),
        isMaximized: window.isMaximized(),
        isMinimized: window.isMinimized(),
        isFullScreen: window.isFullScreen(),
        timestamp: Date.now(),
      };

      // In a real app, you would save this to a file or localStorage
      // For now, we'll just return it
      return {
        status: true,
        data: state,
        message: "Window state saved",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to save window state: ${error.message}`,
      };
    }
  }

  /**
   * @param {Electron.BrowserWindow} window
   */
  async loadWindowState(window) {
    try {
      // In a real app, you would load this from a file or localStorage
      // For now, we'll just restore to default
      window.restore();
      window.center();

      return {
        status: true,
        message: "Window state restored to default",
      };
    } catch (error) {
      return {
        status: false,
        // @ts-ignore
        message: `Failed to load window state: ${error.message}`,
      };
    }
  }
}

// Initialize and register handlers
const windowControlHandlers = new WindowControlHandlers();

if (ipcMain) {
  ipcMain.handle("window-control", (event, payload) =>
    windowControlHandlers.handleRequest(event, payload),
  );
}

function registerWindowControlHandlers() {
  console.log("✅ Window Control IPC handlers registered");
}

module.exports = {
  WindowControlHandlers,
  windowControlHandlers,
  registerWindowControlHandlers,
};
