import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import Product from "../../models/projectManager/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";

const parseDateToUTCNoon = (dateInput) => {
  if (!dateInput) return null;

  let year, month, day;

  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    year = dateInput.getUTCFullYear();
    month = dateInput.getUTCMonth();
    day = dateInput.getUTCDate();
  } else if (typeof dateInput === "number") {
    let serial = dateInput;
    if (serial >= 60) serial -= 1;
    const excelEpoch = Date.UTC(1900, 0, 0);
    const msPerDay = 86400000;
    const date = new Date(excelEpoch + serial * msPerDay);
    year = date.getUTCFullYear();
    month = date.getUTCMonth();
    day = date.getUTCDate();
  } else if (typeof dateInput === "string") {
    const clean = dateInput.trim();
    if (!clean || clean.toLowerCase() === "n/a") return null;

    let match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10) - 1;
      day = parseInt(match[3], 10);
    } else if (
      (match = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/))
    ) {
      day = parseInt(match[1], 10);
      month = parseInt(match[2], 10) - 1;
      year = parseInt(match[3], 10);
    } else if (
      (match = clean.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/))
    ) {
      day = parseInt(match[1], 10);
      const monthStr = match[2].toLowerCase().substring(0, 3);
      const monthMap = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };
      month = monthMap[monthStr];
      if (month === undefined) return null;
      year = parseInt(match[3], 10);
    } else {
      const d = new Date(clean);
      if (!isNaN(d.getTime())) {
        year = d.getUTCFullYear();
        month = d.getUTCMonth();
        day = d.getUTCDate();
      } else {
        return null;
      }
    }
  } else {
    return null;
  }

  if (year === undefined || month === undefined || day === undefined)
    return null;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  return new Date(Date.UTC(year, month, day, 12, 0, 0));
};

/**
 * Format a Date object to YYYY-MM-DD using UTC components.
 */
const formatDateUTC = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeString = (str) => {
  if (!str) return "";
  return str.toString().trim().toLowerCase();
};

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// ==================== ENDPOINTS ====================

// GET DROPDOWN PRODUCTS
router.get("/dropdown", async (req, res) => {
  try {
    const products = await Product.find({ isActive: true });
    const stockList = await ReportInHand.find();
    const stockMap = new Map();
    stockList.forEach((item) => {
      stockMap.set(item.productName.toLowerCase(), item);
    });

    const finalList = products.map((product) => {
      const stock = stockMap.get(product.productName.toLowerCase());
      return {
        ...product.toObject(),
        productName: toTitleCase(product.productName),
        type: toTitleCase(product.type),
        supplierName: toTitleCase(product.supplierName),
        drugLicense: toTitleCase(product.drugLicense),
        batches: stock?.batches || [],
        totalBoxes: stock?.totalBoxes || 0,
        totalAmount: stock?.totalAmount || 0,
        status: stock?.status || "Out of Stock",
        minStockLevel: stock?.minStockLevel || 0,
        category: stock?.category || "Uncategorized",
        lc: stock?.lc || 0,
        fob: stock?.fob || 0,
        cif: stock?.cif || 0,
        stockLastUpdated: stock?.updatedAt || null,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        licenseValidityDate: formatDateUTC(product.licenseValidityDate),
      };
    });

    res.status(200).json({ success: true, data: finalList });
  } catch (err) {
    console.error("❌ Error fetching products with stock:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch products." });
  }
});

// GET ALL PRODUCTS (formatted) — includes isActive
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ productName: 1 });
    const formattedProducts = products.map((product) => ({
      ...product.toObject(),
      productName: toTitleCase(product.productName),
      type: toTitleCase(product.type),
      supplierName: toTitleCase(product.supplierName),
      drugLicense: toTitleCase(product.drugLicense),
      licenseValidityDate: formatDateUTC(product.licenseValidityDate),
      isActive: product.isActive,
    }));
    res.status(200).json(formattedProducts);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Failed to fetch products." });
  }
});

