import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import Product from "../../models/projectManager/product.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";

// Helper function to normalize string to lowercase
const normalizeString = (str) => {
  if (!str) return "";
  return str.toString().trim().toLowerCase();
};

// Helper function to format title case for display
const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Helper function to format product for response
const formatProductResponse = (product) => {
  if (!product) return product;
  const obj = product.toObject ? product.toObject() : product;
  return {
    _id: obj._id,
    productName: toTitleCase(obj.productName),
    type: toTitleCase(obj.type),
    sellingPrice: obj.sellingPrice || 0,
    lc: obj.lc || 0,
    taxSellingPrice: obj.taxSellingPrice || 0,
    drugLicense: toTitleCase(obj.drugLicense || ""),
    licenseValidityDate: obj.licenseValidityDate,
    quantityPerBoxStrip: obj.qtyPerBoxStrip || 0,
  };
};

// GET PRICE LIST - returns all products
router.get("/", async (req, res) => {
  try {
    const priceList = await Product.find(
      {},
      {
        productName: 1,
        sellingPrice: 1,
        lc: 1,
        taxSellingPrice: 1,
        type: 1,
        drugLicense: 1,
        licenseValidityDate: 1,
        qtyPerBoxStrip: 1,
      },
    ).sort({ productName: 1 });

    const formattedPriceList = priceList.map((product) =>
      formatProductResponse(product),
    );

    res.status(200).json(formattedPriceList);
  } catch (error) {
    console.error("Error fetching price list:", error);
    res.status(500).json({ message: "Failed to fetch price list." });
  }
});

// GET SINGLE PRICE LIST ITEM - returns only one product
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === "undefined" || id === "null") {
      return res
        .status(400)
        .json({ message: "Invalid product ID format", ok: false });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res
        .status(400)
        .json({ message: "Invalid product ID format", ok: false });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found", ok: false });
    }

    res.status(200).json(formatProductResponse(product));
  } catch (error) {
    console.error("Error fetching product:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid product ID", ok: false });
    }
    res.status(500).json({ message: "Failed to fetch product." });
  }
});

// UPDATE SINGLE PRICE LIST ITEM - returns only the updated product
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || id === "undefined" || id === "null") {
      return res
        .status(400)
        .json({ message: "Invalid product ID format", ok: false });
    }
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res
        .status(400)
        .json({ message: "Invalid product ID format", ok: false });
    }

    // Get previous record before update for logging
    const previousRecord = await Product.findById(id).lean();
    if (!previousRecord) {
      return res.status(404).json({ message: "Product not found.", ok: false });
    }

    const {
      productName,
      sellingPrice,
      lc,
      taxSellingPrice,
      type,
      drugLicense,
      licenseValidityDate,
      quantityPerBoxStrip,
    } = req.body;

    const updateData = {
      productName:
        productName !== undefined ? normalizeString(productName) : undefined,
      sellingPrice:
        sellingPrice !== undefined ? Number(sellingPrice) : undefined,
      lc: lc !== undefined ? Number(lc) : undefined,
      taxSellingPrice:
        taxSellingPrice !== undefined ? Number(taxSellingPrice) : undefined,
      type: type !== undefined ? normalizeString(type) : undefined,
      drugLicense:
        drugLicense !== undefined ? normalizeString(drugLicense) : undefined,
      licenseValidityDate:
        licenseValidityDate !== undefined
          ? new Date(licenseValidityDate)
          : undefined,
      qtyPerBoxStrip:
        quantityPerBoxStrip !== undefined
          ? Number(quantityPerBoxStrip)
          : undefined,
    };

    // Remove undefined values
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key],
    );

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found.", ok: false });
    }

    // Log update activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Price List Item: ${toTitleCase(updatedProduct.productName)}`,
      tableName: "products",
      tableLabel: "Price List",
      recordId: updatedProduct._id,
      referenceNumber: updatedProduct.productName,
      previousData: previousRecord,
      newData: updatedProduct.toObject(),
      description: `Price list item ${toTitleCase(updatedProduct.productName)} was updated. Changed fields: ${Object.keys(updateData).join(", ")}`,
    });

    const formattedProduct = formatProductResponse(updatedProduct);

    res.status(200).json({
      success: true,
      message: `Price list item <b>${formattedProduct.productName}</b> updated successfully`,
      product: formattedProduct, // Returns ONLY the updated product
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Failed to update product.", ok: false });
  }
});

