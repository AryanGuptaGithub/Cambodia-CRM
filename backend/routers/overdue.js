import express from "express";
import SaleSummary from "../models/sale/saleSummary.js";
import MRCreditSales from "../models/MRCreditSales.js"; // Import the MRCreditSales model

const router = express.Router();

// GET /api/salesummaries/overdue
router.get("/overdue", async (req, res) => {
  try {
    const { currentDate } = req.query;
    const referenceDate = currentDate ? new Date(currentDate) : new Date();

    // Get start of today for date comparison (00:00:00)
    const referenceDateStart = new Date(referenceDate);
    referenceDateStart.setHours(0, 0, 0, 0);

    // Fetch from SaleSummary (original invoices)
    const overdueSaleSummary = await SaleSummary.find({
      $or: [
        { saleReturn: { $exists: false } },
        { saleReturn: false },
        { saleReturn: null },
      ],
      dueDate: { $exists: true, $ne: null },
      dueDate: { $lt: referenceDateStart }, // Due date is BEFORE today
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .sort({ dueDate: 1 })
      .lean();

    // Fetch from MRCreditSales (credit sales with dueAmount > 0)
    const overdueCreditSales = await MRCreditSales.find({
      dueDate: { $exists: true, $ne: null },
      dueDate: { $lt: referenceDateStart }, // Due date is BEFORE today
      dueAmount: { $gt: 0 }, // Only invoices with outstanding amount
      status: "active",
      isActive: true,
    })
      .sort({ dueDate: 1 })
      .lean();

    // Combine both results
    const overdueInvoices = [
      ...overdueSaleSummary.map((inv) => ({
        ...inv,
        source: "SaleSummary",
        overdueAmount: inv.dueAmount > 0 
          ? inv.dueAmount 
          : Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0))
      })),
      ...overdueCreditSales.map((inv) => ({
        ...inv,
        source: "MRCreditSales",
        overdueAmount: inv.dueAmount || 0,
        // Add missing fields for consistency
        totalAmount: inv.originalTotal || 0,
        paidAmount: inv.paidAmount || 0,
        mrName: inv.mrName,
        customerName: inv.customerName,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
      })),
    ];

    // Sort combined results by dueDate (oldest first)
    overdueInvoices.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // Calculate total overdue amount
    const totalOverdueAmount = overdueInvoices.reduce((total, invoice) => {
      return total + (invoice.overdueAmount || 0);
    }, 0);

    // Calculate days overdue for each invoice
    const overdueInvoicesWithDetails = overdueInvoices.map((invoice) => {
      const dueDate = new Date(invoice.dueDate);
      const daysOverdue = Math.max(
        0,
        Math.floor((referenceDateStart - dueDate) / (1000 * 60 * 60 * 24))
      );

      return {
        ...invoice,
        daysOverdue,
        dueDateFormatted: dueDate.toLocaleDateString(),
        overdueSeverity: 
          daysOverdue > 90 ? "Critical" :
          daysOverdue > 60 ? "High" :
          daysOverdue > 30 ? "Medium" : "Low"
      };
    });

    // Format response
    res.json({
      success: true,
      data: overdueInvoicesWithDetails,
      totalOverdueAmount: totalOverdueAmount,
      count: overdueInvoicesWithDetails.length,
      currentDate: referenceDate,
      referenceDate: referenceDateStart,
      message: `Found ${overdueInvoicesWithDetails.length} overdue invoices`,
      breakdown: {
        saleSummary: overdueSaleSummary.length,
        creditSales: overdueCreditSales.length,
      },
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