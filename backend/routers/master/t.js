import express from "express";
import mongoose from "mongoose";
import Customer from "../../models/master/customer.js";
import Province from "../../models/master/Province.js";
import MedicalRep from "../../models/staffMember/staff.js";

const router = express.Router();

/* =========================================================
   COMMON HELPERS
========================================================= */

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
    message: `A customer with this ${field} already exists (${value})`,
    field,
    ok: false,
  });
};

const safeStr = (val) => (val == null ? "" : String(val).trim());

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const parseCustomerDate = (dateInput) => {
  if (!dateInput) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  }

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split("-");
    return new Date(+year, +month - 1, +day, 12);
  }

  const parsed = new Date(dateInput);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
  }

  return new Date();
};

const formatDateForResponse = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
};

const formatCustomerResponse = (customer) => {
  if (!customer) return customer;

  const obj = customer.toObject ? customer.toObject() : customer;

  return {
    ...obj,
    name: toTitleCase(obj.name),
    typeOfBusiness: toTitleCase(obj.typeOfBusiness),
    medicalRepName: toTitleCase(obj.medicalRepName),
    address: toTitleCase(obj.address),
    zone: toTitleCase(obj.zone),
    province: toTitleCase(obj.province),
    remark: toTitleCase(obj.remark),
    date: formatDateForResponse(obj.date)
  };
};

const generateNextCustomerCode = async () => {
  try {
    const last = await Customer.findOne({})
      .sort({ createdAt: -1 })
      .select("customerCode");

    let nextCode = 1;

    if (last?.customerCode) {
      const match = last.customerCode.match(/\d+/);
      if (match) nextCode = parseInt(match[0]) + 1;
    }

    return nextCode.toString().padStart(5, "0");
  } catch (err) {
    console.error("Code generation error:", err);
    return "00001";
  }
};

/* 1️⃣ IMPORT CUSTOMERS */
router.post("/customers/import", async (req, res) => {
  try {
    const customers = req.body;
    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({ message: "No customers found.", ok: false });
    }

    const mrList = await MedicalRep.find().select("medicalRepName staffName userId");
    const mrMap = new Map();

    mrList.forEach(mr => {
      if (mr.medicalRepName)
        mrMap.set(safeStr(mr.medicalRepName).toLowerCase(), mr.userId?.toString());
      if (mr.staffName)
        mrMap.set(safeStr(mr.staffName).toLowerCase(), mr.userId?.toString());
    });

    const lastCustomer = await Customer.findOne({}).sort({ createdAt: -1 });
    let nextCode = 1;

    if (lastCustomer?.customerCode) {
      const match = lastCustomer.customerCode.match(/\d+/);
      if (match) nextCode = parseInt(match[0]) + 1;
    }

    const newCustomers = [];

    for (let i = 0; i < customers.length; i++) {
      const item = customers[i];
      const name = safeStr(item.name).toLowerCase();
      if (!name) continue;

      const customerCode = (nextCode + newCustomers.length)
        .toString()
        .padStart(5, "0");

      newCustomers.push({
        customerCode,
        name,
        customerNumber: safeStr(item.customerNumber),
        medicalRepName: safeStr(item.medicalRepName).toLowerCase(),
        date: parseCustomerDate(item.date),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const inserted = await Customer.insertMany(newCustomers, { ordered: false });

    res.json({
      message: `Imported ${inserted.length} customers`,
      ok: true,
    });

  } catch (err) {
    handleServerError(res, err, "Import failed");
  }
});

/* 2️⃣ CREATE CUSTOMER */
router.post("/customers", async (req, res) => {
  try {
    const { customerNumber, date, ...data } = req.body;

    const customerCode = await generateNextCustomerCode();

    const exists = await Customer.findOne({ customerNumber });
    if (exists) {
      return res.status(400).json({
        message: "Customer number already exists",
        ok: false,
      });
    }

    const customer = new Customer({
      ...data,
      customerCode,
      name: data.name?.toLowerCase(),
      customerNumber: safeStr(customerNumber),
      date: parseCustomerDate(date),
    });

    const saved = await customer.save();

    res.status(201).json({
      message: "Customer created",
      customer: formatCustomerResponse(saved),
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 3️⃣ UPDATE CUSTOMER */
router.put("/customers/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID", ok: false });
    }

    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }

    res.json({ customer: formatCustomerResponse(updated), ok: true });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 4️⃣ DROPDOWN (MUST BE BEFORE :id) */
router.get("/customers/dropdown", async (req, res) => {
  try {
    const { search = "" } = req.query;

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { customerCode: { $regex: search, $options: "i" } },
        { customerNumber: { $regex: search, $options: "i" } },
      ];
    }

    const customers = await Customer.find(query)
      .select("_id name customerCode customerNumber")
      .sort({ name: 1 });

    res.json({ customers, total: customers.length, ok: true });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 5️⃣ GET ALL WITH PAGINATION */
router.get("/customers", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const total = await Customer.countDocuments();
    const customers = await Customer.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      customers: customers.map(formatCustomerResponse),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 6️⃣ PROVINCES */
router.get("/customers/provinces", async (req, res) => {
  try {
    const provinces = await Province.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: provinces });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 7️⃣ BY PROVINCE */
router.get("/customers/province/:province", async (req, res) => {
  try {
    const customers = await Customer.find({
      province: new RegExp(req.params.province, "i"),
    });

    res.json({
      success: true,
      data: customers.map(formatCustomerResponse),
      count: customers.length,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 8️⃣ GET BY ID (MUST BE LAST GET ROUTE) */
router.get("/customers/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid customer ID", ok: false });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }

    res.json({ customer: formatCustomerResponse(customer), ok: true });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 9️⃣ DELETE SINGLE */
router.delete("/customers/:id", async (req, res) => {
  try {
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }
    res.json({ message: "Customer deleted", ok: true });
  } catch (err) {
    handleServerError(res, err);
  }
});

/* 🔟 DELETE MULTIPLE */
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
