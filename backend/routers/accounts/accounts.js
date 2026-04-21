import express from "express";
import mongoose from "mongoose";
import CategoryType from "../../models/accounts/CategoryType.js";
import Destination from "../../models/accounts/Destination.js";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import Transaction from "../../models/accounts/Transaction.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";
import XLSX from "xlsx";

const router = express.Router();

// Helper to format a transaction for frontend consumption
function formatTx(tx, direction = null) {
  return {
    _id: tx._id,
    direction, // "credit", "debit", or null

    // ── Core display fields ──
    transactionType: tx.transactionType || "transaction",
    categoryTypeName: tx.categoryType || null,
    destinationName: tx.destination || null,
    sourceName: tx.sourceAccount || null,

    // ── Amount ──
    amount: tx.finalAmount || tx.amount || 0,
    exchangeLoss: tx.exchangeLoss || 0,

    // ── Dates ──
    date: tx.date || tx.createdAt,
    invoiceDate: tx.invoiceDate || null,

    // ── Invoice / customer info ──
    invoiceNumber: tx.invoiceNo || null,
    customerName: tx.customerName || null,
    customerAddress: tx.customerAddress || null,

    // ── Notes ──
    remarks: tx.remarks || null,
    description: tx.description || null,

    // ── Meta ──
    importStatus: tx.importStatus || null,
    accountType: tx.accountType || null,
  };
}

// Helper to format date
const formatDateForResponse = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper to handle server errors
const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("ERROR:", err);
  res.status(code).json({ success: false, message, error: err.message });
};

// Helper to handle duplicate errors
const handleDuplicateError = (res, err, entityName = "record") => {
  let field = "field";
  let value = "Unknown";
  try {
    field = Object.keys(err.keyPattern || {})[0];
    value = err.keyValue?.[field] || "Unknown";
  } catch (e) {}
  return res.status(400).json({
    success: false,
    message: `A ${entityName} with this ${field} <b style="color:#EF4444">${value}</b> already exists.`,
    field,
  });
};

// ============================================================================
// Category Types CRUD with Activity Logging
// ============================================================================

// GET all category types
router.get("/category-type", async (req, res) => {
  try {
    const categories = await CategoryType.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (err) {
    console.error("Failed to fetch category types:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// CREATE category type
router.post("/category-type", protect, allowAdminOnly, async (req, res) => {
  try {
    const { name, description, code } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const existingCategory = await CategoryType.findOne({
      name: name.trim(),
      isActive: true,
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category type with this name already exists",
      });
    }

    const categoryType = new CategoryType({
      name: name.trim(),
      description: description?.trim() || "",
      code: code?.trim() || "",
      isActive: true,
    });

    await categoryType.save();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Category Type: ${categoryType.name}`,
      tableName: "categorytypes",
      tableLabel: "Category Type",
      recordId: categoryType._id,
      referenceNumber: categoryType.code || categoryType.name,
      newData: categoryType.toObject(),
      description: `New category type "${categoryType.name}" added with code ${categoryType.code || "N/A"}`,
      refField: "name",
    });

    res.status(201).json({
      success: true,
      message: "Category type created successfully",
      data: categoryType,
    });
  } catch (err) {
    console.error("Failed to create category type:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate category type",
      });
    }

    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// UPDATE category type
router.put("/category-type/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, code, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category type ID format",
      });
    }

    const previousRecord = await CategoryType.findById(id).lean();

    if (!previousRecord) {
      return res.status(404).json({
        success: false,
        message: "Category type not found",
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (code !== undefined) updateData.code = code.trim();
    if (isActive !== undefined) updateData.isActive = isActive;

    const categoryType = await CategoryType.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Category Type: ${categoryType.name}`,
      tableName: "categorytypes",
      tableLabel: "Category Type",
      recordId: categoryType._id,
      referenceNumber: categoryType.code || categoryType.name,
      previousData: previousRecord,
      newData: categoryType.toObject(),
      description: `Category type "${categoryType.name}" was updated`,
      refField: "name",
    });

    res.status(200).json({
      success: true,
      message: "Category type updated successfully",
      data: categoryType,
    });
  } catch (err) {
    console.error("Failed to update category type:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// DELETE category type (soft delete)
router.delete(
  "/category-type/:id",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category type ID format",
        });
      }

      const previousRecord = await CategoryType.findById(id).lean();

      if (!previousRecord) {
        return res.status(404).json({
          success: false,
          message: "Category type not found",
        });
      }

      const categoryType = await CategoryType.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true },
      );

      // Log activity
      await logActivity(req, {
        action: "DELETE",
        actionLabel: `Deleted Category Type: ${previousRecord.name}`,
        tableName: "categorytypes",
        tableLabel: "Category Type",
        recordId: previousRecord._id,
        referenceNumber: previousRecord.code || previousRecord.name,
        previousData: previousRecord,
        description: `Category type "${previousRecord.name}" was soft deleted`,
        refField: "name",
      });

      res.status(200).json({
        success: true,
        message: "Category type deleted successfully",
      });
    } catch (err) {
      console.error("Failed to delete category type:", err);
      res.status(500).json({
        success: false,
        error: "Server Error",
        message: err.message,
      });
    }
  },
);

