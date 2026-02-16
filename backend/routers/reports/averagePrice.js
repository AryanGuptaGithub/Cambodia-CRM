import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ======================================================
// GET / (base path is /api/reports/average-price)
// ======================================================
router.get("/", async (req, res) => {
  try {
    const search = req.query.search || "";
    const pipeline = [
      // 1️⃣ Break invoice → product rows
      { $unwind: "$products" },

      // 2️⃣ CLEAN PRODUCT NAME + CONVERT NUMBERS
      {
        $addFields: {
          productNameClean: {
            $trim: {
              input: {
                $toLower: {
                  $replaceAll: {
                    input: { $ifNull: ["$products.productName", ""] },
                    find: "\n",
                    replacement: ""
                  }
                }
              }
            }
          },

          salesQty: { $toDouble: { $ifNull: ["$products.salesQty", 0] } },
          bonusQty: { $toDouble: { $ifNull: ["$products.bonusQty", 0] } },
          amount:   { $toDouble: { $ifNull: ["$products.amount", 0] } }
        }
      },

      // 3️⃣ Line total qty
      {
        $addFields: {
          lineTotalQty: { $add: ["$salesQty", "$bonusQty"] }
        }
      },

      // 4️⃣ GROUP BY PRODUCT
      {
        $group: {
          _id: "$productNameClean",
          productName: { $first: "$productNameClean" },
          totalSalesQty: { $sum: "$salesQty" },
          totalBonusQty: { $sum: "$bonusQty" },
          totalQuantity: { $sum: "$lineTotalQty" },
          totalAmount: { $sum: "$amount" }
        }
      },

      // 5️⃣ Average price
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

      // 6️⃣ Search
      ...(search
        ? [{ $match: { productName: { $regex: search, $options: "i" } } }]
        : []),

      // 7️⃣ Final output
      {
        $project: {
          _id: 0,
          productName: 1,
          totalSalesQty: 1,
          totalBonusQty: 1,
          totalQuantity: 1,
          totalAmount: { $round: ["$totalAmount", 2] },
          averagePrice: { $round: ["$averagePrice", 2] }
        }
      },

      { $sort: { productName: 1 } }
    ];

    const reports = await Sale.aggregate(pipeline);
    res.json({ success: true, reports });
  } catch (error) {
    console.error("❌ ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======================================================
// EXPORT EXCEL (base path /api/reports/average-price/export)
// ======================================================
router.get("/export", async (req, res) => {
  try {
    const reports = await Sale.aggregate([
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productName",
          productName: { $first: "$products.productName" },
          totalAmount: { $sum: "$products.amount" },
          totalQuantity: {
            $sum: { $add: ["$products.salesQty", "$products.bonusQty"] }
          },
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
    ]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Average Price");

    sheet.addRow([
      "Product",
      "MR",
      "Customer",
      "Qty",
      "Amount",
      "Avg Price"
    ]).font = { bold: true };

    reports.forEach(r => {
      sheet.addRow([
        r.productName,
        r.mrName || "Office",
        r.contact || "-",
        r.totalQuantity,
        r.totalAmount.toFixed(2),
        r.averagePrice.toFixed(2)
      ]);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=average_price.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;