// BULK UPDATE PRICE LIST
router.post("/bulk-update", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        message: "No updates provided",
        ok: false,
      });
    }

    const results = {
      successful: [],
      failed: [],
    };

    // Get previous records for logging
    const productIds = updates.map((u) => u.id).filter((id) => id);
    const previousRecords = await Product.find({
      _id: { $in: productIds },
    }).lean();
    const previousRecordsMap = new Map(
      previousRecords.map((p) => [p._id.toString(), p]),
    );
    const updatedProducts = [];

    for (const update of updates) {
      try {
        const { id, ...updateData } = update;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
          results.failed.push({ id, error: "Invalid product ID" });
          continue;
        }

        const normalizedUpdate = {};
        if (updateData.productName !== undefined)
          normalizedUpdate.productName = normalizeString(
            updateData.productName,
          );
        if (updateData.sellingPrice !== undefined)
          normalizedUpdate.sellingPrice = Number(updateData.sellingPrice);
        if (updateData.lc !== undefined)
          normalizedUpdate.lc = Number(updateData.lc);
        if (updateData.taxSellingPrice !== undefined)
          normalizedUpdate.taxSellingPrice = Number(updateData.taxSellingPrice);
        if (updateData.type !== undefined)
          normalizedUpdate.type = normalizeString(updateData.type);
        if (updateData.drugLicense !== undefined)
          normalizedUpdate.drugLicense = normalizeString(
            updateData.drugLicense,
          );
        if (updateData.licenseValidityDate !== undefined)
          normalizedUpdate.licenseValidityDate = new Date(
            updateData.licenseValidityDate,
          );
        if (updateData.quantityPerBoxStrip !== undefined)
          normalizedUpdate.qtyPerBoxStrip = Number(
            updateData.quantityPerBoxStrip,
          );

        const updatedProduct = await Product.findByIdAndUpdate(
          id,
          normalizedUpdate,
          { new: true, runValidators: true, session },
        );

        if (updatedProduct) {
          results.successful.push({
            id: updatedProduct._id,
            productName: toTitleCase(updatedProduct.productName),
          });
          updatedProducts.push(formatProductResponse(updatedProduct));
        } else {
          results.failed.push({ id, error: "Product not found" });
        }
      } catch (err) {
        results.failed.push({ id: update.id, error: err.message });
      }
    }

    // Log bulk update activity
    if (results.successful.length > 0) {
      await logActivity(req, {
        action: "UPDATE",
        actionLabel: `Bulk Updated ${results.successful.length} Price List Item(s)`,
        tableName: "products",
        tableLabel: "Price List",
        previousData: previousRecords,
        newData: { updatedCount: results.successful.length },
        description: `Bulk updated ${results.successful.length} price list items`,
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `Updated ${results.successful.length} product(s). Failed: ${results.failed.length}`,
      results,
      updatedProducts, // Returns only the updated products
      ok: true,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in bulk update:", error);
    res
      .status(500)
      .json({ message: "Failed to perform bulk update", ok: false });
  }
});