// Bulk DELETE category types
router.delete(
  "/category-type/bulk",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No IDs provided",
        });
      }

      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

      if (validIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid IDs provided",
        });
      }

      const toDelete = await CategoryType.find({
        _id: { $in: validIds },
      }).lean();
      const result = await CategoryType.updateMany(
        { _id: { $in: validIds } },
        { isActive: false },
      );

      // Log activity
      await logActivity(req, {
        action: "DELETE",
        actionLabel: `Bulk Deleted ${result.modifiedCount} Category Type(s)`,
        tableName: "categorytypes",
        tableLabel: "Category Type",
        previousData: toDelete,
        description: `Soft deleted ${result.modifiedCount} category types`,
        refField: "name",
      });

      res.status(200).json({
        success: true,
        message: `${result.modifiedCount} category type(s) deleted successfully`,
        deletedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Failed to bulk delete category types:", err);
      res.status(500).json({
        success: false,
        error: "Server Error",
        message: err.message,
      });
    }
  },
);

// ============================================================================
// Destinations CRUD with Activity Logging
// ============================================================================

// GET all destinations
router.get("/destinations", async (req, res) => {
  try {
    const destinations = await Destination.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: destinations,
      count: destinations.length,
    });
  } catch (err) {
    console.error("Failed to fetch destinations:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// CREATE destination
router.post("/destinations", protect, allowAdminOnly, async (req, res) => {
  try {
    const { name, description, code, address, city, state, pincode } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Destination name is required",
      });
    }

    const existingDestination = await Destination.findOne({
      name: name.trim(),
      isActive: true,
    });

    if (existingDestination) {
      return res.status(400).json({
        success: false,
        message: "Destination with this name already exists",
      });
    }

    const destination = new Destination({
      name: name.trim(),
      description: description?.trim() || "",
      code: code?.trim() || "",
      address: address?.trim() || "",
      city: city?.trim() || "",
      state: state?.trim() || "",
      pincode: pincode?.trim() || "",
      isActive: true,
    });

    await destination.save();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Destination: ${destination.name}`,
      tableName: "destinations",
      tableLabel: "Destination",
      recordId: destination._id,
      referenceNumber: destination.code || destination.name,
      newData: destination.toObject(),
      description: `New destination "${destination.name}" added with code ${destination.code || "N/A"}`,
      refField: "name",
    });

    res.status(201).json({
      success: true,
      message: "Destination created successfully",
      data: destination,
    });
  } catch (err) {
    console.error("Failed to create destination:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate destination",
      });
    }

    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// UPDATE destination
router.put("/destinations/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, code, address, city, state, pincode, isActive } =
      req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid destination ID format",
      });
    }

    const previousRecord = await Destination.findById(id).lean();

    if (!previousRecord) {
      return res.status(404).json({
        success: false,
        message: "Destination not found",
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (code !== undefined) updateData.code = code.trim();
    if (address !== undefined) updateData.address = address.trim();
    if (city !== undefined) updateData.city = city.trim();
    if (state !== undefined) updateData.state = state.trim();
    if (pincode !== undefined) updateData.pincode = pincode.trim();
    if (isActive !== undefined) updateData.isActive = isActive;

    const destination = await Destination.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Destination: ${destination.name}`,
      tableName: "destinations",
      tableLabel: "Destination",
      recordId: destination._id,
      referenceNumber: destination.code || destination.name,
      previousData: previousRecord,
      newData: destination.toObject(),
      description: `Destination "${destination.name}" was updated`,
      refField: "name",
    });

    res.status(200).json({
      success: true,
      message: "Destination updated successfully",
      data: destination,
    });
  } catch (err) {
    console.error("Failed to update destination:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// DELETE destination (soft delete)
router.delete(
  "/destinations/:id",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid destination ID format",
        });
      }

      const previousRecord = await Destination.findById(id).lean();

      if (!previousRecord) {
        return res.status(404).json({
          success: false,
          message: "Destination not found",
        });
      }

      const destination = await Destination.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true },
      );

      // Log activity
      await logActivity(req, {
        action: "DELETE",
        actionLabel: `Deleted Destination: ${previousRecord.name}`,
        tableName: "destinations",
        tableLabel: "Destination",
        recordId: previousRecord._id,
        referenceNumber: previousRecord.code || previousRecord.name,
        previousData: previousRecord,
        description: `Destination "${previousRecord.name}" was soft deleted`,
        refField: "name",
      });

      res.status(200).json({
        success: true,
        message: "Destination deleted successfully",
      });
    } catch (err) {
      console.error("Failed to delete destination:", err);
      res.status(500).json({
        success: false,
        error: "Server Error",
        message: err.message,
      });
    }
  },
);

