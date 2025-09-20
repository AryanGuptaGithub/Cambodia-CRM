import express from "express";
import SaleSummary from "../../models/sale/saleSummary";
const router = express.Router();

router.post("/sale/import", async (req, res) => {
  try {
    const parsedData = req.body;
    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      return res.status(400).json({ message: "No data provided for import." });
    }

    const docsToInsert = parsedData.map((item, idx) => {
      const recordingDate = item.recordingDate ? new Date(item.recordingDate) : null;
      const invoiceDate = item.invoiceDate ? new Date(item.invoiceDate) : null;
      const dueDate = item.dueDate ? new Date(item.dueDate) : null;
      const deliveryDate = item.deliveryDate ? new Date(item.deliveryDate) : null;

      return {
        recordingDate,
        invoiceNumber: item.invoiceNumber,
        invoiceDate,
        mrName: item.mrName,
        customerCode: item.customerCode,
        productName: item.productName,
        salesQty: Number(item.salesQty) || 0,
        bonusQty: Number(item.bonusQty) || 0,
        totalQty: Number(item.totalQty) || 0,
        sellingPrice: Number(item.sellingPrice) || 0,
        amount: Number(item.amount) || 0,
        discount: Number(item.discount) || 0,
        netSellingAmount: Number(item.netSellingAmount) || 0,
        averageUnitPrice: Number(item.averageUnitPrice) || 0,
        profitLoss: Number(item.profitLoss) || 0,
        creditDays: item.creditDays != null ? Number(item.creditDays) : null,
        dueDate,
        deliveryDate,
        paymentStatus: item.paymentStatus || "Pending",
        remark: item.remark || "",
      };
    });

    const inserted = await SaleSummary.insertMany(docsToInsert);
    return res.status(200).json({ 
      message: `${inserted.length} sale summary records imported successfully.` 
    });
  } catch (error) {
    console.error("Error importing sale summary:", error);
    return res.status(500).json({ message: "Failed to import sale summary." });
  }
});

router.get("/sales", async (req, res) => {
  try {
    const summaries = await SaleSummary.find().sort({ recordingDate: -1 });  
    res.status(200).json(summaries);
  } catch (error) {
    console.error("Error fetching sale summaries:", error);
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

export default router;