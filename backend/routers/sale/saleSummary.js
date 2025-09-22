import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
const router = express.Router();

// 🔧 Convert Excel serial date to JS Date
const excelDateToJSDate = (serial) => {
  if (typeof serial === "number") {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }

  const parsed = new Date(serial);
  return !isNaN(parsed) ? parsed : null;
};

router.post("/sale/import", async (req, res) => {
  try {
    const parsedData = req.body;

    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      return res.status(400).json({ message: "No data provided for import." });
    }

    const validDocs = [];
    const skippedRows = [];

    parsedData.forEach((item, index) => {
      const rowNumber = index + 2; // Excel row (accounts for header)

      const safeDate = (value, fieldName) => {
        const parsed = excelDateToJSDate(value);
        if (!parsed || isNaN(parsed.getTime())) {
          skippedRows.push({
            row: rowNumber,
            reason: `Invalid ${fieldName}`,
            data: item,
          });
          return null;
        }
        return parsed;
      };

      const invoiceDate = safeDate(item.invoiceDate, "invoiceDate");
      const recordingDate = safeDate(item.recordingDate, "recordingDate");
      const dueDate = safeDate(item.dueDate, "dueDate");
      const deliveryDate = safeDate(item.deliveryDate, "deliveryDate");

      // ❌ Required field checks
      if (
        !item.mrName ||
        typeof item.mrName !== "string" ||
        item.mrName.trim() === ""
      ) {
        skippedRows.push({
          row: rowNumber,
          reason: "Missing or invalid 'mrName'",
          data: item,
        });
        return;
      }

      if (
        item.customerCode === undefined ||
        item.customerCode === null ||
        item.customerCode === "" ||
        isNaN(Number(item.customerCode))
      ) {
        skippedRows.push({
          row: rowNumber,
          reason: "Missing or invalid 'customerCode'",
          data: item,
        });
        return;
      }

      if (!invoiceDate) {
        skippedRows.push({
          row: rowNumber,
          reason: "Missing or invalid 'invoiceDate'",
          data: item,
        });
        return;
      }

      // Calculate paidAmount and dueAmount based on paymentStatus and netSellingAmount
      const paymentStatus = item.paymentStatus
        ? String(item.paymentStatus).toLowerCase()
        : "pending";

      const netSellingAmount = Number(item.netSellingAmount) || 0;

      const paidAmount = paymentStatus === "paid" ? item.amount : 0;
      const dueAmount = paymentStatus === "pending" ? item.amount : 0;

      // ✅ All checks passed
      validDocs.push({
        recordingDate,
        invoiceNumber: item.invoiceNumber,
        invoiceDate,
        mrName: item.mrName.trim(),
        customerCode: Number(item.customerCode),
        productName: item.productName,
        salesQty: Number(item.salesQty) || 0,
        bonusQty: Number(item.bonusQty) || 0,
        totalQty: Number(item.totalQty) || 0,
        sellingPrice: Number(item.sellingPrice) || 0,
        amount: Number(item.amount) || 0,
        discount: Number(item.discount) || 0,
        netSellingAmount,
        averageUnitPrice: Number(item.averageUnitPrice) || 0,
        profitLoss: Number(item.profitLoss) || 0,
        creditDays: item.creditDays !== "" ? Number(item.creditDays) : null,
        dueDate,
        deliveryDate,
        paymentStatus,
        paidAmount,
        dueAmount,
        remark: item.remark || "",
      });
    });

    // ❌ Nothing valid?
    if (validDocs.length === 0) {
      return res.status(400).json({
        message: "❌ No valid rows to import. Please check required fields.",
        skippedRows,
      });
    }

    // ✅ Insert and respond
    const inserted = await SaleSummary.insertMany(validDocs);

    return res.status(200).json({
      message: `✅ ${inserted.length} sale summary records imported successfully.`,
      insertedCount: inserted.length,
      skippedCount: skippedRows.length,
      skippedRows,
    });
  } catch (error) {
    console.error("❌ Error importing sale summary:", error);
    return res.status(500).json({ message: "Failed to import sale summary." });
  }
});

router.get("/sales", async (req, res) => {
  try {
    const summaries = await SaleSummary.aggregate([
      {
        $lookup: {
          from: "customers", // 👈 the MongoDB collection name (should be lowercase and plural)
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true, // if you want to include sales even if customer not found
        },
      },
      {
        $sort: {
          recordingDate: -1,
        },
      },
    ]);

    res.status(200).json(summaries);
  } catch (error) {
    console.error(
      "❌ Error fetching sale summaries with customer info:",
      error
    );
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

export default router;
