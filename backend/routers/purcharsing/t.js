import express from "express";
import Sale from "../../models/sale/saleSummary.js";

const router = express.Router();

router.get("/reports/average-price", async (req, res) => {
  try {
    const search = req.query.search || "";
    console.log("🔍 Search:", search || "NONE");

    const pipeline = [
      // 1️⃣ Break invoice → product rows
      { $unwind: "$products" },

      // 2️⃣ CLEAN + CONVERT DATA (THIS IS THE KEY FIX)
      {
        $addFields: {
          productName: {
            $trim: {
              input: {
                $replaceAll: {
                  input: "$products.productName",
                  find: "\n",
                  replacement: ""
                }
              }
            }
          },

          salesQty: { $toDouble: { $ifNull: ["$products.salesQty", 0] } },
          bonusQty: { $toDouble: { $ifNull: ["$products.bonusQty", 0] } },
          amount:   { $toDouble: { $ifNull: ["$products.amount", 0] } }
        }
      },

      // 3️⃣ Total qty per line
      {
        $addFields: {
          lineTotalQty: { $add: ["$salesQty", "$bonusQty"] }
        }
      },

      // 4️⃣ GROUP ALL INVOICES BY PRODUCT NAME
      {
        $group: {
          _id: {
            $toLower: {
              $trim: { input: "$productName" }
            }
          },

          productName: { $first: "$productName" },
          totalSalesQty: { $sum: "$salesQty" },
          totalBonusQty: { $sum: "$bonusQty" },
          totalQuantity: { $sum: "$lineTotalQty" },
          totalAmount: { $sum: "$amount" }
        }
      },

      // 5️⃣ ✅ EXACT EXCEL FORMULA
      // (sale qty + bonus qty) already included
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

      // 6️⃣ Search filter
      ...(search
        ? [{ $match: { productName: { $regex: search, $options: "i" } } }]
        : []),

      // 7️⃣ Final shape
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

    // 🔥 FULL PRODUCT LOGS
    console.log("\n====================================");
    console.log("📦 PRODUCT CALCULATION BREAKDOWN");
    console.log("====================================");

    reports.forEach((r, i) => {
      console.log(`\n#${i + 1} PRODUCT: ${r.productName}`);
      console.log(" Sales Qty :", r.totalSalesQty);
      console.log(" Bonus Qty :", r.totalBonusQty);
      console.log(" Total Qty :", r.totalQuantity);
      console.log(" Total Amt :", r.totalAmount);
      console.log(
        ` Avg Price : ${r.totalAmount} / ${r.totalQuantity} = ${r.averagePrice}`
      );
    });

    // 🔢 OVERALL SUMMARY
    const totalAmount = reports.reduce((s, r) => s + r.totalAmount, 0);
    const totalQuantity = reports.reduce((s, r) => s + r.totalQuantity, 0);

    console.log("\n====================================");
    console.log("📊 OVERALL SUMMARY");
    console.log("====================================");
    console.log("Total Products :", reports.length);
    console.log("Total Quantity :", totalQuantity);
    console.log("Total Amount   :", totalAmount.toFixed(2));
    console.log(
      "Overall Avg   :",
      totalQuantity > 0
        ? `${totalAmount} / ${totalQuantity} = ${(totalAmount / totalQuantity).toFixed(2)}`
        : 0
    );

    res.json({
      success: true,
      reports,
      summary: {
        totalProducts: reports.length,
        totalQuantity,
        totalAmount: totalAmount.toFixed(2),
        overallAveragePrice:
          totalQuantity > 0
            ? (totalAmount / totalQuantity).toFixed(2)
            : 0
      }
    });
  } catch (error) {
    console.error("❌ API ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
