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

router.get("/suppliers/all", async (req, res) => {
  try {
    const { search = "" } = req.query;
    
    // Build search query
    const searchQuery = {};
    if (search && search.trim() !== "") {
      const searchLower = search.trim().toLowerCase();
      searchQuery.$or = [
        { name: { $regex: searchLower, $options: "i" } },
        { supplierName: { $regex: searchLower, $options: "i" } },
        { address: { $regex: searchLower, $options: "i" } }
      ];
    }

    // Get all suppliers without pagination (for dropdowns)
    const suppliers = await Supplier.find(searchQuery)
      .select("_id name supplierName address contact email")
      .sort({ name: 1 });

    // Format suppliers
    const formattedSuppliers = suppliers.map(supplier => ({
      _id: supplier._id,
      name: supplier.name || "",
      supplierName: supplier.supplierName || supplier.name || "",
      address: supplier.address || "",
      contact: supplier.contact || "",
      email: supplier.email || ""
    }));

    res.json(formattedSuppliers); // Returns array directly
  } catch (err) {
    handleServerError(res, err);
  }
});

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
      const searchLower = search.trim().toLowerCase();
      searchQuery.$or = [
        { name: { $regex: searchLower, $options: "i" } },
        { supplierName: { $regex: searchLower, $options: "i" } },
        { address: { $regex: searchLower, $options: "i" } }
      ];
    }

    // Get total count for pagination
    const total = await Supplier.countDocuments(searchQuery);

    // Get paginated suppliers
    const suppliers = await Supplier.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Format suppliers
    const formattedSuppliers = suppliers.map(supplier => formatSupplierResponse(supplier));

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

/* ------------------------------- GET by ID ------------------------------ */
router.get("/suppliers/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    res.json({
      success: true,
      supplier: formatSupplierResponse(supplier),
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* ----------------------------- CREATE Supplier ----------------------------- */
router.post("/suppliers", async (req, res) => {
  try {
    const { name, supplierName, address, contact, email, gstNumber, panNumber } = req.body;

    // Check for duplicates
    const existingSupplier = await Supplier.findOne({
      $or: [
        { name: name?.trim() },
        { supplierName: supplierName?.trim() },
        { email: email?.trim() },
        { contact: contact?.trim() }
      ]
    });

    if (existingSupplier) {
      return res.status(400).json({
        success: false,
        message: "Supplier with similar details already exists",
      });
    }

    const newSupplier = new Supplier({
      name: name?.trim(),
      supplierName: supplierName?.trim(),
      address: address?.trim(),
      contact: contact?.trim(),
      email: email?.trim().toLowerCase(),
      gstNumber: gstNumber?.trim(),
      panNumber: panNumber?.trim(),
    });

    await newSupplier.save();

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      supplier: formatSupplierResponse(newSupplier),
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* ----------------------------- UPDATE Supplier ----------------------------- */
router.put("/suppliers/:id", async (req, res) => {
  try {
    const { name, supplierName, address, contact, email, gstNumber, panNumber } = req.body;

    // Check if supplier exists
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Update supplier
    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      {
        name: name?.trim(),
        supplierName: supplierName?.trim(),
        address: address?.trim(),
        contact: contact?.trim(),
        email: email?.trim().toLowerCase(),
        gstNumber: gstNumber?.trim(),
        panNumber: panNumber?.trim(),
      },
      { new: true, runValidators: true }
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

/* ----------------------------- DELETE Supplier ----------------------------- */
router.delete("/suppliers/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    await Supplier.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Supplier deleted successfully",
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

router.delete("/suppliers", async (req, res) => {
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