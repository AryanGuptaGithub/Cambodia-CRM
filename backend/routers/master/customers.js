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
  } else if (typeof dateInput === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + (dateInput - 1) * 86400000);
    year = date.getUTCFullYear();
    month = date.getUTCMonth();
    day = date.getUTCDate();
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
      .sort({ customerCode: -1 })
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

// ─── Routes ────────────────────────────────────────────────────────────────────

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

// POST / – Create single customer
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
        return res.status(400).json({
          message: `Customer with code already exists. Please try again.`,
          ok: false,
        });
      if (err.keyPattern?.customerNumber)
        return res.status(400).json({
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

// POST /import – Bulk import customers from parsed Excel/JSON data
router.post("/import", async (req, res) => {
  try {
    console.log("Import request received");
    console.log("Request body structure:", Object.keys(req.body));

    let customers,
      importWithCode = false;

    // Handle different request formats
    if (Array.isArray(req.body)) {
      customers = req.body;
      importWithCode = false;
    } else if (
      req.body &&
      req.body.customers &&
      Array.isArray(req.body.customers)
    ) {
      customers = req.body.customers;
      importWithCode = req.body.importWithCode === true;
    } else if (req.body && Array.isArray(req.body)) {
      customers = req.body;
    } else {
      console.error("Invalid request format:", req.body);
      return res.status(400).json({
        message:
          "Invalid request format. Expected array of customers or { customers: [], importWithCode: boolean }",
        ok: false,
      });
    }

    if (!customers || customers.length === 0) {
      return res.status(400).json({
        message: "No customers found in the uploaded file.",
        ok: false,
      });
    }

    console.log(
      `Processing ${customers.length} customers, importWithCode: ${importWithCode}`,
    );
    console.log("Sample customer data:", customers[0]);

    // Fetch all MRs for mapping
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

    // Always compute nextCode — needed as fallback even when importWithCode=true
    // (rows that have no customerCode in the file will get an auto-generated one)
    const highest = await Customer.findOne({})
      .sort({ customerCode: -1 })
      .select("customerCode");
    let nextCode = 1;
    if (highest?.customerCode) {
      const match = highest.customerCode.match(/\d+/);
      if (match) {
        const parsed = parseInt(match[0], 10);
        if (!isNaN(parsed)) nextCode = parsed + 1;
      }
    }

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
        customerCode: 1,
      },
    ).lean();

    const existingCustomerKeys = new Set();
    const existingCodeSet = new Set();
    allExistingCustomers.forEach((cust) => {
      existingCustomerKeys.add(generateCustomerKey(cust));
      if (cust.customerCode)
        existingCodeSet.add(cust.customerCode.toLowerCase());
    });

    const rowKeyMap = new Map();
    const batchDuplicateIndices = new Set();
    customers.forEach((item, idx) => {
      if (!item) return;
      const key = generateCustomerKey(item);
      if (rowKeyMap.has(key)) {
        batchDuplicateIndices.add(idx);
        batchDuplicateIndices.add(rowKeyMap.get(key));
      } else {
        rowKeyMap.set(key, idx);
      }
    });

    // Check for duplicate customerCodes within the batch (only for rows that actually have a code)
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

    const docsToInsert = [];
    const errors = [];
    const duplicates = [];

    for (let i = 0; i < customers.length; i++) {
      const item = customers[i];
      const rowNumber = i + 1;

      try {
        // Validate required fields
        const name = safeStr(
          item.name ||
            item["Customer Name in English"] ||
            item["Customer Name"] ||
            "",
        );
        if (!name) {
          errors.push(`Row ${rowNumber}: Customer name is required`);
          continue;
        }

        const customerNumber = safeStr(
          item.customerNumber || item["Customer Number"] || "",
        );

        // Handle address field (could be customerAddress or address)
        const address = safeStr(item.address || item.customerAddress || "");

        // Handle other fields
        const medicalRepName = safeStr(
          item.medicalRepName || item["Medical Representative Name"] || "",
        );
        const typeOfBusiness = safeStr(
          item.typeOfBusiness || item["Types of Business"] || "",
        );
        const zone = safeStr(item.zone || "");
        const province = safeStr(item.province || "");
        const remark = safeStr(item.remark || "");

        // Handle date
        let dateValue = item.date;
        if (!dateValue && item["Joining Date"])
          dateValue = item["Joining Date"];
        if (!dateValue && item.Date) dateValue = item.Date;

        const rowKey = generateCustomerKey({
          name,
          date: dateValue,
          medicalRepName,
          typeOfBusiness,
          customerNumber,
          address,
          zone,
          province,
          remark,
        });

        if (existingCustomerKeys.has(rowKey)) {
          duplicates.push({
            row: rowNumber,
            name: name,
            customerNumber: customerNumber,
            reason:
              "Exactly the same customer already exists in database (all fields match)",
          });
          continue;
        }

        if (batchDuplicateIndices.has(i)) {
          duplicates.push({
            row: rowNumber,
            name: name,
            customerNumber: customerNumber,
            reason: "Duplicate row within the uploaded file",
          });
          continue;
        }

        // ── FIX: Determine customer code ──────────────────────────────────────
        // When importWithCode=true, use the provided code if present.
        // If the row has no customerCode (or importWithCode=false), auto-generate.
        // Previously, a missing code when importWithCode=true caused an error and
        // skipped the row — now we gracefully fall back to auto-generation.
        let customerCode;
        const providedCode = importWithCode ? safeStr(item.customerCode) : "";

        if (providedCode) {
          // Use provided code but guard against DB duplicates
          customerCode = providedCode;
          if (existingCodeSet.has(customerCode.toLowerCase())) {
            duplicates.push({
              row: rowNumber,
              name: name,
              customerNumber: customerNumber,
              reason: `Customer code "${customerCode}" already exists in database`,
            });
            continue;
          }
          existingCodeSet.add(customerCode.toLowerCase());
        } else {
          // Auto-generate, skipping any codes already taken
          let candidate = nextCode.toString().padStart(5, "0");
          while (existingCodeSet.has(candidate.toLowerCase())) {
            nextCode++;
            candidate = nextCode.toString().padStart(5, "0");
          }
          customerCode = candidate;
          existingCodeSet.add(customerCode.toLowerCase());
          nextCode++;
        }
        // ── END FIX ───────────────────────────────────────────────────────────

        // MR lookup
        let medicalRepId = null;
        let mrName = medicalRepName.toLowerCase();
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

        docsToInsert.push({
          customerCode,
          date: parseCustomerDate(dateValue),
          medicalRepName: mrName,
          medicalRepId,
          name: name.toLowerCase(),
          typeOfBusiness: typeOfBusiness.toLowerCase() || "not provided",
          customerNumber: customerNumber || "",
          address: address.toLowerCase() || "not provided",
          zone: zone.toLowerCase() || "not provided",
          province: province.toLowerCase() || "not provided",
          remark: remark.toLowerCase() || "not provided",
          enabled: true,
        });
      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    if (docsToInsert.length === 0) {
      return res.status(400).json({
        message: "No valid customers to import.",
        errors: errors.slice(0, 20),
        duplicates: duplicates.slice(0, 20),
        ok: false,
      });
    }

    let insertedCount = 0;
    let dbErrors = [];

    try {
      const result = await Customer.insertMany(docsToInsert, {
        ordered: false,
      });
      insertedCount = result.length;
      console.log(`Successfully inserted ${insertedCount} customers`);
    } catch (err) {
      console.error("Bulk insert error:", err);
      if (err.name === "MongoBulkWriteError" && err.insertedDocs) {
        insertedCount = err.insertedDocs.length;
        if (err.writeErrors) {
          dbErrors = err.writeErrors.map((we) => ({
            message: we.errmsg,
            index: we.index,
          }));
        }
      } else {
        throw err;
      }
    }

    let message = `Successfully imported ${insertedCount} customer(s).`;
    if (errors.length)
      message += ` ${errors.length} validation error(s) encountered.`;
    if (duplicates.length)
      message += ` ${duplicates.length} duplicate(s) skipped.`;
    if (dbErrors.length)
      message += ` ${dbErrors.length} database error(s) encountered.`;

    res.status(200).json({
      message,
      importedCount: insertedCount,
      errorCount: errors.length,
      duplicateCount: duplicates.length,
      dbErrorCount: dbErrors.length,
      errors: errors.slice(0, 10),
      duplicates: duplicates.slice(0, 20),
      dbErrors: dbErrors.slice(0, 10),
      ok: true,
    });
  } catch (err) {
    console.error("Import error:", err);

    if (err.code === 11000) {
      if (err.keyPattern?.customerNumber) {
        return res.status(400).json({
          message: `Customer with mobile number <b>${err.keyValue.customerNumber}</b> already exists.`,
          duplicateNumber: err.keyValue.customerNumber,
          ok: false,
        });
      }
      return handleDuplicateError(res, err);
    }

    if (err.name === "ValidationError") {
      const field = Object.keys(err.errors)[0];
      return res.status(400).json({
        message: `Validation failed: ${err.errors[field].message}`,
        ok: false,
      });
    }

    handleServerError(res, err, "Failed to import customers");
  }
});

// GET all customers with pagination
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const searchQuery = {};

    if (search && search.trim()) {
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
        .collation({ locale: "en", numericOrdering: true })
        .sort({ customerCode: -1 })
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

// GET single customer
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "undefined" || id === "null") {
      return res.status(400).json({
        message: "Invalid customer ID format",
        ok: false,
      });
    }

    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    if (!isValidObjectId) {
      return res.status(400).json({
        message: "Invalid customer ID format",
        ok: false,
      });
    }

    const customer = await Customer.findById(id);

    if (!customer) {
      return res.status(404).json({
        message: "Customer not found",
        ok: false,
      });
    }

    res.json({
      customer: formatCustomerResponse(customer),
      ok: true,
    });
  } catch (err) {
    console.error("Error fetching customer:", err);

    if (err.name === "CastError") {
      return res.status(400).json({
        message: "Invalid customer ID",
        ok: false,
      });
    }

    handleServerError(res, err);
  }
});

