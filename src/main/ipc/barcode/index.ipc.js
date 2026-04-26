// src/main/ipc/barcode/index.ipc.js

const { ipcMain } = require('electron');
const { withErrorHandling } = require('../../../middlewares/errorHandler'); // adjust path
const barcodeService = require('../../../services/BarcodeService');

ipcMain.handle(
  'barcode',
  // @ts-ignore
  withErrorHandling(async (event, payload) => {
    const { method, params } = payload;
    switch (method) {
      case 'emit':
        barcodeService.emitBarcode(params.barcode);
        return { status: true };
      default:
        return { status: false, message: `Unknown method: ${method}` };
    }
  }, 'IPC:barcode')
);