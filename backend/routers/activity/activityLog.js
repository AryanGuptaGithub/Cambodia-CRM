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
  purchase: () => import("../../models/purcharsing/purcharsing.js"),
  products: () => import("../../models/projectManager/product.js"),
  expenses: () => import("../../models/expenses/addExpense.js"),
  staff: () => import("../../models/staffMember/staff.js"),
  stockAdjustment: () => import("../../models/stock/stockAdjustment.js"),
  stockTransfer: () => import("../../models/stock/stockTransfer.js"),
  purchaseReturn: () => import("../../models/purcharsing/purchaseReturn.js"),
  salesReturn: () => import("../../models/sale/saleReturn.js"),
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
// Helper: Recursively flatten nested objects for Excel export
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
router.post("/:id/revert", protect, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "super admin" && role !== "super") {
      return res
        .status(403)
        .json({
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
    if (!["DELETE", "UPDATE"].includes(log.action)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Cannot revert action: ${log.action}`,
        });
    }

    const importer = TABLE_MODEL_MAP[log.tableName];
    if (!importer) {
      return res
        .status(400)
        .json({
          success: false,
          message: `No model found for table: ${log.tableName}`,
        });
    }
    const mod = await importer();
    const Model = mod.default;

    let revertSummary = {};

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
        return res
          .status(400)
          .json({
            success: false,
            message: "No snapshot data available to restore.",
          });
      }

      let restored = 0,
        failed = 0;
      for (const row of rows) {
        const docData = row.data || row;
        const { _id, __v, createdAt, updatedAt, ...rest } = docData;
        try {
          const doc = new Model({
            _id: new mongoose.Types.ObjectId(String(_id)),
            ...rest,
          });
          await doc.save();
          restored++;
        } catch (e) {
          console.error("Restore failed for", _id, e.message);
          failed++;
        }
      }
      revertSummary = { restored, failed };
    } else if (log.action === "UPDATE") {
      const prevDoc = log.previousSnapshots?.[0]?.data || log.previousData;
      if (!prevDoc) {
        return res
          .status(400)
          .json({
            success: false,
            message: "No previous snapshot to roll back to.",
          });
      }
      const targetId =
        log.recordId || (prevDoc._id ? String(prevDoc._id) : null);
      if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        return res
          .status(400)
          .json({
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
      revertSummary = { rolledBack: updated ? 1 : 0 };
    }

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
      description: `Reverted ${log.action} action. Original log ID: ${log._id}`,
    });

    await ActivityLog.findByIdAndUpdate(log._id, {
      isReverted: true,
      revertedAt: new Date(),
      revertedBy: req.user.name || req.user.userName || "Super Admin",
      revertLogId: revertLog._id.toString(),
    });

    res.json({
      success: true,
      message: "Reverted successfully.",
      revertSummary,
      revertLogId: revertLog._id,
    });
  } catch (err) {
    console.error("Revert error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /export ─────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const { action, tableName, userId, startDate, endDate, search } = req.query;

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

    const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).lean();
    const wb = XLSX.utils.book_new();

    // Sheet 1: All logs (summary)
    const summaryData = logs.map((l) => ({
      "Date & Time": formatDateTime(l.createdAt),
      User: l.userName || "System",
      Role: l.userRole || "",
      Action: l.action || "",
      Module: l.tableLabel || l.tableName || "",
      Reference: l.referenceNumber || "",
      Details: l.actionLabel || l.description || "",
      Reverted: l.isReverted ? "Yes" : "No",
      "Reverted By": l.revertedBy || "",
      "Reverted At": l.revertedAt ? formatDateTime(l.revertedAt) : "",
      "IP Address": l.ipAddress || "",
      "Expires At": l.expiresAt ? formatDateTime(l.expiresAt) : "",
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary["!cols"] = [
      { wch: 26 },
      { wch: 18 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 44 },
      { wch: 10 },
      { wch: 18 },
      { wch: 26 },
      { wch: 18 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, "All Logs");

    // Sheet 2: DELETE records (flattened)
    const deleteRows = [];
    for (const l of logs.filter((x) => x.action === "DELETE")) {
      const rows = l.previousSnapshots?.length
        ? l.previousSnapshots
        : Array.isArray(l.previousData)
          ? l.previousData.map((d) => ({ data: d }))
          : l.previousData
            ? [{ data: l.previousData }]
            : [];
      for (const row of rows) {
        const doc = row.data || row;
        const flat = flattenObject(doc);
        flat["Log Date"] = formatDateTime(l.createdAt);
        flat["Deleted By"] = l.userName || "System";
        deleteRows.push(flat);
      }
    }
    if (deleteRows.length) {
      const wsDelete = XLSX.utils.json_to_sheet(deleteRows);
      XLSX.utils.book_append_sheet(wb, wsDelete, "Deleted Records");
    }

    // Sheet 3: UPDATE diffs (flattened before/after)
    const updateRows = [];
    for (const l of logs.filter((x) => x.action === "UPDATE")) {
      const prev = l.previousSnapshots?.[0]?.data || l.previousData;
      const next = l.newSnapshots?.[0]?.data || l.newData;
      if (!prev && !next) continue;

      const prevFlat = flattenObject(prev);
      const nextFlat = flattenObject(next);
      const allKeys = [
        ...new Set([...Object.keys(prevFlat), ...Object.keys(nextFlat)]),
      ];

      for (const k of allKeys) {
        if (["__v"].includes(k)) continue;
        const before = prevFlat[k] ?? "";
        const after = nextFlat[k] ?? "";
        const changed = String(before) !== String(after);
        updateRows.push({
          "Log Date": formatDateTime(l.createdAt),
          "Updated By": l.userName || "System",
          Reference: l.referenceNumber || "",
          Field: k,
          Before: before,
          After: after,
          Changed: changed ? "YES" : "no",
        });
      }
    }
    if (updateRows.length) {
      const wsUpdate = XLSX.utils.json_to_sheet(updateRows);
      wsUpdate["!cols"] = [
        { wch: 26 },
        { wch: 18 },
        { wch: 14 },
        { wch: 22 },
        { wch: 30 },
        { wch: 30 },
        { wch: 8 },
      ];
      XLSX.utils.book_append_sheet(wb, wsUpdate, "Updated Records");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=activity_logs.xlsx",
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
    if (req.user?.role !== "super admin" && req.user?.role !== "super") {
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
