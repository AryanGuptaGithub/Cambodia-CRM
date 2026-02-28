import express from "express";
import ReportInHand from "../../models/reports/reportsInHand.js";
import ExcelJS from "exceljs";

const router = express.Router();

// Utility function to remove reports with empty batches
const filterReportsWithBatches = (reports) => {
  return reports.filter(
    (report) => Array.isArray(report.batches) && report.batches.length > 0
  );
};

// Utility function to calculate net amount (totalAmount - totalMrSaleDeductions)
const calculateNetAmount = (report) => {
  const totalAmount = report.totalAmount || 0;
  const totalMrSaleDeductions = report.totalMrSaleDeductions || 0;
  return totalAmount - totalMrSaleDeductions;
};

// ✅ Main route - GET all reports with totalBoxes and net amount
router.get("/", async (req, res) => {
  try {

    console.log('values of first 25');
    const { search } = req.query;

    // Build query based on search parameter
    let query = {};
    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    // Get ALL reports matching the query
    const allReports = await ReportInHand.find(query).sort({ createdAt: -1 });
    const filteredReports = filterReportsWithBatches(allReports);

    // Calculate summary statistics
    const inStockCount = filteredReports.filter(r => r.status === "In Stock").length;
    const lowStockCount = filteredReports.filter(r => r.status === "Low Stock").length;
    const criticalCount = filteredReports.filter(r => r.status === "Critical").length;
    const outOfStockCount = filteredReports.filter(r => r.status === "Out of Stock").length;
    
    // Calculate total boxes across all products
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    // Calculate total amount and total deductions across all products
    const totalAmountSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalAmount || 0);
    }, 0);

    const totalDeductionsSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalMrSaleDeductions || 0);
    }, 0);

    const totalNetAmountSum = totalAmountSum - totalDeductionsSum;

    // Add netAmount to each report
    const reportsWithNetAmount = filteredReports.map(report => ({
      ...report.toObject(),
      netAmount: calculateNetAmount(report)
    }));

    console.log('values of allReports', allReports);
    res.status(200).json({
      success: true,
      count: filteredReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum,
      totalAmount: totalAmountSum,
      totalDeductions: totalDeductionsSum,
      totalNetAmount: totalNetAmountSum,
      inStockCount: inStockCount,
      lowStockCount: lowStockCount,
      criticalCount: criticalCount,
      outOfStockCount: outOfStockCount,
      reports: reportsWithNetAmount,
    });
  } catch (error) {
    console.error("Error fetching reports in hand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ✅ Route for exporting to Excel with net amount
router.get("/average-price/export", async (req, res) => {
  try {
    const { search } = req.query;

    // Build query based on search parameter
    let query = {};
    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    // Get all reports matching the query
    const allReports = await ReportInHand.find(query).sort({ createdAt: -1 });
    const filteredReports = filterReportsWithBatches(allReports);

    // Calculate overall average price
    let overallTotalAveragePrice = 0;
    let overallValidReportsCount = 0;

    filteredReports.forEach((report) => {
      const avgPrice = report.averagePrice || 0;
      if (avgPrice > 0) {
        overallTotalAveragePrice += avgPrice;
        overallValidReportsCount++;
      }
    });

    const overallAveragePrice =
      overallValidReportsCount > 0
        ? overallTotalAveragePrice / overallValidReportsCount
        : 0;

    // Calculate total boxes
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    // Calculate total amounts
    const totalAmountSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalAmount || 0);
    }, 0);

    const totalDeductionsSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalMrSaleDeductions || 0);
    }, 0);

    const totalNetAmountSum = totalAmountSum - totalDeductionsSum;

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Stock Report");

    // Add title
    worksheet.mergeCells("A1:G1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Stock In Hand Report";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    // Add summary information
    let currentRow = 2;
    
    // Add total boxes summary
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
    const totalBoxesCell = worksheet.getCell(`A${currentRow}`);
    totalBoxesCell.value = `Total Stock Across All Products: ${totalBoxesSum.toLocaleString()} Boxes`;
    totalBoxesCell.font = { bold: true, size: 12 };
    totalBoxesCell.alignment = { horizontal: "left" };
    
    currentRow += 1;
    
    // Add total net amount summary
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
    const totalNetCell = worksheet.getCell(`A${currentRow}`);
    totalNetCell.value = `Total Net Amount Across All Products: $${totalNetAmountSum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    totalNetCell.font = { bold: true, size: 12 };
    totalNetCell.alignment = { horizontal: "left" };
    
    currentRow += 2;

    // Add table headers
    const headerRowNum = currentRow;
    worksheet.getCell(`A${headerRowNum}`).value = "Sr.No";
    worksheet.getCell(`B${headerRowNum}`).value = "Product Name";
    worksheet.getCell(`C${headerRowNum}`).value = "Category";
    worksheet.getCell(`D${headerRowNum}`).value = "Total Boxes";
    worksheet.getCell(`E${headerRowNum}`).value = "Total Amount ($)";
    worksheet.getCell(`F${headerRowNum}`).value = "Deductions ($)";
    worksheet.getCell(`G${headerRowNum}`).value = "Net Amount ($)";
    worksheet.getCell(`H${headerRowNum}`).value = "Average Price ($)";

    // Style headers
    const headerRow = worksheet.getRow(headerRowNum);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { horizontal: "center" };

    // Add data rows
    filteredReports.forEach((report, index) => {
      const rowNum = headerRowNum + index + 1;
      const row = worksheet.getRow(rowNum);
      const netAmount = calculateNetAmount(report);

      row.getCell(1).value = index + 1; // Sr.No
      row.getCell(2).value = report.productName || "N/A";
      row.getCell(3).value = report.type || "N/A";
      row.getCell(4).value = report.totalBoxes || 0;
      row.getCell(5).value = report.totalAmount || 0;
      row.getCell(5).numFmt = "$#,##0.00";
      row.getCell(6).value = report.totalMrSaleDeductions || 0;
      row.getCell(6).numFmt = "$#,##0.00";
      row.getCell(7).value = netAmount;
      row.getCell(7).numFmt = "$#,##0.00";
      row.getCell(8).value = report.averagePrice || 0;
      row.getCell(8).numFmt = "$#,##0.00";
    });

    // Auto-fit columns
    worksheet.columns = [
      { key: "srNo", width: 10 },
      { key: "productName", width: 40 },
      { key: "category", width: 20 },
      { key: "totalBoxes", width: 15 },
      { key: "totalAmount", width: 18 },
      { key: "deductions", width: 18 },
      { key: "netAmount", width: 18 },
      { key: "averagePrice", width: 18 },
    ];

    // Style borders for headers and data
    const dataEndRow = headerRowNum + filteredReports.length;
    for (let i = headerRowNum; i <= dataEndRow; i++) {
      const row = worksheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    // Center align specific columns
    worksheet.getColumn(1).alignment = { horizontal: "center" }; // Sr.No
    worksheet.getColumn(4).alignment = { horizontal: "center" }; // Total Boxes
    worksheet.getColumn(5).alignment = { horizontal: "right" }; // Total Amount
    worksheet.getColumn(6).alignment = { horizontal: "right" }; // Deductions
    worksheet.getColumn(7).alignment = { horizontal: "right" }; // Net Amount

    // Set response headers
    const fileName = search
      ? `stock_report_${search.replace(/[^a-z0-9]/gi, "_")}_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`
      : `stock_report_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export to Excel",
      error: error.message,
    });
  }
});

