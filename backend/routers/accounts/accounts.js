import express from "express";
import CategoryType from "../../models/accounts/CategoryType.js";
import Destination from "../../models/accounts/Destination.js";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";

const router = express.Router();

// Get all accounts with optional invoice number filter
router.get("/accounts", async (req, res) => {
  try {
    const { invoiceNumber } = req.query;

    // Build query object
    const query = { isActive: true };

    // Add invoice number filter if provided
    if (invoiceNumber) {
      query.invoiceNumber = invoiceNumber;
    }

    const sale = await Sale.find();
    const accounts = [];

    res.json(accounts);
  } catch (err) {
    console.error("Failed to fetch accounts:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Remove duplicate route - keep only one
router.get("/accounts/category-type", async (req, res) => {
  try {
    const categories = await CategoryType.find({ isActive: true }).sort({
      name: 1,
    });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

router.get("/accounts/destinations", async (req, res) => {
  try {
    const destinations = await Destination.find({ isActive: true }).sort({
      name: 1,
    });
    res.json(destinations);
  } catch (err) {
    console.error("Failed to fetch destinations:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

router.get("/accounts/alternative", async (req, res) => {
  try {
    const { invoiceNumber } = req.query;

    const query = {};
    if (invoiceNumber) {
      query.invoiceNumber = invoiceNumber;
    }

    // Use aggregation to join SaleSummary with Customer collection
    const sales = await Sale.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "customers", // MongoDB collection name (usually pluralized)
          localField: "customerCode", // Field in SaleSummary
          foreignField: "customerCode", // Field in Customer
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true, // Include sales even if customer not found
        },
      },
      {
        $project: {
          invoiceNumber: 1,
          invoiceDate: 1,
          customerName: "$customerInfo.name",
          customerAddress: "$customerInfo.address",
          dueAmount: 1,
          // Include customerCode for debugging if needed
          customerCode: 1,
        },
      },
      { $sort: { invoiceDate: -1 } },
    ]);

    const transformedSales = sales.map((sale) => ({
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.invoiceDate,
      customerName: sale.customerName || "N/A",
      customerAddress: sale.customerAddress || "N/A",
      amount: sale.dueAmount,
    }));

    res.json({
      success: true,
      data: transformedSales,
      count: sales.length,
    });
  } catch (err) {
    console.error("Failed to fetch accounts:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});


export default router;
