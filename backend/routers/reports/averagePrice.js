import express from "express";
import Sale from "../../models/sale/saleSummary.js";       // your actual sales/invoice model
import ExcelJS from "exceljs";

const router = express.Router();

// ----------------------------------------------------------------------
// GET /reports/average-price
// Product-wise average selling price with pagination and search
// ----------------------------------------------------------------------
router.get("/reports/average-price", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    // 1. Build match stage for searching product names
    const productMatch = {};
    if (search) {
      productMatch["productName"] = { $regex: search, $options: "i" };
    }

    // 2. Aggregation pipeline
    const pipeline = [
      // Unwind the products array (each sale may have many products)
      { $unwind: "$products" },

      // Optionally filter by date range? Add if needed
      // { $match: { recordingDate: { ... } } },

      // Group by productName (and maybe by MR if required)
      {
        $group: {
          _id: "$products.productName",
          totalAmount: { $sum: "$products.amount" },
          totalQuantity: {
            $sum: { $add: ["$products.salesQty", "$products.bonusQty"] }
          },
          // Keep the first occurrence of product details (if any)
          productName: { $first: "$products.productName" },
          // Optional: collect MR names or keep first
          mrName: { $first: "$mrName" },
          contact: { $first: "$customerName" } // or customer contact field
        }
      },

      // Compute average price
      {
        $addFields: {
          averagePrice: {
            $cond: [
              { $eq: ["$totalQuantity", 0] },
              0,
              { $divide: ["$totalAmount", "$totalQuantity"] }
            ]
          }
        }
      },

      // Filter by search if any
      ...(search
        ? [
            {
              $match: {
                productName: { $regex: search, $options: "i" }
              }
            }
          ]
        : []),

      // Sort by product name
      { $sort: { productName: 1 } },

      // Pagination via $facet
      {
        $facet: {
          metadata: [
            { $count: "totalRecords" },
            {
              $group: {
                _id: null,
                totalAmountOverall: { $sum: "$totalAmount" },
                totalQuantityOverall: { $sum: "$totalQuantity" },
                overallAvgPrice: { $avg: "$averagePrice" } // simple average of averages (optional)
              }
            }
          ],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                productName: 1,
                mrName: { $ifNull: ["$mrName", "Office"] },
                contact: { $ifNull: ["$contact", "Not Available"] },
                totalAmount: { $round: ["$totalAmount", 2] },
                totalQuantity: 1,
                averagePrice: { $round: ["$averagePrice", 2] }
              }
            }
          ]
        }
      }
    ];

    const result = await Sale.aggregate(pipeline);
    const metadata = result[0]?.metadata[0] || {};
    const reports = result[0]?.data || [];

    // Calculate weighted overall average price
    const totalAmountOverall = metadata.totalAmountOverall || 0;
    const totalQuantityOverall = metadata.totalQuantityOverall || 0;
    const overallAvgPrice =
      totalQuantityOverall > 0
        ? (totalAmountOverall / totalQuantityOverall).toFixed(2)
        : 0;

    // Format response
    const formattedReports = reports.map((item, index) => ({
      srNo: skip + index + 1,
      productName: item.productName,
      mrName: item.mrName,
      contact: item.contact,
      totalQuantity: item.totalQuantity,
      totalAmount: item.totalAmount,
      averagePrice: item.averagePrice
    }));

    const totalRecords = metadata.totalRecords || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      success: true,
      reports: formattedReports,
      summary: {
        totalProducts: totalRecords,
        totalAmount: totalAmountOverall.toFixed(2),
        totalQuantity: totalQuantityOverall,
        overallAveragePrice: overallAvgPrice
      },
      total: totalRecords,
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });
  } catch (error) {
    console.error("Average Price API Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch average price report",
      error: error.message
    });
  }
});

