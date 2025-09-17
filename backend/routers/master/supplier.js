// routers/master/supplier.js
import express from "express";
import Supplier from "../../models/master/supplier.js";


const router = express.Router();

// ✅ Utility: Handle standard errors
const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("❌ [ERROR]:", err);
  res.status(code).json({ message, error: err.message || err });
};

// ✅ Utility: Handle duplicate key error
const handleDuplicateError = (res, err, entity = "supplier") => {
  const field = Object.keys(err.keyPattern || {})[0] || "field";
  const value = err.keyValue?.[field] || "unknown";
  return res.status(400).json({
    message: `A ${entity} with this ${field} <b style="color:#EF4444">${value}</b> already exists.`,
    field,
    ok: false,
  });
};

// ✅ Utility: Validate required fields
const validateRequiredFields = (obj, required = []) => {
  return required.every((key) => obj[key] !== undefined && obj[key] !== "");
};

// ✅ Route: Get all suppliers
router.get("/suppliers", async (_, res) => {
  try {
    const suppliers = await Supplier.find();
    res.json(suppliers);
  } catch (err) {
    handleServerError(res, err);
  }
});

// ✅ Route: Get supplier by ID
router.get("/suppliers/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    res.json(supplier);
  } catch (err) {
    handleServerError(res, err);
  }
});

// ✅ Route: Create supplier
router.post("/suppliers", async (req, res) => {
  try {
    const payload = {
      ...req.body,
      openingBalance: Number(req.body.openingBalance) || 0,
      creditPeriod: Number(req.body.creditPeriod) || 0,
      creditLimit: Number(req.body.creditLimit) || 0,
    };

    const newSupplier = new Supplier(payload);
    const savedSupplier = await newSupplier.save();

    res.status(201).json({
      message: `Supplier <b>${savedSupplier.name}</b> created successfully`,
      ok: true,
    });
  } catch (err) {
    if (err.code === 11000) return handleDuplicateError(res, err, "supplier");
    res.status(400).json({ message: "Invalid data provided", error: err.message, ok: false });
  }
});

// ✅ Route: Update supplier
router.put("/suppliers/:id", async (req, res) => {
  try {
    const updatedSupplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedSupplier) return res.status(404).json({ message: "Supplier not found" });

    res.json(updatedSupplier);
  } catch (err) {
    res.status(400).json({ message: "Invalid data", error: err.message });
  }
});

// ✅ Route: Delete one supplier
router.delete("/suppliers/:id", async (req, res) => {
  try {
    const deleted = await Supplier.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Supplier not found" });

    res.json({
      message: `Supplier <b>${deleted.name}</b> deleted successfully`,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

// ✅ Route: Bulk delete suppliers
router.delete("/suppliers", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No supplier IDs provided" });
    }

    const result = await Supplier.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} supplier(s) deleted successfully`,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

router.post("/suppliers/import", async (req, res) => {
  try {
    const suppliers = req.body;
    if (!Array.isArray(suppliers)) {
      return res.status(400).json({
        message: "Invalid data format. Expected an array of suppliers.",
      });
    }

    // Required fields only mrName and teamName now
    const requiredFields = ["mrName", "teamName"];

    for (const supplier of suppliers) {
      for (const field of requiredFields) {
        if (
          !supplier.hasOwnProperty(field) ||
          supplier[field] === undefined ||
          supplier[field] === null ||
          supplier[field] === ""
        ) {
          return res.status(400).json({
            message: `Missing required field '${field}' in one or more records.`,
          });
        }
      }

      // Map input to schema fields
      const supplierData = {
        medicalRepName: supplier.mrName,
        name: supplier.teamName,  // assuming teamName goes into "name" field
      };
      const existingSupplier = await Supplier.findOne({
        medicalRepName: supplierData.medicalRepName,
        name: supplierData.name,
      });

      if (!existingSupplier) {
        await Supplier.create(supplierData);
      }
    }

    res.status(200).json({ message: "Supplier(s) imported successfully." });
  } catch (err) {
      console.log('values of err', err);
  }
});


export default router;
