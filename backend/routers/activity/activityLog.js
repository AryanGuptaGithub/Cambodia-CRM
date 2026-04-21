import express from "express";
import ActivityLog from "../../models/activity/activityLog.js";
import mongoose from "mongoose";
import Staff from "../../models/staffMember/staff.js";
import User from "../../models/User.js";
import XLSX from "xlsx";
import { protect } from "../../middleware/auth.js";

const TABLE_MODEL_MAP = {
  customers: () => import("../../models/master/customer.js"),
  suppliers: () => import("../../models/master/supplier.js"),
  sales: () => import("../../models/sale/saleSummary.js"),
  purchase: () => import("../../models/purcharsing/purchaseInventory.js"),
  products: () => import("../../models/projectManger/product.js"),
  expenses: () => import("../../models/expenses/addExpense.js"),
  staff: () => import("../../models/staffMember/staff.js"),
  StockAdjustment: () => import("../../models/stock/stockAdjustment.js"),
  stockTransfer: () => import("../../models/stock/stockTransfer.js"),
  purchaseReturn: () => import("../../models/purcharsing/purchaseReturns.js"),
  paymentsOut: () => import("../../models/purcharsing/purchaseOut.js"),
  salesReturn: () => import("../../models/sale/saleReturn.js"),
  transactions: () => import("../../models/accounts/Transaction.js"),
  mrcashes: () => import("../../models/accounts/MRCash.js"),
  addexpensecategaries: () =>
    import("../../models/expenses/addExpenseCategary.js"),
  mrbasicpayrolls: () => import("../../models/Hrm/MRBasicPayroll.js"),
};

const router = express.Router();

