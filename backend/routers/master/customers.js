import express from "express";
import Customer from "../../models/master/customer.js";
import Province from "../../models/master/Province.js";
import MedicalRep from "../../models/staffMember/staff.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import XLSX from "xlsx";

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

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Parse any date input into a Date object set to UTC noon.
 */
const parseCustomerDate = (dateInput) => {
  let year, month, day;

  if (!dateInput) {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth();
    day = now.getUTCDate();
  } else if (dateInput instanceof Date) {
    year = dateInput.getUTCFullYear();
    month = dateInput.getUTCMonth();
    day = dateInput.getUTCDate();
  } else if (typeof dateInput === "string") {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10) - 1;
      day = parseInt(match[3], 10);
    } else {
      const parsed = new Date(dateInput);
      if (!isNaN(parsed.getTime())) {
        year = parsed.getUTCFullYear();
        month = parsed.getUTCMonth();
        day = parsed.getUTCDate();
      } else {
        const now = new Date();
        year = now.getUTCFullYear();
        month = now.getUTCMonth();
        day = now.getUTCDate();
      }
    }
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth();
    day = now.getUTCDate();
  }

  return new Date(Date.UTC(year, month, day, 12, 0, 0));
};

/**
 * Format a Date object to YYYY-MM-DD using UTC components.
 */
const formatDateForResponse = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    date: formatDateForResponse(obj.date),
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
      if (match) {
        const parsed = parseInt(match[0], 10);
        if (!isNaN(parsed)) nextCode = parsed + 1;
      }
    }
    return nextCode.toString().padStart(5, "0");
  } catch {
    return "00001";
  }
};

