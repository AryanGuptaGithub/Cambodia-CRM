import express from "express";
import Customer from "../../models/master/customer.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ExcelJS from "exceljs";

const router = express.Router();


function formatDateForExcel(date) {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('default', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// Helper to capitalize first letter (optional – to match frontend)
function capitalizeFirstLetter(str) {
  if (!str) return "N/A";
  str = str.toString();
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}


// ==================== Original Zone‑Based Endpoints (unchanged) ====================
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 7, search = "", period = "all" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = { invoiceDate: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth } };
    }

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
                _id: "$zone",
                zoneName: { $first: "$zone" },
                totalCustomers: { $sum: 1 },
                retainedCustomers: { $sum: { $cond: ["$isActiveCustomer", 1, 0] } },
                repeatCustomers: { $sum: { $cond: ["$isRepeatCustomer", 1, 0] } },
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
    console.error("❌ Error in customer retention:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/export", async (req, res) => {
  try {
    const { search = "", period = "all" } = req.query;

    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = { invoiceDate: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth } };
    }

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
          retainedCustomers: { $sum: { $cond: ["$isActiveCustomer", 1, 0] } },
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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer Retention Report');

    worksheet.mergeCells('A1:E1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = 'Customer Retention/Repeat Rate Report';
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center' };

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

    records.forEach((record, index) => {
      worksheet.addRow([
        index + 1,
        record.zoneName || "N/A",
        record.totalCustomers || 0,
        record.retainedCustomers || 0,
        `${record.retentionRate?.toFixed(1) || 0}%`
      ]);
    });

    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > maxLength) maxLength = len;
      });
      column.width = Math.min(maxLength + 2, 30);
    });

    const fileName = `Customer_Retention_Report_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

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

// ==================== FIXED ANNUAL ENDPOINT ====================
router.get("/annual", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7;
    const search = req.query.search?.trim() || "";
    const period = req.query.period || "last_year";

    let dateFilter = {};
    if (period === "last_year") {
      const now = new Date();
      const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
      dateFilter = {
        invoiceDate: { $gte: firstDayOfLastYear, $lte: lastDayOfLastYear },
      };
    }

    const matchQuery = { ...dateFilter };
    if (search) {
      matchQuery.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { customerCode: { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
      ];
    }
  
    // SIMPLIFIED: No lookup needed, customerName is already in SaleSummary
    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
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
            $cond: { if: { $gte: ["$totalPurchases", 2] }, then: true, else: false },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    // Apply pagination
    const paginatedPipeline = [
      ...pipeline,
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];
    const records = await SaleSummary.aggregate(paginatedPipeline);

    // Summary statistics
    const summaryPipeline = [
      { $match: dateFilter },
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
            $sum: { $cond: [{ $gte: ["$totalPurchases", 2] }, 1, 0] },
          },
          newCustomers: {
            $sum: { $cond: [{ $eq: ["$totalPurchases", 1] }, 1, 0] },
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
    const summary = summaryResult[0] || {
      totalCustomers: 0,
      repeatCustomers: 0,
      newCustomers: 0,
      repeatRate: 0,
    };

    const formattedRecords = records.map((record) => ({
      customerCode: record.customerCode,
      customerName: record.customerName || "N/A",
      totalPurchases: record.totalPurchases,
      firstPurchaseDate: record.firstPurchaseDate,
      lastPurchaseDate: record.lastPurchaseDate,
      isRepeatCustomer: record.isRepeatCustomer,
      totalAmount: record.totalAmount || 0,
    }));

    res.json({
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
    console.error("❌ Error fetching annual customer repeat rate:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== FIXED MONTHLY ENDPOINT ====================
router.get("/monthly", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7;
    const search = req.query.search?.trim() || "";
    const period = req.query.period || "last_month";

    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = {
        invoiceDate: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth },
      };
    }

    const matchQuery = { ...dateFilter };
    if (search) {
      matchQuery.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { customerCode: { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
      ];
    }

    // SIMPLIFIED: No lookup needed, customerName is already in SaleSummary
    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
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
            $cond: { if: { $gte: ["$totalPurchases", 2] }, then: true, else: false },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });
    const records = await SaleSummary.aggregate(pipeline);

    const summaryPipeline = [
      { $match: dateFilter },
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
            $sum: { $cond: [{ $gte: ["$totalPurchases", 2] }, 1, 0] },
          },
          newCustomers: {
            $sum: { $cond: [{ $eq: ["$totalPurchases", 1] }, 1, 0] },
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
    const summary = summaryResult[0] || {
      totalCustomers: 0,
      repeatCustomers: 0,
      newCustomers: 0,
      repeatRate: 0,
    };

    const formattedRecords = records.map((record) => ({
      customerCode: record.customerCode,
      customerName: record.customerName || "N/A",
      totalPurchases: record.totalPurchases,
      firstPurchaseDate: record.firstPurchaseDate,
      lastPurchaseDate: record.lastPurchaseDate,
      isRepeatCustomer: record.isRepeatCustomer,
      totalAmount: record.totalAmount || 0,
    }));

    res.json({
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
    console.error("❌ Error fetching monthly customer repeat rate:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to format date as "dd Mmm yyyy"


// ==================== ANNUAL EXPORT (FIXED) ====================
router.get("/annual/export", async (req, res) => {
  try {
    const { search = "", period = "last_year" } = req.query;

    let dateFilter = {};
    if (period === "last_year") {
      const now = new Date();
      const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
      dateFilter = {
        invoiceDate: { $gte: firstDayOfLastYear, $lte: lastDayOfLastYear },
      };
    }

    let searchCondition = {};
    if (search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      searchCondition = {
        $or: [
          { customerName: regex },
          { customerCode: regex },
          { mrName: regex },
        ],
      };
    }

    const pipeline = [
      { $match: { ...dateFilter, ...searchCondition } },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
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
            $cond: { if: { $gte: ["$totalPurchases", 2] }, then: true, else: false },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    const records = await SaleSummary.aggregate(pipeline);

    const summaryPipeline = [
      { $match: { ...dateFilter, ...searchCondition } },
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
            $sum: { $cond: [{ $gte: ["$totalPurchases", 2] }, 1, 0] },
          },
          newCustomers: {
            $sum: { $cond: [{ $eq: ["$totalPurchases", 1] }, 1, 0] },
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
    const summary = summaryResult[0] || {
      totalCustomers: 0,
      repeatCustomers: 0,
      newCustomers: 0,
      repeatRate: 0,
    };

    const workbook = new ExcelJS.Workbook();

    // Summary Sheet (optional – keep as is)
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.mergeCells("A1:E1");
    const titleCell = summarySheet.getCell("A1");
    titleCell.value = "Annual Customer Repeat Rate - Summary";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center" };

    summarySheet.addRow([]);
    const summaryHeaders = ["Metric", "Value"];
    const summaryHeaderRow = summarySheet.addRow(summaryHeaders);
    summaryHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center" };
    });

    summarySheet.addRow(["Total Customers", summary.totalCustomers]);
    summarySheet.addRow(["Repeat Customers", summary.repeatCustomers]);
    summarySheet.addRow(["New Customers", summary.newCustomers]);
    summarySheet.addRow(["Repeat Rate", `${summary.repeatRate?.toFixed(2) || 0}%`]);
    summarySheet.addRow(["Generated On", new Date().toLocaleString()]);

    summarySheet.columns.forEach((col) => (col.width = 25));

    // Details Sheet – matches the image layout
    const detailsSheet = workbook.addWorksheet("Details");
    detailsSheet.mergeCells("A1:F1");
    const detailsTitle = detailsSheet.getCell("A1");
    detailsTitle.value = "Annual Customer Repeat Rate - Details";
    detailsTitle.font = { size: 16, bold: true };
    detailsTitle.alignment = { horizontal: "center" };

    detailsSheet.addRow([]);
    const detailsHeaders = [
      "Sr.No",
      "Customer Name",
      "Total Purchases",
      "First Purchase",
      "Last Purchase",
      "Status",
    ];
    const detailsHeaderRow = detailsSheet.addRow(detailsHeaders);
    detailsHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center" };
    });

    records.forEach((record, idx) => {
      detailsSheet.addRow([
        idx + 1,
        capitalizeFirstLetter(record.customerName) || "N/A",
        record.totalPurchases || 0,
        formatDateForExcel(record.firstPurchaseDate),
        formatDateForExcel(record.lastPurchaseDate),
        record.isRepeatCustomer ? "Repeat" : "One-Time",
      ]);
    });

    // Auto-size columns
    detailsSheet.columns.forEach((col) => {
      let maxLength = 0;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > maxLength) maxLength = len;
      });
      col.width = Math.min(maxLength + 2, 30);
    });

    const fileName = `Annual_Repeat_Rate_${Date.now()}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error exporting annual repeat rate:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export annual repeat rate",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ==================== MONTHLY EXPORT (FIXED) ====================