// Bulk DELETE destinations
router.delete(
  "/destinations/bulk",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No IDs provided",
        });
      }

      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

      if (validIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid IDs provided",
        });
      }

      const toDelete = await Destination.find({
        _id: { $in: validIds },
      }).lean();
      const result = await Destination.updateMany(
        { _id: { $in: validIds } },
        { isActive: false },
      );

      // Log activity
      await logActivity(req, {
        action: "DELETE",
        actionLabel: `Bulk Deleted ${result.modifiedCount} Destination(s)`,
        tableName: "destinations",
        tableLabel: "Destination",
        previousData: toDelete,
        description: `Soft deleted ${result.modifiedCount} destinations`,
        refField: "name",
      });

      res.status(200).json({
        success: true,
        message: `${result.modifiedCount} destination(s) deleted successfully`,
        deletedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Failed to bulk delete destinations:", err);
      res.status(500).json({
        success: false,
        error: "Server Error",
        message: err.message,
      });
    }
  },
);

// ============================================================================
// IMPORT Destination
// ============================================================================
router.post(
  "/destinations/import",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      let destinations;
      if (Array.isArray(req.body)) {
        destinations = req.body;
      } else if (
        req.body?.destinations &&
        Array.isArray(req.body.destinations)
      ) {
        destinations = req.body.destinations;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid request format. Expected array of destinations.",
        });
      }

      if (!destinations || destinations.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No destinations found to import.",
        });
      }

      const existingDestinations = await Destination.find(
        { isActive: true },
        { name: 1, code: 1 },
      ).lean();

      const existingNameSet = new Set();
      const existingCodeSet = new Set();
      existingDestinations.forEach((d) => {
        existingNameSet.add(d.name.toLowerCase());
        if (d.code) existingCodeSet.add(d.code.toLowerCase());
      });

      const docsToInsert = [];
      const errors = [];
      const duplicates = [];

      for (let i = 0; i < destinations.length; i++) {
        const item = destinations[i];
        const rowNumber = i + 1;

        try {
          const name = item.name?.trim();
          if (!name) {
            errors.push(`Row ${rowNumber}: Destination name is required`);
            continue;
          }

          const code = item.code?.trim() || "";
          const description = item.description?.trim() || "";
          const address = item.address?.trim() || "";
          const city = item.city?.trim() || "";
          const state = item.state?.trim() || "";
          const pincode = item.pincode?.trim() || "";

          if (existingNameSet.has(name.toLowerCase())) {
            duplicates.push({
              row: rowNumber,
              name,
              reason: "Destination with this name already exists",
            });
            continue;
          }

          if (code && existingCodeSet.has(code.toLowerCase())) {
            duplicates.push({
              row: rowNumber,
              name,
              code,
              reason: "Destination with this code already exists",
            });
            continue;
          }

          docsToInsert.push({
            name,
            code,
            description,
            address,
            city,
            state,
            pincode,
            isActive: true,
          });

          existingNameSet.add(name.toLowerCase());
          if (code) existingCodeSet.add(code.toLowerCase());
        } catch (error) {
          errors.push(`Row ${rowNumber}: ${error.message}`);
        }
      }

      if (docsToInsert.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid destinations to import.",
          errors: errors.slice(0, 20),
          duplicates: duplicates.slice(0, 20),
        });
      }

      let insertedCount = 0;
      let dbErrors = [];

      try {
        const result = await Destination.insertMany(docsToInsert, {
          ordered: false,
        });
        insertedCount = result.length;
      } catch (err) {
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

      // Log activity
      await logActivity(req, {
        action: "IMPORT",
        actionLabel: `Bulk Imported ${insertedCount} Destination(s)`,
        tableName: "destinations",
        tableLabel: "Destination",
        description: `Imported ${insertedCount} destinations. Duplicates skipped: ${duplicates.length}. Errors: ${errors.length}.`,
        newData: {
          importedCount: insertedCount,
          duplicateCount: duplicates.length,
          errorCount: errors.length,
        },
      });

      let message = `Successfully imported ${insertedCount} destination(s).`;
      if (errors.length) message += ` ${errors.length} validation error(s).`;
      if (duplicates.length)
        message += ` ${duplicates.length} duplicate(s) skipped.`;
      if (dbErrors.length) message += ` ${dbErrors.length} database error(s).`;

      res.status(200).json({
        success: true,
        message,
        importedCount: insertedCount,
        errorCount: errors.length,
        duplicateCount: duplicates.length,
        dbErrorCount: dbErrors.length,
        errors: errors.slice(0, 10),
        duplicates: duplicates.slice(0, 20),
        dbErrors: dbErrors.slice(0, 10),
      });
    } catch (err) {
      console.error("Failed to import destinations:", err);
      if (err.code === 11000) {
        return handleDuplicateError(res, err, "destination");
      }
      handleServerError(res, err, "Failed to import destinations");
    }
  },
);

