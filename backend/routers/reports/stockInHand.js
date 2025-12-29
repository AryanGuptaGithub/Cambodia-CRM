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

router.get("/reports/reports-in-hand", async (req, res) => {
  try {
    const { page = 1, limit = 9, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query based on search parameter
    let query = {};
    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    // Get all reports matching the query
    const allReports = await ReportInHand.find(query).sort({ createdAt: -1 });
    const filteredReports = filterReportsWithBatches(allReports);
    const totalCount = filteredReports.length;

    // Calculate OVERALL average price for ALL products
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

    // Get paginated results
    const rawReports = await ReportInHand.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const paginatedReports = filterReportsWithBatches(rawReports);

    res.status(200).json({
      success: true,
      count: paginatedReports.length, // Current page count
      total: totalCount, // Total across all pages
      overallAveragePrice: overallAveragePrice, // Average for ALL products
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

// New route for exporting to Excel
router.get("/reports/average-price/export", async (req, res) => {
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

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Average Price Report");

    // Add title
    worksheet.mergeCells("A1:D1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Average Price Per Product Report";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    // Add summary information
    let currentRow = 1;

    currentRow++;

    // Add table headers
    const headerRowNum = currentRow;
    worksheet.getCell(`A${headerRowNum}`).value = "Sr.No";
    worksheet.getCell(`B${headerRowNum}`).value = "Product Name";
    worksheet.getCell(`C${headerRowNum}`).value = "Category";
    worksheet.getCell(`D${headerRowNum}`).value = "Average Price ($)";

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
      row.getCell(4).value = report.averagePrice || 0;
      row.getCell(4).numFmt = "$#,##0.00";
    });

    // Auto-fit columns
    worksheet.columns = [
      { key: "srNo", width: 10 },
      { key: "productName", width: 40 },
      { key: "category", width: 20 },
      { key: "averagePrice", width: 15 },
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

    // Center align serial numbers
    const serialNumberColumn = worksheet.getColumn(1);
    serialNumberColumn.alignment = { horizontal: "center" };

    // Set response headers
    const fileName = search
      ? `average_price_report_${search.replace(/[^a-z0-9]/gi, "_")}_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`
      : `average_price_report_${new Date().toISOString().slice(0, 10)}.xlsx`;

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

// Alternative: More efficient database approach
router.get("/reports-in-hand-efficient", async (req, res) => {
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
          metadata: [{ $count: "totalCount" }],
          data: [{ $skip: skip }, { $limit: limitNum }],
        },
      },
    ]);

    const totalCount = reports[0]?.metadata[0]?.totalCount || 0;
    const paginatedReports = reports[0]?.data || [];

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: totalCount,
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

// Keep existing routes for backward compatibility
router.get("/reports-in-hand/all", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });
    const filteredReports = filterReportsWithBatches(reports);

    res.status(200).json({
      success: true,
      count: filteredReports.length,
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

// The rest of your existing routes remain the same
router.get("/reports-in-hand/:id", async (req, res) => {
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

router.get("/reports-in-hand/search/:productName", async (req, res) => {
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

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: filteredReports.length,
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

router.get("/reports-in-hand/supplier/:supplierName", async (req, res) => {
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

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: filteredReports.length,
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

export default router;