router.get("/monthly/export", async (req, res) => {
  try {
    const { search = "", period = "last_month" } = req.query;

    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = {
        invoiceDate: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth },
      };
    }

    let searchCondition = {};
    if (search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      searchCondition = {
        $or: [
          { customerName: regex },
          { customerCode: regex },
          { mrName: regex },
        ],
      };
    }

    const pipeline = [
      { $match: { ...dateFilter, ...searchCondition } },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
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
            $cond: { if: { $gte: ["$totalPurchases", 2] }, then: true, else: false },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    const records = await SaleSummary.aggregate(pipeline);

    const summaryPipeline = [
      { $match: { ...dateFilter, ...searchCondition } },
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
            $sum: { $cond: [{ $gte: ["$totalPurchases", 2] }, 1, 0] },
          },
          newCustomers: {
            $sum: { $cond: [{ $eq: ["$totalPurchases", 1] }, 1, 0] },
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
    const summary = summaryResult[0] || {
      totalCustomers: 0,
      repeatCustomers: 0,
      newCustomers: 0,
      repeatRate: 0,
    };

    const workbook = new ExcelJS.Workbook();

    // Summary Sheet (keep as is)
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.mergeCells("A1:E1");
    const titleCell = summarySheet.getCell("A1");
    titleCell.value = "Monthly Customer Repeat Rate - Summary";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center" };

    summarySheet.addRow([]);
    const summaryHeaders = ["Metric", "Value"];
    const summaryHeaderRow = summarySheet.addRow(summaryHeaders);
    summaryHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center" };
    });

    summarySheet.addRow(["Total Customers", summary.totalCustomers]);
    summarySheet.addRow(["Repeat Customers", summary.repeatCustomers]);
    summarySheet.addRow(["New Customers", summary.newCustomers]);
    summarySheet.addRow(["Repeat Rate", `${summary.repeatRate?.toFixed(2) || 0}%`]);
    summarySheet.addRow(["Generated On", new Date().toLocaleString()]);

    summarySheet.columns.forEach((col) => (col.width = 25));

    // Details Sheet – matches the image layout (no Customer Code)
    const detailsSheet = workbook.addWorksheet("Details");
    detailsSheet.mergeCells("A1:F1");
    const detailsTitle = detailsSheet.getCell("A1");
    detailsTitle.value = "Monthly Customer Repeat Rate - Details";
    detailsTitle.font = { size: 16, bold: true };
    detailsTitle.alignment = { horizontal: "center" };

    detailsSheet.addRow([]);
    const detailsHeaders = [
      "Sr.No",
      "Customer Name",
      "Total Purchases",
      "First Purchase",
      "Last Purchase",
      "Status",
    ];
    const detailsHeaderRow = detailsSheet.addRow(detailsHeaders);
    detailsHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center" };
    });

    records.forEach((record, idx) => {
      detailsSheet.addRow([
        idx + 1,
        capitalizeFirstLetter(record.customerName) || "N/A",
        record.totalPurchases || 0,
        formatDateForExcel(record.firstPurchaseDate),
        formatDateForExcel(record.lastPurchaseDate),
        record.isRepeatCustomer ? "Repeat" : "One-Time",
      ]);
    });

    // Auto-size columns
    detailsSheet.columns.forEach((col) => {
      let maxLength = 0;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > maxLength) maxLength = len;
      });
      col.width = Math.min(maxLength + 2, 30);
    });

    const fileName = `Monthly_Repeat_Rate_${Date.now()}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error exporting monthly repeat rate:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export monthly repeat rate",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;