// src/main/services/BarcodeService.js

const { BrowserWindow, app } = require('electron');
const { logger } = require('../utils/logger');

const Product = require('../entities/Product');

class BarcodeService {
  constructor() {
    /** @type {NodeJS.Timeout | null} */
    this.autoEmitInterval = null;
    
    // Check if running in development mode
    // this.isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    this.isDev = false;

    if (this.isDev) {
      this.startAutoEmit();
      app.on('before-quit', () => this.stopAutoEmit());
    }
  }

  /**
   * I-broadcast ang barcode sa lahat ng renderer windows.
   * @param {string} barcode
   */
  emitBarcode(barcode) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('barcode-scanned', barcode);
      }
    }
    if (logger) logger.info(`[Barcode] Emitted: ${barcode}`);
  }

  /**
   * Simulate barcode scanning in development mode using actual product barcodes.
   * @param {number} intervalMs - Interval in milliseconds (default: 5000)
   */
  startAutoEmit(intervalMs = 5000) {
    const { AppDataSource } = require('../main/db/datasource');
    if (!this.isDev) return;
    
    this.stopAutoEmit(); // clear any existing interval
    this.autoEmitInterval = setInterval(async () => {
      try {
        // Ensure database is initialized
        if (!AppDataSource.isInitialized) {
          console.log('[Barcode] Database not ready yet, waiting...');
          return;
        }

        const productRepo = AppDataSource.getRepository(Product);
        
        // Get all active products with barcode
        const products = await productRepo.find({
          select: ['barcode'],
          where: { isActive: true },
        });

        if (products.length === 0) {
          console.warn('[Barcode] No active products with barcode found in database');
          return;
        }

        // Pick a random product and emit its barcode
        const randomProduct = products[Math.floor(Math.random() * products.length)];
        if (randomProduct.barcode) {
          // @ts-ignore
          this.emitBarcode(randomProduct.barcode);
        }
      } catch (error) {
        console.error('[Barcode] Error during auto-emit:', error);
      }
    }, intervalMs);
    
    console.log('[Barcode] Auto-emit started in dev mode (using real product barcodes from DB)');
  }

  /**
   * Stop auto-emitting barcodes.
   */
  stopAutoEmit() {
    if (this.autoEmitInterval) {
      clearInterval(this.autoEmitInterval);
      this.autoEmitInterval = null;
      console.log('[Barcode] Auto-emit stopped');
    }
  }
}

// Export a singleton instance
module.exports = new BarcodeService();