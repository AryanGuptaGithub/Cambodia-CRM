import express from "express";
import Customer from "../../models/master/customer.js";
import Province from "../../models/master/Province.js";
import MedicalRep from "../../models/staffMember/staff.js";

const router = express.Router();

const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("ERROR:", err);
  res.status(code).json({ message, error: err.message || err, ok: false });
};

const handleDuplicateError = (res, err) => {
  let field = "field";
  let value = "Unknown";

  try {
    field = Object.keys(err.keyPattern || {})[0];
    value = err.keyValue?.[field] || "Unknown";
  } catch (e) {
    console.error("Parse duplicate error failed:", e);
  }

  return res.status(400).json({
    message: `A customer with this ${field} <b style="color:#EF4444">${value}</b> already exists.`,
    field,
    ok: false,
  });
};

const safeStr = (val) => (val == null ? "" : String(val).trim());

// Helper to normalize MR name for matching
const normalizeMRName = (name) => {
  if (!name) return "";
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .replace(/[.,]/g, ""); // Remove dots and commas
};

router.post("/customers/import", async (req, res) => {
  try {
    const customers = req.body;

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        message: "No customers found in the uploaded file.",
        ok: false,
      });
    }

    // Fetch all MRs including USER ID (important)
    const mrList = await MedicalRep.find().select(
      "medicalRepName staffName userId"
    );

    // Map MR Name → USER ID (NOT MR ID)
    const mrMap = new Map();
    mrList.forEach((mr) => {
      const medRepName = safeStr(mr.medicalRepName);
      const staffName = safeStr(mr.staffName);

      if (medRepName) {
        mrMap.set(medRepName.toLowerCase(), mr.userId?.toString());
      }
      if (staffName) {
        mrMap.set(staffName.toLowerCase(), mr.userId?.toString());
      }
    });

    // Get last customer code
    const lastCustomer = await Customer.findOne({})
      .sort({ createdAt: -1 })
      .select("customerCode");

    let nextCode = 1;
    if (lastCustomer?.customerCode) {
      const parsed = parseInt(lastCustomer.customerCode, 10);
      if (!isNaN(parsed)) nextCode = parsed + 1;
    }

    const newCustomers = [];

    for (let i = 0; i < customers.length; i++) {
      const item = customers[i];

      let name = safeStr(item.name);
      if (!name || name.trim() === "") {
        name = `Customer_${nextCode + newCustomers.length}_${Date.now()}`;
      }

      let date = new Date();
      if (item.date) {
        const parsedDate = new Date(item.date);
        if (!isNaN(parsedDate.getTime())) {
          date = parsedDate;
        }
      }

      // MR Name → USER ID
      let medicalRepId = null; // final field stored in DB
      let mrName = safeStr(item.medicalRepName);

      if (!mrName || mrName.trim() === "") {
        mrName = "Not Provided";
      } else {
        const mrKey = mrName.toLowerCase();
        medicalRepId = mrMap.get(mrKey);

        // Partial match fallback
        if (!medicalRepId) {
          for (const [key, value] of mrMap) {
            if (key.includes(mrKey) || mrKey.includes(key)) {
              medicalRepId = value;
              break;
            }
          }
        }
      }

      const customerNumber = safeStr(item.customerNumber);

      newCustomers.push({
        customerCode: (nextCode + newCustomers.length)
          .toString()
          .padStart(4, "0"),
        date: date.toISOString().split("T")[0],
        medicalRepName: mrName,

        // ⭐ STORE USER ID HERE (NOT MR ID)
        medicalRepId,

        name,
        typeOfBusiness: safeStr(item.typeOfBusiness) || "Not Provided",
        customerNumber: customerNumber || "",
        address: safeStr(item.customerAddress) || "Not Provided",
        zone: safeStr(item.zone) || "Not Provided",
        province: safeStr(item.province) || "Not Provided",
        remark: safeStr(item.remark) || "Not Provided",
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    if (newCustomers.length === 0) {
      return res.status(400).json({
        message: "No valid customers to import.",
        ok: false,
      });
    }

    const inserted = await Customer.insertMany(newCustomers, {
      ordered: false,
    });

    res.status(200).json({
      message: `Successfully imported ${inserted.length} customer(s).`,
      importedCount: inserted.length,
      skippedCount: 0,
      ok: true,
    });
  } catch (err) {
    console.error("Import error:", err);

    if (err.code === 11000) {
      if (err.keyPattern?.customerNumber) {
        return res.status(400).json({
          message: `Customer with mobile number <b style="color:#EF4444">${err.keyValue.customerNumber}</b> already exists.`,
          duplicateNumber: err.keyValue.customerNumber,
          ok: false,
        });
      }
      return handleDuplicateError(res, err);
    }

    if (err.name === "ValidationError") {
      const field = Object.keys(err.errors)[0];
      const msg = err.errors[field].message;
      return res.status(400).json({
        message: `Validation failed: ${msg}`,
        ok: false,
      });
    }

    handleServerError(res, err, "Failed to import customers");
  }
});

