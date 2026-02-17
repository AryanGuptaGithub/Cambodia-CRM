import express from "express";
import Customer from "../../models/master/customer.js";
import Province from "../../models/master/Province.js";
import MedicalRep from "../../models/staffMember/staff.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

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

// Helper to capitalize first letter of each word
const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Helper function to parse date and handle timezone issues
const parseCustomerDate = (dateInput) => {
  if (!dateInput) {
    // Return current date at noon to avoid timezone issues
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  }

  if (dateInput instanceof Date) {
    // If already a Date, ensure it's at noon
    const year = dateInput.getFullYear();
    const month = dateInput.getMonth();
    const day = dateInput.getDate();
    return new Date(year, month, day, 12, 0, 0);
  }

  if (typeof dateInput === "string") {
    // If it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const parts = dateInput.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      // Create date at noon to avoid timezone issues
      return new Date(year, month, day, 12, 0, 0);
    }

    // Try to parse other date formats
    const parsedDate = new Date(dateInput);
    if (!isNaN(parsedDate.getTime())) {
      // Create a new date with the same year, month, day but at noon
      const year = parsedDate.getFullYear();
      const month = parsedDate.getMonth();
      const day = parsedDate.getDate();
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // Return current date at noon
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
};

// Helper function to format date for response
const formatDateForResponse = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

// Helper to format customer response with title case for display
const formatCustomerResponse = (customer) => {
  if (!customer) return customer;

  const customerObj = customer.toObject ? customer.toObject() : customer;

  return {
    ...customerObj,
    name: toTitleCase(customerObj.name),
    typeOfBusiness: toTitleCase(customerObj.typeOfBusiness),
    medicalRepName: toTitleCase(customerObj.medicalRepName),
    address: toTitleCase(customerObj.address),
    zone: toTitleCase(customerObj.zone),
    province: toTitleCase(customerObj.province),
    remark: toTitleCase(customerObj.remark),
    date: formatDateForResponse(customerObj.date),
  };
};

// Function to generate next customer code with 5 digits
const generateNextCustomerCode = async () => {
  try {
    // Find the highest customer code that matches the 5-digit pattern
    const lastCustomer = await Customer.findOne({})
      .sort({ createdAt: -1 })
      .select("customerCode");

    let nextCode = 1;

    if (lastCustomer?.customerCode) {
      // Extract numeric part from customer code (handles "00001", "CUST00001", etc.)
      const codeMatch = lastCustomer.customerCode.match(/\d+/);
      if (codeMatch) {
        const parsed = parseInt(codeMatch[0], 10);
        if (!isNaN(parsed)) {
          nextCode = parsed + 1;
        }
      }
    }

    return nextCode.toString().padStart(5, "0");
  } catch (error) {
    console.error("Error generating customer code:", error);
    return "00001";
  }
};

router.get("/dropdown", async (req, res) => {
  try {
    const { search = "" } = req.query;

    let query = {};
    if (search && search.trim() !== "") {
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

    // Format names to title case for display
    const formattedCustomers = customers.map((customer) => ({
      ...customer,
      name: toTitleCase(customer.name),
    }));

    res.json({
      customers: formattedCustomers,
      total: formattedCustomers.length,
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

router.post("/import", async (req, res) => {
  try {
    const customers = req.body;

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        message: "No customers found in the uploaded file.",
        ok: false,
      });
    }

    // Fetch all MRs including USER ID
    const mrList = await MedicalRep.find().select(
      "medicalRepName staffName userId",
    );

    // Map MR Name → USER ID
    const mrMap = new Map();
    mrList.forEach((mr) => {
      const medRepName = safeStr(mr.medicalRepName).toLowerCase();
      const staffName = safeStr(mr.staffName).toLowerCase();

      if (medRepName) {
        mrMap.set(medRepName, mr.userId?.toString());
      }
      if (staffName) {
        mrMap.set(staffName, mr.userId?.toString());
      }
    });

    // Get starting code for this import batch
    const lastCustomer = await Customer.findOne({})
      .sort({ createdAt: -1 })
      .select("customerCode");

    let nextCode = 1;
    if (lastCustomer?.customerCode) {
      const codeMatch = lastCustomer.customerCode.match(/\d+/);
      if (codeMatch) {
        const parsed = parseInt(codeMatch[0], 10);
        if (!isNaN(parsed)) nextCode = parsed + 1;
      }
    }

    const newCustomers = [];
    const errors = [];
    const duplicates = [];

    for (let i = 0; i < customers.length; i++) {
      const item = customers[i];

      try {
        let name = safeStr(item.name).toLowerCase();
        if (!name || name.trim() === "") {
          errors.push(`Row ${i + 1}: Customer name is required`);
          continue;
        }

        // Parse date using helper function
        const parsedDate = parseCustomerDate(item.date);

        // MR Name → USER ID
        let medicalRepId = null;
        let mrName = safeStr(item.medicalRepName).toLowerCase();

        if (!mrName || mrName.trim() === "") {
          mrName = "not provided";
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

        // Check for duplicates
        const existingCustomer = await Customer.findOne({
          $or: [
            { customerNumber: customerNumber },
            { name: name, customerNumber: customerNumber },
          ],
        });

        if (existingCustomer) {
          duplicates.push({
            row: i + 1,
            name: name,
            reason: "Customer with same name or number already exists",
          });
          continue;
        }

        const customerCode = (nextCode + newCustomers.length)
          .toString()
          .padStart(5, "0");

        newCustomers.push({
          customerCode: customerCode,
          date: parsedDate,
          medicalRepName: mrName,
          medicalRepId,
          name: name,
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
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    if (newCustomers.length === 0) {
      return res.status(400).json({
        message: "No valid customers to import.",
        errors: errors,
        duplicates: duplicates,
        ok: false,
      });
    }

    const inserted = await Customer.insertMany(newCustomers, {
      ordered: false,
    });

    let responseMessage = `Successfully imported ${inserted.length} customer(s).`;
    if (errors.length > 0) {
      responseMessage += ` ${errors.length} error(s) encountered.`;
    }
    if (duplicates.length > 0) {
      responseMessage += ` ${duplicates.length} duplicate(s) skipped.`;
    }

    res.status(200).json({
      message: responseMessage,
      importedCount: inserted.length,
      errorCount: errors.length,
      duplicateCount: duplicates.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : [],
      duplicates: duplicates.length > 0 ? duplicates.slice(0, 5) : [],
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

router.get("/province/:province", async (req, res) => {
  try {
    const { province } = req.params;
    const customers = await Customer.find({
      province: new RegExp(province, "i"),
    });

    // Format customers with title case
    const formattedCustomers = customers.map((customer) =>
      formatCustomerResponse(customer),
    );

    res.json({
      success: true,
      data: formattedCustomers,
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

    // Build search query
    const searchQuery = {};
    if (search && search.trim() !== "") {
      const searchLower = search.trim().toLowerCase();
      searchQuery.$or = [
        { name: { $regex: searchLower, $options: "i" } },
        { typeOfBusiness: { $regex: searchLower, $options: "i" } },
        { medicalRepName: { $regex: searchLower, $options: "i" } },
        { address: { $regex: searchLower, $options: "i" } },
        { zone: { $regex: searchLower, $options: "i" } },
        { province: { $regex: searchLower, $options: "i" } },
        { customerCode: { $regex: search.trim(), $options: "i" } },
        { customerNumber: { $regex: search.trim(), $options: "i" } },
        { remark: { $regex: searchLower, $options: "i" } },
      ];
    }

    const total = await Customer.countDocuments(searchQuery);
    const customers = await Customer.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const formattedCustomers = customers.map((customer) =>
      formatCustomerResponse(customer),
    );

    const nextCustomerCode = await generateNextCustomerCode();

    res.json({
      customers: formattedCustomers,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      nextCustomerCode: nextCustomerCode,
      ok: true,
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

router.post("/", async (req, res) => {
  try {
    const { customerNumber, date, ...data } = req.body;
    const customerCode = await generateNextCustomerCode();
    const cleanData = {
      ...data,
      customerCode: customerCode, // Add the generated code
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

    // Parse date if provided
    const parsedDate = date ? parseCustomerDate(date) : parseCustomerDate(null);

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

    const customer = new Customer({
      ...cleanData,
      customerNumber: cleanNumber,
      date: parsedDate,
    });
    const saved = await customer.save();

    // Format response with title case
    const formattedCustomer = formatCustomerResponse(saved);

    res.status(201).json({
      message: `Customer <b>${toTitleCase(saved.name)}</b> created with code <b>${saved.customerCode}</b>`,
      customer: formattedCustomer,
      customerCode: saved.customerCode,
      ok: true,
    });
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern?.customerCode) {
        return res.status(400).json({
          message: `Customer with code <b style="color:#EF4444">${err.keyValue.customerCode}</b> already exists. Please try again.`,
          duplicateCode: err.keyValue.customerCode,
          ok: false,
        });
      }
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

router.get("/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }

    // Format response with title case
    const responseCustomer = formatCustomerResponse(customer);

    res.json({ customer: responseCustomer, ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ message: "Invalid customer ID", ok: false });
    }
    handleServerError(res, err);
  }
});

router.put("/:id",protect, allowAdminOnly, async (req, res) => {
  try {
    const { customerNumber, date, customerCode, ...updateData } = req.body;
    const cleanNumber = customerNumber ? safeStr(customerNumber) : "";

    // Prevent customer code updates
    if (customerCode) {
      return res.status(400).json({
        message: "Customer code cannot be updated.",
        ok: false,
      });
    }

    // Convert string fields to lowercase for update
    const cleanUpdateData = {};
    Object.keys(updateData).forEach((key) => {
      if (typeof updateData[key] === "string" && key !== "customerNumber") {
        cleanUpdateData[key] = updateData[key].toLowerCase();
      } else {
        cleanUpdateData[key] = updateData[key];
      }
    });

    // Parse date if provided
    if (date) {
      cleanUpdateData.date = parseCustomerDate(date);
    }

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
      cleanUpdateData.customerNumber = cleanNumber;
    }

    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      cleanUpdateData,
      { new: true, runValidators: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "Customer not found", ok: false });
    }

    // Format response with title case
    const responseCustomer = formatCustomerResponse(updated);

    res.json({ customer: responseCustomer, ok: true });
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

router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
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

router.delete("/", protect, allowAdminOnly, async (req, res) => {
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