// ============================================================================
// EXPORT Destinations
// ============================================================================
router.get(
  "/destinations/export",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const destinations = await Destination.find({ isActive: true }).lean();

      const data = destinations.map((dest) => ({
        Name: dest.name,
        Code: dest.code || "",
        Description: dest.description || "",
        Address: dest.address || "",
        City: dest.city || "",
        State: dest.state || "",
        Pincode: dest.pincode || "",
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Destinations");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      await logActivity(req, {
        action: "EXPORT",
        actionLabel: `Exported Destination List (${destinations.length} records)`,
        tableName: "destinations",
        tableLabel: "Destination",
        description: `Exported ${destinations.length} destinations to Excel`,
        newData: { count: destinations.length },
      });

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=destinations.xlsx",
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.send(buf);
    } catch (err) {
      console.error("Export error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to export destinations",
      });
    }
  },
);

// ============================================================================
// ROUTE: Get transactions (optionally filtered by accountId)
// ============================================================================
router.get("/transactions", async (req, res) => {
  try {
    const { accountId } = req.query;

    let transactions;
    let formatted;

    if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
      // 1. Find the account to get its name
      const account = await Destination.findById(accountId).lean();
      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Account not found",
        });
      }
      const accountName = account.name;

      // 2. Find transactions where source or destination matches the account name
      transactions = await Transaction.find({
        $or: [{ sourceAccount: accountName }, { destination: accountName }],
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      // 3. Add direction based on whether the account is destination (credit) or source (debit)
      formatted = transactions.map((tx) => {
        const isCredit = tx.destination === accountName;
        return formatTx(tx, isCredit ? "credit" : "debit");
      });
    } else {
      // No accountId – return all transactions without direction
      transactions = await Transaction.find({})
        .sort({ date: -1, createdAt: -1 })
        .lean();

      formatted = transactions.map((tx) => formatTx(tx, null));
    }

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
});

