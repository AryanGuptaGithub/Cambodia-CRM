import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import ExcelJS from "exceljs";

const router = express.Router();

// FIXED: Changed from '/customer-product-acceptance-rate' to '/'
// GET endpoint for paginated data
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7;
    const search = req.query.search?.trim() || "";

    // 🔍 Build match query
    const matchQuery = {};
    if (search) {
      matchQuery.$or = [
        { "customerDetails.name": { $regex: search, $options: "i" } },
        { "customerDetails.customerCode": { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
        { "products.productName": { $regex: search, $options: "i" } },
      ];
    }

    // 🧮 Main aggregation pipeline (customer + product wise)
    const pipeline = [
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
      { $match: matchQuery },
      {
        $unwind: {
          path: "$products",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $group: {
          _id: {
            customerCode: "$customerCode",
            customerName: "$customerDetails.name",
            productName: "$products.productName",
          },
          totalSales: { $sum: 1 },
          acceptedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, "$products.totalQty", 0]
            },
          },
          rejectedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", false] }, "$products.totalQty", 0]
            },
          },
          totalDecisions: {
            $sum: {
              $cond: [
                { $in: ["$products.isProductAccept", [true, false]] },
                1,
                0
              ]
            },
          },
          acceptedDecisions: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, 1, 0]
            },
          },
          rejectedDecisions: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", false] }, 1, 0]
            },
          },
        },
      },
      {
        $addFields: {
          acceptanceRate: {
            $cond: [
              { $eq: ["$totalDecisions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$acceptedDecisions", "$totalDecisions"] },
                  100,
                ],
              },
            ],
          },
          totalQty: { $add: ["$acceptedQty", "$rejectedQty"] }
        },
      },
      {
        $project: {
          customerCode: "$_id.customerCode",
          customerName: { $ifNull: ["$_id.customerName", "N/A"] },
          productName: { 
            $ifNull: ["$_id.productName", "Unknown Product"]
          },
          totalProducts: "$totalQty",
          acceptedCount: "$acceptedQty",
          rejectedCount: "$rejectedQty",
          acceptanceRate: { $round: ["$acceptanceRate", 2] },
          _id: 0,
        },
      },
      { $sort: { customerName: 1, productName: 1 } },
    ];
    
    // 📊 Get total record count
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalRecords / limit);
    
    // 📄 Apply pagination
    const paginatedPipeline = [...pipeline, { $skip: (page - 1) * limit }, { $limit: limit }];
    const records = await SaleSummary.aggregate(paginatedPipeline);
    
    // 🧾 Global Summary
    const summaryPipeline = [
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalCustomers: { $addToSet: "$customerCode" },
          totalQty: { $sum: "$products.totalQty" },
          totalAcceptedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, "$products.totalQty", 0]
            },
          },
          totalRejectedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", false] }, "$products.totalQty", 0]
            },
          },
          totalDecisions: {
            $sum: {
              $cond: [
                { $in: ["$products.isProductAccept", [true, false]] },
                1,
                0
              ]
            },
          },
          acceptedDecisions: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, 1, 0]
            },
          },
        },
      },
      {
        $project: {
          totalCustomers: { $size: "$totalCustomers" },
          totalProducts: "$totalQty",
          totalAccepted: "$totalAcceptedQty",
          totalRejected: "$totalRejectedQty",
          acceptanceRate: {
            $cond: [
              { $eq: ["$totalDecisions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$acceptedDecisions", "$totalDecisions"] },
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
            totalProducts: 0,
            totalAccepted: 0,
            totalRejected: 0,
            acceptanceRate: 0,
          };
    
    // ✅ Format response records
    const formattedRecords = records.map((record, index) => ({
      srNo: index + 1 + (page - 1) * limit,
      customerCode: record.customerCode,
      customerName: record.customerName,
      productName: record.productName || "Unknown Product",
      totalProducts: record.totalProducts,
      acceptedCount: record.acceptedCount,
      rejectedCount: record.rejectedCount,
      acceptanceRate: record.acceptanceRate,
    }));
    
    // ✅ Send response
    const response = {
      success: true,
      data: {
        summary: {
          totalCustomers: summary.totalCustomers,
          totalProducts: summary.totalProducts,
          totalAccepted: summary.totalAccepted,
          totalRejected: summary.totalRejected,
          acceptanceRate: parseFloat(summary.acceptanceRate.toFixed(2)),
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
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while fetching acceptance rate data",
      error: error.message,
    });
  }
});

// FIXED: Changed from '/customer-product-acceptance-rate/export' to '/export'
// Export to Excel endpoint
router.get("/export", async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    const matchQuery = {};

    if (search) {
      matchQuery.$or = [
        { "customerDetails.name": { $regex: search, $options: "i" } },
        { "customerDetails.customerCode": { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
        { "products.productName": { $regex: search, $options: "i" } },
      ];
    }

    // First, get the summary data
    const summaryPipeline = [
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalCustomers: { $addToSet: "$customerCode" },
          totalQty: { $sum: "$products.totalQty" },
          totalAcceptedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, "$products.totalQty", 0]
            },
          },
          totalRejectedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", false] }, "$products.totalQty", 0]
            },
          },
          totalDecisions: {
            $sum: {
              $cond: [
                { $in: ["$products.isProductAccept", [true, false]] },
                1,
                0
              ]
            },
          },
          acceptedDecisions: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, 1, 0]
            },
          },
        },
      },
    ];

    const summaryResult = await SaleSummary.aggregate(summaryPipeline);
    const summary = summaryResult.length > 0 ? summaryResult[0] : {
      totalCustomers: 0,
      totalQty: 0,
      totalAcceptedQty: 0,
      totalRejectedQty: 0,
      totalDecisions: 0,
      acceptedDecisions: 0,
    };

    // Calculate acceptance rate
    const acceptanceRate = summary.totalDecisions > 0 
      ? (summary.acceptedDecisions / summary.totalDecisions * 100).toFixed(2)
      : 0;

    // Get all records without pagination
    const pipeline = [
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
      { $match: matchQuery },
      {
        $unwind: {
          path: "$products",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $group: {
          _id: {
            customerCode: "$customerCode",
            customerName: "$customerDetails.name",
            productName: "$products.productName",
          },
          totalSales: { $sum: 1 },
          acceptedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, "$products.totalQty", 0]
            },
          },
          rejectedQty: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", false] }, "$products.totalQty", 0]
            },
          },
          totalDecisions: {
            $sum: {
              $cond: [
                { $in: ["$products.isProductAccept", [true, false]] },
                1,
                0
              ]
            },
          },
          acceptedDecisions: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", true] }, 1, 0]
            },
          },
          rejectedDecisions: {
            $sum: {
              $cond: [{ $eq: ["$products.isProductAccept", false] }, 1, 0]
            },
          },
        },
      },
      {
        $addFields: {
          acceptanceRate: {
            $cond: [
              { $eq: ["$totalDecisions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$acceptedDecisions", "$totalDecisions"] },
                  100,
                ],
              },
            ],
          },
          totalQty: { $add: ["$acceptedQty", "$rejectedQty"] }
        },
      },
      {
        $project: {
          customerCode: "$_id.customerCode",
          customerName: { $ifNull: ["$_id.customerName", "N/A"] },
          productName: { 
            $ifNull: ["$_id.productName", "Unknown Product"]
          },
          totalProducts: "$totalQty",
          acceptedCount: "$acceptedQty",
          rejectedCount: "$rejectedQty",
          acceptanceRate: { $round: ["$acceptanceRate", 2] },
          _id: 0,
        },
      },
      { $sort: { customerName: 1, productName: 1 } },
    ];

    const records = await SaleSummary.aggregate(pipeline);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer Product Acceptance Rate');

    // Add title
    const titleRow = worksheet.addRow(['Customer Product Acceptance Rate Report']);
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: 'center' };
    worksheet.mergeCells('A1:H1');
    worksheet.addRow([]); // Empty row

    // Add summary section header
    const summaryHeader = worksheet.addRow(['SUMMARY']);
    summaryHeader.font = { bold: true, size: 14, color: { argb: 'FF0000FF' } };
    summaryHeader.alignment = { horizontal: 'center' };
    worksheet.mergeCells('A3:H3');
    worksheet.addRow([]); // Empty row

    // Add summary data
    const summaryLabels = [
      'Total Customers', 'Total Products', 'Accepted Quantity', 
      'Rejected Quantity', 'Acceptance Rate'
    ];
    
    const summaryValues = [
      summary.totalCustomers ? summary.totalCustomers.length : 0,
      summary.totalQty || 0,
      summary.totalAcceptedQty || 0,
      summary.totalRejectedQty || 0,
      parseFloat(acceptanceRate),
    ];

    // Create a table-like summary
    for (let i = 0; i < summaryLabels.length; i++) {
      const row = worksheet.addRow([summaryLabels[i], summaryValues[i]]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).numFmt = i === 4 ? '0.00"%"' : '#,##0';
    }

    worksheet.addRow([]); // Empty row
    worksheet.addRow([]); // Empty row

    // Add data section header
    const dataHeader = worksheet.addRow(['DETAILED DATA']);
    dataHeader.font = { bold: true, size: 14, color: { argb: 'FF0000FF' } };
    dataHeader.alignment = { horizontal: 'center' };
    worksheet.mergeCells('A' + (worksheet.rowCount) + ':H' + (worksheet.rowCount));
    worksheet.addRow([]); // Empty row

    // Define columns for detailed data
    const headerRow = worksheet.addRow([
      'Sr. No.',
      'Customer Code',
      'Customer Name',
      'Product Name',
      'Total Quantity',
      'Accepted Quantity',
      'Rejected Quantity',
      'Acceptance Rate %'
    ]);
    
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add data rows
    records.forEach((record, index) => {
      const dataRow = worksheet.addRow([
        index + 1,
        record.customerCode,
        record.customerName,
        record.productName,
        record.totalProducts,
        record.acceptedCount,
        record.rejectedCount,
        record.acceptanceRate
      ]);
      
      // Add borders to data rows
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Format columns
    worksheet.getColumn(1).width = 10;  // Sr. No.
    worksheet.getColumn(2).width = 20;  // Customer Code
    worksheet.getColumn(3).width = 30;  // Customer Name
    worksheet.getColumn(4).width = 30;  // Product Name
    worksheet.getColumn(5).width = 15;  // Total Quantity
    worksheet.getColumn(6).width = 18;  // Accepted Quantity
    worksheet.getColumn(7).width = 18;  // Rejected Quantity
    worksheet.getColumn(8).width = 18;  // Acceptance Rate
    
    // Format numeric columns
    worksheet.getColumn(5).numFmt = '#,##0';
    worksheet.getColumn(6).numFmt = '#,##0';
    worksheet.getColumn(7).numFmt = '#,##0';
    worksheet.getColumn(8).numFmt = '0.00"%"';

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="customer_product_acceptance_rate_${new Date().toISOString().split('T')[0]}.xlsx"`
    );

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: error.message,
    });
  }
});

// ===== Annual Repeat Rate Export =====
router.get("/annual/export", async (req, res) => {
  try {
    const { search = "", period = "last_year" } = req.query;

    // Date filter for last year
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

    // Search filter
    let searchCondition = {};
    if (search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      searchCondition = {
        $or: [
          { "customerDetails.name": regex },
          { "customerDetails.customerCode": regex },
          { mrName: regex },
        ],
      };
    }

    // Main aggregation pipeline (no pagination)
    const pipeline = [
      { $match: { ...dateFilter, ...searchCondition } },
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
            $cond: { if: { $gte: ["$totalPurchases", 2] }, then: true, else: false },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    const records = await SaleSummary.aggregate(pipeline);

    // Summary statistics
    const summaryPipeline = [
      { $match: { ...dateFilter, ...searchCondition } },
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

    // Helper to pad customer code
    const padCode = (code) => {
      if (!code) return "N/A";
      return String(code).padStart(5, '0');
    };

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // Summary Sheet
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

    // Details Sheet
    const detailsSheet = workbook.addWorksheet("Details");
    detailsSheet.mergeCells("A1:G1");
    const detailsTitle = detailsSheet.getCell("A1");
    detailsTitle.value = "Annual Customer Repeat Rate - Details";
    detailsTitle.font = { size: 16, bold: true };
    detailsTitle.alignment = { horizontal: "center" };

    detailsSheet.addRow([]);
    const detailsHeaders = [
      "Sr.No",
      "Customer Code",
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
        padCode(record.customerCode),                // padded code
        record.customerName || "N/A",
        record.totalPurchases || 0,
        record.firstPurchaseDate
          ? new Date(record.firstPurchaseDate).toLocaleDateString()
          : "N/A",
        record.lastPurchaseDate
          ? new Date(record.lastPurchaseDate).toLocaleDateString()
          : "N/A",
        record.isRepeatCustomer ? "Repeat" : "One-Time",
      ]);
    });

    detailsSheet.columns.forEach((col) => (col.width = 20));

    // Send response
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

export default router;
