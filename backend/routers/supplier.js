const express = require("express");
const router = express.Router();
const Supplier = require("../models/supplier");

// ✅ Utility: Common error handler
const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("❌ [ERROR]:", err);
  res.status(code).json({ message, error: err.message || err });
};

// ✅ Utility: Duplicate key error handler
const handleDuplicateError = (res, err) => {
  let duplicateField = "field";
  let duplicateValue = "value";

  try {
    duplicateField = Object.keys(err.keyPattern || {})[0];
    duplicateValue = err.keyValue?.[duplicateField] || "Unknown";
  } catch (parseErr) {
    console.error("❌ Error parsing duplicate key info:", parseErr);
  }

  return res.status(400).json({
    message: `A customer with this ${duplicateField} <b style="color:#EF4444">${duplicateValue}</b> already exists.`,
    field: duplicateField,
    ok: false,
  });
};

router.get("/suppliers", async (req, res) => {
  try {
    const supplier = await Supplier.find();
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/suppliers/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier)
      return res.status(404).json({ message: "Supplier not found" });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/suppliers", async (req, res) => {
  try {
    req.body.openingBalance = Number(req.body.openingBalance) || 0;
    req.body.creditPeriod = Number(req.body.creditPeriod) || 0;
    req.body.creditLimit = Number(req.body.creditLimit) || 0;

    const newSupplier = new Supplier(req.body);
    const savedSupplier = await newSupplier.save();

    res.status(201).json({
      message: `Supplier <b>${savedSupplier.name}</b> created successfully`,
      ok: true,
    });
  } catch (err) {

    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyPattern)[0]; 
      const duplicateValue = err.keyValue[duplicateField];  

      return res.status(400).json({
        message: `A supplier with this ${duplicateField} <b style="color:#EF4444">${duplicateValue}</b> already exists.`,
        field: duplicateField,
        ok: false,
      });
    }

    res.status(400).json({
      message: "Invalid data provided",
      error: err.message,
      ok: false,
    });
  }
});

router.put("/suppliers/:id", async (req, res) => {
  try {
    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedSupplier)
      return res.status(404).json({ message: "Supplier not found" });
    res.json(updatedSupplier);
  } catch (err) {
    res.status(400).json({ message: "Invalid data", error: err.message });
  }
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    const deletedSupplier = await Supplier.findByIdAndDelete(req.params.id);

    if (!deletedSupplier)
      return res.status(404).json({ message: "Supplier not found" });
    res.json({
      message: `Supplier <b>${deletedSupplier.name}</b> deleted successfully`,
      Ok: true,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", Ok: false });
  }
});

router.delete("/suppliers", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No Suppiler IDs provided" });
    }

    const result = await Supplier.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} Supplier(s) deleted successfully`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Import customers from Excel
router.post("/suppliers/import", async (req, res) => {
  try {
    const suppilers = req.body;
    if (!Array.isArray(suppilers)) {
      return res
        .status(400)
        .json({
          message: "Invalid data format. Expected an array of customers.",
        });
    }

    for (const suppiler of suppilers) {
      if (
        !suppiler.name ||
        !suppiler.phone ||
        !suppiler.email ||
        !suppiler.warehouse
      ) {
        return res
          .status(400)
          .json({ message: "Missing required fields in one or more records." });
      }

      await Supplier.create(suppiler);
    }

    res.status(200).json({ message: "Supplier imported successfully." });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Failed to import supplier." });
  }
});

module.exports = router;