// ✅ Efficient route with aggregation
router.get("/efficient", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Use MongoDB aggregation to filter and paginate in one query
    const reports = await ReportInHand.aggregate([
      {
        $match: {
          $and: [
            { batches: { $exists: true } },
            { batches: { $ne: [] } },
            { batches: { $not: { $size: 0 } } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          metadata: [
            { $count: "totalCount" },
            {
              $addFields: {
                totalBoxes: { $sum: "$totalBoxes" },
                totalAmount: { $sum: "$totalAmount" },
                totalDeductions: { $sum: "$totalMrSaleDeductions" },
              },
            },
            {
              $addFields: {
                totalNetAmount: { 
                  $subtract: ["$totalAmount", "$totalDeductions"] 
                }
              }
            }
          ],
          data: [
            { $skip: skip }, 
            { $limit: limitNum },
            {
              $addFields: {
                netAmount: { 
                  $subtract: [
                    { $ifNull: ["$totalAmount", 0] }, 
                    { $ifNull: ["$totalMrSaleDeductions", 0] }
                  ]
                }
              }
            }
          ],
        },
      },
    ]);

    const totalCount = reports[0]?.metadata[0]?.totalCount || 0;
    const totalBoxes = reports[0]?.metadata[0]?.totalBoxes || 0;
    const totalAmount = reports[0]?.metadata[0]?.totalAmount || 0;
    const totalDeductions = reports[0]?.metadata[0]?.totalDeductions || 0;
    const totalNetAmount = totalAmount - totalDeductions;
    const paginatedReports = reports[0]?.data || [];

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: totalCount,
      totalBoxes: totalBoxes,
      totalAmount: totalAmount,
      totalDeductions: totalDeductions,
      totalNetAmount: totalNetAmount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      reports: paginatedReports,
    });
  } catch (error) {
    console.error("Error fetching reports in hand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ✅ Get all reports with net amount
router.get("/all", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });
    const filteredReports = filterReportsWithBatches(reports);

    // Calculate totals
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    const totalAmountSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalAmount || 0);
    }, 0);

    const totalDeductionsSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalMrSaleDeductions || 0);
    }, 0);

    const totalNetAmountSum = totalAmountSum - totalDeductionsSum;

    // Add netAmount to each report
    const reportsWithNetAmount = filteredReports.map(report => ({
      ...report.toObject(),
      netAmount: calculateNetAmount(report)
    }));

    res.status(200).json({
      success: true,
      count: filteredReports.length,
      totalBoxes: totalBoxesSum,
      totalAmount: totalAmountSum,
      totalDeductions: totalDeductionsSum,
      totalNetAmount: totalNetAmountSum,
      reports: reportsWithNetAmount,
    });
  } catch (error) {
    console.error("Error fetching reports in hand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ✅ Get single report by ID with net amount
router.get("/:id", async (req, res) => {
  try {
    const report = await ReportInHand.findById(req.params.id);

    if (!report || !report.batches || report.batches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found or has no batches",
      });
    }

    // Add netAmount to the report
    const reportWithNetAmount = {
      ...report.toObject(),
      netAmount: calculateNetAmount(report)
    };

    res.status(200).json({
      success: true,
      report: reportWithNetAmount,
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: error.message,
    });
  }
});

