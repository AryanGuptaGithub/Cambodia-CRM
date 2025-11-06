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
      if (req.body.ids.length > 0 && typeof req.body.ids[0] === 'object') {
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

// ✅ Import suppliers from Excel
router.post("/suppliers/import", async (req, res) => {
  try {
    const suppliers = req.body;

    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return res.status(400).json({
        message: "Invalid or empty data. Expected an array of suppliers.",
        ok: false,
      });
    }

    // You can skip normalizeKeys if your keys are already in correct format,
    // or normalize only lowercase for safety but keep camelCase keys intact:
    const normalizeKeys = (obj) => {
      const newObj = {};
      for (const key in obj) {
        if (Object.hasOwn(obj, key)) {
          // Keep camelCase keys as-is (no spaces), lowercase simple keys:
          // If you want, just keep keys as they are to avoid mismatch:
          newObj[key] = obj[key];
        }
      }
      return newObj;
    };

    const requiredFields = [
      "name",
      "address",
      "siteRegistrationDate",
      "siteRegistrationExpiryDate",
    ];

    const results = [];

    for (let supplier of suppliers) {
      supplier = normalizeKeys(supplier);

      // Check missing fields for this data shape
      const missing = requiredFields.filter(
        (f) => !supplier[f] || supplier[f].toString().trim() === ""
      );
      if (missing.length > 0) {
        results.push({
          supplier: supplier["name"] || "Unnamed",
          status: "failed",
          message: `Missing required field(s): ${missing.join(", ")}.`,
        });
        continue;
      }

      // For ISO date strings just do new Date() conversion
      const mappedSupplier = {
        name: supplier["name"].trim(),
        address: supplier["address"].trim(),
        siteRegistrationDate: new Date(supplier["siteRegistrationDate"]),
        siteRegistrationExpiryDate: new Date(
          supplier["siteRegistrationExpiryDate"]
        ),
        enabled: true,
      };

      // Check if supplier already exists
      const exists = await Supplier.findOne({
        name: mappedSupplier.name,
        address: mappedSupplier.address,
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
    }

    return res.status(200).json({
      message: `${
        results.filter((r) => r.status === "created").length
      } supplier(s) imported successfully.`,
      results,
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
