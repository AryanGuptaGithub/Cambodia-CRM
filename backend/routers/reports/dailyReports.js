import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";

const router = express.Router();

// Helper function to format currency
const formatCurrency = (value) => {
  if (value === null || value === undefined) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
};

// Helper function to generate filename
const generateFilename = (selectedTab, selectedSaleType, dateRange) => {
  const dateStr = new Date().toISOString().split("T")[0];
  let filename = `Daily_Report_${dateStr}`;

  if (selectedSaleType && selectedSaleType !== "Total sales") {
    filename += `_${selectedSaleType.replace(/\s+/g, "_")}`;
  }

  if (selectedTab) {
    filename += `_${selectedTab}`;
  }

  if (dateRange) {
    filename += `_${dateRange}`;
  }

  return `${filename}.xlsx`;
};

// GET / - Daily Reports
router.get("/", async (req, res) => {
  try {
    const {
      saleType,
      startDate,
      endDate,
      dateFilter,
      search,
      page = 1,
      limit = 7,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions
    const matchConditions = {};

    // 1. Payment Status Condition
    if (saleType && saleType !== "Total sales") {
      if (saleType.toLowerCase().includes("cash")) {
        matchConditions.paymentStatus = "Cash";
      } else if (saleType.toLowerCase().includes("credit")) {
        matchConditions.paymentStatus = "Credit";
      }
    }

    // 2. Search Condition
    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // 3. Date Condition
    if (dateFilter && dateFilter !== "all") {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      let startDateStr, endDateStr;

      switch (dateFilter) {
        case "today":
          startDateStr = todayStr;
          endDateStr = todayStr;
          break;

        case "currentMonth":
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          startDateStr = new Date(currentYear, currentMonth, 1)
            .toISOString()
            .split("T")[0];
          endDateStr = new Date(currentYear, currentMonth + 1, 0)
            .toISOString()
            .split("T")[0];
          break;

        case "janToPreviousMonth":
          const year = today.getFullYear();
          const month = today.getMonth();
          if (month === 0) {
            startDateStr = `${year - 1}-01-01`;
            endDateStr = `${year - 1}-12-31`;
          } else {
            startDateStr = `${year}-01-01`;
            const lastMonth = new Date(year, month, 0);
            endDateStr = lastMonth.toISOString().split("T")[0];
          }
          break;

        case "custom":
          if (startDate && endDate) {
            startDateStr = startDate;
            endDateStr = endDate;
          }
          break;

        default:
          break;
      }

      if (startDateStr && endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);

        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    // Build base pipeline
    const basePipeline = [];

    if (Object.keys(matchConditions).length > 0) {
      basePipeline.push({ $match: matchConditions });
    }

    // FIX: Group only by mrName (case-insensitive) to avoid duplicate rows per MR
    basePipeline.push({
      $group: {
        _id: { $toLower: { $trim: { input: "$mrName" } } }, // group key = normalized name
        mrName: { $first: "$mrName" },
        mrId: { $first: "$mrId" },
        totalSalesAmount: { $sum: "$totalAmount" },
        totalOrders: { $sum: 1 },
        totalPaidAmount: { $sum: "$paidAmount" },
        totalDueAmount: { $sum: "$dueAmount" },
        totalSalesQty: { $sum: "$salesQty" },
        totalBonusQty: { $sum: "$bonusQty" },
        totalQty: { $sum: "$totalQty" },
        credits: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "Credit"] }, "$totalAmount", 0],
          },
        },
        cash: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "Cash"] }, "$totalAmount", 0],
          },
        },
        uniqueCustomers: { $addToSet: "$customerCode" },
        latestInvoiceDate: { $max: "$invoiceDate" }, // latest date
        earliestInvoiceDate: { $min: "$invoiceDate" },
      },
    });

    // Lookup staff details
    basePipeline.push({
      $lookup: {
        from: "staffs",
        let: {
          mrName: "$mrName",
          mrId: "$mrId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $eq: [
                      { $toLower: { $trim: { input: "$medicalRepName" } } },
                      { $toLower: { $trim: { input: "$$mrName" } } },
                    ],
                  },
                  {
                    $and: [
                      { $ne: ["$$mrId", null] },
                      { $ne: ["$$mrId", ""] },
                      {
                        $eq: [{ $toString: "$_id" }, { $toString: "$$mrId" }],
                      },
                    ],
                  },
                  {
                    $and: [
                      { $ne: ["$$mrId", null] },
                      { $ne: ["$$mrId", ""] },
                      {
                        $eq: [{ $toString: "$MRId" }, { $toString: "$$mrId" }],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "staffDetails",
      },
    });

    // Project output
    basePipeline.push({
      $project: {
        _id: 0,
        mrName: "$mrName",
        mrId: "$mrId",
        totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
        totalOrders: 1,
        totalPaidAmount: { $round: ["$totalPaidAmount", 2] },
        totalDueAmount: { $round: ["$totalDueAmount", 2] },
        totalSalesQty: 1,
        totalBonusQty: 1,
        totalQty: 1,
        credits: { $round: ["$credits", 2] },
        cash: { $round: ["$cash", 2] },
        totalCustomers: { $size: "$uniqueCustomers" },
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$latestInvoiceDate", // always the latest date
            timezone: "Asia/Dhaka",
          },
        },
        latestInvoiceDate: 1,
        mrContactNo: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [
                { $arrayElemAt: ["$staffDetails.contactNo", 0] },
                "Not Available",
              ],
            },
            else: "Not Available",
          },
        },
        mrEmail: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [
                { $arrayElemAt: ["$staffDetails.email", 0] },
                "Not Available",
              ],
            },
            else: "Not Available",
          },
        },
        mrTeamName: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [
                { $arrayElemAt: ["$staffDetails.teamName", 0] },
                "Not Available",
              ],
            },
            else: "Not Available",
          },
        },
        mrMedicalRepName: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [
                { $arrayElemAt: ["$staffDetails.medicalRepName", 0] },
                "Not Available",
              ],
            },
            else: "Not Available",
          },
        },
        mrStaffMRId: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [{ $arrayElemAt: ["$staffDetails.MRId", 0] }, null],
            },
            else: null,
          },
        },
      },
    });

    basePipeline.push({ $sort: { totalSalesAmount: -1 } });

    // FIX: Count pipeline also groups only by mrName
    const countPipeline = [
      ...(Object.keys(matchConditions).length > 0
        ? [{ $match: matchConditions }]
        : []),
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$mrName" } } },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
        },
      },
    ];

    // Execute pipelines in parallel
    const [countResult, reportsData, summaryResult] = await Promise.all([
      SaleSummary.aggregate(countPipeline),
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),
      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalSalesAmount: { $sum: "$totalAmount" },
            totalOrders: { $sum: 1 },
            totalPaidAmount: { $sum: "$paidAmount" },
            totalDueAmount: { $sum: "$dueAmount" },
            credits: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Credit"] },
                  "$totalAmount",
                  0,
                ],
              },
            },
            cash: {
              $sum: {
                $cond: [{ $eq: ["$paymentStatus", "Cash"] }, "$totalAmount", 0],
              },
            },
            uniqueCustomers: { $addToSet: "$customerCode" },
            uniqueMRs: { $addToSet: "$mrName" },
            latestInvoiceDate: { $max: "$invoiceDate" },
            earliestInvoiceDate: { $min: "$invoiceDate" },
          },
        },
        {
          $project: {
            _id: 0,
            totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
            totalOrders: 1,
            totalPaidAmount: { $round: ["$totalPaidAmount", 2] },
            totalDueAmount: { $round: ["$totalDueAmount", 2] },
            credits: { $round: ["$credits", 2] },
            cash: { $round: ["$cash", 2] },
            totalCustomers: { $size: "$uniqueCustomers" },
            totalMRs: { $size: "$uniqueMRs" },
            dateRange: {
              $cond: {
                if: { $eq: ["$earliestInvoiceDate", "$latestInvoiceDate"] },
                then: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$earliestInvoiceDate",
                    timezone: "Asia/Dhaka",
                  },
                },
                else: {
                  $concat: [
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$earliestInvoiceDate",
                        timezone: "Asia/Dhaka",
                      },
                    },
                    " to ",
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$latestInvoiceDate",
                        timezone: "Asia/Dhaka",
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Fallback: manually fetch staff details for records still missing contact info
    let enhancedRecords = [...reportsData];

    const reportsMissingStaff = enhancedRecords.filter(
      (report) => report.mrContactNo === "Not Available" && report.mrName,
    );

    if (reportsMissingStaff.length > 0) {
      const mrNamesToLookup = [
        ...new Set(reportsMissingStaff.map((report) => report.mrName)),
      ];
      const mrIdsToLookup = reportsMissingStaff
        .filter((report) => report.mrId)
        .map((report) => report.mrId);

      const staffQuery = { $or: [] };

      if (mrNamesToLookup.length > 0) {
        staffQuery.$or.push({
          medicalRepName: {
            $in: mrNamesToLookup.map((name) => new RegExp(`^${name}$`, "i")),
          },
        });
      }

      if (mrIdsToLookup.length > 0) {
        const objectIdConditions = mrIdsToLookup
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));

        if (objectIdConditions.length > 0) {
          staffQuery.$or.push({ _id: { $in: objectIdConditions } });
        }

        staffQuery.$or.push({ MRId: { $in: mrIdsToLookup } });
      }

      const staffDetails =
        staffQuery.$or.length > 0
          ? await mongoose.connection.db
              .collection("staffs")
              .find(staffQuery)
              .toArray()
          : [];

      const staffByNameMap = new Map();
      const staffByIdMap = new Map();
      const staffByMRIdMap = new Map();

      staffDetails.forEach((staff) => {
        if (staff.medicalRepName) {
          staffByNameMap.set(staff.medicalRepName.toLowerCase().trim(), staff);
        }
        if (staff._id) {
          staffByIdMap.set(staff._id.toString(), staff);
        }
        if (staff.MRId) {
          staffByMRIdMap.set(staff.MRId.toString(), staff);
        }
      });

      enhancedRecords = enhancedRecords.map((report) => {
        if (report.mrContactNo === "Not Available") {
          let staff = null;

          if (report.mrName) {
            staff = staffByNameMap.get(report.mrName.toLowerCase().trim());
          }

          if (!staff && report.mrId) {
            staff =
              staffByIdMap.get(report.mrId.toString()) ||
              staffByMRIdMap.get(report.mrId.toString());
          }

          if (staff) {
            return {
              ...report,
              mrContactNo: staff.contactNo || "Not Available",
              mrEmail: staff.email || "Not Available",
              mrTeamName: staff.teamName || "Not Available",
              mrMedicalRepName: staff.medicalRepName || report.mrName,
              mrStaffMRId: staff.MRId || null,
            };
          }
        }
        return report;
      });
    }

    // Format records
    const records = enhancedRecords.map((report, index) => ({
      mrId: report.mrId || `MR${String(skip + index + 1).padStart(3, "0")}`,
      mrName: report.mrName,
      totalSalesAmount: report.totalSalesAmount,
      totalOrders: report.totalOrders,
      totalPaidAmount: report.totalPaidAmount,
      totalDueAmount: report.totalDueAmount,
      totalSalesQty: report.totalSalesQty,
      totalBonusQty: report.totalBonusQty,
      totalQty: report.totalQty,
      credits: report.credits,
      cash: report.cash,
      totalCustomers: report.totalCustomers,
      date: report.date,
      mrContactNo: report.mrContactNo,
      mrEmail: report.mrEmail,
      mrTeamName: report.mrTeamName,
      mrMedicalRepName: report.mrMedicalRepName,
    }));

    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalPaidAmount: 0,
      totalDueAmount: 0,
      credits: 0,
      cash: 0,
      totalCustomers: 0,
      totalMRs: 0,
      dateRange: "N/A",
    };

    res.status(200).json({
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
  } catch (error) {
    console.error("Error fetching daily reports:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// GET /export - Excel Export
router.get("/export", async (req, res) => {
  try {
    const { saleType, startDate, endDate, dateFilter, search } = req.query;

    // Build match conditions
    const matchConditions = {};

    if (saleType && saleType !== "Total sales") {
      if (saleType.toLowerCase().includes("cash")) {
        matchConditions.paymentStatus = "Cash";
      } else if (saleType.toLowerCase().includes("credit")) {
        matchConditions.paymentStatus = "Credit";
      }
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    if (dateFilter && dateFilter !== "all") {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      let startDateStr, endDateStr;

      switch (dateFilter) {
        case "today":
          startDateStr = todayStr;
          endDateStr = todayStr;
          break;
        case "currentMonth":
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          startDateStr = new Date(currentYear, currentMonth, 1)
            .toISOString()
            .split("T")[0];
          endDateStr = new Date(currentYear, currentMonth + 1, 0)
            .toISOString()
            .split("T")[0];
          break;
        case "janToPreviousMonth":
          const year = today.getFullYear();
          const month = today.getMonth();
          if (month === 0) {
            startDateStr = `${year - 1}-01-01`;
            endDateStr = `${year - 1}-12-31`;
          } else {
            startDateStr = `${year}-01-01`;
            const lastMonth = new Date(year, month, 0);
            endDateStr = lastMonth.toISOString().split("T")[0];
          }
          break;
        case "custom":
          if (startDate && endDate) {
            startDateStr = startDate;
            endDateStr = endDate;
          }
          break;
        default:
          break;
      }

      if (startDateStr && endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);
        matchConditions.invoiceDate = { $gte: start, $lte: end };
      }
    }

    // Build export pipeline
    const exportPipeline = [];

    if (Object.keys(matchConditions).length > 0) {
      exportPipeline.push({ $match: matchConditions });
    }

    // FIX: Group only by mrName to avoid duplicates
    exportPipeline.push({
      $group: {
        _id: { $toLower: { $trim: { input: "$mrName" } } },
        mrName: { $first: "$mrName" },
        mrId: { $first: "$mrId" },
        totalSalesAmount: { $sum: "$totalAmount" },
        totalOrders: { $sum: 1 },
        credits: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "Credit"] }, "$totalAmount", 0],
          },
        },
        cash: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "Cash"] }, "$totalAmount", 0],
          },
        },
        latestInvoiceDate: { $max: "$invoiceDate" }, // always the latest date
      },
    });

    // Staff lookup
    exportPipeline.push({
      $lookup: {
        from: "staffs",
        let: {
          mrName: "$mrName",
          mrId: "$mrId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $eq: [
                      { $toLower: { $trim: { input: "$medicalRepName" } } },
                      { $toLower: { $trim: { input: "$$mrName" } } },
                    ],
                  },
                  {
                    $and: [
                      { $ne: ["$$mrId", null] },
                      { $ne: ["$$mrId", ""] },
                      {
                        $or: [
                          {
                            $eq: [
                              { $toString: "$_id" },
                              { $toString: "$$mrId" },
                            ],
                          },
                          {
                            $eq: [
                              { $toString: "$MRId" },
                              { $toString: "$$mrId" },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "staffDetails",
      },
    });

    exportPipeline.push({
      $project: {
        _id: 0,
        mrName: "$mrName",
        mrId: "$mrId",
        totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
        totalOrders: 1,
        credits: { $round: ["$credits", 2] },
        cash: { $round: ["$cash", 2] },
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$latestInvoiceDate", // latest date
            timezone: "Asia/Dhaka",
          },
        },
        mrContactNo: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [
                { $arrayElemAt: ["$staffDetails.contactNo", 0] },
                "Not Available",
              ],
            },
            else: "Not Available",
          },
        },
        mrEmail: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [
                { $arrayElemAt: ["$staffDetails.email", 0] },
                "Not Available",
              ],
            },
            else: "Not Available",
          },
        },
        mrTeamName: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: {
              $ifNull: [
                { $arrayElemAt: ["$staffDetails.teamName", 0] },
                "Not Available",
              ],
            },
            else: "Not Available",
          },
        },
      },
    });

    exportPipeline.push({ $sort: { totalSalesAmount: -1 } });

    const exportData = await SaleSummary.aggregate(exportPipeline);

    if (!exportData || exportData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found for the selected filters",
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Daily Report");

    // Determine column count
    let columnCount = 9;
    if (saleType === "Cash Sales" || saleType === "Credit Sales") {
      columnCount = 8;
    }

    // Title row
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = "DAILY REPORTS";
    titleRow.getCell(1).font = { bold: true, size: 16 };
    titleRow.getCell(1).alignment = { horizontal: "center" };
    titleRow.height = 25;
    worksheet.mergeCells(1, 1, 1, columnCount);

    // Filter info row
    let filterInfo = `Filters: ${dateFilter || "All Records"}`;
    if (saleType && saleType !== "Total sales") {
      filterInfo += ` | ${saleType}`;
    }
    if (search) {
      filterInfo += ` | Search: ${search}`;
    }

    const filterRow = worksheet.getRow(2);
    filterRow.getCell(1).value = filterInfo;
    filterRow.getCell(1).font = { italic: true };
    filterRow.getCell(1).alignment = { horizontal: "center" };
    worksheet.mergeCells(2, 1, 2, columnCount);

    // Summary row
    const summaryPipeline = [
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalSalesAmount: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
          credits: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Credit"] }, "$totalAmount", 0],
            },
          },
          cash: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Cash"] }, "$totalAmount", 0],
            },
          },
          uniqueCustomers: { $addToSet: "$customerCode" },
          uniqueMRs: { $addToSet: "$mrName" },
        },
      },
      {
        $project: {
          _id: 0,
          totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
          totalOrders: 1,
          credits: { $round: ["$credits", 2] },
          cash: { $round: ["$cash", 2] },
          totalCustomers: { $size: "$uniqueCustomers" },
          totalMRs: { $size: "$uniqueMRs" },
        },
      },
    ];

    const summaryResult = await SaleSummary.aggregate(summaryPipeline);
    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      credits: 0,
      cash: 0,
      totalCustomers: 0,
      totalMRs: 0,
    };

    const summaryRow = worksheet.getRow(3);
    summaryRow.getCell(1).value =
      `Summary: Total Sales: ${formatCurrency(summary.totalSalesAmount)} | Total Orders: ${summary.totalOrders} | Total MRs: ${summary.totalMRs} | Total Customers: ${summary.totalCustomers} | Credits: ${formatCurrency(summary.credits)} | Cash: ${formatCurrency(summary.cash)}`;
    summaryRow.getCell(1).font = { bold: true };
    summaryRow.getCell(1).alignment = { horizontal: "center" };
    worksheet.mergeCells(3, 1, 3, columnCount);

    worksheet.getRow(4); // Empty row

    // Define headers
    let headers = [];
    if (saleType === "Cash Sales") {
      headers = [
        "Sr.No",
        "MR Name",
        "Contact No.",
        "Email",
        "Team",
        "Cash ($)",
        "Total Sales ($)",
        "Date",
      ];
      columnCount = 8;
    } else if (saleType === "Credit Sales") {
      headers = [
        "Sr.No",
        "MR Name",
        "Contact No.",
        "Email",
        "Team",
        "Credits ($)",
        "Total Sales ($)",
        "Date",
      ];
      columnCount = 8;
    } else {
      headers = [
        "Sr.No",
        "MR Name",
        "Contact No.",
        "Email",
        "Team",
        "Credits ($)",
        "Cash ($)",
        "Total Sales ($)",
        "Date",
      ];
      columnCount = 9;
    }

    // Header row
    const headerRow = worksheet.getRow(5);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Data rows
    exportData.forEach((record, index) => {
      const rowNumber = 6 + index;
      const row = worksheet.getRow(rowNumber);

      let col = 1;
      row.getCell(col++).value = index + 1;
      row.getCell(col++).value = record.mrName;
      row.getCell(col++).value = record.mrContactNo;
      row.getCell(col++).value = record.mrEmail;
      row.getCell(col++).value = record.mrTeamName;

      if (saleType === "Cash Sales") {
        row.getCell(col).value = record.cash;
        row.getCell(col).numFmt = "$#,##0.00";
        col++;
        row.getCell(col).value = record.totalSalesAmount;
        row.getCell(col).numFmt = "$#,##0.00";
        col++;
      } else if (saleType === "Credit Sales") {
        row.getCell(col).value = record.credits;
        row.getCell(col).numFmt = "$#,##0.00";
        col++;
        row.getCell(col).value = record.totalSalesAmount;
        row.getCell(col).numFmt = "$#,##0.00";
        col++;
      } else {
        row.getCell(col).value = record.credits;
        row.getCell(col).numFmt = "$#,##0.00";
        col++;
        row.getCell(col).value = record.cash;
        row.getCell(col).numFmt = "$#,##0.00";
        col++;
        row.getCell(col).value = record.totalSalesAmount;
        row.getCell(col).numFmt = "$#,##0.00";
        col++;
      }

      row.getCell(col).value = record.date;

      // Borders and alignment for all cells
      for (let i = 1; i <= columnCount; i++) {
        const cell = row.getCell(i);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    });

    // Auto-fit columns
    for (let i = 1; i <= columnCount; i++) {
      let maxLength = 0;
      for (let row = 1; row <= worksheet.rowCount; row++) {
        const cell = worksheet.getRow(row).getCell(i);
        if (cell.value) {
          const cellLength = cell.value.toString().length;
          if (cellLength > maxLength) {
            maxLength = cellLength;
          }
        }
      }
      worksheet.getColumn(i).width = Math.min(maxLength + 2, 30);
    }

    // Generate filename
    const dateRangeStr =
      dateFilter === "custom" && startDate && endDate
        ? `${startDate}_to_${endDate}`
        : dateFilter || "All_Records";

    const filename = generateFilename(dateFilter, saleType, dateRangeStr);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: error.message,
    });
  }
});

// GET /types - Sale Types
router.get("/types", async (req, res) => {
  try {
    const types = await SaleType.find(
      {},
      { type: 1, sequenceNumber: 1, _id: 0 },
    ).sort({ sequenceNumber: 1 });

    res.json(types);
  } catch (err) {
    console.error("Error fetching sale types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
