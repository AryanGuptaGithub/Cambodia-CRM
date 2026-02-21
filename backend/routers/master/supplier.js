import express from "express";
import mongoose from "mongoose";
import Supplier from "../../models/master/supplier.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("❌ [ERROR]:", err);
  res.status(code).json({ message, error: err.message || err });
};

const handleDuplicateError = (res, err, entity = "supplier") => {
  const field = Object.keys(err.keyPattern || {})[0] || "field";
  const value = err.keyValue?.[field] || "unknown";
  return res.status(400).json({
    message: `A ${entity} with this ${field} "${value}" already exists.`,
    field,
    ok: false,
  });
};

// Helper to convert to title case for display
const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Convert Excel serial date to JS Date
const excelDateToJSDate = (value) => {
  if (!value) return null;
  if (typeof value === "number") {
    // Excel dates start from 1899-12-30
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + value * 86400000);
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// Parse date string in various formats
const parseDateString = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return null;
  const str = dateStr.trim();
  if (str === "") return null;

  // Try DD/MM/YYYY format
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const fullYear = year < 100 ? year + 2000 : year;
      return new Date(fullYear, month, day);
    }
  }

  // Try with dash separator
  if (str.includes("-")) {
    const parts = str.split("-");
    if (parts.length === 3) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      if (first > 12) {
        // DD-MM-YYYY
        return new Date(
          parseInt(parts[2], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[0], 10),
        );
      } else {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          return new Date(
            parts[0],
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
          );
        } else {
          // MM-DD-YYYY
          return new Date(
            parseInt(parts[2], 10),
            parseInt(parts[0], 10) - 1,
            parseInt(parts[1], 10),
          );
        }
      }
    }
  }

  // Try parsing as ISO date
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
};

// Helper to format supplier response with title case for display
const formatSupplierResponse = (supplier) => {
  if (!supplier) return supplier;
  const supplierObj = supplier.toObject ? supplier.toObject() : supplier;
  return {
    ...supplierObj,
    name: toTitleCase(supplierObj.name),
    address: toTitleCase(supplierObj.address),
  };
};

/* -------------------------------
   GET All without Pagination (for dropdowns)
------------------------------- */
router.get("/all", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const searchQuery = {};
    if (search && search.trim() !== "") {
      const searchLower = search.trim().toLowerCase();
      searchQuery.$or = [
        { name: { $regex: searchLower, $options: "i" } },
        { supplierName: { $regex: searchLower, $options: "i" } },
        { address: { $regex: searchLower, $options: "i" } },
      ];
    }

    const suppliers = await Supplier.find(searchQuery)
      .select("_id name supplierName address contact email")
      .sort({ name: 1 });

    const formattedSuppliers = suppliers.map((supplier) => ({
      _id: supplier._id,
      name: supplier.name || "",
      supplierName: supplier.supplierName || supplier.name || "",
      address: supplier.address || "",
      contact: supplier.contact || "",
      email: supplier.email || "",
    }));

    res.json(formattedSuppliers);
  } catch (err) {
    handleServerError(res, err);
  }
});