const formatDateTime = (date) => {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${day} ${month} ${year} ${time}`;
};

const buildSnapshots = (raw, refField = "customerCode") => {
  if (!raw) return undefined;
  const rows = Array.isArray(raw) ? raw : [raw];
  return rows.map((doc) => ({
    recordId: doc._id ? String(doc._id) : undefined,
    refNumber:
      doc[refField] || doc.referenceNumber || doc.invoiceNumber || undefined,
    data: doc,
  }));
};

export const logActivity = async (req, options = {}) => {
  try {
    const {
      action,
      actionLabel,
      tableName,
      tableLabel,
      recordId,
      referenceNumber,
      previousData,
      newData,
      description,
      previousSnapshots,
      newSnapshots,
      refField = "customerCode",
    } = options;

    const user = req.user || {};
    const userId = user._id || user.id || null;

    const prevSnaps =
      previousSnapshots ?? buildSnapshots(previousData, refField);
    const newSnaps = newSnapshots ?? buildSnapshots(newData, refField);

    await ActivityLog.create({
      userId,
      userName: user.name || user.userName || "System",
      userRole: user.role || null,
      userEmail: user.email || null,
      action,
      actionLabel: actionLabel || null,
      tableName,
      tableLabel: tableLabel || null,
      recordId: recordId ? String(recordId) : null,
      referenceNumber: referenceNumber || null,
      previousSnapshots: prevSnaps,
      newSnapshots: newSnaps,
      previousData: previousData || null,
      newData: newData || null,
      ipAddress:
        req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
      userAgent: req.headers["user-agent"] || null,
      description: description || null,
    });
  } catch (err) {
    console.error("❌ ActivityLog write failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Recalculate and update ReportInHand stock totals after revert
// This is the KEY fix — after restoring purchase/sale records, we need to
// recalculate the actual stock values from all existing batches.
// ─────────────────────────────────────────────────────────────────────────────
const recalculateReportInHandStock = async () => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const allReports = await ReportInHand.find({}).lean();

    for (const report of allReports) {
      try {
        const batches = report.batches || [];

        // Only consider real batches (not adjustments)
        const realBatches = batches.filter(
          (b) => !b.adjustmentType || b.adjustmentType === "batch",
        );

        const totalBoxesFromBatches = realBatches.reduce(
          (sum, b) => sum + (Number(b.boxes) || 0),
          0,
        );
        const totalAmount = realBatches.reduce(
          (sum, b) => sum + (Number(b.amount) || 0),
          0,
        );

        const addAdj = Number(report.addStockAdjustment || 0);
        const removeAdj = Number(report.removeStockAdjustment || 0);
        const totalBoxes = Math.max(
          0,
          totalBoxesFromBatches + addAdj - removeAdj,
        );
        const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

        let status = "In Stock";
        if (totalBoxes <= 0) status = "Out of Stock";
        else if (totalBoxes < (report.minStockLevel || 10))
          status = "Low Stock";

        await ReportInHand.updateOne(
          { _id: report._id },
          {
            $set: {
              totalBoxesFromBatches,
              totalBoxes,
              totalAmount,
              averagePrice,
              status,
              updatedAt: new Date(),
            },
          },
        );
      } catch (err) {
        console.error(
          `Failed to recalculate stock for ${report.productName}:`,
          err.message,
        );
      }
    }
    console.log("✅ ReportInHand stock recalculated after revert");
  } catch (err) {
    console.error("❌ recalculateReportInHandStock failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: After restoring a purchase invoice, add its batches back to
// ReportInHand so the stock totals reflect the reverted state.
// ─────────────────────────────────────────────────────────────────────────────
const restorePurchaseBatchesToStock = async (invoiceData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const products = invoiceData.products || [];

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const qty = Number(product.quantityPerBoxStrip || 0);
      const lc = Number(product.lc || 0);
      const fob = Number(product.fob || 0);
      const cif = Number(product.cif || 0);
      const amount = qty * lc;
      const expiryDate = product.expiryDate
        ? new Date(product.expiryDate)
        : null;

      if (qty <= 0) continue;

      const newBatch = {
        boxes: qty,
        lc,
        fob,
        cif,
        amount,
        expiryDate,
        date: product.date ? new Date(product.date) : new Date(),
        _id: new mongoose.Types.ObjectId(),
        adjustmentType: "batch",
        sellingPrice: Number(product.sellingPrice || 0),
      };

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (existingReport) {
        const updatedBatches = [...(existingReport.batches || []), newBatch];
        const realBatches = updatedBatches.filter(
          (b) => !b.adjustmentType || b.adjustmentType === "batch",
        );
        const totalBoxesFromBatches = realBatches.reduce(
          (s, b) => s + (Number(b.boxes) || 0),
          0,
        );
        const totalAmount = realBatches.reduce(
          (s, b) => s + (Number(b.amount) || 0),
          0,
        );
        const addAdj = Number(existingReport.addStockAdjustment || 0);
        const removeAdj = Number(existingReport.removeStockAdjustment || 0);
        const totalBoxes = Math.max(
          0,
          totalBoxesFromBatches + addAdj - removeAdj,
        );
        const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

        let status = "In Stock";
        if (totalBoxes <= 0) status = "Out of Stock";
        else if (totalBoxes < (existingReport.minStockLevel || 10))
          status = "Low Stock";

        await ReportInHand.updateOne(
          { _id: existingReport._id },
          {
            $set: {
              batches: updatedBatches,
              totalBoxesFromBatches,
              totalBoxes,
              totalAmount,
              averagePrice,
              status,
              updatedAt: new Date(),
            },
          },
        );
      } else {
        const totalBoxesFromBatches = qty;
        const totalBoxes = qty;
        const averagePrice = lc;

        await ReportInHand.create({
          productName,
          supplierName: invoiceData.supplierName || "Unknown",
          type: product.type || "",
          sellingPrice: Number(product.sellingPrice || 0),
          batches: [newBatch],
          totalBoxesFromBatches,
          totalBoxes,
          totalAmount: amount,
          averagePrice,
          addStockAdjustment: 0,
          removeStockAdjustment: 0,
          status: "In Stock",
          minStockLevel: 10,
        });
      }
    }
    console.log(
      `✅ Purchase batches restored to stock for invoice: ${invoiceData.invoiceNumber}`,
    );
  } catch (err) {
    console.error("❌ restorePurchaseBatchesToStock failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: After removing a purchase invoice (revert CREATE), subtract its
// batches from ReportInHand
// ─────────────────────────────────────────────────────────────────────────────
const removePurchaseBatchesFromStock = async (invoiceData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const products = invoiceData.products || [];

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const qty = Number(product.quantityPerBoxStrip || 0);
      if (qty <= 0) continue;

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!existingReport) continue;

      let remainingToRemove = qty;
      const batches = [...(existingReport.batches || [])];
      batches.sort((a, b) => new Date(b.date) - new Date(a.date)); // newest first for revert

      const updatedBatches = [];
      for (const batch of batches) {
        if (remainingToRemove <= 0) {
          updatedBatches.push(batch);
          continue;
        }
        if (batch.adjustmentType && batch.adjustmentType !== "batch") {
          updatedBatches.push(batch);
          continue;
        }
        const available = Number(batch.boxes || 0);
        if (available <= remainingToRemove) {
          remainingToRemove -= available;
          // Don't push — effectively remove this batch
        } else {
          const lc = Number(batch.lc || 0);
          updatedBatches.push({
            ...batch,
            boxes: available - remainingToRemove,
            amount: (available - remainingToRemove) * lc,
          });
          remainingToRemove = 0;
        }
      }

      const realBatches = updatedBatches.filter(
        (b) => !b.adjustmentType || b.adjustmentType === "batch",
      );
      const totalBoxesFromBatches = realBatches.reduce(
        (s, b) => s + (Number(b.boxes) || 0),
        0,
      );
      const totalAmount = realBatches.reduce(
        (s, b) => s + (Number(b.amount) || 0),
        0,
      );
      const addAdj = Number(existingReport.addStockAdjustment || 0);
      const removeAdj = Number(existingReport.removeStockAdjustment || 0);
      const totalBoxes = Math.max(
        0,
        totalBoxesFromBatches + addAdj - removeAdj,
      );
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

      let status = "In Stock";
      if (totalBoxes <= 0) status = "Out of Stock";
      else if (totalBoxes < (existingReport.minStockLevel || 10))
        status = "Low Stock";

      await ReportInHand.updateOne(
        { _id: existingReport._id },
        {
          $set: {
            batches: updatedBatches,
            totalBoxesFromBatches,
            totalBoxes,
            totalAmount,
            averagePrice,
            status,
            updatedAt: new Date(),
          },
        },
      );
    }
    console.log(
      `✅ Purchase batches removed from stock for invoice: ${invoiceData.invoiceNumber}`,
    );
  } catch (err) {
    console.error("❌ removePurchaseBatchesFromStock failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: After restoring a sale invoice (revert DELETE), deduct stock again
// ─────────────────────────────────────────────────────────────────────────────
const restoreSaleDeductionsToStock = async (saleData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const products = saleData.products || [];

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const salesQty = Number(product.salesQty || 0);
      const bonusQty = Number(product.bonusQty || 0);
      const totalQty = salesQty + bonusQty;
      if (totalQty <= 0) continue;

      // For MR Sales, stock was in MR hand — skip warehouse deduction
      if (saleData.saleType === "MR Sale") continue;

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!existingReport) continue;

      // Re-deduct from stock (since we're restoring the sale record,
      // the sale deduction needs to be reapplied)
      const newRemoveAdj =
        Number(existingReport.removeStockAdjustment || 0) + totalQty;

      const realBatches = (existingReport.batches || []).filter(
        (b) => !b.adjustmentType || b.adjustmentType === "batch",
      );
      const totalBoxesFromBatches = realBatches.reduce(
        (s, b) => s + (Number(b.boxes) || 0),
        0,
      );
      const totalAmount = realBatches.reduce(
        (s, b) => s + (Number(b.amount) || 0),
        0,
      );
      const addAdj = Number(existingReport.addStockAdjustment || 0);
      const totalBoxes = Math.max(
        0,
        totalBoxesFromBatches + addAdj - newRemoveAdj,
      );
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

      let status = "In Stock";
      if (totalBoxes <= 0) status = "Out of Stock";
      else if (totalBoxes < (existingReport.minStockLevel || 10))
        status = "Low Stock";

      await ReportInHand.updateOne(
        { _id: existingReport._id },
        {
          $set: {
            removeStockAdjustment: newRemoveAdj,
            totalBoxes,
            averagePrice,
            status,
            updatedAt: new Date(),
          },
        },
      );
    }
    console.log(
      `✅ Sale deductions re-applied after revert for invoice: ${saleData.invoiceNumber}`,
    );
  } catch (err) {
    console.error("❌ restoreSaleDeductionsToStock failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: After removing a sale invoice (revert CREATE), restore stock
// ─────────────────────────────────────────────────────────────────────────────
const removeSaleDeductionsFromStock = async (saleData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const products = saleData.products || [];

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const salesQty = Number(product.salesQty || 0);
      const bonusQty = Number(product.bonusQty || 0);
      const totalQty = salesQty + bonusQty;
      if (totalQty <= 0) continue;

      if (saleData.saleType === "MR Sale") continue;

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!existingReport) continue;

      const newRemoveAdj = Math.max(
        0,
        Number(existingReport.removeStockAdjustment || 0) - totalQty,
      );

      const realBatches = (existingReport.batches || []).filter(
        (b) => !b.adjustmentType || b.adjustmentType === "batch",
      );
      const totalBoxesFromBatches = realBatches.reduce(
        (s, b) => s + (Number(b.boxes) || 0),
        0,
      );
      const totalAmount = realBatches.reduce(
        (s, b) => s + (Number(b.amount) || 0),
        0,
      );
      const addAdj = Number(existingReport.addStockAdjustment || 0);
      const totalBoxes = Math.max(
        0,
        totalBoxesFromBatches + addAdj - newRemoveAdj,
      );
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

      let status = "In Stock";
      if (totalBoxes <= 0) status = "Out of Stock";
      else if (totalBoxes < (existingReport.minStockLevel || 10))
        status = "Low Stock";

      await ReportInHand.updateOne(
        { _id: existingReport._id },
        {
          $set: {
            removeStockAdjustment: newRemoveAdj,
            totalBoxes,
            averagePrice,
            status,
            updatedAt: new Date(),
          },
        },
      );
    }
    console.log(
      `✅ Sale deductions removed after revert for invoice: ${saleData.invoiceNumber}`,
    );
  } catch (err) {
    console.error("❌ removeSaleDeductionsFromStock failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Flatten nested objects for Excel export
// ─────────────────────────────────────────────────────────────────────────────
const flattenObject = (obj, parentKey = "", result = {}) => {
  if (!obj || typeof obj !== "object") return result;
  for (let [key, value] of Object.entries(obj)) {
    const newKey = parentKey ? `${parentKey}.${key}` : key;
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value)
    ) {
      flattenObject(value, newKey, result);
    } else if (Array.isArray(value)) {
      result[newKey] = JSON.stringify(value);
    } else {
      result[newKey] =
        value instanceof Date
          ? formatDateTime(value)
          : value == null
            ? ""
            : String(value);
    }
  }
  return result;
};

// ─── GET /users/list ─────────────────────────────────────────────────────────
router.get("/users/list", async (req, res) => {
  try {
    const [staff, users] = await Promise.all([
      Staff.find({ isActive: true }).select("_id medicalRepName tMRId"),
      User.find({ isActive: true }).select("_id name role"),
    ]);

    const staffList = staff.map((s) => ({
      value: s._id.toString(),
      label: `${s.medicalRepName} (${s.tMRId || "N/A"})`,
      type: "staff",
    }));
    const userList = users.map((u) => ({
      value: u._id.toString(),
      label: `${u.name} (${u.role})`,
      type: "user",
    }));

    const combined = [...staffList, ...userList];
    res.json({ success: true, count: combined.length, data: combined });
  } catch (err) {
    console.error("User list error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET / ───────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      tableName,
      userId,
      startDate,
      endDate,
      search,
      referenceNumber,
      activityType = "all",
    } = req.query;

    const filter = {};

    if (action) filter.action = action;
    if (tableName) filter.tableName = tableName;
    if (userId && userId !== "undefined" && userId !== "null" && userId !== "")
      filter.userId = userId;
    if (referenceNumber)
      filter.referenceNumber = { $regex: referenceNumber, $options: "i" };
    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { actionLabel: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
        { tableName: { $regex: search, $options: "i" } },
        { tableLabel: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (activityType === "normal") {
      filter.action = { $in: ["DELETE", "UPDATE", "CREATE"] };
      filter.isReverted = { $ne: true };
    } else if (activityType === "revert") {
      filter.action = "REVERT";
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      logs: logs.map((l) => ({
        ...l,
        formattedDate: formatDateTime(l.createdAt),
      })),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error("Fetch logs error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:id/details ────────────────────────────────────────────────────────
router.get("/:id/details", async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id).lean();
    if (!log)
      return res.status(404).json({ success: false, message: "Log not found" });

    let liveRecord = null;
    if (log.recordId && log.tableName) {
      try {
        const importer = TABLE_MODEL_MAP[log.tableName];
        if (importer) {
          const mod = await importer();
          const Model = mod.default;
          if (mongoose.Types.ObjectId.isValid(log.recordId)) {
            liveRecord = await Model.findById(log.recordId).lean();
          }
        }
      } catch (e) {
        console.error("Live record fetch error:", e.message);
      }
    }

    res.json({
      success: true,
      log: { ...log, formattedDate: formatDateTime(log.createdAt) },
      liveRecord,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /stats/summary ──────────────────────────────────────────────────────
router.get("/stats/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    const [byAction, byTable, byUser, total] = await Promise.all([
      ActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: "$tableName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: "$userName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      ActivityLog.countDocuments(filter),
    ]);
    res.json({ success: true, total, byAction, byTable, byUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:id/revert ────────────────────────────────────────────────────────
// ✅ FIXED: Now recalculates stock totals after reverting purchase/sale records
router.post("/:id/revert", protect, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "super admin" && role !== "super" && role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only super-admin can revert actions.",
      });
    }

    const log = await ActivityLog.findById(req.params.id).lean();
    if (!log)
      return res.status(404).json({ success: false, message: "Log not found" });
    if (log.isReverted)
      return res
        .status(400)
        .json({ success: false, message: "Already reverted." });
    if (!["DELETE", "UPDATE", "CREATE"].includes(log.action)) {
      return res.status(400).json({
        success: false,
        message: `Cannot revert action: ${log.action}`,
      });
    }

    const importer = TABLE_MODEL_MAP[log.tableName];
    if (!importer) {
      return res.status(400).json({
        success: false,
        message: `No model found for table: ${log.tableName}`,
      });
    }
    const mod = await importer();
    const Model = mod.default;

    let revertSummary = {};

    // ─── DELETE revert: restore deleted records + fix stock ──────────────
    if (log.action === "DELETE") {
      const rows = log.previousSnapshots?.length
        ? log.previousSnapshots
        : log.previousData
          ? (Array.isArray(log.previousData)
              ? log.previousData
              : [log.previousData]
            ).map((d) => ({ data: d }))
          : [];

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          message: "No snapshot data available to restore.",
        });
      }

      let restored = 0,
        failed = 0;
      const restoredDocs = [];

      for (const row of rows) {
        const docData = row.data || row;
        const { _id, __v, createdAt, updatedAt, ...rest } = docData;
        try {
          const existing = await Model.findById(_id);
          if (existing) {
            failed++;
            continue;
          }
          const doc = new Model({
            _id: new mongoose.Types.ObjectId(String(_id)),
            ...rest,
          });
          await doc.save();
          restoredDocs.push(docData);
          restored++;
        } catch (e) {
          console.error("Restore failed for", _id, e.message);
          failed++;
        }
      }

      // ✅ KEY FIX: After restoring records, update stock calculations
      if (restoredDocs.length > 0) {
        if (log.tableName === "purchase") {
          // Restore each invoice's batches back into ReportInHand
          for (const doc of restoredDocs) {
            await restorePurchaseBatchesToStock(doc);
          }
        } else if (log.tableName === "sales") {
          // Re-apply sale deductions to stock
          for (const doc of restoredDocs) {
            await restoreSaleDeductionsToStock(doc);
          }
        }
        // Final recalculation pass to ensure all totals are accurate
        await recalculateReportInHandStock();
      }

      revertSummary = { restored, failed };

      // ─── UPDATE revert: roll back to previous state ───────────────────────
    } else if (log.action === "UPDATE") {
      const prevDoc = log.previousSnapshots?.[0]?.data || log.previousData;
      if (!prevDoc) {
        return res.status(400).json({
          success: false,
          message: "No previous snapshot to roll back to.",
        });
      }
      const targetId =
        log.recordId || (prevDoc._id ? String(prevDoc._id) : null);
      if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({
          success: false,
          message: "Cannot revert: invalid recordId.",
        });
      }
      const { _id, __v, createdAt, updatedAt, ...prevFields } = prevDoc;
      const updated = await Model.findByIdAndUpdate(
        targetId,
        { $set: prevFields },
        { new: true, runValidators: false },
      );

      // ✅ KEY FIX: Recalculate stock after update revert
      if (
        updated &&
        (log.tableName === "purchase" || log.tableName === "sales")
      ) {
        await recalculateReportInHandStock();
      }

      revertSummary = { rolledBack: updated ? 1 : 0 };

      // ─── CREATE revert: delete the created record + fix stock ─────────────
    } else if (log.action === "CREATE") {
      const newDoc = log.newSnapshots?.[0]?.data || log.newData;
      if (!newDoc) {
        return res.status(400).json({
          success: false,
          message: "No snapshot data available for the created record.",
        });
      }
      const targetId = log.recordId || (newDoc._id ? String(newDoc._id) : null);
      if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({
          success: false,
          message: "Cannot revert: invalid recordId.",
        });
      }

      const existingRecord = await Model.findById(targetId);
      if (!existingRecord) {
        return res.status(400).json({
          success: false,
          message: "Record no longer exists in the database.",
        });
      }

      // ✅ KEY FIX: Before deleting, undo the stock effect of this record
      if (log.tableName === "purchase") {
        await removePurchaseBatchesFromStock(newDoc);
      } else if (log.tableName === "sales") {
        await removeSaleDeductionsFromStock(newDoc);
      }

      await Model.findByIdAndDelete(targetId);

      // Final recalculation pass
      if (log.tableName === "purchase" || log.tableName === "sales") {
        await recalculateReportInHandStock();
      }

      revertSummary = { deleted: 1 };
    }

    // Create the revert log entry
    const revertLog = await ActivityLog.create({
      userId: req.user._id || req.user.id,
      userName: req.user.name || req.user.userName || "Super Admin",
      userRole: req.user.role,
      userEmail: req.user.email || null,
      action: "REVERT",
      actionLabel: `Reverted: ${log.actionLabel || log.action + " on " + (log.tableLabel || log.tableName)}`,
      tableName: log.tableName,
      tableLabel: log.tableLabel,
      recordId: log.recordId,
      referenceNumber: log.referenceNumber,
      previousSnapshots: log.newSnapshots,
      newSnapshots: log.previousSnapshots,
      previousData: log.newData,
      newData: log.previousData,
      ipAddress:
        req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
      userAgent: req.headers["user-agent"] || null,
      description: `Reverted ${log.action} action. Original log ID: ${log._id}. Stock recalculated.`,
    });

    await ActivityLog.findByIdAndUpdate(log._id, {
      isReverted: true,
      revertedAt: new Date(),
      revertedBy: req.user.name || req.user.userName || "Super Admin",
      revertLogId: revertLog._id.toString(),
    });

    res.json({
      success: true,
      message: "Reverted successfully. Stock totals have been recalculated.",
      revertSummary,
      revertLogId: revertLog._id,
    });
  } catch (err) {
    console.error("Revert error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:id/revert-single ────────────────────────────────────────────────
// ✅ FIXED: Now recalculates stock totals after reverting a single record
router.post("/:id/revert-single", protect, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "super admin" && role !== "super" && role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only super-admin can revert actions.",
      });
    }

    const { recordId, recordIndex } = req.body;
    const log = await ActivityLog.findById(req.params.id).lean();

    if (!log)
      return res.status(404).json({ success: false, message: "Log not found" });
    if (log.isReverted)
      return res
        .status(400)
        .json({ success: false, message: "Already reverted." });
    if (log.action !== "DELETE") {
      return res.status(400).json({
        success: false,
        message: "Single record revert only available for DELETE actions",
      });
    }

    const rows = log.previousSnapshots?.length
      ? log.previousSnapshots
      : Array.isArray(log.previousData)
        ? log.previousData.map((d) => ({ data: d }))
        : log.previousData
          ? [{ data: log.previousData }]
          : [];

    if (!rows.length || recordIndex >= rows.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid record index",
      });
    }

    const targetRow = rows[recordIndex];
    const docData = targetRow.data || targetRow;

    const importer = TABLE_MODEL_MAP[log.tableName];
    if (!importer) {
      return res.status(400).json({
        success: false,
        message: `No model found for table: ${log.tableName}`,
      });
    }

    const mod = await importer();
    const Model = mod.default;

    const { _id, __v, createdAt, updatedAt, ...rest } = docData;

    try {
      const existing = await Model.findById(_id);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Record already exists in the database",
        });
      }

      const doc = new Model({
        _id: new mongoose.Types.ObjectId(String(_id)),
        ...rest,
      });
      await doc.save();

      // ✅ KEY FIX: Restore stock for this single record
      if (log.tableName === "purchase") {
        await restorePurchaseBatchesToStock(docData);
      } else if (log.tableName === "sales") {
        await restoreSaleDeductionsToStock(docData);
      }

      // Final recalculation to make sure all totals are right
      if (log.tableName === "purchase" || log.tableName === "sales") {
        await recalculateReportInHandStock();
      }

      await ActivityLog.create({
        userId: req.user._id || req.user.id,
        userName: req.user.name || req.user.userName || "Super Admin",
        userRole: req.user.role,
        userEmail: req.user.email || null,
        action: "REVERT",
        actionLabel: `Reverted single record from ${log.actionLabel || log.action + " on " + (log.tableLabel || log.tableName)}`,
        tableName: log.tableName,
        tableLabel: log.tableLabel,
        referenceNumber: targetRow.refNumber,
        previousData: null,
        newData: docData,
        ipAddress:
          req.ip ||
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          null,
        userAgent: req.headers["user-agent"] || null,
        description: `Reverted single record from DELETE action. Original log ID: ${log._id}, Record Index: ${recordIndex}. Stock recalculated.`,
      });

      res.json({
        success: true,
        message:
          "Record restored successfully. Stock totals have been recalculated.",
      });
    } catch (e) {
      console.error("Single record restore failed:", e.message);
      res.status(500).json({ success: false, message: e.message });
    }
  } catch (err) {
    console.error("Revert single error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /export ─────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const {
      action,
      tableName,
      userId,
      startDate,
      endDate,
      search,
      activityType = "all",
    } = req.query;

    const filter = {};

    if (action) filter.action = action;
    if (tableName) filter.tableName = tableName;
    if (userId && userId !== "undefined" && userId !== "null" && userId !== "")
      filter.userId = userId;
    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { actionLabel: { $regex: search, $options: "i" } },
        { tableName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (activityType === "normal") {
      filter.action = { $in: ["DELETE", "UPDATE", "CREATE"] };
      filter.isReverted = { $ne: true };
    } else if (activityType === "revert") {
      filter.action = "REVERT";
    }

    const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).lean();

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const sheetData = [];
    sheetData.push([]);
    sheetData.push(["HEALTHCARE SOUTH EAST ASIA"]);
    sheetData.push(["User Activity Logs"]);
    sheetData.push([`Generated On: ${formattedDate}`]);
    sheetData.push([]);

    if (startDate || endDate) {
      let dateRange = "";
      if (startDate && endDate) {
        dateRange = `Date Range: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
      } else if (startDate) {
        dateRange = `From: ${new Date(startDate).toLocaleDateString()}`;
      } else if (endDate) {
        dateRange = `Until: ${new Date(endDate).toLocaleDateString()}`;
      }
      if (dateRange) {
        sheetData.push([dateRange]);
        sheetData.push([]);
      }
    }

    sheetData.push([
      "Date & Time",
      "User",
      "Role",
      "Action",
      "Details",
      "Status",
      "Reverted By",
      "Reverted At",
      "Expires At",
    ]);

    logs.forEach((l) => {
      sheetData.push([
        formatDateTime(l.createdAt),
        l.userName || "System",
        l.userRole || "",
        l.action || "",
        l.actionLabel || l.description || "",
        l.isReverted ? "Reverted" : "Normal",
        l.revertedBy || "",
        l.revertedAt ? formatDateTime(l.revertedAt) : "",
        l.expiresAt ? formatDateTime(l.expiresAt) : "",
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws["!cols"] = [
      { wch: 22 },
      { wch: 18 },
      { wch: 12 },
      { wch: 10 },
      { wch: 50 },
      { wch: 10 },
      { wch: 18 },
      { wch: 22 },
      { wch: 22 },
    ];

    const headerRowIndex = sheetData.findIndex(
      (row) => row[0] === "Date & Time" && row[1] === "User",
    );
    const lastColumnIndex = 8;
    const companyRowIndex = 1;
    const titleRowIndex = 2;
    const dateRowIndex = 3;

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: companyRowIndex, c });
      if (!ws[cellAddress])
        ws[cellAddress] = { t: "s", v: "HEALTHCARE SOUTH EAST ASIA" };
      ws[cellAddress].s = {
        font: { bold: true, sz: 18, color: { rgb: "1E3A8A" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: titleRowIndex, c });
      if (!ws[cellAddress])
        ws[cellAddress] = { t: "s", v: "User Activity Logs" };
      ws[cellAddress].s = {
        font: { bold: true, sz: 14, color: { rgb: "1E40AF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: dateRowIndex, c });
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          font: { italic: true, color: { rgb: "6B7280" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push(
      {
        s: { r: companyRowIndex, c: 0 },
        e: { r: companyRowIndex, c: lastColumnIndex },
      },
      {
        s: { r: titleRowIndex, c: 0 },
        e: { r: titleRowIndex, c: lastColumnIndex },
      },
      {
        s: { r: dateRowIndex, c: 0 },
        e: { r: dateRowIndex, c: lastColumnIndex },
      },
    );

    const filterRowIndex = sheetData.findIndex(
      (row) => row && row[0] && row[0].startsWith("Date Range:"),
    );
    if (filterRowIndex >= 0) {
      for (let i = 0; i <= lastColumnIndex; i++) {
        const cellAddress = XLSX.utils.encode_cell({ r: filterRowIndex, c: i });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { color: { rgb: "DC2626" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }
      ws["!merges"].push({
        s: { r: filterRowIndex, c: 0 },
        e: { r: filterRowIndex, c: lastColumnIndex },
      });
    }

    if (headerRowIndex >= 0) {
      for (let i = 0; i <= lastColumnIndex; i++) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: i });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4F46E5" }, patternType: "solid" },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    const dataStartRow = headerRowIndex + 1;
    for (let i = dataStartRow; i < sheetData.length; i++) {
      const rowColor = (i - dataStartRow) % 2 === 0 ? "F9FAFB" : "FFFFFF";
      for (let c = 0; c <= lastColumnIndex; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c });
        if (ws[cellAddress]) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.fill = {
            fgColor: { rgb: rowColor },
            patternType: "solid",
          };
          ws[cellAddress].s.alignment = { vertical: "center" };
        }
      }
    }

    for (let r = 0; r < sheetData.length; r++) {
      for (let c = 0; c <= lastColumnIndex; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        if (ws[cellAddress]) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.border = {
            top: { style: "thin", color: { rgb: "E5E7EB" } },
            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
            left: { style: "thin", color: { rgb: "E5E7EB" } },
            right: { style: "thin", color: { rgb: "E5E7EB" } },
          };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "User Activity Logs");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=user_activity_logs.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ success: false, message: "Failed to export logs" });
  }
});

// ─── DELETE /cleanup/:days ───────────────────────────────────────────────────
router.delete("/cleanup/:days", protect, async (req, res) => {
  try {
    if (
      req.user?.role !== "super admin" &&
      req.user?.role !== "super" &&
      req.user?.role !== "superadmin"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Super-admin only." });
    }
    const days = parseInt(req.params.days) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await ActivityLog.deleteMany({ createdAt: { $lt: cutoff } });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
