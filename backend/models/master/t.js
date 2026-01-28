import express from "express";
import mongoose from "mongoose";
import Supplier from "../../models/master/supplier.js";

const router = express.Router();

const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("❌ [ERROR]:", err);
  res.status(code).json({ message, error: err.message || err });
};

const handleDuplicateError = (res, err, entity = "supplier") => {
  const field = Object.keys(err.keyPattern || {})[0] || "field";
  const value = err.keyValue?.[field] || "unknown";
  return res.status(400).json({
    message: `A ${entity} with this ${field} <b style="color:#EF4444">${value}</b> already exists.`,
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
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
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
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const str = dateStr.trim();
  if (str === '') return null;
  
  // Try DD/MM/YYYY format
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      
      // Handle 2-digit year
      const fullYear = year < 100 ? year + 2000 : year;
      return new Date(fullYear, month, day);
    }
  }
  
  // Try MM/DD/YYYY format
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      // Check if it's DD-MM-YYYY or MM-DD-YYYY
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      
      if (first > 12) {
        // DD-MM-YYYY
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        // MM-DD-YYYY or YYYY-MM-DD
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          return new Date(parts[0], parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          // MM-DD-YYYY
          return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        }
      }
    }
  }
  
  // Try parsing as ISO date
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
};

// Helper to format supplier response with title case
const formatSupplierResponse = (supplier) => {
  if (!supplier) return supplier;
  
  const supplierObj = supplier.toObject ? supplier.toObject() : supplier;
  
  return {
    ...supplierObj,
    name: toTitleCase(supplierObj.name),
    address: toTitleCase(supplierObj.address),
  };
};

/* ------------------------------- GET All with Pagination ------------------------------- */
router.get("/suppliers", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build search query
    const searchQuery = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim().toLowerCase(), 'i');
      searchQuery.$or = [
        { name: searchRegex },
        { address: searchRegex }
      ];
    }

    // Get total count for pagination
    const total = await Supplier.countDocuments(searchQuery);

    // Get paginated suppliers
    const suppliers = await Supplier.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Format suppliers with title case for display
    const formattedSuppliers = suppliers.map(supplier => formatSupplierResponse(supplier));

    res.json({
      suppliers: formattedSuppliers,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* ------------------------------- GET by ID ------------------------------ */
router.get("/suppliers/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }
    
    // Format response with title case
    const responseSupplier = formatSupplierResponse(supplier);
    
    res.json(responseSupplier);
  } catch (err) {
    handleServerError(res, err);
  }
});

/* ----------------------------- CREATE Supplier ----------------------------- */
router.post("/suppliers", async (req, res) => {
  try {
    const {
      name,
      address,
      siteRegistrationDate,
      siteRegistrationExpiryDate,
      enabled,
    } = req.body;

    // ✅ Validation
    if (!name || !address) {
      return res
        .status(400)
        .json({ message: "Name and Address are required fields." });
    }

    // Convert strings to lowercase for storage
    const payload = {
      name: name.toLowerCase().trim(),
      address: address.toLowerCase().trim(),
      enabled: enabled === true || enabled === "enabled" || enabled === "true",
    };

    // Set site registration date (default to current date if not provided)
    if (siteRegistrationDate) {
      const regDate = new Date(siteRegistrationDate);
      payload.siteRegistrationDate = isNaN(regDate.getTime()) ? new Date() : regDate;
    } else {
      payload.siteRegistrationDate = new Date();
    }

    // Set site registration expiry date (default to 1 year from registration date if not provided)
    if (siteRegistrationExpiryDate) {
      const expiryDate = new Date(siteRegistrationExpiryDate);
      if (isNaN(expiryDate.getTime())) {
        payload.siteRegistrationExpiryDate = new Date(payload.siteRegistrationDate);
        payload.siteRegistrationExpiryDate.setFullYear(payload.siteRegistrationExpiryDate.getFullYear() + 1);
      } else {
        payload.siteRegistrationExpiryDate = expiryDate;
      }
    } else {
      payload.siteRegistrationExpiryDate = new Date(payload.siteRegistrationDate);
      payload.siteRegistrationExpiryDate.setFullYear(payload.siteRegistrationExpiryDate.getFullYear() + 1);
    }

    const newSupplier = new Supplier(payload);
    const savedSupplier = await newSupplier.save();

    // Format response with title case
    const formattedSupplier = formatSupplierResponse(savedSupplier);

    res.status(201).json({
      message: `Supplier <b>${toTitleCase(savedSupplier.name)}</b> created successfully.`,
      supplier: formattedSupplier,
      ok: true,
    });
  } catch (err) {
    if (err.code === 11000) return handleDuplicateError(res, err);
    handleServerError(res, err);
  }
});

/* ----------------------------- UPDATE Supplier ----------------------------- */
router.put("/suppliers/:id", async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert string fields to lowercase for update
    if (updateData.name) {
      updateData.name = updateData.name.toLowerCase().trim();
    }
    if (updateData.address) {
      updateData.address = updateData.address.toLowerCase().trim();
    }

    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedSupplier)
      return res.status(404).json({ message: "Supplier not found" });

    // Format response with title case
    const formattedSupplier = formatSupplierResponse(updatedSupplier);

    res.json({
      message: `Supplier <b>${toTitleCase(updatedSupplier.name)}</b> updated successfully.`,
      supplier: formattedSupplier,
      ok: true,
    });
  } catch (err) {
    res.status(400).json({ message: "Invalid data", error: err.message });
  }
});

