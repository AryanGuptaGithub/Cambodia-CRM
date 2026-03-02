import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

/**
 * GET /table-data
 * Returns outstanding sales based on period filter.
 * Query params:
 *   period: "today" | "all" | "currentMonth" | "janToPreviousMonth" | "custom"
 *   startDate, endDate – required when period = "custom"
 */
router.get("/table-data", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    // ---------- 1. Build date filter based on period ----------
    let dateFilter = {};
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (period) {
      case "today": {
        const start = new Date(today);
        start.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);
        dateFilter = { invoiceDate: { $gte: start, $lte: end } };
        break;
      }
      case "currentMonth": {
        const start = new Date(currentYear, currentMonth, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(currentYear, currentMonth + 1, 0);
        end.setHours(23, 59, 59, 999);
        dateFilter = { invoiceDate: { $gte: start, $lte: end } };
        break;
      }
      case "janToPreviousMonth": {
        if (currentMonth === 0) {
          // January – previous month would be December of last year
          const start = new Date(currentYear - 1, 0, 1);
          start.setHours(0, 0, 0, 0);
          const end = new Date(currentYear - 1, 11, 31);
          end.setHours(23, 59, 59, 999);
          dateFilter = { invoiceDate: { $gte: start, $lte: end } };
        } else {
          const start = new Date(currentYear, 0, 1);
          start.setHours(0, 0, 0, 0);
          const end = new Date(currentYear, currentMonth, 0);
          end.setHours(23, 59, 59, 999);
          dateFilter = { invoiceDate: { $gte: start, $lte: end } };
        }
        break;
      }
      case "custom": {
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "startDate and endDate are required for custom period",
          });
        }
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = { invoiceDate: { $gte: start, $lte: end } };
        break;
      }
      case "all":
      default:
        // No date filter
        dateFilter = {};
        break;
    }

    // ---------- 2. Outstanding filter: dueAmount > 0 AND status not cash/paid ----------
    const outstandingFilter = {
      dueAmount: { $gt: 0 },
      // Exclude any payment status that matches "cash" or "paid" (case‑insensitive)
      paymentStatus: { $nin: [/^cash$/i, /^paid$/i] },
    };

    // Combine date filter and outstanding filter
    const matchFilter = { ...dateFilter, ...outstandingFilter };

    // ---------- 3. Fetch data ----------
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

    // ---------- 4. Send response ----------
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
 * GET /custom-range (optional – kept for backward compatibility)
 * Returns outstanding sales within a custom date range.
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
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const outstandingData = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: { $gte: start, $lte: end },
          dueAmount: { $gt: 0 },
          paymentStatus: { $nin: [/^cash$/i, /^paid$/i] },
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