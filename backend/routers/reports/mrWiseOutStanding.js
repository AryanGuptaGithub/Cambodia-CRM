import express from "express";
import ExcelJS from "exceljs";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Helper function to generate a fallback MR ID (if not found in staff)
const generateFallbackMRId = (index) => {
  return `MR${String(index + 1).padStart(3, "0")}`;
};

// GET / – paginated data with working contact info
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = { dueAmount: { $gt: 0 } };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      matchConditions.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // Base aggregation pipeline
    // Key fix: normalize mrName (trim + toLower) BEFORE grouping so that
    // "John Doe", " john doe ", "JOHN DOE" etc. all collapse into one group.
    // We keep the original (first seen) mrName for display.
    const basePipeline = [
      { $match: matchConditions },

      // Step 1: add a normalised key field on every document
      {
        $addFields: {
          _mrNameNormalized: {
            $toLower: { $trim: { input: "$mrName" } },
          },
        },
      },

      // Step 2: group by the normalised key; keep first original name for display
      {
        $group: {
          _id: "$_mrNameNormalized",
          mrNameDisplay: { $first: { $trim: { input: "$mrName" } } },
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      // Step 3: look up staff using case-insensitive match on the normalised name
      {
        $lookup: {
          from: "staffs",
          let: { mrNameNorm: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toLower: { $trim: { input: "$medicalRepName" } } },
                    "$$mrNameNorm",
                  ],
                },
              },
            },
            {
              $project: {
                medicalRepName: 1,
                teamName: 1,
                contactNo: 1,
                email: 1,
                MRId: 1,
              },
            },
          ],
          as: "staffDetails",
        },
      },

      {
        $project: {
          mrName: "$mrNameDisplay",
          totalOutstandingAmount: { $round: ["$totalOutstandingAmount", 2] },
          totalCustomers: { $size: "$uniqueCustomers" },
          staff: {
            $cond: {
              if: { $gt: [{ $size: "$staffDetails" }, 0] },
              then: { $arrayElemAt: ["$staffDetails", 0] },
              else: {
                medicalRepName: "$mrNameDisplay",
                contactNo: "Not Available",
                email: "Not Available",
                teamName: "Not Available",
                MRId: null,
              },
            },
          },
        },
      },

      { $sort: { totalOutstandingAmount: -1 } },
    ];

    const [countResult, mrData, summaryResult] = await Promise.all([
      SaleSummary.aggregate([...basePipeline, { $count: "totalCount" }]),

      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),

      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $addFields: {
            _mrNameNormalized: {
              $toLower: { $trim: { input: "$mrName" } },
            },
          },
        },
        {
          $group: {
            _id: "$_mrNameNormalized",
            totalOutstandingAmount: { $sum: "$dueAmount" },
            uniqueCustomers: { $addToSet: "$customerCode" },
          },
        },
        {
          $group: {
            _id: null,
            totalOutstandingAmount: {
              $sum: { $round: ["$totalOutstandingAmount", 2] },
            },
            totalCustomers: { $sum: { $size: "$uniqueCustomers" } },
            totalMRs: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    const records = mrData.map((mr, index) => ({
      mrId: mr.staff?.MRId
        ? String(mr.staff.MRId).padStart(3, "0")
        : generateFallbackMRId(skip + index),
      mrName: mr.mrName,
      totalOutstandingAmount: mr.totalOutstandingAmount,
      totalCustomers: mr.totalCustomers,
      staff: mr.staff,
    }));

    const summary = summaryResult[0] || {
      totalOutstandingAmount: 0,
      totalCustomers: 0,
      totalMRs: 0,
    };

    res.json({
      data: {
        summary,
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
  } catch (err) {
    console.error("Error in MR wise outstanding:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

// GET /export/excel – Excel export with working contact info
router.get("/export/excel", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    const matchConditions = { dueAmount: { $gt: 0 } };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      matchConditions.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    const mrData = await SaleSummary.aggregate([
      { $match: matchConditions },

      // Normalise mrName before grouping (same fix as the GET route above)
      {
        $addFields: {
          _mrNameNormalized: {
            $toLower: { $trim: { input: "$mrName" } },
          },
        },
      },

      {
        $group: {
          _id: "$_mrNameNormalized",
          mrNameDisplay: { $first: { $trim: { input: "$mrName" } } },
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      {
        $lookup: {
          from: "staffs",
          let: { mrNameNorm: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toLower: { $trim: { input: "$medicalRepName" } } },
                    "$$mrNameNorm",
                  ],
                },
              },
            },
            {
              $project: {
                medicalRepName: 1,
                teamName: 1,
                contactNo: 1,
                email: 1,
                MRId: 1,
              },
            },
          ],
          as: "staffDetails",
        },
      },

      {
        $project: {
          mrName: "$mrNameDisplay",
          totalOutstandingAmount: { $round: ["$totalOutstandingAmount", 2] },
          totalCustomers: { $size: "$uniqueCustomers" },
          staff: {
            $cond: {
              if: { $gt: [{ $size: "$staffDetails" }, 0] },
              then: { $arrayElemAt: ["$staffDetails", 0] },
              else: {
                medicalRepName: "$mrNameDisplay",
                contactNo: "Not Available",
                email: "Not Available",
                teamName: "Not Available",
                MRId: null,
              },
            },
          },
        },
      },

      { $sort: { totalOutstandingAmount: -1 } },
    ]);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MR Wise Outstanding System";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("MR Wise Outstanding");

    worksheet.columns = [
      { header: "Sr.No", key: "serialNo", width: 10 },
      { header: "MR ID", key: "mrId", width: 15 },
      { header: "MR Name", key: "mrName", width: 30 },
      { header: "Contact", key: "contact", width: 20 },
      { header: "Total Customers", key: "totalCustomers", width: 15 },
      { header: "Total Outstanding ($)", key: "totalOutstanding", width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 25;

    mrData.forEach((mr, index) => {
      const mrId = mr.staff?.MRId
        ? String(mr.staff.MRId).padStart(3, "0")
        : generateFallbackMRId(index);

      const row = worksheet.addRow({
        serialNo: index + 1,
        mrId: mrId,
        mrName: mr.mrName || "N/A",
        contact: mr.staff?.contactNo || "Not Available",
        totalCustomers: mr.totalCustomers || 0,
        totalOutstanding: mr.totalOutstandingAmount || 0,
      });

      row.font = { size: 11 };
      row.alignment = { vertical: "middle" };
      row.getCell("totalOutstanding").numFmt = "$#,##0.00";
    });

    // Calculate totals
    const totalOutstanding = mrData.reduce(
      (sum, mr) => sum + (mr.totalOutstandingAmount || 0),
      0,
    );
    const totalCustomers = mrData.reduce(
      (sum, mr) => sum + (mr.totalCustomers || 0),
      0,
    );

    if (mrData.length > 0) {
      worksheet.addRow({});
      const summaryRow = worksheet.addRow({});
      summaryRow.getCell("mrName").value = "TOTAL SUMMARY";
      summaryRow.getCell("totalCustomers").value = totalCustomers;
      summaryRow.getCell("totalOutstanding").value = totalOutstanding;
      summaryRow.font = { bold: true, size: 12 };
      summaryRow.getCell("totalOutstanding").numFmt = "$#,##0.00";
    }

    // Apply borders
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split("T")[0];
    let fileName = "mr-wise-outstanding";
    if (startDate && endDate) {
      fileName = `mr-wise-outstanding-${startDate.replace(/-/g, "")}-to-${endDate.replace(/-/g, "")}`;
    } else {
      fileName = `mr-wise-outstanding-${formattedDate.replace(/-/g, "")}`;
    }
    fileName += ".xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (err) {
    console.error("Error in Excel export:", err);
    res.status(500).json({
      error: "Failed to generate Excel export",
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

export default router;
