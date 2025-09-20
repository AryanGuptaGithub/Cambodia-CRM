// routers/master/supplier.js
import express from "express";
import Supplier from "../../models/master/supplier.js";
import mongoose from "mongoose";

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
    const { name, address, siteRegistrationDate, siteRegistrationExpiryDate, enabled } = req.body;
    const enabledValue = enabled === "enabled" ? true: false; 

    // Validate required fields
    if (!name || !address || !siteRegistrationDate || !siteRegistrationExpiryDate || !enabled) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Prepare the payload
    const payload = {
      name,
      address,
      siteRegistrationDate,
      siteRegistrationExpiryDate,
      enabledValue,
    };

    const newSupplier = new Supplier(payload);
    const savedSupplier = await newSupplier.save();

    res.status(201).json({
      message: `Supplier ${savedSupplier.name} created successfully`,
      ok: true,
    });
  } catch (err) {

    if (err.code === 11000) {
      return res.status(409).json({
        message: "Duplicate key error",
        error: err.message,
        ok: false,
      });
    }
    if (err.name === "ValidationError") {
      const errors = Object.values(err.errors).map((e) => ({
        path: e.path,
        message: e.message,
      }));
      return res.status(400).json({ errors });
    }

    console.error(err);
    res.status(500).json({ message: "Internal Server Error", ok: false });
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

router.delete("/suppliers", async (req, res) => {
  try {
    const idObjects = req.body.ids;
    if (!Array.isArray(idObjects) || idObjects.length === 0) {
      return res.status(400).json({ message: "No supplier IDs provided", ok: false });
    }

    const stringIds = idObjects.map(obj => obj.id);
    const validIds = stringIds.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length !== stringIds.length) {
      return res.status(400).json({
        message: "One or more supplier IDs are invalid",
        ok: false,
      });
    }

    const result = await Supplier.deleteMany({ _id: { $in: validIds } });
    res.json({
      message: `${result.deletedCount} supplier(s) deleted successfully`,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err); 
  }
});

const excelDateToJSDate = (excelSerial) => {
  const epoch = new Date(1899, 11, 30); // Excel epoch
  return new Date(epoch.getTime() + excelSerial * 86400000);
};

router.post("/suppliers/import", async (req, res) => {
  try {
    const suppliers = req.body;

    if (!Array.isArray(suppliers)) {
      return res.status(400).json({
        message: "Invalid data format. Expected an array of suppliers.",
      });
    }

    const requiredFields = [
      "sr no",
      "product name",
      "address",
      "site registration date",
      "site registration expiry date",
    ];

    const results = [];

    for (const supplier of suppliers) {
      for (const field of requiredFields) {
        if (
          !supplier.hasOwnProperty(field) ||
          supplier[field] === undefined ||
          supplier[field] === null ||
          supplier[field] === ""
        ) {
          results.push({
            supplier: supplier["product name"],
            status: "failed",
            message: `Missing required field '${field}'.`,
          });
          continue;
        }
      }

      const mappedSupplier = {
        srNo: supplier["sr no"],
        name: supplier["product name"],
        address: supplier["address"],
        siteRegistrationDate: excelDateToJSDate(supplier["site registration date"]),
        siteRegistrationExpiryDate: excelDateToJSDate(supplier["site registration expiry date"]),
      };

      // Check for duplicates
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
      message: `Supplier <b> ${suppliers.length}</b> imported successfully.`,
      results,
    });
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({
      message: "Server error while importing suppliers.",
      error: err.message,
    });
  }
});

export default router;
