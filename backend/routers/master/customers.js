import express from "express";
import Customer from "../../models/master/customer.js";
import Province from "../../models/master/Province.js";
import MedicalRep from "../../models/staffMember/staff.js"

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

router.post("/customers/import", async (req, res) => {
  try {
    const customers = req.body;

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        message: "No customers found in the uploaded file.",
        ok: false,
      });
    }

    // Fetch all MRs to map name → _id
    const mrList = await MedicalRep.find().select(
      "medicalRepName _id staffName"
    );
    const mrMap = new Map();
    mrList.forEach((mr) => {
      const name = (mr.medicalRepName || mr.staffName || "")
        .trim()
        .toLowerCase();
      if (name) mrMap.set(name, mr._id);
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

    // Convert all fields to safe strings + map MR
    const newCustomers = customers.map((item, idx) => {
      const mrName = safeStr(item.medicalRepName).trim().toLowerCase();
      const medicalRepId = mrMap.get(mrName) || null;

      return {
        customerCode: (nextCode + idx).toString().padStart(4, "0"),
        date: item.date ? new Date(item.date) : new Date(),
        medicalRepName: safeStr(item.medicalRepName),
        medicalRepId, // Critical: Must be ObjectId or null
        name: safeStr(item.name),
        typeOfBusiness: safeStr(item.typeOfBusiness),
        customerNumber: safeStr(item.customerNumber),
        address: safeStr(item.customerAddress),
        zone: safeStr(item.zone),
        province: safeStr(item.province),
        remark: safeStr(item.remark),
        isNew: true,
        enabled: true,
      };
    });

    // Filter out empty names
    const validCustomers = newCustomers.filter((c) => c.name && c.medicalRepId);

    if (validCustomers.length === 0) {
      return res.status(400).json({
        message: "No valid customers to import (missing name or MR not found).",
        ok: false,
      });
    }

    // Check duplicate customer numbers in DB
    const importedNumbers = validCustomers
      .map((c) => c.customerNumber)
      .filter((n) => n);

    if (importedNumbers.length > 0) {
      const existing = await Customer.find({
        customerNumber: { $in: importedNumbers },
      }).select("customerNumber name");

      if (existing.length > 0) {
        const dup = existing[0];
        return res.status(400).json({
          message: `Customer with mobile number <b style="color:#EF4444">${dup.customerNumber}</b> already exists.`,
          duplicateNumber: dup.customerNumber,
          existingCustomer: dup.name,
          ok: false,
        });
      }
    }

    // Check duplicate names
    const existingNames = await Customer.find({
      name: { $in: validCustomers.map((c) => c.name) },
    }).select("name");

    const existingNameSet = new Set(existingNames.map((c) => c.name));
    const uniqueCustomers = validCustomers.filter(
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
      skippedCount: validCustomers.length - inserted.length,
      ok: true,
    });
  } catch (err) {
    console.error("Import error:", err); // Log full error

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