// EXPORT PRICE LIST TO EXCEL
router.get("/export", async (req, res) => {
  try {
    const priceList = await Product.find(
      {},
      {
        productName: 1,
        sellingPrice: 1,
        lc: 1,
        taxSellingPrice: 1,
        type: 1,
        drugLicense: 1,
        licenseValidityDate: 1,
        qtyPerBoxStrip: 1,
      },
    ).sort({ productName: 1 });

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Prepare data for Excel
    const sheetData = [];

    // Add title rows
    sheetData.push([]);
    sheetData.push(["HEALTHCARE SOUTH EAST ASIA"]);
    sheetData.push(["Price List"]);
    sheetData.push([`Generated On: ${formattedDate}`]);
    sheetData.push([]);

    // Add headers
    sheetData.push([
      "Product Name",
      "Type",
      "Quantity per Box/Strip",
      "Selling Price (USD)",
      "LC (USD)",
      "Tax Selling Price (USD)",
      "Drug License",
      "License Validity Date",
    ]);

    // Add data rows
    priceList.forEach((product) => {
      sheetData.push([
        toTitleCase(product.productName),
        toTitleCase(product.type),
        product.qtyPerBoxStrip || 0,
        product.sellingPrice || 0,
        product.lc || 0,
        product.taxSellingPrice || 0,
        toTitleCase(product.drugLicense || ""),
        product.licenseValidityDate
          ? new Date(product.licenseValidityDate).toISOString().split("T")[0]
          : "",
      ]);
    });

    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Set column widths
    ws["!cols"] = [
      { wch: 30 }, // Product Name
      { wch: 15 }, // Type
      { wch: 22 }, // Quantity per Box/Strip
      { wch: 20 }, // Selling Price
      { wch: 15 }, // LC
      { wch: 20 }, // Tax Selling Price
      { wch: 20 }, // Drug License
      { wch: 22 }, // License Validity Date
    ];

    // Apply styling to headers
    const headerRowIndex = 5;
    const lastColumnIndex = 7;

    // Company name styling
    const companyRowIndex = 1;
    const titleRowIndex = 2;
    const dateRowIndex = 3;

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: companyRowIndex, c: c });
      if (!ws[cellAddress])
        ws[cellAddress] = { t: "s", v: "HEALTHCARE SOUTH EAST ASIA" };
      ws[cellAddress].s = {
        font: { bold: true, sz: 18, color: { rgb: "1E3A8A" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: titleRowIndex, c: c });
      if (!ws[cellAddress]) ws[cellAddress] = { t: "s", v: "Price List" };
      ws[cellAddress].s = {
        font: { bold: true, sz: 14, color: { rgb: "1E40AF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: dateRowIndex, c: c });
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          font: { italic: true, color: { rgb: "6B7280" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    // Merge cells for title rows
    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push(
      {
        s: { r: companyRowIndex, c: 0 },
        e: { r: companyRowIndex, c: lastColumnIndex },
      },
      {
        s: { r: titleRowIndex, c: 0 },
        e: { r: titleRowIndex, c: lastColumnIndex },
      },
      {
        s: { r: dateRowIndex, c: 0 },
        e: { r: dateRowIndex, c: lastColumnIndex },
      },
    );

    // Apply styling to headers
    for (let i = 0; i <= lastColumnIndex; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: i });
      if (!ws[cellAddress]) ws[cellAddress] = {};
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F46E5" }, patternType: "solid" },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    // Apply alternating row colors for data rows
    const dataStartRow = headerRowIndex + 1;
    for (let i = dataStartRow; i < sheetData.length; i++) {
      const rowColor = (i - dataStartRow) % 2 === 0 ? "F9FAFB" : "FFFFFF";
      for (let c = 0; c <= lastColumnIndex; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c: c });
        if (ws[cellAddress]) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.fill = {
            fgColor: { rgb: rowColor },
            patternType: "solid",
          };
          ws[cellAddress].s.alignment = { vertical: "center" };
        }
      }
    }

    // Apply border to all cells
    for (let r = 0; r < sheetData.length; r++) {
      for (let c = 0; c <= lastColumnIndex; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: r, c: c });
        if (ws[cellAddress]) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.border = {
            top: { style: "thin", color: { rgb: "E5E7EB" } },
            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
            left: { style: "thin", color: { rgb: "E5E7EB" } },
            right: { style: "thin", color: { rgb: "E5E7EB" } },
          };
        }
      }
    }

    // Log export activity
    await logActivity(req, {
      action: "EXPORT",
      actionLabel: `Exported Price List (${priceList.length} records)`,
      tableName: "products",
      tableLabel: "Price List",
      description: `Exported ${priceList.length} price list items to Excel`,
      newData: { count: priceList.length },
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Price List");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=price_list.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Failed to export price list", ok: false });
  }
});

export default router;
