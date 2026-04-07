import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import ExcelJS from "exceljs";

const router = express.Router();

const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

// ======================================================
// GET /api/reports/average-price
// ======================================================
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const pipeline = [
      { $unwind: "$products" },
      {
        $addFields: {
          productNameClean: {
            $trim: {
              input: {
                $toLower: {
                  $replaceAll: {
                    input: { $ifNull: ["$products.productName", ""] },
                    find: "\n",
                    replacement: "",
                  },
                },
              },
            },
          },
          salesQty: { $toDouble: { $ifNull: ["$products.salesQty", 0] } },
          bonusQty: { $toDouble: { $ifNull: ["$products.bonusQty", 0] } },
          amount: { $toDouble: { $ifNull: ["$products.amount", 0] } },
        },
      },
      {
        $addFields: {
          lineTotalQty: { $add: ["$salesQty", "$bonusQty"] },
        },
      },
      // 🔍 LOOKUP product master collection to get type
      {
        $lookup: {
          from: "products", // name of your product master collection
          let: { prodName: "$productNameClean" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toLower: { $trim: { input: "$productName" } } },
                    "$$prodName",
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { type: 1, _id: 0 } },
          ],
          as: "productInfo",
        },
      },
      {
        $addFields: {
          productType: { $arrayElemAt: ["$productInfo.type", 0] },
        },
      },
      {
        $group: {
          _id: "$productNameClean",
          productName: { $first: "$productNameClean" },
          // ✅ Use the looked-up type as category
          category: { $first: "$productType" },
          totalSalesQty: { $sum: "$salesQty" },
          totalBonusQty: { $sum: "$bonusQty" },
          totalQuantity: { $sum: "$lineTotalQty" },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $addFields: {
          averagePrice: {
            $cond: [
              { $eq: ["$totalQuantity", 0] },
              0,
              { $divide: ["$totalAmount", "$totalQuantity"] },
            ],
          },
        },
      },
      // Search filter
      ...(search
        ? [{ $match: { productName: { $regex: search, $options: "i" } } }]
        : []),
      {
        $project: {
          _id: 0,
          productName: 1,
          category: { $ifNull: ["$category", "N/A"] },
          totalQuantity: 1,
          totalAmount: { $round: ["$totalAmount", 2] },
          averagePrice: { $round: ["$averagePrice", 2] },
        },
      },
      { $sort: { productName: 1 } },
    ];

    const allReports = await Sale.aggregate(pipeline);

    let totalAmountAll = 0;
    let totalQtyAll = 0;
    allReports.forEach((record) => {
      totalAmountAll += record.totalAmount;
      totalQtyAll += record.totalQuantity;
    });
    const overallAveragePrice =
      totalQtyAll > 0 ? fixPrecision(totalAmountAll / totalQtyAll) : 0;
    const totalRecords = allReports.length;
    const totalPages = Math.ceil(totalRecords / limit);

    const paginatedReports = allReports.slice(skip, skip + limit);

    const formattedRecords = paginatedReports.map((record, idx) => ({
      _id: `${record.productName}_${idx}`,
      productId: `${record.productName}_${idx}`,
      productName: record.productName,
      category: record.category || "N/A",
      qty: record.totalQuantity,
      amount: record.totalAmount,
      averagePrice: fixPrecision(record.averagePrice),
    }));

    res.json({
      success: true,
      reports: formattedRecords,
      total: totalRecords,
      currentPage: page,
      totalPages: totalPages,
      overallAveragePrice: overallAveragePrice,
      totalProducts: totalRecords,
    });
  } catch (error) {
    console.error("❌ ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======================================================
// EXPORT EXCEL (same lookup logic)
// ======================================================
router.get("/export", async (req, res) => {
  try {
    const search = req.query.search || "";

    const pipeline = [
      { $unwind: "$products" },
      {
        $addFields: {
          productNameClean: {
            $trim: {
              input: {
                $toLower: {
                  $replaceAll: {
                    input: { $ifNull: ["$products.productName", ""] },
                    find: "\n",
                    replacement: "",
                  },
                },
              },
            },
          },
          salesQty: { $toDouble: { $ifNull: ["$products.salesQty", 0] } },
          bonusQty: { $toDouble: { $ifNull: ["$products.bonusQty", 0] } },
          amount: { $toDouble: { $ifNull: ["$products.amount", 0] } },
        },
      },
      {
        $addFields: {
          lineTotalQty: { $add: ["$salesQty", "$bonusQty"] },
        },
      },
      // 🔍 LOOKUP product master
      {
        $lookup: {
          from: "products",
          let: { prodName: "$productNameClean" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toLower: { $trim: { input: "$productName" } } },
                    "$$prodName",
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { type: 1, _id: 0 } },
          ],
          as: "productInfo",
        },
      },
      {
        $addFields: {
          productType: { $arrayElemAt: ["$productInfo.type", 0] },
        },
      },
      {
        $group: {
          _id: "$productNameClean",
          productName: { $first: "$productNameClean" },
          category: { $first: "$productType" },
          totalQuantity: { $sum: "$lineTotalQty" },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $addFields: {
          averagePrice: {
            $cond: [
              { $eq: ["$totalQuantity", 0] },
              0,
              { $divide: ["$totalAmount", "$totalQuantity"] },
            ],
          },
        },
      },
      ...(search
        ? [{ $match: { productName: { $regex: search, $options: "i" } } }]
        : []),
      {
        $project: {
          _id: 0,
          productName: 1,
          category: { $ifNull: ["$category", "N/A"] },
          totalQuantity: 1,
          totalAmount: { $round: ["$totalAmount", 2] },
          averagePrice: { $round: ["$averagePrice", 2] },
        },
      },
      { $sort: { productName: 1 } },
    ];

    const reports = await Sale.aggregate(pipeline);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Average Price Report");

    const headers = [
      "Product Name",
      "Category",
      "Total Quantity",
      "Amount ($)",
      "Average Price ($)",
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.height = 25;

    reports.forEach((r) => {
      const row = sheet.addRow([
        r.productName || "N/A",
        r.category || "N/A",
        r.totalQuantity || 0,
        r.totalAmount || 0,
        r.averagePrice || 0,
      ]);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    const totalAmount = reports.reduce(
      (sum, r) => sum + (r.totalAmount || 0),
      0,
    );
    const totalQty = reports.reduce(
      (sum, r) => sum + (r.totalQuantity || 0),
      0,
    );
    const overallAvg = totalQty > 0 ? totalAmount / totalQty : 0;

    sheet.addRow([]);
    const summaryRow = sheet.addRow([
      "",
      "TOTAL:",
      totalQty,
      `$${totalAmount.toFixed(2)}`,
      `$${overallAvg.toFixed(2)}`,
    ]);
    summaryRow.font = { bold: true };
    summaryRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    sheet.columns = [
      { width: 30 },
      { width: 20 },
      { width: 15 },
      { width: 18 },
      { width: 18 },
    ];
    sheet.getColumn(3).numFmt = "#,##0.00";
    sheet.getColumn(4).numFmt = '"$"#,##0.00';
    sheet.getColumn(5).numFmt = '"$"#,##0.00';

    const fileName = search
      ? `average_price_report_${search.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `average_price_report_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
