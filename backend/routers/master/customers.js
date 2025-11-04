import express from "express";
import Customer from "../../models/master/customer.js";
import Province from "../../models/master/Province.js";

const router = express.Router();

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
// ✅ POST import multiple customers from Excel
router.post("/customers/import", async (req, res) => {
  try {
    const customers = req.body; // Array of customer objects from frontend
    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        message: "No customers found in the uploaded file.",
        ok: false,
      });
    }

    // ✅ Find last customerCode in DB to continue incrementing
    const lastCustomer = await Customer.findOne({})
      .sort({ createdAt: -1 })
      .select("customerCode");

    let nextCode = 1;
    if (lastCustomer && lastCustomer.customerCode) {
      const parsed = parseInt(lastCustomer.customerCode, 10);
      if (!isNaN(parsed)) nextCode = parsed + 1;
    }

    const newCustomers = customers.map((item, index) => ({
      customerCode: (nextCode + index).toString().padStart(4, "0"),
      date: item.date ? new Date(item.date) : new Date(),
      medicalRepName: item.medicalRepName || "",
      name: item.name || "",
      typeOfBusiness: item.typeOfBusiness || "",
      customerNumber: item.customerNumber || "",
      address: item.address || "",
      zone: item.zone || "",
      province: item.province || "",
      remark: item.remark || "",
      isNew: true,
      enabled: true,
    }));

    // ✅ Bulk insert with duplicate filtering
    const existingNames = await Customer.find({
      name: { $in: newCustomers.map((c) => c.name) },
    }).select("name");

    const existingNameSet = new Set(existingNames.map((c) => c.name));
    const uniqueCustomers = newCustomers.filter(
      (c) => !existingNameSet.has(c.name)
    );

    if (uniqueCustomers.length === 0) {
      return res.status(400).json({
        message: "No new customers to import (all already exist).",
        ok: false,
      });
    }

    const inserted = await Customer.insertMany(uniqueCustomers);

    res.status(200).json({
      message: `${inserted.length} customer(s) imported successfully.`,
      importedCount: inserted.length,
      skippedCount: newCustomers.length - inserted.length,
      ok: true,
    });
  } catch (err) {
    console.error("❌ Import Error:", err);
    res.status(500).json({
      message: "Failed to import customers.",
      error: err.message,
      ok: false,
    });
  }
});

router.get("/customers", async (req, res) => {
  try {
    const customers = await Customer.find();

    const agg = await Customer.aggregate([
      {
        $project: {
          customerCodeNumeric: {
            $convert: {
              input: { $trim: { input: "$customerCode" } },
              to: "int",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      {
        $sort: { customerCodeNumeric: -1 },
      },
      {
        $limit: 1,
      },
    ]);

    let nextCode = 1;
    if (agg.length > 0 && typeof agg[0].customerCodeNumeric === "number") {
      nextCode = agg[0].customerCodeNumeric + 1;
    }

    res.json({
      customers,
      nextCustomerCode: nextCode.toString(),
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

// ✅ GET provinces - MOVE THIS BEFORE THE :id ROUTE
router.get("/customers/provinces", async (req, res) => {
  try {
    const provinces = await Province.find({ isActive: true }).sort({ name: 1 });

    res.json({
      success: true,
      data: provinces,
    });
  } catch (error) {
    console.error("Error fetching provinces:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch provinces",
      error: error.message,
    });
  }
});

// ✅ GET customers by province
router.get("/customers/province/:province", async (req, res) => {
  try {
    const { province } = req.params;
    const customers = await Customer.find({
      province: new RegExp(province, "i"),
    });

    res.json({
      success: true,
      data: customers,
      count: customers.length,
    });
  } catch (error) {
    handleServerError(res, error, "Failed to fetch customers by province");
  }
});

// ✅ GET customer by ID
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(customer);
  } catch (err) {
    handleServerError(res, err);
  }
});

// ✅ POST create new customer
// ✅ POST create new customer
router.post("/customers", async (req, res) => {
  try {
    // Remove any user-sent customerCode (security)
    const { ...cleanData } = req.body;

    const newCustomer = new Customer(cleanData);
    const savedCustomer = await newCustomer.save();

    res.status(201).json({
      message: `Customer <b>${savedCustomer.name}</b> created successfully with code <b>${savedCustomer.customerCode}</b>`,
      customer: savedCustomer,
      ok: true,
    });
  } catch (err) {
    if (err.code === 11000) return handleDuplicateError(res, err);
    res.status(400).json({
      message: "Invalid data provided",
      error: err.message,
      ok: false,
    });
  }
});

// ✅ PUT update customer
router.put("/customers/:id", async (req, res) => {
  try {
    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(updatedCustomer);
  } catch (err) {
    res.status(400).json({ message: "Invalid data", error: err.message });
  }
});

// ✅ DELETE single customer
router.delete("/customers/:id", async (req, res) => {
  try {
    const deletedCustomer = await Customer.findByIdAndDelete(req.params.id);
    if (!deletedCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json({ message: "Customer deleted successfully" });
  } catch (err) {
    handleServerError(res, err);
  }
});

// ✅ DELETE multiple customers
router.delete("/customers", async (req, res) => {
  try {
    const ids = req.body.ids.map((item) => item.id);
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No customer IDs provided" });
    }

    const result = await Customer.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} customer(s) deleted successfully`,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

export default router;