// GET PRODUCTS WITH IN-STOCK INFO
router.get("/in-stock", async (req, res) => {
  try {
    const stockByProduct = await ReportInHand.aggregate([
      {
        $group: {
          _id: "$productName",
          totalBoxes: { $sum: "$quantity.boxes" },
        },
      },
    ]);
    const products = await Product.find({ isActive: true });
    const productsWithStock = products.map((product) => {
      const stock = stockByProduct.find(
        (s) => s._id.toLowerCase() === product.productName.toLowerCase(),
      );
      return {
        ...product.toObject(),
        productName: toTitleCase(product.productName),
        type: toTitleCase(product.type),
        supplierName: toTitleCase(product.supplierName),
        inStock: {
          boxes: stock?.totalBoxes || 0,
          status: stock?.totalBoxes > 0 ? "In Stock" : "Out of Stock",
        },
        licenseValidityDate: formatDateUTC(product.licenseValidityDate),
      };
    });
    res.status(200).json(productsWithStock);
  } catch (err) {
    console.error("Error fetching products with stock:", err);
    res.status(500).json({
      message: "Failed to fetch products with stock information.",
    });
  }
});

// GET PAGINATED PRODUCTS
router.get("/paginated", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const search = req.query.search || "";
    const type = req.query.type || "";
    const status = req.query.status || "all";
    const skip = (page - 1) * limit;

    const query = {};

    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    }

    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } },
        { drugLicense: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
      ];
    }
    if (type && type.toLowerCase() !== "all") {
      query.type = { $regex: new RegExp(`^${type}$`, "i") };
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort({ isActive: -1, productName: 1 })
      .skip(skip)
      .limit(limit);

    const formattedProducts = products.map((product) => ({
      ...product.toObject(),
      productName: toTitleCase(product.productName),
      type: toTitleCase(product.type),
      supplierName: toTitleCase(product.supplierName),
      drugLicense: toTitleCase(product.drugLicense),
      licenseValidityDate: formatDateUTC(product.licenseValidityDate),
      isActive: product.isActive,
    }));

    res.status(200).json({
      success: true,
      data: formattedProducts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (err) {
    console.error("Error fetching paginated products:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch products." });
  }
});

// GET PRODUCT TYPES
router.get("/types", async (req, res) => {
  try {
    const types = await Product.distinct("type");
    const formattedTypes = types
      .filter((type) => type && type.trim() !== "")
      .map((type) => toTitleCase(type))
      .sort();
    res.status(200).json({ success: true, data: formattedTypes });
  } catch (err) {
    console.error("Error fetching product types:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch product types." });
  }
});

// ── TOGGLE isActive ───────────────────────────────────────────────────
router.patch(
  "/:id/toggle-status",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const { id } = req.params;

      const previousRecord = await Product.findById(id).lean();
      if (!previousRecord) {
        return res.status(404).json({ message: "Product not found." });
      }

      const product = await Product.findById(id);
      product.isActive = !product.isActive;
      await product.save();

      const label = product.isActive ? "enabled" : "disabled";
      const displayName = toTitleCase(product.productName);

      // Log status toggle activity
      await logActivity(req, {
        action: "UPDATE",
        actionLabel: `${label === "enabled" ? "Enabled" : "Disabled"} Product: ${displayName}`,
        tableName: "products",
        tableLabel: "Product",
        recordId: product._id,
        referenceNumber: product.productName,
        previousData: { isActive: previousRecord.isActive },
        newData: { isActive: product.isActive },
        description: `Product ${displayName} has been ${label}.`,
      });

      return res.status(200).json({
        message: `Product <b>${displayName}</b> has been ${label}.`,
        isActive: product.isActive,
        _id: product._id,
      });
    } catch (error) {
      console.error("Error toggling product status:", error);
      return res.status(500).json({ message: "Server error." });
    }
  },
);