// ----------------------------------------------------------------------
// GET /reports/average-price/export
// Export product-wise average prices to Excel
// ----------------------------------------------------------------------
router.get("/reports/average-price/export", async (req, res) => {
  try {
    const search = req.query.search || "";

    const pipeline = [
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productName",
          totalAmount: { $sum: "$products.amount" },
          totalQuantity: {
            $sum: { $add: ["$products.salesQty", "$products.bonusQty"] }
          },
          productName: { $first: "$products.productName" },
          mrName: { $first: "$mrName" },
          contact: { $first: "$customerName" }
        }
      },
      {
        $addFields: {
          averagePrice: {
            $cond: [
              { $eq: ["$totalQuantity", 0] },
              0,
              { $divide: ["$totalAmount", "$totalQuantity"] }
            ]
          }
        }
      },
      { $sort: { productName: 1 } }
    ];

    // Add search filter if provided
    if (search) {
      pipeline.push({
        $match: {
          productName: { $regex: search, $options: "i" }
        }
      });
    }

    const reports = await Sale.aggregate(pipeline);

    // Calculate totals for summary
    const totalAmount = reports.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalQuantity = reports.reduce((sum, r) => sum + r.totalQuantity, 0);
    const overallAvg = totalQuantity > 0 ? totalAmount / totalQuantity : 0;

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Product Average Price");

    // Title
    worksheet.mergeCells("A1:F1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Product-wise Average Selling Price Report";
    titleCell.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" }
    };
    worksheet.getRow(1).height = 35;

    // Summary section
    worksheet.mergeCells("A3:B3");
    worksheet.getCell("A3").value = "Total Products:";
    worksheet.getCell("A3").font = { bold: true };
    worksheet.getCell("C3").value = reports.length;

    worksheet.mergeCells("A4:B4");
    worksheet.getCell("A4").value = "Total Sales Amount ($):";
    worksheet.getCell("A4").font = { bold: true };
    worksheet.getCell("C4").value = `$${totalAmount.toFixed(2)}`;

    worksheet.mergeCells("A5:B5");
    worksheet.getCell("A5").value = "Total Quantity Sold:";
    worksheet.getCell("A5").font = { bold: true };
    worksheet.getCell("C5").value = totalQuantity;

    worksheet.mergeCells("A6:B6");
    worksheet.getCell("A6").value = "Overall Average Price ($):";
    worksheet.getCell("A6").font = { bold: true };
    worksheet.getCell("C6").value = `$${overallAvg.toFixed(2)}`;

    worksheet.addRow([]);

    // Headers
    const headerRow = worksheet.addRow([
      "Sr.No",
      "Product Name",
      "MR Name",
      "Contact",
      "Total Qty",
      "Total Amount ($)",
      "Avg Price ($)"
    ]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF374151" }
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 30;

    // Data rows
    reports.forEach((item, index) => {
      const row = worksheet.addRow([
        index + 1,
        item.productName,
        item.mrName || "Office",
        item.contact || "Not Available",
        item.totalQuantity,
        `$${item.totalAmount.toFixed(2)}`,
        `$${item.averagePrice.toFixed(2)}`
      ]);
      row.alignment = { horizontal: "center", vertical: "middle" };
      if (index % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" }
        };
      }
    });

    // Total row
    const totalRow = worksheet.addRow([
      "",
      "TOTAL",
      "",
      "",
      totalQuantity,
      `$${totalAmount.toFixed(2)}`,
      `$${overallAvg.toFixed(2)}`
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" }
    };

    // Column widths
    worksheet.columns = [
      { width: 8 },
      { width: 30 },
      { width: 25 },
      { width: 20 },
      { width: 12 },
      { width: 18 },
      { width: 15 }
    ];

    // Borders
    const startRow = 9; // after title and summary
    const endRow = startRow + reports.length;
    for (let i = startRow; i <= endRow + 1; i++) {
      const row = worksheet.getRow(i);
      row.eachCell(cell => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" }
        };
      });
    }

    // Send file
    const date = new Date().toISOString().split("T")[0];
    const filename = `product_avg_price_${date}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message
    });
  }
});

// ----------------------------------------------------------------------
// GET /reports/average-price/summary
// Summary cards for dashboard
// ----------------------------------------------------------------------
router.get("/reports/average-price/summary", async (req, res) => {
  try {
    const result = await Sale.aggregate([
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$products.amount" },
          totalQuantity: {
            $sum: { $add: ["$products.salesQty", "$products.bonusQty"] }
          },
          productCount: { $addToSet: "$products.productName" }
        }
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
          totalQuantity: 1,
          productCount: { $size: "$productCount" },
          overallAveragePrice: {
            $cond: [
              { $eq: ["$totalQuantity", 0] },
              0,
              { $divide: ["$totalAmount", "$totalQuantity"] }
            ]
          }
        }
      }
    ]);

    const summary = result[0] || {
      productCount: 0,
      totalAmount: 0,
      totalQuantity: 0,
      overallAveragePrice: 0
    };

    res.status(200).json({
      success: true,
      summary: {
        totalProducts: summary.productCount,
        totalAmount: summary.totalAmount.toFixed(2),
        totalQuantity: summary.totalQuantity,
        overallAveragePrice: summary.overallAveragePrice.toFixed(2)
      }
    });
  } catch (error) {
    console.error("Summary Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch summary",
      error: error.message
    });
  }
});

export default router;