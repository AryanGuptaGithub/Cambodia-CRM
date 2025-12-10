import express from "express";
import SaleSummary from "../models/sale/saleSummary.js";
const router = express.Router();

// GET /api/salesummaries/overdue
router.get("/overdue", async (req, res) => {
  try {
    const { currentDate } = req.query;

    // Use provided currentDate or default to server's current date
    const referenceDate = currentDate ? new Date(currentDate) : new Date();

    // Find invoices that are NOT sale returns and are overdue
    const overdueInvoices = await SaleSummary.find({
      $or: [
        { saleReturn: { $exists: false } },
        { saleReturn: false },
        { saleReturn: null },
      ],
      // 2. Has dueDate
      dueDate: { $exists: true, $ne: null },
      // 3. dueDate is before current date
      dueDate: { $lt: referenceDate },
      // 4. Payment is not complete (dueAmount > 0 OR totalAmount > paidAmount)
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .sort({ dueDate: 1 }) // Sort by dueDate ascending (oldest first)
      .lean(); // Return plain JavaScript objects

    // Calculate total overdue amount
    const totalOverdueAmount = overdueInvoices.reduce((total, invoice) => {
      // Use dueAmount if available, otherwise calculate from totalAmount - paidAmount
      const overdueAmount =
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - invoice.paidAmount);
      return total + overdueAmount;
    }, 0);

    // Format response
    res.json({
      success: true,
      data: overdueInvoices,
      totalOverdueAmount: totalOverdueAmount,
      count: overdueInvoices.length,
      currentDate: referenceDate,
      message: `Found ${overdueInvoices.length} overdue invoices`,
    });
  } catch (error) {
    console.error("Error fetching overdue invoices:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching overdue invoices",
      error: error.message,
    });
  }
});

export default router;