/* -------------------------------
   GET All with Pagination
------------------------------- */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const searchQuery = {};
    if (search && search.trim() !== "") {
      const searchLower = search.trim().toLowerCase();
      searchQuery.$or = [
        { name: { $regex: searchLower, $options: "i" } },
        { supplierName: { $regex: searchLower, $options: "i" } },
        { address: { $regex: searchLower, $options: "i" } },
      ];
    }

    const total = await Supplier.countDocuments(searchQuery);
    const suppliers = await Supplier.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const formattedSuppliers = suppliers.map((supplier) =>
      formatSupplierResponse(supplier),
    );

    res.json({
      success: true,
      suppliers: formattedSuppliers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* -------------------------------
   EXPORT All Suppliers as Excel
   ⚠️ MUST be above GET /:id — otherwise Express treats "export" as an ObjectId
------------------------------- */
router.get("/export", async (req, res) => {
  try {
    const suppliers = await Supplier.find({}).sort({ createdAt: -1 }).lean();

    const XLSX = await import("xlsx");

    const worksheetData = [
      [
        "Supplier Name",
        "Address",
        "Site Registration Date",
        "Site Registration Expiry Date",
        "Status",
      ],
      ...suppliers.map((s) => [
        toTitleCase(s.name || ""),
        toTitleCase(s.address || ""),
        s.siteRegistrationDate
          ? new Date(s.siteRegistrationDate).toISOString().split("T")[0]
          : "",
        s.siteRegistrationExpiryDate
          ? new Date(s.siteRegistrationExpiryDate).toISOString().split("T")[0]
          : "",
        s.enabled ? "Enabled" : "Disabled",
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Suppliers");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=suppliers_export.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (err) {
    handleServerError(res, err);
  }
});

/* -------------------------------
   GET by ID
------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    res.json({ success: true, supplier: formatSupplierResponse(supplier) });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* -----------------------------
   CREATE Supplier
   FIX: Now handles siteRegistrationDate, siteRegistrationExpiryDate, enabled
----------------------------- */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      supplierName,
      address,
      contact,
      email,
      gstNumber,
      panNumber,
      siteRegistrationDate,
      siteRegistrationExpiryDate,
      enabled,
    } = req.body;

    // Duplicate check (only non‑empty fields)
    const orConditions = [];
    if (name?.trim()) {
      orConditions.push({ name: name.trim().toLowerCase() });
    }
    if (supplierName?.trim()) {
      orConditions.push({ supplierName: supplierName.trim().toLowerCase() });
    }
    if (email?.trim()) {
      orConditions.push({ email: email.trim().toLowerCase() });
    }
    if (contact?.trim()) {
      orConditions.push({ contact: contact.trim() });
    }

    // Only check duplicates if we have at least one non-empty field to check
    if (orConditions.length > 0) {
      const existingSupplier = await Supplier.findOne({ $or: orConditions });
      if (existingSupplier) {
        return res.status(400).json({
          success: false,
          message: "Supplier with similar details already exists",
        });
      }
    }

    // Helper: safely parse a date, return null if invalid
    const parseDate = (dateValue) => {
      if (!dateValue) return undefined; // let model default apply if any
      const d = new Date(dateValue);
      return isNaN(d.getTime()) ? null : d;
    };

    const newSupplier = new Supplier({
      name: name?.trim().toLowerCase(),
      supplierName: supplierName?.trim()?.toLowerCase(),
      address: address?.trim()?.toLowerCase(),
      contact: contact?.trim(),
      email: email?.trim()?.toLowerCase(),
      gstNumber: gstNumber?.trim(),
      panNumber: panNumber?.trim(),
      siteRegistrationDate: parseDate(siteRegistrationDate),
      siteRegistrationExpiryDate: parseDate(siteRegistrationExpiryDate),
      enabled: enabled !== undefined ? enabled : undefined, // use model default if not provided
    });

    await newSupplier.save();
    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      supplier: formatSupplierResponse(newSupplier),
    });
  } catch (err) {
    if (err.code === 11000) return handleDuplicateError(res, err);
    handleServerError(res, err);
  }
});