const generateCustomerKey = (customer) => {
  const {
    name = "",
    date,
    medicalRepName = "",
    typeOfBusiness = "",
    customerNumber = "",
    address = "",
    zone = "",
    province = "",
    remark = "",
  } = customer;
  const dateStr =
    date instanceof Date ? formatDateForResponse(date) : date || "";
  return JSON.stringify({
    name: safeStr(name).toLowerCase(),
    date: dateStr,
    medicalRepName: safeStr(medicalRepName).toLowerCase(),
    typeOfBusiness: safeStr(typeOfBusiness).toLowerCase(),
    customerNumber: safeStr(customerNumber),
    address: safeStr(address).toLowerCase(),
    zone: safeStr(zone).toLowerCase(),
    province: safeStr(province).toLowerCase(),
    remark: safeStr(remark).toLowerCase(),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

router.get("/dropdown", async (req, res) => {
  try {
    const { search = "" } = req.query;
    const query = {};
    if (search.trim()) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { customerCode: { $regex: search, $options: "i" } },
        { customerNumber: { $regex: search, $options: "i" } },
      ];
    }
    const customers = await Customer.find(query)
      .select("_id name customerCode customerNumber")
      .sort({ name: 1 })
      .lean();
    res.json({
      customers: customers.map((c) => ({ ...c, name: toTitleCase(c.name) })),
      total: customers.length,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err, "Failed to fetch customers dropdown");
  }
});

router.get("/provinces", async (req, res) => {
  try {
    const provinces = await Province.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: provinces });
  } catch (err) {
    handleServerError(res, err, "Failed to fetch provinces");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / – Create single customer
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { customerNumber, date, ...data } = req.body;
    const customerCode = await generateNextCustomerCode();

    const cleanData = {
      ...data,
      customerCode,
      name: data.name ? data.name.toLowerCase() : "",
      typeOfBusiness: data.typeOfBusiness
        ? data.typeOfBusiness.toLowerCase()
        : "",
      medicalRepName: data.medicalRepName
        ? data.medicalRepName.toLowerCase()
        : "",
      address: data.address ? data.address.toLowerCase() : "",
      zone: data.zone ? data.zone.toLowerCase() : "",
      province: data.province ? data.province.toLowerCase() : "",
      remark: data.remark ? data.remark.toLowerCase() : "",
    };

    const cleanNumber = customerNumber ? safeStr(customerNumber) : "";

    const duplicateQuery = {
      name: cleanData.name,
      typeOfBusiness: cleanData.typeOfBusiness,
      medicalRepName: cleanData.medicalRepName,
      address: cleanData.address,
      zone: cleanData.zone,
      province: cleanData.province,
      remark: cleanData.remark,
      date: parseCustomerDate(date),
    };
    if (cleanNumber) duplicateQuery.customerNumber = cleanNumber;

    const existingFullMatch = await Customer.findOne(duplicateQuery);
    if (existingFullMatch) {
      return res.status(400).json({
        message: `A customer with exactly the same details already exists (Code: ${existingFullMatch.customerCode}).`,
        ok: false,
      });
    }

    const customer = new Customer({
      ...cleanData,
      customerNumber: cleanNumber,
      date: parseCustomerDate(date),
    });
    const saved = await customer.save();
    res.status(201).json({
      message: `Customer <b>${toTitleCase(saved.name)}</b> created with code <b>${saved.customerCode}</b>`,
      customer: formatCustomerResponse(saved),
      customerCode: saved.customerCode,
      ok: true,
    });
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern?.customerCode)
        return res
          .status(400)
          .json({
            message: `Customer with code already exists. Please try again.`,
            ok: false,
          });
      if (err.keyPattern?.customerNumber)
        return res
          .status(400)
          .json({
            message: `Customer with mobile number <b>${err.keyValue.customerNumber}</b> already exists.`,
            ok: false,
          });
      return handleDuplicateError(res, err);
    }
    res
      .status(400)
      .json({ message: "Invalid data", error: err.message, ok: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /import – Bulk import
// ✅ NEW: Accepts { customers: [], importWithCode: bool } body
//         When importWithCode=true, uses customerCode from file instead of auto-generating
// ─────────────────────────────────────────────────────────────────────────────
router.post("/import", async (req, res) => {
  try {
    // ✅ Support both old format (array) and new format ({ customers, importWithCode })
    let customers, importWithCode;
    if (Array.isArray(req.body)) {
      // backward compat: old frontend sent array directly
      customers = req.body;
      importWithCode = false;
    } else {
      customers = req.body.customers;
      importWithCode = req.body.importWithCode === true;
    }

    if (!Array.isArray(customers) || customers.length === 0) {
      return res
        .status(400)
        .json({
          message: "No customers found in the uploaded file.",
          ok: false,
        });
    }

    // 1. Fetch all MRs
    const mrList = await MedicalRep.find().select(
      "medicalRepName staffName userId",
    );
    const mrMap = new Map();
    mrList.forEach((mr) => {
      const rep = safeStr(mr.medicalRepName).toLowerCase();
      const staff = safeStr(mr.staffName).toLowerCase();
      if (rep) mrMap.set(rep, mr.userId?.toString());
      if (staff) mrMap.set(staff, mr.userId?.toString());
    });

    // 2. Get last customer code (only needed when NOT importing with code)
    let nextCode = 1;
    if (!importWithCode) {
      const lastCustomer = await Customer.findOne({})
        .sort({ createdAt: -1 })
        .select("customerCode");
      if (lastCustomer?.customerCode) {
        const match = lastCustomer.customerCode.match(/\d+/);
        if (match) {
          const parsed = parseInt(match[0], 10);
          if (!isNaN(parsed)) nextCode = parsed + 1;
        }
      }
    }

    // 3. Load existing customers for duplicate check
    const allExistingCustomers = await Customer.find(
      {},
      {
        name: 1,
        date: 1,
        medicalRepName: 1,
        typeOfBusiness: 1,
        customerNumber: 1,
        address: 1,
        zone: 1,
        province: 1,
        remark: 1,
      },
    ).lean();

    const existingCustomerKeys = new Set();
    allExistingCustomers.forEach((cust) =>
      existingCustomerKeys.add(generateCustomerKey(cust)),
    );

    // ✅ If importWithCode=true, also collect existing codes to check for duplicates
    let existingCodeSet = new Set();
    if (importWithCode) {
      const existingWithCodes = await Customer.find(
        {},
        { customerCode: 1 },
      ).lean();
      existingWithCodes.forEach((c) => {
        if (c.customerCode)
          existingCodeSet.add(c.customerCode.trim().toLowerCase());
      });
    }

    // 4. Intra-batch duplicate detection
    const rowKeyMap = new Map();
    const batchDuplicateIndices = new Set();
    customers.forEach((item, idx) => {
      const key = generateCustomerKey(item);
      if (rowKeyMap.has(key)) {
        batchDuplicateIndices.add(idx);
        batchDuplicateIndices.add(rowKeyMap.get(key));
      } else {
        rowKeyMap.set(key, idx);
      }
    });

    // ✅ Intra-batch duplicate code detection (when importWithCode=true)
    const batchCodeMap = new Map();
    if (importWithCode) {
      customers.forEach((item, idx) => {
        const code = safeStr(item.customerCode).toLowerCase();
        if (code) {
          if (batchCodeMap.has(code)) {
            batchDuplicateIndices.add(idx);
            batchDuplicateIndices.add(batchCodeMap.get(code));
          } else {
            batchCodeMap.set(code, idx);
          }
        }
      });
    }

    const newCustomers = [];
    const errors = [];
    const duplicates = [];

    for (let i = 0; i < customers.length; i++) {
      const item = customers[i];
      const rowNumber = i + 1;

      try {
        const name = safeStr(item.name).toLowerCase();
        if (!name) {
          errors.push(`Row ${rowNumber}: Customer name is required`);
          continue;
        }

        const customerNumber = safeStr(item.customerNumber);

        // Full-row duplicate check against DB
        const rowKey = generateCustomerKey(item);
        if (existingCustomerKeys.has(rowKey)) {
          duplicates.push({
            row: rowNumber,
            name: item.name,
            customerNumber,
            reason:
              "Exactly the same customer already exists in database (all fields match)",
          });
          continue;
        }

        // Intra-batch duplicate check
        if (batchDuplicateIndices.has(i)) {
          duplicates.push({
            row: rowNumber,
            name: item.name,
            customerNumber,
            reason: "Duplicate row within the uploaded file",
          });
          continue;
        }

        // ✅ Customer code handling
        let customerCode;
        if (importWithCode) {
          customerCode = safeStr(item.customerCode);
          if (!customerCode) {
            errors.push(
              `Row ${rowNumber}: Customer code is required when importing with code`,
            );
            continue;
          }
          // Check if code already exists in DB
          if (existingCodeSet.has(customerCode.toLowerCase())) {
            duplicates.push({
              row: rowNumber,
              name: item.name,
              customerNumber,
              reason: `Customer code "${customerCode}" already exists in database`,
            });
            continue;
          }
        } else {
          // Auto-generate code
          customerCode = (nextCode + newCustomers.length)
            .toString()
            .padStart(5, "0");
        }

        // MR lookup
        let medicalRepId = null;
        let mrName = safeStr(item.medicalRepName).toLowerCase();
        if (!mrName) {
          mrName = "not provided";
        } else {
          medicalRepId = mrMap.get(mrName);
          if (!medicalRepId) {
            for (const [key, value] of mrMap) {
              if (key.includes(mrName) || mrName.includes(key)) {
                medicalRepId = value;
                break;
              }
            }
          }
        }

        newCustomers.push({
          customerCode,
          date: parseCustomerDate(item.date),
          medicalRepName: mrName,
          medicalRepId,
          name,
          typeOfBusiness:
            safeStr(item.typeOfBusiness).toLowerCase() || "not provided",
          customerNumber: customerNumber || "",
          address:
            safeStr(item.customerAddress).toLowerCase() || "not provided",
          zone: safeStr(item.zone).toLowerCase() || "not provided",
          province: safeStr(item.province).toLowerCase() || "not provided",
          remark: safeStr(item.remark).toLowerCase() || "not provided",
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    if (newCustomers.length === 0) {
      return res
        .status(400)
        .json({
          message: "No valid customers to import.",
          errors,
          duplicates: duplicates.slice(0, 20),
          ok: false,
        });
    }

    const inserted = await Customer.insertMany(newCustomers, {
      ordered: false,
    });

    let message = `Successfully imported ${inserted.length} customer(s).`;
    if (errors.length) message += ` ${errors.length} error(s) encountered.`;
    if (duplicates.length)
      message += ` ${duplicates.length} duplicate(s) skipped.`;

    res.status(200).json({
      message,
      importedCount: inserted.length,
      errorCount: errors.length,
      duplicateCount: duplicates.length,
      errors: errors.slice(0, 10),
      duplicates: duplicates.slice(0, 20),
      ok: true,
    });
  } catch (err) {
    console.error("Import error:", err);
    if (err.code === 11000) {
      if (err.keyPattern?.customerNumber)
        return res
          .status(400)
          .json({
            message: `Customer with mobile number <b>${err.keyValue.customerNumber}</b> already exists.`,
            duplicateNumber: err.keyValue.customerNumber,
            ok: false,
          });
      return handleDuplicateError(res, err);
    }
    if (err.name === "ValidationError") {
      const field = Object.keys(err.errors)[0];
      return res
        .status(400)
        .json({
          message: `Validation failed: ${err.errors[field].message}`,
          ok: false,
        });
    }
    handleServerError(res, err, "Failed to import customers");
  }
});

router.get("/province/:province", async (req, res) => {
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
    handleServerError(res, err, "Failed to fetch customers by province");
  }
});

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const searchQuery = {};
    if (search.trim()) {
      const s = search.trim();
      searchQuery.$or = [
        { name: { $regex: s, $options: "i" } },
        { typeOfBusiness: { $regex: s, $options: "i" } },
        { medicalRepName: { $regex: s, $options: "i" } },
        { address: { $regex: s, $options: "i" } },
        { zone: { $regex: s, $options: "i" } },
        { province: { $regex: s, $options: "i" } },
        { customerCode: { $regex: s, $options: "i" } },
        { customerNumber: { $regex: s, $options: "i" } },
        { remark: { $regex: s, $options: "i" } },
      ];
    }

    const [total, customers, nextCustomerCode] = await Promise.all([
      Customer.countDocuments(searchQuery),
      Customer.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      generateNextCustomerCode(),
    ]);

    res.json({
      customers: customers.map(formatCustomerResponse),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      nextCustomerCode,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export
// ✅ NEW: ?withCode=true includes Customer Code as the FIRST column
//         so the exported file can be re-imported with customer codes intact
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const withCode = req.query.withCode === "true";
    const customers = await Customer.find({}).lean();

    const data = customers.map((cust) => {
      const row = {};

      // ✅ Customer Code as first column when withCode=true
      if (withCode) {
        row["Customer Code"] = cust.customerCode || "";
      }

      row["Date"] = formatDateForResponse(cust.date);
      row["Medical Representative Name"] = cust.medicalRepName
        ? toTitleCase(cust.medicalRepName)
        : "";
      row["Customer Name in English"] = cust.name ? toTitleCase(cust.name) : "";
      row["Types of Business"] = cust.typeOfBusiness
        ? toTitleCase(cust.typeOfBusiness)
        : "";
      row["Customer Number"] = cust.customerNumber || "";
      row["Customer Address"] = cust.address ? toTitleCase(cust.address) : "";
      row["Zone"] = cust.zone ? toTitleCase(cust.zone) : "";
      row["Province"] = cust.province ? toTitleCase(cust.province) : "";
      row["Remark"] = cust.remark ? toTitleCase(cust.remark) : "";

      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data, {
      header: Object.keys(data[0] || {}),
    });
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=customer_list.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Failed to export customers", ok: false });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer)
      return res.status(404).json({ message: "Customer not found", ok: false });
    res.json({ customer: formatCustomerResponse(customer), ok: true });
  } catch (err) {
    if (err.name === "CastError")
      return res
        .status(400)
        .json({ message: "Invalid customer ID", ok: false });
    handleServerError(res, err);
  }
});

router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { customerNumber, date, customerCode, ...updateData } = req.body;
    if (customerCode)
      return res
        .status(400)
        .json({ message: "Customer code cannot be updated.", ok: false });

    const cleanUpdateData = {};
    Object.keys(updateData).forEach((key) => {
      cleanUpdateData[key] =
        typeof updateData[key] === "string" && key !== "customerNumber"
          ? updateData[key].toLowerCase()
          : updateData[key];
    });
    if (date) cleanUpdateData.date = parseCustomerDate(date);

    const cleanNumber = customerNumber ? safeStr(customerNumber) : "";
    if (cleanNumber) {
      const exists = await Customer.findOne({
        customerNumber: cleanNumber,
        _id: { $ne: req.params.id },
      });
      if (exists)
        return res
          .status(400)
          .json({
            message: `Customer with mobile number <b>${cleanNumber}</b> already exists.`,
            duplicateNumber: cleanNumber,
            existingCustomer: exists.name,
            ok: false,
          });
      cleanUpdateData.customerNumber = cleanNumber;
    }

    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      cleanUpdateData,
      { new: true, runValidators: true },
    );
    if (!updated)
      return res.status(404).json({ message: "Customer not found", ok: false });
    res.json({ customer: formatCustomerResponse(updated), ok: true });
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern?.customerNumber)
        return res
          .status(400)
          .json({
            message: `Customer with mobile number <b>${err.keyValue.customerNumber}</b> already exists.`,
            ok: false,
          });
      return handleDuplicateError(res, err);
    }
    res
      .status(400)
      .json({ message: "Invalid data", error: err.message, ok: false });
  }
});

router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ message: "Customer not found", ok: false });
    res.json({ message: "Customer deleted successfully", ok: true });
  } catch (err) {
    handleServerError(res, err);
  }
});

router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "No IDs provided", ok: false });
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
