import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

/**
 * OUTSTANDING TABLE DATA
 * Changed from: router.get("/outstanding/table-data", ...)
 * To: router.get("/table-data", ...)
 */
router.get("/table-data", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    let matchFilter = {};

    // ✅ Apply date filter ONLY when custom range is selected
    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      matchFilter.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    // ✅ Outstanding condition
    matchFilter.$or = [
      { dueAmount: { $gt: 0 } },
      { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
    ];

    const outstandingData = await SaleSummary.aggregate([
      { $match: matchFilter },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerName: 1,
          customerCode: 1,
          customerId: 1,
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
          products: 1,
        },
      },
      { $sort: { recordingDate: -1 } },
    ]);

    res.json({
      success: true,
      data: outstandingData,
      count: outstandingData.length,
      period: period || "all",
    });
  } catch (error) {
    console.error("Error fetching outstanding table data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

/**
 * CUSTOM RANGE OUTSTANDING (Optional – can be removed if unused)
 * Changed from: router.get("/outstanding/custom-range", ...)
 * To: router.get("/custom-range", ...)
 */
router.get("/custom-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const outstandingData = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: { $gte: start, $lte: end },
          $or: [
            { dueAmount: { $gt: 0 } },
            { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
          ],
        },
      },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerName: 1,
          customerCode: 1,
          customerId: 1,
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
          products: 1,
        },
      },
      { $sort: { recordingDate: -1 } },
    ]);

    const totalOutstanding = outstandingData.reduce(
      (sum, inv) => sum + (inv.dueAmount || 0),
      0
    );

    res.json({
      success: true,
      totalOutstanding,
      outstandingData,
      count: outstandingData.length,
    });
  } catch (error) {
    console.error("Error fetching custom range outstanding:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      totalOutstanding: 0,
      outstandingData: [],
    });
  }
});

export default router;