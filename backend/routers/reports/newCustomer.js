import express from "express";
import Customer from "../../models/master/customer.js";
import Staff from "../../models/staffMember/staff.js";
import ExcelJS from "exceljs";
import mongoose from "mongoose";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build date filter on customer `date` field
// ─────────────────────────────────────────────────────────────────────────────
const buildDateFilter = (dateFilter, startDate, endDate) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  switch (dateFilter) {
    case "today": {
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { date: { $gte: start, $lte: end } };
    }
    case "currentMonth": {
      const start = new Date(currentYear, currentMonth, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentYear, currentMonth + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { date: { $gte: start, $lte: end } };
    }
    case "janToPreviousMonth": {
      if (currentMonth === 0) {
        const start = new Date(currentYear - 1, 0, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(currentYear - 1, 11, 31);
        end.setHours(23, 59, 59, 999);
        return { date: { $gte: start, $lte: end } };
      }
      const start = new Date(currentYear, 0, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentYear, currentMonth, 0);
      end.setHours(23, 59, 59, 999);
      return { date: { $gte: start, $lte: end } };
    }
    case "custom": {
      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return { date: { $gte: start, $lte: end } };
      }
      return {};
    }
    case "all":
    default:
      return {};
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET / — paginated new customer report (MR Wise or Zone Wise)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 7,
      search = "",
      reportType = "MR Wise",
      dateFilter = "all",
      startDate,
      endDate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let matchStage = {
      enabled: true,
      ...buildDateFilter(dateFilter, startDate, endDate),
    };

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchStage[reportType === "MR Wise" ? "medicalRepName" : "zone"] =
        searchRegex;
    }

    let records = [];
    let totalRecords = 0;

    if (reportType === "MR Wise") {
      const allStaff = await Staff.find({}).lean();
      const staffMap = new Map();
      allStaff.forEach((s) => {
        if (s._id) {
          staffMap.set(s._id.toString(), {
            MRId: s.MRId,
            contactNo: s.contactNo,
            email: s.email,
            teamName: s.teamName,
            originalName: s.medicalRepName,
          });
        }
      });

      const [result] = await Customer.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $ifNull: [
                "$medicalRepId",
                { $ifNull: ["$medicalRepName", "Unknown MR"] },
              ],
            },
            mrName: { $first: "$medicalRepName" },
            medicalRepId: { $first: "$medicalRepId" },
            zone: { $first: "$zone" },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$date" },
          },
        },
        { $sort: { newCustomers: -1 } },
        {
          $facet: {
            paginatedResults: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "total" }],
          },
        },
      ]);

      records = (result?.paginatedResults || []).map((item, index) => {
        const mrName = item.mrName || "Unknown MR";
        let staffDetails = null;

        if (item.medicalRepId) {
          staffDetails = staffMap.get(item.medicalRepId.toString());
        }
        if (!staffDetails && mrName !== "Unknown MR") {
          const norm = mrName.toLowerCase().trim();
          for (const [, s] of staffMap.entries()) {
            if (s.originalName?.toLowerCase().trim() === norm) {
              staffDetails = s;
              break;
            }
          }
        }

        let mrIdToUse = "N/A";
        if (staffDetails?.MRId) mrIdToUse = staffDetails.MRId;
        else if (item.medicalRepId) mrIdToUse = item.medicalRepId.toString();
        else if (item._id)
          mrIdToUse =
            typeof item._id === "object" ? item._id.toString() : item._id;

        return {
          srNo: skip + index + 1,
          mrId: mrIdToUse,
          mrName: staffDetails?.originalName || mrName,
          contactNo: staffDetails?.contactNo || "N/A",
          email: staffDetails?.email || "N/A",
          teamName: staffDetails?.teamName || "N/A",
          zone: item.zone || "N/A",
          newCustomers: item.newCustomers,
          date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : "N/A",
          medicalRepId: item.medicalRepId
            ? item.medicalRepId.toString()
            : "N/A",
        };
      });

      totalRecords = result?.totalCount?.[0]?.total || 0;
    } else {
      const allStaff = await Staff.find({ enabled: true }).lean();
      const staffMap = new Map();
      allStaff.forEach((s) => {
        if (s._id) {
          staffMap.set(s._id.toString(), {
            contactNo: s.contactNo,
            originalName: s.medicalRepName,
          });
        }
      });

      const [result] = await Customer.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $ifNull: ["$zone", "Unknown Zone"] },
            zoneName: { $first: "$zone" },
            totalMRs: {
              $addToSet: {
                $ifNull: [
                  { $toString: "$medicalRepId" },
                  { $ifNull: ["$medicalRepName", "Unknown MR"] },
                ],
              },
            },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$date" },
            medicalRepIds: { $addToSet: "$medicalRepId" },
          },
        },
        {
          $project: {
            zoneName: { $ifNull: ["$zoneName", "Unknown Zone"] },
            totalMRs: { $size: "$totalMRs" },
            newCustomers: 1,
            averagePerMR: {
              $cond: [
                { $gt: [{ $size: "$totalMRs" }, 0] },
                { $divide: ["$newCustomers", { $size: "$totalMRs" }] },
                0,
              ],
            },
            latestDate: 1,
            medicalRepIds: 1,
          },
        },
        { $sort: { newCustomers: -1 } },
        {
          $facet: {
            paginatedResults: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "total" }],
          },
        },
      ]);

      records = (result?.paginatedResults || []).map((item, index) => {
        let contactMR = "N/A";
        let contactNo = "N/A";

        for (const id of item.medicalRepIds || []) {
          if (id) {
            const s = staffMap.get(id.toString());
            if (s?.contactNo) {
              contactMR = s.originalName || "N/A";
              contactNo = s.contactNo;
              break;
            }
          }
        }

        return {
          srNo: skip + index + 1,
          zoneId: item._id || "N/A",
          zoneName: item.zoneName || "Unknown Zone",
          totalMRs: item.totalMRs || 0,
          newCustomers: item.newCustomers || 0,
          averagePerMR: item.averagePerMR || 0,
          contactNo,
          contactMR,
          date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : "N/A",
        };
      });

      totalRecords = result?.totalCount?.[0]?.total || 0;
    }

    const [summary] = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalNewCustomers: { $sum: 1 },
          totalMRs: {
            $addToSet: {
              $ifNull: [
                { $toString: "$medicalRepId" },
                { $ifNull: ["$medicalRepName", "Unknown MR"] },
              ],
            },
          },
          totalZones: { $addToSet: { $ifNull: ["$zone", "Unknown Zone"] } },
        },
      },
      {
        $project: {
          totalNewCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          totalZones: { $size: "$totalZones" },
          averageCustomersPerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalNewCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          },
        },
      },
    ]);

    const totalPages = Math.ceil(totalRecords / limitNum);

    res.json({
      success: true,
      data: {
        summary: summary || {
          totalNewCustomers: 0,
          totalMRs: 0,
          totalZones: 0,
          averageCustomersPerMR: 0,
        },
        records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching new customers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch new customer data",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /customers — fetch customers for a specific MR or zone (with pagination)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET /customers — fetch customers for a specific MR or zone (with pagination)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/customers", async (req, res) => {
  try {
    const {
      mrId,
      mrName,
      zone,
      page = 1,
      limit = 10,
      dateFilter,
      startDate,
      endDate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let matchStage = { enabled: true };

    if (mrId) {
      // Check if mrId is a valid MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(mrId)) {
        // Use ObjectId directly
        matchStage.medicalRepId = new mongoose.Types.ObjectId(mrId);
      } else {
        // Not a valid ObjectId → treat as custom MR ID (e.g., "946")
        // Find the staff member with this custom MRId
        const staff = await Staff.findOne({ MRId: mrId }).lean();
        if (staff && staff._id) {
          matchStage.medicalRepId = staff._id;
        } else {
          // No staff found with that custom ID → return empty result
          return res.json({
            success: true,
            data: [],
            pagination: {
              currentPage: pageNum,
              totalPages: 1,
              totalRecords: 0,
              hasNext: false,
              hasPrev: false,
            },
          });
        }
      }
    } else if (mrName) {
      // Fallback to MR name (exact match, case‑insensitive)
      matchStage.medicalRepName = {
        $regex: new RegExp(`^${mrName.trim()}$`, "i"),
      };
    } else if (zone) {
      // Zone filter
      matchStage.zone = { $regex: new RegExp(`^${zone.trim()}$`, "i") };
    } else {
      return res.status(400).json({
        success: false,
        message: "Either mrId, mrName, or zone is required",
      });
    }

    // Apply date filter if provided
    if (dateFilter && dateFilter !== "all") {
      const dateFilterObj = buildDateFilter(dateFilter, startDate, endDate);
      matchStage = { ...matchStage, ...dateFilterObj };
    }

    const customers = await Customer.find(matchStage)
      .select(
        "name customerCode customerNumber address province date medicalRepName",
      )
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Customer.countDocuments(matchStage);
    const totalPages = Math.ceil(total / limitNum);
    console.log('values of customers', customers);
    res.json({
      success: true,
      data: customers,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching customers:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export — Excel export with date filter
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const {
      search = "",
      reportType = "MR Wise",
      dateFilter = "all",
      startDate,
      endDate,
    } = req.query;

    let matchStage = {
      enabled: true,
      ...buildDateFilter(dateFilter, startDate, endDate),
    };

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchStage[reportType === "MR Wise" ? "medicalRepName" : "zone"] =
        searchRegex;
    }

    let records = [];

    if (reportType === "MR Wise") {
      const allStaff = await Staff.find({}).lean();
      const staffMap = new Map();
      allStaff.forEach((s) => {
        if (s._id) {
          staffMap.set(s._id.toString(), {
            MRId: s.MRId,
            contactNo: s.contactNo,
            email: s.email,
            teamName: s.teamName,
            originalName: s.medicalRepName,
          });
        }
      });

      const result = await Customer.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $ifNull: [
                "$medicalRepId",
                { $ifNull: ["$medicalRepName", "Unknown MR"] },
              ],
            },
            mrName: { $first: "$medicalRepName" },
            medicalRepId: { $first: "$medicalRepId" },
            zone: { $first: "$zone" },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$date" },
          },
        },
        { $sort: { newCustomers: -1 } },
      ]);

      records = result.map((item, index) => {
        const mrName = item.mrName || "Unknown MR";
        let staffDetails = null;
        if (item.medicalRepId)
          staffDetails = staffMap.get(item.medicalRepId.toString());
        if (!staffDetails && mrName !== "Unknown MR") {
          const norm = mrName.toLowerCase().trim();
          for (const [, s] of staffMap.entries()) {
            if (s.originalName?.toLowerCase().trim() === norm) {
              staffDetails = s;
              break;
            }
          }
        }
        let mrIdToUse = "N/A";
        if (staffDetails?.MRId) mrIdToUse = staffDetails.MRId;
        else if (item.medicalRepId) mrIdToUse = item.medicalRepId.toString();

        return {
          "Sr.No": index + 1,
          "MR ID": mrIdToUse,
          "MR Name": staffDetails?.originalName || mrName,
          Contact: staffDetails?.contactNo || "N/A",
          Email: staffDetails?.email || "N/A",
          "Team Name": staffDetails?.teamName || "N/A",
          Zone: item.zone || "N/A",
          "New Customers": item.newCustomers,
          Date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : "N/A",
        };
      });
    } else {
      const allStaff = await Staff.find({ enabled: true }).lean();
      const staffMap = new Map();
      allStaff.forEach((s) => {
        if (s._id)
          staffMap.set(s._id.toString(), {
            contactNo: s.contactNo,
            originalName: s.medicalRepName,
          });
      });

      const result = await Customer.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $ifNull: ["$zone", "Unknown Zone"] },
            zoneName: { $first: "$zone" },
            totalMRs: {
              $addToSet: {
                $ifNull: [
                  { $toString: "$medicalRepId" },
                  { $ifNull: ["$medicalRepName", "Unknown MR"] },
                ],
              },
            },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$date" },
            medicalRepIds: { $addToSet: "$medicalRepId" },
          },
        },
        {
          $project: {
            zoneName: { $ifNull: ["$zoneName", "Unknown Zone"] },
            totalMRs: { $size: "$totalMRs" },
            newCustomers: 1,
            averagePerMR: {
              $cond: [
                { $gt: [{ $size: "$totalMRs" }, 0] },
                { $divide: ["$newCustomers", { $size: "$totalMRs" }] },
                0,
              ],
            },
            latestDate: 1,
            medicalRepIds: 1,
          },
        },
        { $sort: { newCustomers: -1 } },
      ]);

      records = result.map((item, index) => {
        let contactMR = "N/A";
        for (const id of item.medicalRepIds || []) {
          if (id) {
            const s = staffMap.get(id.toString());
            if (s) {
              contactMR = s.originalName || "N/A";
              break;
            }
          }
        }
        return {
          "Sr.No": index + 1,
          "Zone Name": item.zoneName || "Unknown Zone",
          "Total MRs": item.totalMRs || 0,
          "New Customers": item.newCustomers || 0,
          "Average per MR": item.averagePerMR?.toFixed(1) || "0.0",
          "Contact MR": contactMR,
          Date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : "N/A",
        };
      });
    }

    if (records.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No data found to export" });
    }

    const [summary] = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalNewCustomers: { $sum: 1 },
          totalMRs: {
            $addToSet: {
              $ifNull: [{ $toString: "$medicalRepId" }, "$medicalRepName"],
            },
          },
          totalZones: { $addToSet: { $ifNull: ["$zone", "Unknown Zone"] } },
        },
      },
      {
        $project: {
          totalNewCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          totalZones: { $size: "$totalZones" },
          averageCustomersPerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalNewCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          },
        },
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("New Customer Report");

    ws.mergeCells("A1:I1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `New Customer Addition — ${reportType} Report`;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center" };

    ws.mergeCells("A2:I2");
    const dateLabel = ws.getCell("A2");
    const filterLabels = {
      today: "Filter: Today",
      all: "Filter: All Records",
      currentMonth: `Filter: Current Month (${new Date().toLocaleString("default", { month: "long", year: "numeric" })})`,
      janToPreviousMonth: "Filter: Jan – Previous Month",
      custom:
        startDate && endDate
          ? `Filter: ${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`
          : "Filter: Custom",
    };
    dateLabel.value = filterLabels[dateFilter] || "Filter: All Records";
    dateLabel.font = { size: 12, italic: true, color: { argb: "FF555555" } };
    dateLabel.alignment = { horizontal: "center" };

    ws.addRow([]);

    const summaryData = summary || {
      totalNewCustomers: 0,
      totalMRs: 0,
      totalZones: 0,
      averageCustomersPerMR: 0,
    };
    const summaryRow = ws.addRow([
      "Total Customers",
      summaryData.totalNewCustomers,
      reportType === "MR Wise" ? "Total MRs" : "Total Zones",
      reportType === "MR Wise" ? summaryData.totalMRs : summaryData.totalZones,
      "Avg per MR",
      summaryData.averageCustomersPerMR?.toFixed(1) || "0.0",
      "Generated",
      new Date().toLocaleDateString(),
    ]);
    summaryRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    ws.addRow([]);

    const headers = Object.keys(records[0] || {});
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center" };
    });

    records.forEach((r) => ws.addRow(Object.values(r)));

    ws.columns.forEach((col) => {
      let max = 10;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 0;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 2, 35);
    });

    const fileName = `New_Customer_${reportType.replace(" ", "_")}_${dateFilter}_${Date.now()}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error exporting:", error);
    res
      .status(500)
      .json({ success: false, message: "Export failed", error: error.message });
  }
});

export default router;