// ============================================================================
// ROUTE: Get company balance with per‑account transaction lists
// ============================================================================
router.get("/balance", async (req, res) => {
  try {
    const destinations = await Destination.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    const totalBalance = destinations.reduce(
      (sum, dest) => sum + (dest.totalAmount || 0),
      0,
    );

    // For each account, fetch transactions by name (not ID)
    const accountsWithTransactions = await Promise.all(
      destinations.map(async (dest) => {
        const accountName = dest.name;

        // Transactions where this account is the destination (money in)
        const incomingRaw = await Transaction.find({ destination: accountName })
          .sort({ date: -1, createdAt: -1 })
          .lean();

        // Transactions where this account is the source (money out)
        const outgoingRaw = await Transaction.find({
          sourceAccount: accountName,
        })
          .sort({ date: -1, createdAt: -1 })
          .lean();

        const formattedIncoming = incomingRaw.map((tx) =>
          formatTx(tx, "credit"),
        );
        const formattedOutgoing = outgoingRaw.map((tx) =>
          formatTx(tx, "debit"),
        );

        const allTransactions = [
          ...formattedIncoming,
          ...formattedOutgoing,
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        return {
          _id: dest._id,
          name: dest.name,
          code: dest.code,
          totalAmount: dest.totalAmount || 0,
          transactions: allTransactions,
          transactionCount: allTransactions.length,
        };
      }),
    );

    res.json({
      success: true,
      totalBalance,
      accounts: accountsWithTransactions,
      accountCount: destinations.length,
    });
  } catch (error) {
    console.error("Error fetching company balance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch company balance",
      error: error.message,
      totalBalance: 0,
      accounts: [],
    });
  }
});

