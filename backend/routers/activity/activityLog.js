import express from "express";
import ActivityLog from "../../models/activity/activityLog.js";
import mongoose from "mongoose";

// ✅ ADD THESE (NEW)
import Staff from "../../models/staffMember/staff.js";
import User from "../../models/User.js";

// Dynamic model resolver
const TABLE_MODEL_MAP = {
  sales: () => import("../models/sale/saleSummary.js"),
  purchase: () => import("../models/purcharsing/purcharsing.js"),
  customers: () => import("../models/master/customer.js"),
  suppliers: () => import("../models/master/supplier.js"),
  products: () => import("../models/projectManager/product.js"),
  expenses: () => import("../models/expenses/addExpense.js"),
  staff: () => import("../models/staffMember/staff.js"),
  stockAdjustment: () => import("../models/stock/stockAdjustment.js"),
  stockTransfer: () => import("../models/stock/stockTransfer.js"),
  purchaseReturn: () => import("../models/purcharsing/purchaseReturn.js"),
  salesReturn: () => import("../models/sale/saleReturn.js"),
};

const router = express.Router();

// =====================================================
// ✅ NEW API: GET USERS + STAFF (FOR DROPDOWN)
// =====================================================
router.get("/users/list", async (req, res) => {
  try {
    // 🔹 Active Staff
    const staff = await Staff.find({ isActive: true }).select(
      "_id medicalRepName tMRId",
    );

    // 🔹 Active Users
    const users = await User.find({ isActive: true }).select("_id name role");

    // 🔹 Format Staff
    const staffList = staff.map((s) => ({
      value: s._id,
      label: `${s.medicalRepName} (${s.tMRId || "N/A"})`,
      type: "staff",
    }));

    // 🔹 Format Users
    const userList = users.map((u) => ({
      value: u._id,
      label: `${u.name} (${u.role})`,
      type: "user",
    }));

    // 🔹 Combine both
    const combined = [...staffList, ...userList];

    res.json({
      success: true,
      count: combined.length,
      data: combined,
    });
  } catch (error) {
    console.error("User list error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// =====================================================
// GET ALL ACTIVITY LOGS (FILTER + PAGINATION)
// =====================================================
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
    if (userId) filter.userId = userId;

    if (referenceNumber) {
      filter.referenceNumber = {
        $regex: referenceNumber,
        $options: "i",
      };
    }

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { actionLabel: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
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
      logs,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// =====================================================
// GET SINGLE LOG DETAILS
// =====================================================
router.get("/:id/details", async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id).lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Log not found",
      });
    }

    let recordDetails = null;

    if (log.recordId && log.tableName) {
      try {
        const modelImporter = TABLE_MODEL_MAP[log.tableName];

        if (modelImporter) {
          const mod = await modelImporter();
          const Model = mod.default;

          if (mongoose.Types.ObjectId.isValid(log.recordId)) {
            recordDetails = await Model.findById(log.recordId).lean();
          }
        }
      } catch (e) {
        console.error("Record fetch error:", e.message);
      }
    }

    res.json({
      success: true,
      log,
      recordDetails,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// =====================================================
// GET STATS SUMMARY
// =====================================================
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

    res.json({
      success: true,
      total,
      byAction,
      byTable,
      byUser,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// =====================================================
// DELETE OLD LOGS
// =====================================================
router.delete("/cleanup/:days", async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 90;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await ActivityLog.deleteMany({
      createdAt: { $lt: cutoff },
    });

    res.json({
      success: true,
      deleted: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;