/* -----------------------------
   UPDATE Supplier (including dates and enabled)
----------------------------- */
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const {
      name,
      supplierName,
      address,
      contact,
      email,
      gstNumber,
      panNumber,
      siteRegistrationDate,
      siteRegistrationExpiryDate,
      enabled,
    } = req.body;

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }

    // Helper: safely parse a date, return null if invalid
    const parseDate = (dateValue) => {
      if (!dateValue) return undefined;
      const d = new Date(dateValue);
      return isNaN(d.getTime()) ? null : d;
    };

    const updateData = {};
    if (name !== undefined) updateData.name = name?.trim().toLowerCase();
    if (supplierName !== undefined) updateData.supplierName = supplierName?.trim().toLowerCase();
    if (address !== undefined) updateData.address = address?.trim().toLowerCase();
    if (contact !== undefined) updateData.contact = contact?.trim();
    if (email !== undefined) updateData.email = email?.trim().toLowerCase();
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber?.trim();
    if (panNumber !== undefined) updateData.panNumber = panNumber?.trim();
    if (siteRegistrationDate !== undefined) updateData.siteRegistrationDate = parseDate(siteRegistrationDate);
    if (siteRegistrationExpiryDate !== undefined) updateData.siteRegistrationExpiryDate = parseDate(siteRegistrationExpiryDate);
    if (enabled !== undefined) updateData.enabled = enabled;

    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    );

    res.json({
      success: true,
      message: "Supplier updated successfully",
      supplier: formatSupplierResponse(updatedSupplier),
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* -----------------------------
   DELETE Supplier
----------------------------- */
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    await Supplier.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Supplier deleted successfully" });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* -----------------------------
   DELETE Multiple Suppliers
----------------------------- */
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide supplier IDs to delete",
      });
    }
    const result = await Supplier.deleteMany({ _id: { $in: ids } });
    res.json({
      success: true,
      message: `${result.deletedCount} supplier(s) deleted successfully`,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* -----------------------------
   EXCEL Import (OPTIMIZED)
   FIX: Handles ISO date strings sent from frontend (after parseExcelDateValue fix)
----------------------------- */
router.post("/import", async (req, res) => {
  try {
    const suppliers = req.body;
    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return res.status(400).json({
        message: "Invalid or empty data. Expected an array of suppliers.",
        ok: false,
      });
    }

    // Fetch all existing supplier names into a Set for O(1) lookup
    const allExisting = await Supplier.find({}, { name: 1 }).lean();
    const existingNamesSet = new Set(
      allExisting.map((s) => s.name.toLowerCase()),
    );

    const toInsert = [];
    const results = [];
    const warnings = [];
    const errors = [];

    for (let [index, supplier] of suppliers.entries()) {
      try {
        // Normalize field names
        const name = (
          supplier.supplierName ||
          supplier.name ||
          supplier["Supplier Name"] ||
          supplier["supplier name"] ||
          supplier["Supplier"] ||
          ""
        )
          .toString()
          .toLowerCase()
          .trim();

        const address = (
          supplier.address ||
          supplier.Address ||
          supplier["Address"] ||
          ""
        )
          .toString()
          .toLowerCase()
          .trim();

        // Validate required fields
        if (!name) {
          errors.push(`Row ${index + 1}: Missing supplier name`);
          continue;
        }
        if (!address) {
          errors.push(`Row ${index + 1}: Missing address`);
          continue;
        }

        // Check duplicate in existing DB
        if (existingNamesSet.has(name)) {
          results.push({
            supplier: toTitleCase(name),
            status: "skipped",
            message: `Supplier "${toTitleCase(name)}" already exists.`,
          });
          continue;
        }

        // ✅ FIX: Parse dates — frontend now sends ISO strings (YYYY-MM-DD)
        // so new Date() works correctly. Fallback handles legacy formats too.
        let siteRegistrationDate = null;
        if (supplier.siteRegistrationDate) {
          // Frontend sends "YYYY-MM-DD" string from parseExcelDateValue
          siteRegistrationDate = new Date(supplier.siteRegistrationDate);

          if (isNaN(siteRegistrationDate.getTime())) {
            // Fallback for number (serial) or other formats
            if (typeof supplier.siteRegistrationDate === "number") {
              siteRegistrationDate = excelDateToJSDate(supplier.siteRegistrationDate);
            } else {
              siteRegistrationDate = parseDateString(supplier.siteRegistrationDate.toString());
            }
            if (!siteRegistrationDate || isNaN(siteRegistrationDate.getTime())) {
              siteRegistrationDate = new Date();
              warnings.push(
                `Row ${index + 1}: Invalid registration date, using current date`,
              );
            }
          }
        } else {
          siteRegistrationDate = new Date();
          warnings.push(
            `Row ${index + 1}: Site registration date not provided, using current date`,
          );
        }

        let siteRegistrationExpiryDate = null;
        if (supplier.siteRegistrationExpiryDate) {
          siteRegistrationExpiryDate = new Date(supplier.siteRegistrationExpiryDate);

          if (isNaN(siteRegistrationExpiryDate.getTime())) {
            if (typeof supplier.siteRegistrationExpiryDate === "number") {
              siteRegistrationExpiryDate = excelDateToJSDate(supplier.siteRegistrationExpiryDate);
            } else {
              siteRegistrationExpiryDate = parseDateString(supplier.siteRegistrationExpiryDate.toString());
            }
            if (!siteRegistrationExpiryDate || isNaN(siteRegistrationExpiryDate.getTime())) {
              siteRegistrationExpiryDate = new Date(siteRegistrationDate);
              siteRegistrationExpiryDate.setFullYear(
                siteRegistrationExpiryDate.getFullYear() + 1,
              );
              warnings.push(
                `Row ${index + 1}: Invalid expiry date, defaulting to 1 year from registration date`,
              );
            }
          }
        } else {
          siteRegistrationExpiryDate = new Date(siteRegistrationDate);
          siteRegistrationExpiryDate.setFullYear(
            siteRegistrationExpiryDate.getFullYear() + 1,
          );
          warnings.push(
            `Row ${index + 1}: Expiry date not provided, defaulting to 1 year from registration date`,
          );
        }

        toInsert.push({
          name,
          address,
          siteRegistrationDate,
          siteRegistrationExpiryDate,
          enabled: true,
        });
      } catch (err) {
        errors.push(`Row ${index + 1}: ${err.message}`);
        console.error(`Error processing row ${index + 1}:`, err);
      }
    }

    // Bulk insert new suppliers
    let inserted = [];
    if (toInsert.length > 0) {
      inserted = await Supplier.insertMany(toInsert, { ordered: false });
    }

    // Build results for inserted rows
    inserted.forEach((doc) => {
      results.push({
        supplier: toTitleCase(doc.name),
        status: "created",
        message: `Supplier "${toTitleCase(doc.name)}" imported successfully.`,
      });
    });

    const createdCount = inserted.length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    let message = `${createdCount} supplier(s) imported successfully.`;
    if (skippedCount > 0)
      message += ` ${skippedCount} supplier(s) skipped (already exist).`;
    if (warnings.length > 0)
      message += ` ${warnings.length} row(s) had date warnings.`;
    if (errors.length > 0)
      message += ` ${errors.length} row(s) had errors.`;

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
    console.error("❌ Import error:", err);
    return res.status(500).json({
      message: "Server error while importing suppliers.",
      error: err.message,
      ok: false,
    });
  }
});

export default router;