// UPDATE PRODUCT
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Get previous record before update for logging
    const previousRecord = await Product.findById(id).lean();
    if (!previousRecord) {
      return res.status(404).json({ message: "Product not found." });
    }

    let updatedData = req.body;

    if (updatedData.productName)
      updatedData.productName = normalizeString(updatedData.productName);
    if (updatedData.type) updatedData.type = normalizeString(updatedData.type);
    if (updatedData.packing)
      updatedData.packing = normalizeString(updatedData.packing);
    if (updatedData.supplierName)
      updatedData.supplierName = normalizeString(updatedData.supplierName);
    if (updatedData.drugLicense)
      updatedData.drugLicense = normalizeString(updatedData.drugLicense);
    if (updatedData.remarks)
      updatedData.remarks = normalizeString(updatedData.remarks);

    if (updatedData.licenseValidityDate) {
      updatedData.licenseValidityDate = parseDateToUTCNoon(
        updatedData.licenseValidityDate,
      );
    }

    delete updatedData.isActive;

    const updatedProduct = await Product.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    // Log update activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Product: ${toTitleCase(updatedProduct.productName)}`,
      tableName: "products",
      tableLabel: "Product",
      recordId: updatedProduct._id,
      referenceNumber: updatedProduct.productName,
      previousData: previousRecord,
      newData: updatedProduct.toObject(),
      description: `Product ${toTitleCase(updatedProduct.productName)} was updated`,
    });

    const formattedProduct = {
      ...updatedProduct.toObject(),
      productName: toTitleCase(updatedProduct.productName),
      type: toTitleCase(updatedProduct.type),
      supplierName: toTitleCase(updatedProduct.supplierName),
      drugLicense: toTitleCase(updatedProduct.drugLicense),
      licenseValidityDate: formatDateUTC(updatedProduct.licenseValidityDate),
      isActive: updatedProduct.isActive,
    };

    return res.status(200).json(formattedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({ message: "Server error." });
  }
});

// DELETE SINGLE PRODUCT
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const deletedProduct = await Product.findByIdAndDelete(id);

    // Log delete activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Product: ${toTitleCase(product.productName)}`,
      tableName: "products",
      tableLabel: "Product",
      recordId: product._id,
      referenceNumber: product.productName,
      previousData: product.toObject(),
      description: `Product ${toTitleCase(product.productName)} permanently deleted`,
    });

    res.status(200).json({
      message: `Product <b>${toTitleCase(product.productName)}</b> deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// DELETE MULTIPLE PRODUCTS
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    let { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided for deletion." });
    }
    if (typeof ids[0] === "object" && ids[0]?.id) {
      ids = ids.map((item) => item.id);
    }

    // Get full documents before deletion for logging
    const toDelete = await Product.find({ _id: { $in: ids } }).lean();

    const objectIds = ids.map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ObjectId: ${id}`);
      }
      return new mongoose.Types.ObjectId(id);
    });
    const result = await Product.deleteMany({ _id: { $in: objectIds } });

    // Log bulk delete activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Product(s)`,
      tableName: "products",
      tableLabel: "Product",
      previousData: toDelete,
      description: `Deleted ${result.deletedCount} products`,
    });

    return res.status(200).json({
      message: `${result.deletedCount} product(s) deleted successfully.`,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return res
      .status(500)
      .json({ message: "Server error while deleting products." });
  }
});

// ADD NEW PRODUCT
router.post("/add", async (req, res) => {
  try {
    const {
      productName,
      type,
      packing,
      qtyPerBoxStrip,
      supplierName,
      drugLicense,
      licenseValidityDate,
      remarks,
      sellingPrice,
      lc,
      fob,
      taxSellingPrice,
    } = req.body;

    if (!productName || !type || !packing) {
      return res
        .status(400)
        .json({ message: "Please fill all required fields." });
    }

    const newProduct = new Product({
      productName: normalizeString(productName),
      type: normalizeString(type),
      packing: normalizeString(packing),
      qtyPerBoxStrip: qtyPerBoxStrip ? Number(qtyPerBoxStrip) : 0,
      supplierName: supplierName ? normalizeString(supplierName) : "",
      drugLicense: drugLicense ? normalizeString(drugLicense) : "",
      licenseValidityDate: parseDateToUTCNoon(licenseValidityDate),
      remarks: remarks ? normalizeString(remarks) : "",
      sellingPrice: sellingPrice ? Number(sellingPrice) : 0,
      lc: lc ? Number(lc) : 0,
      fob: fob ? Number(fob) : 0,
      taxSellingPrice: taxSellingPrice ? Number(taxSellingPrice) : 0,
      isActive: true,
    });

    const savedProduct = await newProduct.save();

    // Log create activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Product: ${toTitleCase(savedProduct.productName)}`,
      tableName: "products",
      tableLabel: "Product",
      recordId: savedProduct._id,
      referenceNumber: savedProduct.productName,
      newData: savedProduct.toObject(),
      description: `New product ${toTitleCase(savedProduct.productName)} added`,
    });

    const formattedProduct = {
      ...savedProduct.toObject(),
      productName: toTitleCase(savedProduct.productName),
      type: toTitleCase(savedProduct.type),
      supplierName: toTitleCase(savedProduct.supplierName),
      licenseValidityDate: formatDateUTC(savedProduct.licenseValidityDate),
      isActive: savedProduct.isActive,
    };

    return res.status(201).json({
      message: `Product <b>${formattedProduct.productName}</b> added successfully`,
      product: formattedProduct,
    });
  } catch (error) {
    console.error("Error adding product:", error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "Product with this name already exists." });
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: "Validation error", errors });
    }
    return res
      .status(500)
      .json({ message: "Server error while adding product" });
  }
});

