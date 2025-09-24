import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
const router = express.Router();

// POST /api/purchase-inventory/import
router.post("/purchase/import", async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data received" });
    }

    const converted = data.map((item) => ({
      ...item,
      invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : null,
      receivedDate: item.receivedDate ? new Date(item.receivedDate) : null,
      expiredDate: item.expiredDate ? new Date(item.expiredDate) : null,
    }));

    const inserted = await purchaseInventory.insertMany(converted);

    res.status(200).json({
      message: `✅ Successfully imported ${inserted.length} purchase inventory records.`,
      count: inserted.length,
    });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/purchase", async (req, res) => {
  try {
    const reports = await purchaseInventory.find().sort({ createdAt: -1 });
    res.status(200).json({ reports });
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch daily sample reports." });
  }
});

router.put("/purchase/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    const updatedPurchase = await purchaseInventory.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPurchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    res.json(updatedPurchase);
  } catch (error) {
    console.error("Update purchase error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/purchase/:id", async (req, res) => {
  try {
    const deleted = await purchaseInventory.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    res.status(200).json({ message: "Purchase deleted successfully", deleted });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Server error during deletion" });
  }
});

router.delete("/purchase", async (req, res) => {
  try {
    let { ids } = req.body;
    ids = ids.map((item) => (typeof item === "string" ? item : item.id));

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const result = await purchaseInventory.deleteMany({
      _id: { $in: ids },
    });

    res.status(200).json({
      message: `${result.deletedCount} purchase(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({ error: "Failed to delete purchases" });
  }
});

router.post("/purchase", async (req, res) => {
  try {
    const formData = req.body;
    if (!formData.invoiceNumber || !formData.productName) {
      return res
        .status(400)
        .json({ message: "Invoice number and product name are required." });
    }

    // Create new purchase document
    const newPurchase = new purchaseInventory({
      invoiceNumber: formData.invoiceNumber,
      invoiceDate: formData.invoiceDate || null,
      deliveryNumber: formData.deliveryNumber,
      receivedDate: formData.receivedDate || null,
      expiredDate: formData.expiredDate || null,
      productName: formData.productName,
      type: formData.type,
      packing: formData.packing,
      qtyMain: formData.qtyMain,
      qty: formData.qty,
      unitPrice: formData.unitPrice,
      amount: formData.amount,
      otherExpenses: formData.otherExpenses,
      totalAmount: formData.totalAmount,
      unitCost: formData.unitCost,
      remark: formData.remark,
    });

    await newPurchase.save();

    res.status(201).json({
      message: `Purchase <b>${formData.productName}-${formData.invoiceNumber}</b> added successfully`,
      purchase: newPurchase,
    });
  } catch (error) {
    console.error("Error adding purchase:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
