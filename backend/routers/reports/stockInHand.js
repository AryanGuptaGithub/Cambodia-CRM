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

// FIXED: Changed from '/reports/reports-in-hand' to '/'
// ✅ Main route - GET all reports with totalBoxes
// ✅ Main route - GET ALL reports (for frontend client-side pagination)
router.get("/", async (req, res) => {
  try {
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
    
    // ✅ Calculate total boxes across all products
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    console.log('value sof allReports', allReports);
    res.status(200).json({
      success: true,
      count: filteredReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum,
      inStockCount: inStockCount,
      lowStockCount: lowStockCount,
      criticalCount: criticalCount,
      outOfStockCount: outOfStockCount,
      reports: filteredReports,
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

// FIXED: Changed from '/reports/average-price/export' to '/average-price/export'
// ✅ New route for exporting to Excel with totalBoxes
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

    // ✅ Calculate total boxes
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Stock Report");

    // Add title
    worksheet.mergeCells("A1:E1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Stock In Hand Report";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    // Add summary information
    let currentRow = 2;
    
    // ✅ Add total boxes summary
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
    const totalBoxesCell = worksheet.getCell(`A${currentRow}`);
    totalBoxesCell.value = `Total Stock Across All Products: ${totalBoxesSum.toLocaleString()} Boxes`;
    totalBoxesCell.font = { bold: true, size: 12 };
    totalBoxesCell.alignment = { horizontal: "left" };
    
    currentRow += 2;

    // Add table headers
    const headerRowNum = currentRow;
    worksheet.getCell(`A${headerRowNum}`).value = "Sr.No";
    worksheet.getCell(`B${headerRowNum}`).value = "Product Name";
    worksheet.getCell(`C${headerRowNum}`).value = "Category";
    worksheet.getCell(`D${headerRowNum}`).value = "Total Boxes"; // ✅ Added
    worksheet.getCell(`E${headerRowNum}`).value = "Average Price ($)";

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

      row.getCell(1).value = index + 1; // Sr.No
      row.getCell(2).value = report.productName || "N/A";
      row.getCell(3).value = report.type || "N/A";
      row.getCell(4).value = report.totalBoxes || 0; // ✅ Total Boxes
      row.getCell(5).value = report.averagePrice || 0;
      row.getCell(5).numFmt = "$#,##0.00";
    });

    // Auto-fit columns
    worksheet.columns = [
      { key: "srNo", width: 10 },
      { key: "productName", width: 40 },
      { key: "category", width: 20 },
      { key: "totalBoxes", width: 15 }, // ✅ Added
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

    // Center align serial numbers and total boxes
    const serialNumberColumn = worksheet.getColumn(1);
    serialNumberColumn.alignment = { horizontal: "center" };
    
    const totalBoxesColumn = worksheet.getColumn(4); // ✅
    totalBoxesColumn.alignment = { horizontal: "center" };

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

// FIXED: Changed from '/reports-in-hand-efficient' to '/efficient'
// ✅ Alternative: More efficient database approach with totalBoxes
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
                totalBoxes: { $sum: "$totalBoxes" }, // ✅ Calculate total boxes
              },
            },
          ],
          data: [{ $skip: skip }, { $limit: limitNum }],
        },
      },
    ]);

    const totalCount = reports[0]?.metadata[0]?.totalCount || 0;
    const totalBoxes = reports[0]?.metadata[0]?.totalBoxes || 0; // ✅
    const paginatedReports = reports[0]?.data || [];

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: totalCount,
      totalBoxes: totalBoxes, // ✅ Include total boxes
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

// FIXED: Changed from '/reports-in-hand/all' to '/all'
// ✅ Keep existing routes for backward compatibility
router.get("/all", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });
    const filteredReports = filterReportsWithBatches(reports);

    // ✅ Calculate total boxes
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    res.status(200).json({
      success: true,
      count: filteredReports.length,
      totalBoxes: totalBoxesSum, // ✅ Include total boxes
      reports: filteredReports,
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

// FIXED: Changed from '/reports-in-hand/:id' to '/:id'
// The rest of your existing routes remain the same
router.get("/:id", async (req, res) => {
  try {
    const report = await ReportInHand.findById(req.params.id);

    if (!report || !report.batches || report.batches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found or has no batches",
      });
    }

    res.status(200).json({
      success: true,
      report: report,
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

// FIXED: Changed from '/reports-in-hand/search/:productName' to '/search/:productName'
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

    // ✅ Calculate total boxes for search results
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum, // ✅ Include total boxes
      totalPages: Math.ceil(filteredReports.length / limitNum),
      currentPage: pageNum,
      reports: paginatedReports,
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

// FIXED: Changed from '/reports-in-hand/supplier/:supplierName' to '/supplier/:supplierName'
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

    // ✅ Calculate total boxes for supplier
    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum, // ✅ Include total boxes
      totalPages: Math.ceil(filteredReports.length / limitNum),
      currentPage: pageNum,
      reports: paginatedReports,
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

// FIXED: Changed from '/reports-in-hand/summary/total-boxes' to '/summary/total-boxes'
// ✅ NEW: Get total boxes summary
router.get("/summary/total-boxes", async (req, res) => {
  try {
    const allReports = await ReportInHand.find();
    const filteredReports = filterReportsWithBatches(allReports);

    const totalBoxesSum = filteredReports.reduce((sum, report) => {
      return sum + (report.totalBoxes || 0);
    }, 0);

    const averageBoxesPerProduct =
      filteredReports.length > 0 ? totalBoxesSum / filteredReports.length : 0;

    // Group by status
    const byStatus = {
      "In Stock": 0,
      "Low Stock": 0,
      Critical: 0,
      "Out of Stock": 0,
    };

    filteredReports.forEach((report) => {
      const status = report.status || "Out of Stock";
      if (byStatus.hasOwnProperty(status)) {
        byStatus[status] += report.totalBoxes || 0;
      }
    });

    res.status(200).json({
      success: true,
      summary: {
        totalProducts: filteredReports.length,
        totalBoxes: totalBoxesSum,
        averageBoxesPerProduct: parseFloat(averageBoxesPerProduct.toFixed(2)),
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
