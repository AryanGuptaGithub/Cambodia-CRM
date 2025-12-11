// routes/master/supplier.js
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

/* ------------------------------- GET All ------------------------------- */
router.get("/suppliers", async (_, res) => {
  try {
    const suppliers = await Supplier.find();
    res.json(suppliers);
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
    res.json(supplier);
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
    if (
      !name ||
      !address ||
      !siteRegistrationDate ||
      !siteRegistrationExpiryDate
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided." });
    }

    const payload = {
      name: name.trim(),
      address: address.trim(),
      siteRegistrationDate: new Date(siteRegistrationDate),
      siteRegistrationExpiryDate: new Date(siteRegistrationExpiryDate),
      enabled: enabled === true || enabled === "enabled",
    };

    const newSupplier = new Supplier(payload);
    const savedSupplier = await newSupplier.save();

    res.status(201).json({
      message: `Supplier <b>${savedSupplier.name}</b> created successfully.`,
      supplier: savedSupplier,
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
    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedSupplier)
      return res.status(404).json({ message: "Supplier not found" });

    res.json({
      message: `Supplier <b>${updatedSupplier.name}</b> updated successfully.`,
      supplier: updatedSupplier,
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
      message: `Supplier <b>${deleted.name}</b> deleted successfully.`,
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

// ✅ Convert Excel serial date to JS Date safely
const excelDateToJSDate = (value) => {
  if (!value) return null;

  if (typeof value === "number") {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + value * 86400000);
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/* ----------------------------- EXCEL Import ----------------------------- */
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
        // Normalize field names for different Excel formats
        const name = (
          supplier.supplierName ||
          supplier.name ||
          supplier["Supplier Name"] ||
          supplier["supplier name"] ||
          supplier["Supplier"] ||
          ""
        )
          .toString()
          .trim();

        const address = (
          supplier.address ||
          supplier.Address ||
          supplier["Address"] ||
          ""
        )
          .toString()
          .trim();

        // Handle missing siteRegistrationDate - set to current date with warning
        let siteRegistrationDate = null;
        if (supplier.siteRegistrationDate) {
          siteRegistrationDate = new Date(supplier.siteRegistrationDate);
          if (isNaN(siteRegistrationDate.getTime())) {
            siteRegistrationDate = new Date(); // Default to current date
            warnings.push(
              `Row ${index + 1}: Invalid registration date, using current date`
            );
          }
        } else {
          siteRegistrationDate = new Date(); // Default to current date
          warnings.push(
            `Row ${
              index + 1
            }: Site registration date not provided, using current date`
          );
        }

        // Handle siteRegistrationExpiryDate - allow empty but default to 1 year from now
        let siteRegistrationExpiryDate = null;
        if (supplier.siteRegistrationExpiryDate) {
          const expiryStr = supplier.siteRegistrationExpiryDate
            .toString()
            .trim();

          // Try different date formats
          if (expiryStr.includes("/")) {
            // DD/MM/YYYY format
            const parts = expiryStr.split("/");
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              siteRegistrationExpiryDate = new Date(year, month, day);
            }
          } else if (expiryStr.includes("-")) {
            // YYYY-MM-DD format
            siteRegistrationExpiryDate = new Date(expiryStr);
          } else {
            // Try parsing as is
            siteRegistrationExpiryDate = new Date(expiryStr);
          }

          if (
            !siteRegistrationExpiryDate ||
            isNaN(siteRegistrationExpiryDate.getTime())
          ) {
            // Default to 1 year from registration date if invalid
            siteRegistrationExpiryDate = new Date(siteRegistrationDate);
            siteRegistrationExpiryDate.setFullYear(
              siteRegistrationExpiryDate.getFullYear() + 1
            );
            warnings.push(
              `Row ${
                index + 1
              }: Invalid expiry date, defaulting to 1 year from registration date`
            );
          }
        } else {
          // Default to 1 year from registration date if not provided
          siteRegistrationExpiryDate = new Date(siteRegistrationDate);
          siteRegistrationExpiryDate.setFullYear(
            siteRegistrationExpiryDate.getFullYear() + 1
          );
          warnings.push(
            `Row ${
              index + 1
            }: Expiry date not provided, defaulting to 1 year from registration date`
          );
        }

        // Validate required fields
        if (!name) {
          importErrors.push(`Row ${index + 1}: Missing supplier name`);
          continue;
        }

        if (!address) {
          importErrors.push(`Row ${index + 1}: Missing address`);
          continue;
        }

        const mappedSupplier = {
          name,
          address,
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
            supplier: mappedSupplier.name,
            status: "skipped",
            message: `Supplier "${mappedSupplier.name}" already exists.`,
          });
        } else {
          await Supplier.create(mappedSupplier);
          results.push({
            supplier: mappedSupplier.name,
            status: "created",
            message: `Supplier "${mappedSupplier.name}" imported successfully.`,
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
      message += ` ${warnings.length} row(s) had missing/invalid dates - defaults applied.`;
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
