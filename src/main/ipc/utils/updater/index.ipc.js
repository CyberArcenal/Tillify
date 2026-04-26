// src/main/ipc/updater/index.ipc.js

const { ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { logger } = require('../../../../utils/logger');

class UpdaterHandler {
  constructor() {
    this.mainWindow = null;
    this.autoUpdater = autoUpdater;
    this.setupListeners();
  }

  // @ts-ignore
  setMainWindow(window) {
    this.mainWindow = window;
  }

  setupListeners() {
    this.autoUpdater.autoDownload = false;      // let user confirm download
    this.autoUpdater.autoInstallOnAppQuit = true;

    this.autoUpdater.on('checking-for-update', () => {
      this.sendToRenderer('updater:checking');
    });

    this.autoUpdater.on('update-available', (info) => {
      this.sendToRenderer('updater:update-available', info);
    });

    this.autoUpdater.on('update-not-available', (info) => {
      this.sendToRenderer('updater:update-not-available', info);
    });

    this.autoUpdater.on('error', (err) => {
      this.sendToRenderer('updater:error', err.message);
    });

    this.autoUpdater.on('download-progress', (progressObj) => {
      this.sendToRenderer('updater:download-progress', progressObj);
    });

    this.autoUpdater.on('update-downloaded', (info) => {
      this.sendToRenderer('updater:update-downloaded', info);
    });
  }

  // @ts-ignore
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    } else {
      logger.warn(`Updater: cannot send ${channel}, main window not available`);
    }
  }

  // @ts-ignore
  async handleRequest(event, payload) {
    const method = payload.method;
    const params = payload.params || {};

    logger.info(`UpdaterHandler: ${method}`, params);

    try {
      switch (method) {
        case 'checkForUpdates':
          return await this.checkForUpdates();
        case 'downloadUpdate':
          return await this.downloadUpdate();
        case 'quitAndInstall':
          return await this.quitAndInstall();
        case 'getUpdateStatus':
          return await this.getUpdateStatus();
        default:
          return { status: false, message: `Unknown method: ${method}`, data: null };
      }
    } catch (error) {
      // @ts-ignore
      logger.error(`UpdaterHandler error in ${method}:`, error);
      // @ts-ignore
      return { status: false, message: error.message, data: null };
    }
  }

  async checkForUpdates() {
    const result = await this.autoUpdater.checkForUpdates();
    return { status: true, message: 'Checking for updates', data: result?.updateInfo || null };
  }

  async downloadUpdate() {
    this.autoUpdater.downloadUpdate();
    return { status: true, message: 'Download started', data: null };
  }

  async quitAndInstall() {
    setImmediate(() => {
      this.autoUpdater.quitAndInstall();
    });
    return { status: true, message: 'Installing update...', data: null };
  }

  async getUpdateStatus() {
    return {
      status: true,
      message: 'Current version',
      data: {
        currentVersion: this.autoUpdater.currentVersion?.version,
        isUpdateAvailable: false, // you can extend this if needed
      },
    };
  }
}

const updaterHandler = new UpdaterHandler();

ipcMain.handle('updater', (event, payload) => updaterHandler.handleRequest(event, payload));

module.exports = {
  UpdaterHandler,
  updaterHandler,
  // @ts-ignore
  setMainWindow: (win) => updaterHandler.setMainWindow(win),
};