// 2. POST: Create new customer
router.post("/customers", async (req, res) => {
  try {
    const { customerNumber, ...data } = req.body;

    const cleanNumber = customerNumber ? safeStr(customerNumber) : "";

    if (cleanNumber) {
      const exists = await Customer.findOne({ customerNumber: cleanNumber });
      if (exists) {
        return res.status(400).json({
          message: `Customer with mobile number <b style="color:#EF4444">${cleanNumber}</b> already exists.`,
          duplicateNumber: cleanNumber,
          existingCustomer: exists.name,
          ok: false,
        });
      }
    }

    const customer = new Customer({ ...data, customerNumber: cleanNumber });
    const saved = await customer.save();

    res.status(201).json({
      message: `Customer <b>${saved.name}</b> created with code <b>${saved.customerCode}</b>`,
      customer: saved,
      ok: true,
    });
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern?.customerNumber) {
        return res.status(400).json({
          message: `Customer with mobile number <b style="color:#EF4444">${err.keyValue.customerNumber}</b> already exists.`,
          duplicateNumber: err.keyValue.customerNumber,
          ok: false,
        });
      }
      return handleDuplicateError(res, err);
    }
    res
      .status(400)
      .json({ message: "Invalid data", error: err.message, ok: false });
  }
});

// 3. PUT: Update customer
router.put("/customers/:id", async (req, res) => {
  try {
    const { customerNumber, ...updateData } = req.body;
    const cleanNumber = customerNumber ? safeStr(customerNumber) : "";

    if (cleanNumber) {
      const exists = await Customer.findOne({
        customerNumber: cleanNumber,
        _id: { $ne: req.params.id },
      });
      if (exists) {
        return res.status(400).json({
          message: `Customer with mobile number <b style="color:#EF4444">${cleanNumber}</b> already exists.`,
          duplicateNumber: cleanNumber,
          existingCustomer: exists.name,
          ok: false,
        });
      }
    }

    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      { ...updateData, customerNumber: cleanNumber },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }

    res.json({ customer: updated, ok: true });
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern?.customerNumber) {
        return res.status(400).json({
          message: `Customer with mobile number <b style="color:#EF4444">${err.keyValue.customerNumber}</b> already exists.`,
          duplicateNumber: err.keyValue.customerNumber,
          ok: false,
        });
      }
      return handleDuplicateError(res, err);
    }
    res
      .status(400)
      .json({ message: "Invalid data", error: err.message, ok: false });
  }
});

// 4. GET: All customers + next code
router.get("/customers", async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });

    const agg = await Customer.aggregate([
      {
        $project: {
          codeNum: {
            $convert: {
              input: { $trim: { input: "$customerCode" } },
              to: "int",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      { $sort: { codeNum: -1 } },
      { $limit: 1 },
    ]);

    let nextCode = 1;
    if (agg[0]?.codeNum) nextCode = agg[0].codeNum + 1;

    res.json({
      customers,
      nextCustomerCode: nextCode.toString().padStart(4, "0"),
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

// 5. GET: Provinces
router.get("/customers/provinces", async (req, res) => {
  try {
    const provinces = await Province.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: provinces });
  } catch (err) {
    handleServerError(res, err, "Failed to fetch provinces");
  }
});

// 6. GET: By province
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
  } catch (err) {
    handleServerError(res, err, "Failed to fetch customers by province");
  }
});

// 7. GET: By ID
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }
    res.json({ customer, ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ message: "Invalid customer ID", ok: false });
    }
    handleServerError(res, err);
  }
});

// 8. DELETE: Single
router.delete("/customers/:id", async (req, res) => {
  try {
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }
    res.json({ message: "Customer deleted successfully", ok: true });
  } catch (err) {
    handleServerError(res, err);
  }
});

// 9. DELETE: Multiple
router.delete("/customers", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided", ok: false });
    }

    const result = await Customer.deleteMany({ _id: { $in: ids } });
    res.json({
      message: `${result.deletedCount} customer(s) deleted`,
      deletedCount: result.deletedCount,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

export default router;