// ✅ Search by product name with net amount
router.get("/search/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reports = await ReportInHand.find({
      productName: { $regex: productName, $options: "i" },
    }).sort({ createdAt: -1 });

    const filteredReports = filterReportsWithBatches(reports);
    const paginatedReports = filteredReports.slice(skip, skip + limitNum);

    // Calculate totals for search results
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    const totalAmountSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalAmount || 0);
    }, 0);

    const totalDeductionsSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalMrSaleDeductions || 0);
    }, 0);

    const totalNetAmountSum = totalAmountSum - totalDeductionsSum;

    // Add netAmount to paginated reports
    const paginatedReportsWithNetAmount = paginatedReports.map(report => ({
      ...report.toObject(),
      netAmount: calculateNetAmount(report)
    }));

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum,
      totalAmount: totalAmountSum,
      totalDeductions: totalDeductionsSum,
      totalNetAmount: totalNetAmountSum,
      totalPages: Math.ceil(filteredReports.length / limitNum),
      currentPage: pageNum,
      reports: paginatedReportsWithNetAmount,
    });
  } catch (error) {
    console.error("Error searching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search reports",
      error: error.message,
    });
  }
});

// ✅ Search by supplier name with net amount
router.get("/supplier/:supplierName", async (req, res) => {
  try {
    const { supplierName } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reports = await ReportInHand.find({
      supplierName: { $regex: supplierName, $options: "i" },
    }).sort({ createdAt: -1 });

    const filteredReports = filterReportsWithBatches(reports);
    const paginatedReports = filteredReports.slice(skip, skip + limitNum);

    // Calculate totals for supplier
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    const totalAmountSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalAmount || 0);
    }, 0);

    const totalDeductionsSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalMrSaleDeductions || 0);
    }, 0);

    const totalNetAmountSum = totalAmountSum - totalDeductionsSum;

    // Add netAmount to paginated reports
    const paginatedReportsWithNetAmount = paginatedReports.map(report => ({
      ...report.toObject(),
      netAmount: calculateNetAmount(report)
    }));

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum,
      totalAmount: totalAmountSum,
      totalDeductions: totalDeductionsSum,
      totalNetAmount: totalNetAmountSum,
      totalPages: Math.ceil(filteredReports.length / limitNum),
      currentPage: pageNum,
      reports: paginatedReportsWithNetAmount,
    });
  } catch (error) {
    console.error("Error fetching supplier reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch supplier reports",
      error: error.message,
    });
  }
});

// ✅ Summary route with net amount
router.get("/summary/total-boxes", async (req, res) => {
  try {
    const allReports = await ReportInHand.find();
    const filteredReports = filterReportsWithBatches(allReports);

    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    const totalAmountSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalAmount || 0);
    }, 0);

    const totalDeductionsSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalMrSaleDeductions || 0);
    }, 0);

    const totalNetAmountSum = totalAmountSum - totalDeductionsSum;

    const averageBoxesPerProduct =
      filteredReports.length > 0 ? totalBoxesSum / filteredReports.length : 0;

    const averageNetAmountPerProduct =
      filteredReports.length > 0 ? totalNetAmountSum / filteredReports.length : 0;

    // Group by status
    const byStatus = {
      "In Stock": { boxes: 0, netAmount: 0 },
      "Low Stock": { boxes: 0, netAmount: 0 },
      Critical: { boxes: 0, netAmount: 0 },
      "Out of Stock": { boxes: 0, netAmount: 0 },
    };

    filteredReports.forEach((report) => {
      const status = report.status || "Out of Stock";
      if (byStatus.hasOwnProperty(status)) {
        byStatus[status].boxes += report.totalBoxes || 0;
        byStatus[status].netAmount += calculateNetAmount(report);
      }
    });

    res.status(200).json({
      success: true,
      summary: {
        totalProducts: filteredReports.length,
        totalBoxes: totalBoxesSum,
        totalAmount: totalAmountSum,
        totalDeductions: totalDeductionsSum,
        totalNetAmount: totalNetAmountSum,
        averageBoxesPerProduct: parseFloat(averageBoxesPerProduct.toFixed(2)),
        averageNetAmountPerProduct: parseFloat(averageNetAmountPerProduct.toFixed(2)),
        byStatus: byStatus,
      },
    });
  } catch (error) {
    console.error("Error fetching total boxes summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch summary",
      error: error.message,
    });
  }
});

export default router;