// PUT /:id – Update customer
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "undefined" || id === "null") {
      return res.status(400).json({
        message: "Invalid customer ID format",
        ok: false,
      });
    }

    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    if (!isValidObjectId) {
      return res.status(400).json({
        message: "Invalid customer ID format",
        ok: false,
      });
    }

    const { customerNumber, date, customerCode, ...updateData } = req.body;

    if (customerCode) {
      return res.status(400).json({
        message: "Customer code cannot be updated.",
        ok: false,
      });
    }

    const cleanUpdateData = {};
    Object.keys(updateData).forEach((key) => {
      cleanUpdateData[key] =
        typeof updateData[key] === "string" && key !== "customerNumber"
          ? updateData[key].toLowerCase()
          : updateData[key];
    });

    if (date) {
      cleanUpdateData.date = parseCustomerDate(date);
    }

    const cleanNumber = customerNumber ? safeStr(customerNumber) : "";
    if (cleanNumber) {
      const exists = await Customer.findOne({
        customerNumber: cleanNumber,
        _id: { $ne: id },
      });
      if (exists) {
        return res.status(400).json({
          message: `Customer with mobile number <b>${cleanNumber}</b> already exists.`,
          duplicateNumber: cleanNumber,
          existingCustomer: exists.name,
          ok: false,
        });
      }
      cleanUpdateData.customerNumber = cleanNumber;
    }

    const updated = await Customer.findByIdAndUpdate(id, cleanUpdateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({
        message: "Customer not found",
        ok: false,
      });
    }

    res.json({
      customer: formatCustomerResponse(updated),
      ok: true,
    });
  } catch (err) {
    console.error("Update error:", err);

    if (err.code === 11000) {
      if (err.keyPattern?.customerNumber) {
        return res.status(400).json({
          message: `Customer with mobile number <b>${err.keyValue.customerNumber}</b> already exists.`,
          ok: false,
        });
      }
      return handleDuplicateError(res, err);
    }

    if (err.name === "CastError") {
      return res.status(400).json({
        message: "Invalid customer ID",
        ok: false,
      });
    }

    res.status(400).json({
      message: "Invalid data",
      error: err.message,
      ok: false,
    });
  }
});

