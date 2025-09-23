import express from "express";
import PaymentReport from "../../models/reports/payments.js";

const router = express.Router();

// Utility to clean number fields
const sanitizeNumber = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0.0 : num;
};

// Utility to convert Excel date or string to JS Date
const parseDate = (val) => {
  if (!val) return null;
  const date = new Date(val);
  return isNaN(date.getTime()) ? null : date;
};

router.post("/payments-reports/import", async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data to import." });
    }

    // Filter only valid rows
    const validRows = data.filter(
      (item) => item.customerCode && item.invoiceNumber
    );

    const sanitizedData = validRows.map((item) => ({
      recordingDate: parseDate(item.recordingDate),
      invoiceNumber: item.invoiceNumber || "",
      invoiceDate: parseDate(item.invoiceDate),
      deliveryDate: parseDate(item.deliveryDate),
      staffName: item.staffName || "",
      customerCode: item.customerCode || "",
      numberOfProduct: sanitizeNumber(item.numberOfProduct),
      totalQty: sanitizeNumber(item.totalQty),
      totalAmount: sanitizeNumber(item.totalAmount),
      collected: sanitizeNumber(item.collected),
      remainingAmount: sanitizeNumber(item.remainingAmount),
      cashCollection: sanitizeNumber(item.cashCollection),
      balance: sanitizeNumber(item.balance),
      remark: item.remark || "",
    }));

    const inserted = await PaymentReport.insertMany(sanitizedData);

    res.status(200).json({
      message: `${inserted.length} payment reports imported successfully.`,
    });
  } catch (err) {
    console.error("Error importing payment reports:", err);
    res.status(500).json({ message: "Failed to import payment reports." });
  }
});

router.get("/payments-reports", async (req, res) => {
  try {
    const reports = await PaymentReport.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $lookup: {
          from: "customers", // MongoDB collection name
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerDetails"
        }
      },
      {
        $unwind: {
          path: "$customerDetails",  // <-- fix here
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          deliveryDate: 1,
          staffName: 1,
          customerCode: 1,
          numberOfProduct: 1,
          totalQty: 1,
          totalAmount: 1,
          collected: 1,
          remainingAmount: 1,
          cashCollection: 1,
          balance: 1,
          remark: 1,
          createdAt: 1,
          updatedAt: 1,
          customerName: "$customerDetails.name" // <-- and here
        }
      }
    ]);

    res.status(200).json(reports);
  } catch (error) {
    console.error("❌ Error fetching payment reports:", error);
    res.status(500).json({ message: "Failed to fetch payment reports" });
  }
});


export default router;
