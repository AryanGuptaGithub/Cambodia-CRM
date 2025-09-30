import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import paymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
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
      message: `<b>${inserted.length}</b> sale summary records imported successfully.`,
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

router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const updatedSale = await SaleSummary.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    res.status(200).json(updatedSale);
  } catch (err) {
    console.error("Error updating sale:", err);
    res.status(500).json({ error: "Failed to update sales record." });
  }
});

router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedSale = await SaleSummary.findByIdAndDelete(id);

    if (!deletedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    res.status(200).json({ message: "Sales record deleted successfully." });
  } catch (err) {
    console.error("Error deleting sale:", err);
    res.status(500).json({ error: "Failed to delete sales record." });
  }
});

router.delete("/sales", async (req, res) => {
  try {
    let { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No sale IDs provided." });
    }

    if (typeof ids[0] === "object" && ids[0]?.id) {
      ids = ids.map((item) => item.id);
    }

    const result = await SaleSummary.deleteMany({ _id: { $in: ids } });

    return res.status(200).json({
      message: `${result.deletedCount} sale(s) deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting sales:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/sales", async (req, res) => {
  try {
    const newSaleData = req.body;
    const newSale = new SaleSummary(newSaleData);
    const savedSale = await newSale.save();

    res.status(201).json({
      message: `Sale <b>${newSaleData.productName} - ${newSaleData.invoiceNumber}</b> added successfully`,
      sale: savedSale,
    });
  } catch (error) {
    console.error("Sale creation error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to add new sale" });
  }
});

router.get("/sales/payment-status", async (req, res) => {
  try {
    const statuses = await paymentStatus.find().sort({ type: 1 });
    res.status(200).json(statuses);
  } catch (error) {
    console.error("❌ Error fetching payment statuses:", error.message);
    res.status(500).json({ error: "Failed to fetch payment statuses." });
  }
});

router.get("/sales/unique-names", async (req, res) => {
  try {
    const uniqueNames = await Product.distinct("productName", {
      productName: { $ne: null },
    });

    uniqueNames.sort((a, b) => a.localeCompare(b));

    res.status(200).json({ productNames: uniqueNames });
  } catch (error) {
    console.error("Error fetching unique product names:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
