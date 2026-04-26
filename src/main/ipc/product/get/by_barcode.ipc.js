// src/main/ipc/product/get/by_barcode.ipc.js

const { AppDataSource } = require("../../../db/datasource");
const Product  = require("../../../../entities/Product");

// Simple in-memory cache para sa idempotency
const barcodeCache = new Map();
const CACHE_TTL = 300; // milliseconds (adjust as needed)

/**
 * Get a product by its barcode with idempotency
 * @param {{ barcode: string }} params
 * @returns {Promise<{status: boolean, message: string, data: any}>}
 */
module.exports = async (params) => {
  try {
    const { barcode } = params;

    if (!barcode) {
      return {
        status: false,
        message: "Barcode is required",
        data: null,
      };
    }

    // Idempotency check: kung may cached result at hindi pa expired, ibalik ito
    const cached = barcodeCache.get(barcode);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[Idempotency] Returning cached result for barcode: ${barcode}`);
      return cached.result;
    }

    const productRepo = AppDataSource.getRepository(Product);

    const product = await productRepo.findOne({
      where: { barcode, isActive: true },
      relations: ["category", "supplier"],
    });

    let result;
    if (!product) {
      result = {
        status: false,
        message: "Product not found with that barcode",
        data: null,
      };
    } else {
      result = {
        status: true,
        message: "Product found",
        data: product,
      };
    }

    // I-store sa cache
    barcodeCache.set(barcode, {
      timestamp: Date.now(),
      result: result,
    });

    return result;
  } catch (error) {
    console.error("Error in getProductByBarcode:", error);
    return {
      status: false,
      // @ts-ignore
      message: error.message || "Failed to fetch product by barcode",
      data: null,
    };
  }
};