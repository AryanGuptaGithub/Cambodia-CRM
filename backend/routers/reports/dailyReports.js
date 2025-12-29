import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";
import mongoose from "mongoose";

const router = express.Router();

router.get("/dailyReports", async (req, res) => {
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

    // 1. Payment Status Condition based on active sale type tab
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

    // 3. Date Condition - USING invoiceDate INSTEAD OF recordingDate
    if (dateFilter && dateFilter !== "all") {
      const today = new Date();
      
      const todayStr = today.toISOString().split('T')[0];
      let startDateStr, endDateStr;
      
      switch (dateFilter) {
        case "today":
          startDateStr = todayStr;
          endDateStr = todayStr;
          break;

        case "currentMonth":
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          startDateStr = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
          endDateStr = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
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
            endDateStr = lastMonth.toISOString().split('T')[0];
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
        
        // USING invoiceDate FOR DATE FILTERING
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

    // Group by MR name and MR ID to preserve both
    basePipeline.push({
      $group: {
        _id: {
          mrName: "$mrName",
          mrId: "$mrId"
        },
        totalSalesAmount: { $sum: "$totalAmount" },
        totalOrders: { $sum: 1 },
        totalPaidAmount: { $sum: "$paidAmount" },
        totalDueAmount: { $sum: "$dueAmount" },
        totalSalesQty: { $sum: "$salesQty" },
        totalBonusQty: { $sum: "$bonusQty" },
        totalQty: { $sum: "$totalQty" },
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
            $cond: [
              { $eq: ["$paymentStatus", "Cash"] },
              "$totalAmount",
              0,
            ],
          },
        },
        uniqueCustomers: { $addToSet: "$customerCode" },
        // USING invoiceDate FOR DATE DISPLAY
        latestInvoiceDate: { $max: "$invoiceDate" },
        earliestInvoiceDate: { $min: "$invoiceDate" },
      },
    });

    // Lookup staff details - SIMPLIFIED APPROACH
    basePipeline.push({
      $lookup: {
        from: "staffs",
        let: { searchMrId: "$_id.mrId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  // Match by _id field (ObjectId to ObjectId)
                  { $eq: ["$_id", { $toObjectId: "$$searchMrId" }] },
                  // Match by MRId field (if mrId is string like "810")
                  { $eq: ["$MRId", { $toString: "$$searchMrId" }] }
                ]
              }
            }
          }
        ],
        as: "staffDetails",
      },
    });

    // Format output with staff details
    basePipeline.push({
      $project: {
        _id: 0,
        mrName: "$_id.mrName",
        mrId: "$_id.mrId",
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
        // USING invoiceDate FOR DATE DISPLAY
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$latestInvoiceDate",
            timezone: "Asia/Dhaka"
          }
        },
        latestInvoiceDate: 1,
        // Staff details
        mrContactNo: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.contactNo", 0] },
            else: "Not Available"
          }
        },
        mrEmail: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.email", 0] },
            else: "Not Available"
          }
        },
        mrTeamName: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.teamName", 0] },
            else: "Not Available"
          }
        },
        mrMedicalRepName: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.medicalRepName", 0] },
            else: "Not Available"
          }
        },
      },
    });

    basePipeline.push({ $sort: { totalSalesAmount: -1 } });

    // Get total count
    const countPipeline = [
      ...(Object.keys(matchConditions).length > 0 ? [{ $match: matchConditions }] : []),
      {
        $group: {
          _id: {
            mrName: "$mrName",
            mrId: "$mrId"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 }
        }
      }
    ];

    // Execute pipelines
    const [countResult, reportsData, summaryResult] = await Promise.all([
      SaleSummary.aggregate(countPipeline),
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),
      // Update summary pipeline to also use invoiceDate
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
                $cond: [
                  { $eq: ["$paymentStatus", "Cash"] },
                  "$totalAmount",
                  0,
                ],
              },
            },
            uniqueCustomers: { $addToSet: "$customerCode" },
            uniqueMRs: { $addToSet: "$mrName" },
            // Also track invoiceDate range for summary
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
                    timezone: "Asia/Dhaka"
                  }
                },
                else: {
                  $concat: [
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$earliestInvoiceDate",
                        timezone: "Asia/Dhaka"
                      }
                    },
                    " to ",
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$latestInvoiceDate",
                        timezone: "Asia/Dhaka"
                      }
                    }
                  ]
                }
              }
            }
          },
        },
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Check if staff lookup worked, if not, manually fetch staff details
    let enhancedRecords = [...reportsData];
    
    // Find reports where staff details are missing
    const reportsMissingStaff = enhancedRecords.filter(
      report => report.mrContactNo === "Not Available" && report.mrId
    );

    if (reportsMissingStaff.length > 0) {
      // Collect all mrIds that need staff lookup
      const mrIdsToLookup = reportsMissingStaff.map(report => report.mrId);
      
      // Fetch staff details manually
      const staffDetails = await mongoose.connection.db.collection("staffs").find({
        $or: [
          { _id: { $in: mrIdsToLookup.map(id => new mongoose.Types.ObjectId(id)) } },
          { MRId: { $in: mrIdsToLookup } }
        ]
      }).toArray();

      // Create a lookup map
      const staffMap = {};
      staffDetails.forEach(staff => {
        // Map by _id
        if (staff._id) {
          staffMap[staff._id.toString()] = staff;
        }
        // Map by MRId
        if (staff.MRId) {
          staffMap[staff.MRId] = staff;
        }
      });

      // Enhance the records with staff details
      enhancedRecords = enhancedRecords.map(report => {
        if (report.mrContactNo === "Not Available" && report.mrId) {
          const staff = staffMap[report.mrId];
          
          if (staff) {
            return {
              ...report,
              mrContactNo: staff.contactNo || "Not Available",
              mrEmail: staff.email || "Not Available",
              mrTeamName: staff.teamName || "Not Available",
              mrMedicalRepName: staff.medicalRepName || "Not Available",
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
      // Staff details
      mrContactNo: report.mrContactNo,
      mrEmail: report.mrEmail,
      mrTeamName: report.mrTeamName,
      mrMedicalRepName: report.mrMedicalRepName,
    }));

    // Get the summary result and add date range info
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
    console.error("❌ Error fetching daily reports:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

router.get("/dailyReports/types", async (req, res) => {
  try {
    const types = await SaleType.find(
      {},
      { type: 1, sequenceNumber: 1, _id: 0 }
    ).sort({ sequenceNumber: 1 });

    res.json(types);
  } catch (err) {
    console.error("Error fetching sale types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;