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

// ✅ GET all customers
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
      count: provinces.length,
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

// ✅ GET customers by province (optional: if you need to filter by province)
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

// ✅ GET customer by ID - THIS SHOULD COME AFTER SPECIFIC ROUTES
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
router.post("/customers", async (req, res) => {
  try {
    const newCustomer = new Customer(req.body);
    const savedCustomer = await newCustomer.save();
    res.status(201).json({
      message: `Customer <b>${savedCustomer.name}</b> created successfully`,
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

// ✅ POST import customers (bulk)
router.post("/customers/import", async (req, res) => {
  try {
    const customers = req.body;
    if (!Array.isArray(customers)) {
      return res.status(400).json({
        message: "Invalid data format. Expected an array of customers.",
      });
    }

    for (const customer of customers) {
      try {
        await Customer.create(customer);
      } catch (err) {
        if (err.code === 11000) return handleDuplicateError(res, err);
        return res.status(400).json({
          message: "Invalid data provided",
          error: err.message,
          ok: false,
        });
      }
    }

    res.status(200).json({ message: "Customers imported successfully." });
  } catch (err) {
    handleServerError(res, err, "Failed to import customers");
  }
});

export default router;