// ============================================================================
// GET all sales accounts
// ============================================================================
router.get("/", async (req, res) => {
  try {
    const {
      invoiceNumber,
      customerCode,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = "invoiceDate",
      sortOrder = "desc",
    } = req.query;

    const query = { isActive: true };

    if (invoiceNumber) {
      query.invoiceNumber = { $regex: invoiceNumber, $options: "i" };
    }

    if (customerCode) {
      query.customerCode = customerCode;
    }

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sales = await Sale.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const accounts = await Promise.all(
      sales.map(async (sale) => {
        let customerInfo = null;

        if (sale.customerCode) {
          customerInfo = await Customer.findOne({
            customerCode: sale.customerCode,
          }).lean();
        }

        return {
          _id: sale._id,
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.invoiceDate,
          customerCode: sale.customerCode,
          customerName: customerInfo?.name || sale.customerName || "N/A",
          customerAddress: customerInfo?.address || "N/A",
          customerPhone: customerInfo?.phone || "",
          totalAmount: sale.totalAmount || 0,
          dueAmount: sale.dueAmount || 0,
          paidAmount: sale.paidAmount || 0,
          paymentStatus: sale.paymentStatus || "Pending",
          remarks: sale.remarks || "",
        };
      }),
    );

    const total = await Sale.countDocuments(query);

    res.status(200).json({
      success: true,
      data: accounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Failed to fetch accounts:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// ============================================================================
// GET /alternative – alternative route with aggregation
// ============================================================================
router.get("/alternative", async (req, res) => {
  try {
    const {
      invoiceNumber,
      customerCode,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = req.query;

    const matchStage = { isActive: true };

    if (invoiceNumber) {
      matchStage.invoiceNumber = { $regex: invoiceNumber, $options: "i" };
    }

    if (customerCode) {
      matchStage.customerCode = customerCode;
    }

    if (startDate || endDate) {
      matchStage.invoiceDate = {};
      if (startDate) matchStage.invoiceDate.$gte = new Date(startDate);
      if (endDate) matchStage.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sales = await Sale.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          invoiceNumber: 1,
          invoiceDate: 1,
          customerCode: 1,
          customerName: {
            $ifNull: ["$customerInfo.name", "$customerName", "N/A"],
          },
          customerAddress: {
            $ifNull: ["$customerInfo.address", "N/A"],
          },
          customerPhone: {
            $ifNull: ["$customerInfo.phone", ""],
          },
          totalAmount: 1,
          dueAmount: 1,
          paidAmount: 1,
          paymentStatus: 1,
          remarks: 1,
        },
      },
      { $sort: { invoiceDate: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    const totalCount = await Sale.countDocuments(matchStage);

    const transformedSales = sales.map((sale) => ({
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.invoiceDate,
      customerCode: sale.customerCode,
      customerName: sale.customerName,
      customerAddress: sale.customerAddress,
      customerPhone: sale.customerPhone,
      amount: sale.totalAmount || 0,
      dueAmount: sale.dueAmount || 0,
      paidAmount: sale.paidAmount || 0,
      paymentStatus: sale.paymentStatus || "Pending",
      remarks: sale.remarks || "",
    }));

    res.status(200).json({
      success: true,
      data: transformedSales,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Failed to fetch accounts:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// ============================================================================
// GET /statistics – sales statistics
// ============================================================================
router.get("/statistics", async (req, res) => {
  try {
    const { startDate, endDate, customerCode } = req.query;

    const matchStage = { isActive: true };

    if (startDate || endDate) {
      matchStage.invoiceDate = {};
      if (startDate) matchStage.invoiceDate.$gte = new Date(startDate);
      if (endDate) matchStage.invoiceDate.$lte = new Date(endDate);
    }

    if (customerCode) {
      matchStage.customerCode = customerCode;
    }

    const stats = await Sale.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalDue: { $sum: "$dueAmount" },
          totalPaid: { $sum: "$paidAmount" },
          pendingSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Pending"] }, 1, 0] },
          },
          completedSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Completed"] }, 1, 0] },
          },
          partialSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Partial"] }, 1, 0] },
          },
        },
      },
    ]);

    const topCustomers = await Sale.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 5 },
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: stats[0] || {
          totalSales: 0,
          totalAmount: 0,
          totalDue: 0,
          totalPaid: 0,
          pendingSales: 0,
          completedSales: 0,
          partialSales: 0,
        },
        topCustomers,
      },
    });
  } catch (err) {
    console.error("Failed to fetch statistics:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// ============================================================================
// GET single sale by ID
// ============================================================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account ID format",
      });
    }

    const sale = await Sale.findOne({ _id: id, isActive: true }).lean();

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    let customerInfo = null;
    if (sale.customerCode) {
      customerInfo = await Customer.findOne({
        customerCode: sale.customerCode,
      }).lean();
    }

    const account = {
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.invoiceDate,
      customerCode: sale.customerCode,
      customerName: customerInfo?.name || sale.customerName || "N/A",
      customerAddress: customerInfo?.address || "N/A",
      customerPhone: customerInfo?.phone || "",
      totalAmount: sale.totalAmount || 0,
      dueAmount: sale.dueAmount || 0,
      paidAmount: sale.paidAmount || 0,
      paymentStatus: sale.paymentStatus || "Pending",
      remarks: sale.remarks || "",
      items: sale.items || [],
    };

    res.status(200).json({
      success: true,
      data: account,
    });
  } catch (err) {
    console.error("Failed to fetch account:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

export default router;
