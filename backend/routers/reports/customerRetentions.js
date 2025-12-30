import express from "express";
import Customer from "../../models/master/customer.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ExcelJS from "exceljs";

const router = express.Router();

// Customer Retention by Zone (updated to include _id in response)
router.get("/customer-retention", async (req, res) => {
  try {
    const { page = 1, limit = 7, search = "", period = "all" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Date filter
    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = { invoiceDate: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth } };
    }

    // Search filter
    let searchCondition = {};
    if (search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      searchCondition = {
        $or: [
          { zone: regex },
          { name: regex },
          { customerCode: regex },
          { medicalRepName: regex },
          { province: regex },
        ],
      };
    }

    console.time("⏱️ customer-retention-query");

    // Single pipeline using $facet for both pagination + summary
    const pipeline = [
      ...(Object.keys(searchCondition).length > 0 ? [{ $match: searchCondition }] : []),
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            { $project: { invoiceDate: 1 } },
          ],
        },
      },
      {
        $addFields: {
          totalSales: { $size: "$sales" },
          firstPurchaseDate: { $min: "$sales.invoiceDate" },
          lastPurchaseDate: { $max: "$sales.invoiceDate" },
          isRepeatCustomer: { $gt: [{ $size: "$sales" }, 1] },
          isActiveCustomer: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $max: "$sales.invoiceDate" }, null] },
                  {
                    $gte: [
                      { $max: "$sales.invoiceDate" },
                      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    ],
                  },
                ],
              },
              true,
              false,
            ],
          },
        },
      },
      {
        $facet: {
          paginated: [
            {
              $group: {
                _id: "$zone", // This is the zone ID
                zoneName: { $first: "$zone" },
                totalCustomers: { $sum: 1 },
                retainedCustomers: {
                  $sum: { $cond: ["$isActiveCustomer", 1, 0] },
                },
                repeatCustomers: {
                  $sum: { $cond: ["$isRepeatCustomer", 1, 0] },
                },
                customers: {
                  $push: {
                    customerId: "$_id",
                    customerName: "$name",
                    customerCode: "$customerCode",
                    typeOfBusiness: "$typeOfBusiness",
                    contactNumber: "$customerNumber",
                    province: "$province",
                    address: "$address",
                    medicalRepName: "$medicalRepName",
                    totalSales: "$totalSales",
                    firstPurchaseDate: "$firstPurchaseDate",
                    lastPurchaseDate: "$lastPurchaseDate",
                    isRepeatCustomer: "$isRepeatCustomer",
                    isActiveCustomer: "$isActiveCustomer",
                  },
                },
              },
            },
            {
              $addFields: {
                retentionRate: {
                  $cond: [
                    { $gt: ["$totalCustomers", 0] },
                    {
                      $round: [
                        {
                          $multiply: [
                            { $divide: ["$retainedCustomers", "$totalCustomers"] },
                            100,
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
            { $sort: { retentionRate: -1, totalCustomers: -1 } },
            { $skip: skip },
            { $limit: limitNum },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalCustomers: { $sum: 1 },
                retainedCustomers: { $sum: { $cond: ["$isActiveCustomer", 1, 0] } },
                repeatCustomers: { $sum: { $cond: ["$isRepeatCustomer", 1, 0] } },
              },
            },
            {
              $project: {
                _id: 0,
                totalCustomers: 1,
                retainedCustomers: 1,
                repeatCustomers: 1,
                retentionRate: {
                  $cond: [
                    { $gt: ["$totalCustomers", 0] },
                    {
                      $round: [
                        {
                          $multiply: [
                            { $divide: ["$retainedCustomers", "$totalCustomers"] },
                            100,
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await Customer.aggregate(pipeline);
    console.timeEnd("⏱️ customer-retention-query");

    const summary = result[0].summary[0] || {};
    const records = result[0].paginated || [];
    const totalCount = result[0].totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: { summary, records },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error in /customer-retention:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// NEW: Excel Export Endpoint for Customer Retention (updated)
router.get("/customer-retention/export", async (req, res) => {
  try {
    const { search = "", period = "all" } = req.query;

    // Date filter
    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = { invoiceDate: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth } };
    }

    // Search filter
    let searchCondition = {};
    if (search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      searchCondition = {
        $or: [
          { zone: regex },
          { name: regex },
          { customerCode: regex },
          { medicalRepName: regex },
          { province: regex },
        ],
      };
    }

    // Pipeline for export (no pagination)
    const pipeline = [
      ...(Object.keys(searchCondition).length > 0 ? [{ $match: searchCondition }] : []),
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            { $project: { invoiceDate: 1 } },
          ],
        },
      },
      {
        $addFields: {
          totalSales: { $size: "$sales" },
          isActiveCustomer: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $max: "$sales.invoiceDate" }, null] },
                  {
                    $gte: [
                      { $max: "$sales.invoiceDate" },
                      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    ],
                  },
                ],
              },
              true,
              false,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$zone",
          zoneName: { $first: "$zone" },
          totalCustomers: { $sum: 1 },
          retainedCustomers: {
            $sum: { $cond: ["$isActiveCustomer", 1, 0] },
          },
        },
      },
      {
        $addFields: {
          retentionRate: {
            $cond: [
              { $gt: ["$totalCustomers", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$retainedCustomers", "$totalCustomers"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { retentionRate: -1, totalCustomers: -1 } },
    ];

    const records = await Customer.aggregate(pipeline);

    // Get summary statistics
    const summaryPipeline = [
      ...(Object.keys(searchCondition).length > 0 ? [{ $match: searchCondition }] : []),
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            { $project: { invoiceDate: 1 } },
          ],
        },
      },
      {
        $addFields: {
          isActiveCustomer: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $max: "$sales.invoiceDate" }, null] },
                  {
                    $gte: [
                      { $max: "$sales.invoiceDate" },
                      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    ],
                  },
                ],
              },
              true,
              false,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          retainedCustomers: { $sum: { $cond: ["$isActiveCustomer", 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalCustomers: 1,
          retainedCustomers: 1,
          retentionRate: {
            $cond: [
              { $gt: ["$totalCustomers", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$retainedCustomers", "$totalCustomers"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
    ];

    const summaryResult = await Customer.aggregate(summaryPipeline);
    const summary = summaryResult[0] || {
      totalCustomers: 0,
      retainedCustomers: 0,
      retentionRate: 0,
    };

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer Retention Report');

    // Add report title
    worksheet.mergeCells('A1:E1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = 'Customer Retention/Repeat Rate Report';
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center' };

    // Add summary section
    worksheet.addRow([]);
    worksheet.mergeCells('A3:E3');
    const summaryTitle = worksheet.getCell('A3');
    summaryTitle.value = 'Summary';
    summaryTitle.font = { size: 14, bold: true };

    const summaryRow1 = worksheet.addRow([
      'Total Customers', summary.totalCustomers,
      'Retained Customers', summary.retainedCustomers,
      'Retention Rate', `${summary.retentionRate?.toFixed(1) || 0}%`,
      'Generated Date', new Date().toLocaleDateString()
    ]);

    summaryRow1.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    worksheet.addRow([]);

    // Add data headers
    const headers = ['Sr.No', 'Zone Name', 'Total Customers', 'Retained Customers', 'Retention Rate'];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      cell.alignment = { horizontal: 'center' };
    });

    // Add data rows
    records.forEach((record, index) => {
      const rowData = [
        index + 1,
        record.zoneName || "N/A",
        record.totalCustomers || 0,
        record.retainedCustomers || 0,
        `${record.retentionRate?.toFixed(1) || 0}%`
      ];
      worksheet.addRow(rowData);
    });

    // Format columns
    worksheet.columns.forEach((column, index) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 30);
    });

    // Set response headers
    const fileName = `Customer_Retention_Report_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("❌ Error exporting customer retention to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ... (keep the existing annual and monthly endpoints as they are - they remain unchanged)
// Annual Customer Repeat Rate (individual customer records)
router.get("/annual-customer-repeat-rate", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7;
    const search = req.query.search?.trim() || "";
    const period = req.query.period || "last_year";

    // Calculate date range based on period
    let dateFilter = {};
    if (period === "last_year") {
      const now = new Date();
      const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);

      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastYear,
          $lte: lastDayOfLastYear,
        },
      };
    }

    // 🔍 Match filter for search and date
    const matchQuery = { ...dateFilter };
    if (search) {
      matchQuery.$or = [
        { "customerDetails.name": { $regex: search, $options: "i" } },
        { "customerDetails.customerCode": { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
      ];
    }

    // 🧮 Aggregation pipeline for annual repeat rate
    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerDetails",
        },
      },
      {
        $unwind: {
          path: "$customerDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerDetails.name" },
          customerCode: { $first: "$customerCode" },
          totalPurchases: { $sum: 1 },
          firstPurchaseDate: { $min: "$invoiceDate" },
          lastPurchaseDate: { $max: "$invoiceDate" },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      {
        $addFields: {
          isRepeatCustomer: {
            $cond: {
              if: { $gte: ["$totalPurchases", 2] },
              then: true,
              else: false,
            },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    // Get total count for pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "total" });

    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    // Apply pagination to main pipeline
    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });

    const records = await SaleSummary.aggregate(pipeline);

    // 📊 Calculate summary statistics
    const summaryPipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerDetails",
        },
      },
      {
        $group: {
          _id: "$customerCode",
          totalPurchases: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: {
              $cond: [{ $gte: ["$totalPurchases", 2] }, 1, 0],
            },
          },
          newCustomers: {
            $sum: {
              $cond: [{ $eq: ["$totalPurchases", 1] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          repeatCustomers: 1,
          newCustomers: 1,
          repeatRate: {
            $cond: [
              { $eq: ["$totalCustomers", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$repeatCustomers", "$totalCustomers"] },
                  100,
                ],
              },
            ],
          },
        },
      },
    ];

    const summaryResult = await SaleSummary.aggregate(summaryPipeline);
    const summary =
      summaryResult.length > 0
        ? summaryResult[0]
        : {
            totalCustomers: 0,
            repeatCustomers: 0,
            newCustomers: 0,
            repeatRate: 0,
          };
    // ✅ Format the response records
    const formattedRecords = records.map((record) => ({
      customerCode: record.customerCode,
      customerName: record.customerName || "N/A",
      totalPurchases: record.totalPurchases,
      firstPurchaseDate: record.firstPurchaseDate,
      lastPurchaseDate: record.lastPurchaseDate,
      isRepeatCustomer: record.isRepeatCustomer,
      totalAmount: record.totalAmount || 0,
    }));

    // ✅ Send response
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCustomers: summary.totalCustomers,
          repeatCustomers: summary.repeatCustomers,
          repeatRate: parseFloat(summary.repeatRate.toFixed(2)),
          newCustomers: summary.newCustomers,
        },
        records: formattedRecords,
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching annual customer repeat rate data:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching annual customer repeat rate data",
      error: error.message,
    });
  }
});

// Monthly Customer Repeat Rate (similar to annual but for monthly period)
router.get("/monthly-customer-repeat-rate", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7;
    const search = req.query.search?.trim() || "";
    const period = req.query.period || "last_month";

    // Calculate date range based on period
    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastMonth,
          $lte: lastDayOfLastMonth,
        },
      };
    }

    // 🔍 Match filter for search and date
    const matchQuery = { ...dateFilter };
    if (search) {
      matchQuery.$or = [
        { "customerDetails.name": { $regex: search, $options: "i" } },
        { "customerDetails.customerCode": { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
      ];
    }

    // 🧮 Aggregation pipeline for monthly repeat rate
    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerDetails",
        },
      },
      {
        $unwind: {
          path: "$customerDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerDetails.name" },
          customerCode: { $first: "$customerCode" },
          totalPurchases: { $sum: 1 },
          firstPurchaseDate: { $min: "$invoiceDate" },
          lastPurchaseDate: { $max: "$invoiceDate" },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      {
        $addFields: {
          isRepeatCustomer: {
            $cond: {
              if: { $gte: ["$totalPurchases", 2] },
              then: true,
              else: false,
            },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    // Get total count for pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "total" });

    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    // Apply pagination to main pipeline
    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });

    const records = await SaleSummary.aggregate(pipeline);

    // 📊 Calculate summary statistics
    const summaryPipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerDetails",
        },
      },
      {
        $group: {
          _id: "$customerCode",
          totalPurchases: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: {
              $cond: [{ $gte: ["$totalPurchases", 2] }, 1, 0],
            },
          },
          newCustomers: {
            $sum: {
              $cond: [{ $eq: ["$totalPurchases", 1] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          repeatCustomers: 1,
          newCustomers: 1,
          repeatRate: {
            $cond: [
              { $eq: ["$totalCustomers", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$repeatCustomers", "$totalCustomers"] },
                  100,
                ],
              },
            ],
          },
        },
      },
    ];

    const summaryResult = await SaleSummary.aggregate(summaryPipeline);
    const summary =
      summaryResult.length > 0
        ? summaryResult[0]
        : {
            totalCustomers: 0,
            repeatCustomers: 0,
            newCustomers: 0,
            repeatRate: 0,
          };

    // ✅ Format the response records
    const formattedRecords = records.map((record) => ({
      customerCode: record.customerCode,
      customerName: record.customerName || "N/A",
      totalPurchases: record.totalPurchases,
      firstPurchaseDate: record.firstPurchaseDate,
      lastPurchaseDate: record.lastPurchaseDate,
      isRepeatCustomer: record.isRepeatCustomer,
      totalAmount: record.totalAmount || 0,
    }));

    // ✅ Send response
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCustomers: summary.totalCustomers,
          repeatCustomers: summary.repeatCustomers,
          repeatRate: parseFloat(summary.repeatRate.toFixed(2)),
          newCustomers: summary.newCustomers,
        },
        records: formattedRecords,
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching monthly customer repeat rate data:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching monthly customer repeat rate data",
      error: error.message,
    });
  }
});

export default router;