// DELETE /:id – Delete single customer
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "undefined" || id === "null") {
      return res.status(400).json({
        message: "Invalid customer ID format",
        ok: false,
      });
    }

    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    if (!isValidObjectId) {
      return res.status(400).json({
        message: "Invalid customer ID format",
        ok: false,
      });
    }

    const deleted = await Customer.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        message: "Customer not found",
        ok: false,
      });
    }

    res.json({
      message: "Customer deleted successfully",
      ok: true,
    });
  } catch (err) {
    console.error("Delete error:", err);

    if (err.name === "CastError") {
      return res.status(400).json({
        message: "Invalid customer ID",
        ok: false,
      });
    }

    handleServerError(res, err);
  }
});

// DELETE / – Delete multiple customers
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        message: "No IDs provided",
        ok: false,
      });
    }

    const validIds = ids.filter((id) => {
      return (
        id &&
        id !== "undefined" &&
        id !== "null" &&
        /^[0-9a-fA-F]{24}$/.test(id)
      );
    });

    if (validIds.length === 0) {
      return res.status(400).json({
        message: "No valid customer IDs provided",
        ok: false,
      });
    }

    const result = await Customer.deleteMany({ _id: { $in: validIds } });

    res.json({
      message: `${result.deletedCount} customer(s) deleted`,
      deletedCount: result.deletedCount,
      ok: true,
    });
  } catch (err) {
    console.error("Bulk delete error:", err);
    handleServerError(res, err);
  }
});

// GET /province/:province – Get customers by province
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

// GET /export – Export customers as XLSX
router.get("/export", async (req, res) => {
  try {
    const withCode = req.query.withCode === "true";
    const customers = await Customer.find({}).lean();

    const data = customers.map((cust) => {
      const row = {};

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

export default router;