// GET ALL PRODUCTS FOR IMPORT DUPLICATE CHECK
router.get("/all-for-import", async (req, res) => {
  try {
    const products = await Product.find(
      {},
      "productName type packing supplierName",
    ).lean();
    res.json(
      products.map((p) => ({
        _id: p._id,
        productName: p.productName,
        type: p.type,
        packing: p.packing,
        supplierName: p.supplierName,
      })),
    );
  } catch (err) {
    console.error("Error fetching products for import:", err);
    res.status(500).json({ message: "Failed to fetch products." });
  }
});

// EXPORT PRODUCTS
router.get("/export", async (req, res) => {
  try {
    const products = await Product.find({}).sort({ productName: 1 }).lean();

    const XLSX = await import("xlsx");

    const worksheetData = [
      [
        "Product Name",
        "Type",
        "Packing",
        "Qty Per Box/Strip",
        "Supplier Name",
        "Drug License",
        "License Validity Date",
        "Selling Price (USD)",
        "LC (USD)",
        "FOB (USD)",
        "Tax Selling Price (USD)",
        "Remarks",
        "Status",
      ],
      ...products.map((p) => [
        toTitleCase(p.productName || ""),
        toTitleCase(p.type || ""),
        toTitleCase(p.packing || ""),
        p.qtyPerBoxStrip || 0,
        toTitleCase(p.supplierName || ""),
        toTitleCase(p.drugLicense || ""),
        p.licenseValidityDate ? formatDateUTC(p.licenseValidityDate) : "",
        p.sellingPrice || 0,
        p.lc || 0,
        p.fob || 0,
        p.taxSellingPrice || 0,
        toTitleCase(p.remarks || ""),
        p.isActive ? "Active" : "Inactive",
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log export activity
    await logActivity(req, {
      action: "EXPORT",
      actionLabel: `Exported Product List (${products.length} records)`,
      tableName: "products",
      tableLabel: "Product",
      description: `Exported ${products.length} products to Excel`,
      newData: { count: products.length },
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=products_export.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Failed to export products", ok: false });
  }
});

// IMPORT PRODUCTS
router.post("/import", async (req, res) => {
  try {
    const products = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid or empty data.", ok: false });
    }

    const allExisting = await Product.find(
      {},
      { productName: 1, type: 1, packing: 1, supplierName: 1 },
    ).lean();

    const existingKeys = new Set();
    allExisting.forEach((p) => {
      const key = JSON.stringify({
        productName: normalizeString(p.productName),
        type: normalizeString(p.type),
        packing: normalizeString(p.packing),
        supplierName: normalizeString(p.supplierName),
      });
      existingKeys.add(key);
    });

    const toInsert = [];
    const results = [];
    const warnings = [];
    const errors = [];
    const fileKeys = new Map();

    for (let [index, item] of products.entries()) {
      try {
        const productName = normalizeString(item.productName);
        const type = normalizeString(item.type);
        const packing = normalizeString(item.packing);
        const supplierName = normalizeString(item.supplierName);

        if (!productName) {
          errors.push(`Row ${index + 1}: Product name is required`);
          continue;
        }
        if (!type) {
          errors.push(`Row ${index + 1}: Product type is required`);
          continue;
        }
        if (!packing) {
          errors.push(`Row ${index + 1}: Packing is required`);
          continue;
        }

        const rowKey = JSON.stringify({
          productName,
          type,
          packing,
          supplierName,
        });
        if (fileKeys.has(rowKey)) {
          results.push({
            name: productName,
            row: index + 1,
            status: "skipped",
            reason: "Duplicate within file",
          });
          continue;
        }
        fileKeys.set(rowKey, index);

        if (existingKeys.has(rowKey)) {
          results.push({
            name: productName,
            row: index + 1,
            status: "skipped",
            reason: "Already exists",
          });
          continue;
        }

        const qtyPerBoxStrip = parseInt(item.qtyPerBoxStrip, 10);
        if (isNaN(qtyPerBoxStrip) || qtyPerBoxStrip <= 0) {
          errors.push(
            `Row ${index + 1}: Quantity per box/strip must be a positive number`,
          );
          continue;
        }

        const parseNumericField = (value, defaultValue = 0) => {
          if (value === undefined || value === null || value === "")
            return defaultValue;
          const str = value.toString().trim().replace(/[$,]/g, "");
          const num = parseFloat(str);
          return isNaN(num) ? defaultValue : num;
        };

        const sellingPriceUSD = parseNumericField(item.sellingPriceUSD);
        const lcUSD = parseNumericField(item.lcUSD);
        const fobUSD = parseNumericField(item.fobUSD);
        const taxSellingPriceUSD = parseNumericField(item.taxSellingPriceUSD);

        let licenseValidityDate = null;
        if (item.licenseValidityDate) {
          licenseValidityDate = parseDateToUTCNoon(item.licenseValidityDate);
          if (!licenseValidityDate) {
            warnings.push(
              `Row ${index + 1}: Could not parse date "${item.licenseValidityDate}", set to null`,
            );
          }
        }

        const drugLicense =
          normalizeString(item.drugLicense) === "n/a"
            ? ""
            : normalizeString(item.drugLicense);
        const remarks = normalizeString(item.remarks);

        toInsert.push({
          productName,
          type,
          packing,
          sellingPrice: sellingPriceUSD,
          lc: lcUSD,
          fob: fobUSD,
          taxSellingPrice: taxSellingPriceUSD,
          qtyPerBoxStrip,
          supplierName,
          drugLicense,
          licenseValidityDate,
          remarks,
          isActive: true,
        });
      } catch (err) {
        errors.push(`Row ${index + 1}: ${err.message}`);
        console.error(`Error processing row ${index + 1}:`, err);
      }
    }

    let inserted = [];
    if (toInsert.length > 0) {
      inserted = await Product.insertMany(toInsert, { ordered: false });
    }

    inserted.forEach((doc) => {
      results.push({
        name: doc.productName,
        status: "created",
        reason: "Imported successfully",
      });
    });

    const createdCount = inserted.length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    // Log import activity
    if (createdCount > 0) {
      await logActivity(req, {
        action: "IMPORT",
        actionLabel: `Bulk Imported ${createdCount} Product(s)`,
        tableName: "products",
        tableLabel: "Product",
        description: `Imported ${createdCount} products. Duplicates skipped: ${skippedCount}. Errors: ${errors.length}.`,
        newData: {
          importedCount: createdCount,
          duplicateCount: skippedCount,
          errorCount: errors.length,
        },
      });
    }

    let message = `${createdCount} product(s) imported successfully.`;
    if (skippedCount > 0)
      message += ` ${skippedCount} product(s) skipped (duplicates).`;
    if (warnings.length > 0)
      message += ` ${warnings.length} row(s) had warnings.`;
    if (errors.length > 0) message += ` ${errors.length} row(s) had errors.`;

    return res.status(200).json({
      message,
      results,
      warnings: warnings.slice(0, 20),
      errors: errors.slice(0, 20),
      createdCount,
      skippedCount,
      warningCount: warnings.length,
      errorCount: errors.length,
      ok: true,
    });
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({
      message: "Server error while importing products.",
      error: err.message,
      ok: false,
    });
  }
});

export default router;