/* ----------------------------- DELETE Supplier ----------------------------- */
router.delete("/suppliers/:id", async (req, res) => {
  try {
    const deleted = await Supplier.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ message: "Supplier not found" });

    res.json({
      message: `Supplier <b>${toTitleCase(deleted.name)}</b> deleted successfully.`,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* ----------------------- DELETE Multiple Suppliers ----------------------- */
router.delete("/suppliers", async (req, res) => {
  try {
    let ids = [];

    // Handle both array of strings and array of objects with id property
    if (Array.isArray(req.body.ids)) {
      if (req.body.ids.length > 0 && typeof req.body.ids[0] === "object") {
        // Array of objects with id property
        ids = req.body.ids.map((item) => item.id).filter(Boolean);
      } else {
        // Array of strings
        ids = req.body.ids;
      }
    }

    if (ids.length === 0) {
      return res
        .status(400)
        .json({ message: "No supplier IDs provided.", ok: false });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res
        .status(400)
        .json({ message: "Invalid supplier ID(s) provided.", ok: false });
    }

    const result = await Supplier.deleteMany({ _id: { $in: validIds } });

    res.json({
      message: `${result.deletedCount} supplier(s) deleted successfully.`,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* ----------------------------- EXCEL Import ----------------------------- */
router.post("/suppliers/import", async (req, res) => {
  try {
    const suppliers = req.body;

    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return res.status(400).json({
        message: "Invalid or empty data. Expected an array of suppliers.",
        ok: false,
      });
    }

    const results = [];
    const importErrors = [];
    const warnings = [];

    for (let [index, supplier] of suppliers.entries()) {
      try {
        // Normalize field names and convert to lowercase
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
          importErrors.push(`Row ${index + 1}: Missing supplier name`);
          continue;
        }

        if (!address) {
          importErrors.push(`Row ${index + 1}: Missing address`);
          continue;
        }

        // Parse dates
        let siteRegistrationDate = null;
        if (supplier.siteRegistrationDate) {
          siteRegistrationDate = new Date(supplier.siteRegistrationDate);
          if (isNaN(siteRegistrationDate.getTime())) {
            // Try parsing as Excel serial date
            if (typeof supplier.siteRegistrationDate === 'number') {
              siteRegistrationDate = excelDateToJSDate(supplier.siteRegistrationDate);
            } else {
              siteRegistrationDate = parseDateString(supplier.siteRegistrationDate.toString());
            }
            
            if (!siteRegistrationDate || isNaN(siteRegistrationDate.getTime())) {
              siteRegistrationDate = new Date(); // Default to current date
              warnings.push(`Row ${index + 1}: Invalid registration date, using current date`);
            }
          }
        } else {
          siteRegistrationDate = new Date(); // Default to current date
          warnings.push(`Row ${index + 1}: Site registration date not provided, using current date`);
        }

        let siteRegistrationExpiryDate = null;
        if (supplier.siteRegistrationExpiryDate) {
          siteRegistrationExpiryDate = new Date(supplier.siteRegistrationExpiryDate);
          
          if (isNaN(siteRegistrationExpiryDate.getTime())) {
            // Try different parsing methods
            if (typeof supplier.siteRegistrationExpiryDate === 'number') {
              siteRegistrationExpiryDate = excelDateToJSDate(supplier.siteRegistrationExpiryDate);
            } else {
              siteRegistrationExpiryDate = parseDateString(supplier.siteRegistrationExpiryDate.toString());
            }
            
            if (!siteRegistrationExpiryDate || isNaN(siteRegistrationExpiryDate.getTime())) {
              // Default to 1 year from registration date
              siteRegistrationExpiryDate = new Date(siteRegistrationDate);
              siteRegistrationExpiryDate.setFullYear(siteRegistrationExpiryDate.getFullYear() + 1);
              warnings.push(`Row ${index + 1}: Invalid expiry date, defaulting to 1 year from registration date`);
            }
          }
        } else {
          // Default to 1 year from registration date
          siteRegistrationExpiryDate = new Date(siteRegistrationDate);
          siteRegistrationExpiryDate.setFullYear(siteRegistrationExpiryDate.getFullYear() + 1);
          warnings.push(`Row ${index + 1}: Expiry date not provided, defaulting to 1 year from registration date`);
        }

        const mappedSupplier = {
          name: name.toLowerCase(),
          address: address.toLowerCase(),
          siteRegistrationDate,
          siteRegistrationExpiryDate,
          enabled: true,
        };

        // Check if supplier already exists (case-insensitive name match)
        const exists = await Supplier.findOne({
          name: { $regex: new RegExp(`^${mappedSupplier.name}$`, "i") },
        });

        if (exists) {
          results.push({
            supplier: toTitleCase(mappedSupplier.name),
            status: "skipped",
            message: `Supplier "${toTitleCase(mappedSupplier.name)}" already exists.`,
          });
        } else {
          await Supplier.create(mappedSupplier);
          results.push({
            supplier: toTitleCase(mappedSupplier.name),
            status: "created",
            message: `Supplier "${toTitleCase(mappedSupplier.name)}" imported successfully.`,
          });
        }
      } catch (err) {
        importErrors.push(`Row ${index + 1}: ${err.message}`);
        console.error(`Error importing row ${index + 1}:`, err);
      }
    }

    const createdCount = results.filter((r) => r.status === "created").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    let message = `${createdCount} supplier(s) imported successfully.`;
    if (skippedCount > 0) {
      message += ` ${skippedCount} supplier(s) skipped (already exist).`;
    }
    if (warnings.length > 0) {
      message += ` ${warnings.length} row(s) had date warnings.`;
    }
    if (importErrors.length > 0) {
      message += ` ${importErrors.length} row(s) had errors.`;
    }

    return res.status(200).json({
      message,
      results,
      warnings: warnings.slice(0, 10), // Limit warnings to first 10
      errors: importErrors,
      createdCount,
      skippedCount,
      warningCount: warnings.length,
      errorCount: importErrors.length,
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