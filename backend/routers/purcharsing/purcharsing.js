// routes/purchasing/purchaseInventory.js
import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

const calculateStockStatus = (totalPieces) => {
  if (totalPieces === 0) return "Out of Stock";
  if (totalPieces < 10) return "Critical";
  if (totalPieces < 25) return "Low Stock";
  return "In Stock";
};

const updateReportInHand = async (productData, operation = "add") => {
  const {
    productName,
    supplierName,
    quantityPerBoxStrip,
    category,
    pricePerPiece,
    pricePerBox,
    minStockLevel,
    lc,
    fob,
    cif,
  } = productData;

  const totalPieces = quantityPerBoxStrip || 0;
  const existing = await ReportInHand.findOne({ productName });

  if (existing) {
    const multiplier = operation === "add" ? 1 : -1;
    const newTotalPieces =
      existing.quantity.totalPieces + totalPieces * multiplier;
    const finalPieces = Math.max(0, newTotalPieces);
    const newStatus = calculateStockStatus(finalPieces);

    let newLc = existing.lc;
    let newFob = existing.fob;
    let newCif = existing.cif;

    if (operation === "add" && totalPieces > 0) {
      const oldPieces = existing.quantity.totalPieces;
      const total = oldPieces + totalPieces;
      if (total > 0) {
        newLc = (existing.lc * oldPieces + lc * totalPieces) / total;
        newFob = (existing.fob * oldPieces + fob * totalPieces) / total;
        newCif = (existing.cif * oldPieces + cif * totalPieces) / total;
      }
    }

    await ReportInHand.findByIdAndUpdate(existing._id, {
      $set: {
        "quantity.totalPieces": finalPieces,
        status: newStatus,
        supplierName: supplierName || existing.supplierName,
        category: category || existing.category,
        pricePerPiece: pricePerPiece || existing.pricePerPiece,
        pricePerBox: pricePerBox || existing.pricePerBox,
        minStockLevel: minStockLevel || existing.minStockLevel,
        lc: newLc,
        fob: newFob,
        cif: newCif,
      },
    });
  } else if (operation === "add") {
    const status = calculateStockStatus(totalPieces);
    await ReportInHand.create({
      productName,
      supplierName: supplierName || "",
      quantity: { totalPieces },
      status,
      category: category || "",
      pricePerPiece: pricePerPiece || 0,
      pricePerBox: pricePerBox || 0,
      minStockLevel: minStockLevel || 0,
      lc: lc || 0,
      fob: fob || 0,
      cif: cif || 0,
    });
  }
};

/* ------------------------------------------------------ */
/* ROUTES */
/* ------------------------------------------------------ */

// 🧾 Get all purchase invoices
router.get("/purchase-invoice", async (req, res) => {
  try {
    const invoices = await purchaseInventory
      .find()
      .sort({ invoiceDate: -1 })
      .select("invoiceNumber invoiceDate supplierName amount");
    res.status(200).json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// 📦 Get all purchases
router.get("/purchase", async (req, res) => {
  try {
    const purchases = await purchaseInventory.find().sort({ createdAt: -1 });
    const products = await product.find({}, "productName type packing");

    const productMap = new Map();
    products.forEach((p) =>
      productMap.set(p.productName, { type: p.type, packing: p.packing })
    );

    const enhanced = purchases.map((p) => {
      const info = productMap.get(p.productName);
      return {
        ...p.toObject(),
        productType: info?.type || "Unknown",
        productPacking: info?.packing || "",
      };
    });

    res.status(200).json({
      success: true,
      count: enhanced.length,
      reports: enhanced,
    });
  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✏️ Update purchase
router.put("/purchase/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const original = await purchaseInventory.findById(id);
    if (!original)
      return res.status(404).json({ message: "Purchase not found" });

    const updated = await purchaseInventory.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    // Update report: subtract old, add new
    await updateReportInHand(original, "subtract");
    await updateReportInHand(updated, "add");

    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ❌ Delete purchase
router.delete("/purchase/:id", async (req, res) => {
  try {
    const purchase = await purchaseInventory.findById(req.params.id);
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });

    await updateReportInHand(purchase, "subtract");
    await purchaseInventory.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "Purchase deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 🧹 Bulk delete
router.delete("/purchase", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: "No IDs provided" });

    const purchases = await purchaseInventory.find({ _id: { $in: ids } });
    for (const p of purchases) await updateReportInHand(p, "subtract");

    const result = await purchaseInventory.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `Deleted ${result.deletedCount} purchases successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📥 Import Excel data
router.post("/purchase/import", async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0)
      return res.status(400).json({ message: "No data received" });

    const converted = data.map((item) => {
      // Use qtyBox or quantityPerBoxStrip, whichever is available
      const qtyValue = parseFloat(item.qtyBox || item.quantityPerBoxStrip) || 0;
      const lc = parseFloat(item.lc) || 0;
      const fob = parseFloat(item.fob) || 0;
      const cif = parseFloat(item.cif) || 0;

      const amount = lc * qtyValue;

      return {
        ...item,
        invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : null,
        receivedDate: item.receivedDate ? new Date(item.receivedDate) : null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        supplierName: item.supplierName || "",
        fob,
        cif,
        lcNumber: item.lc?.toString() || "",
        quantityPerBoxStrip: qtyValue,
        amount,
      };
    });

    const inserted = await purchaseInventory.insertMany(converted);
    for (const i of converted) await updateReportInHand(i, "add");

    res.status(200).json({
      message: `Imported ${inserted.length} purchase records successfully.`,
      count: inserted.length,
    });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ➕ Add new purchase manually
router.post("/purchase", async (req, res) => {
  try {
    const data = req.body;
    if (
      !data.invoiceNumber ||
      !data.supplierName ||
      !Array.isArray(data.products) ||
      data.products.length === 0
    ) {
      return res.status(400).json({
        message: "Invoice number, supplier, and at least one product required.",
      });
    }

    const saved = [];
    for (const p of data.products) {
      const qty = parseFloat(p.qtyBox || p.quantityPerBoxStrip) || 0;
      const lc = parseFloat(p.lc) || 0;
      const fob = parseFloat(p.fob) || 0;
      const cif = parseFloat(p.cif) || 0;

      // Use the amount from frontend as-is
      const amount = parseFloat(p.amount) || lc * qty; // fallback if frontend missed

      const doc = new purchaseInventory({
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate || null,
        deliveryNumber: data.deliveryNumber,
        receivedDate: data.receivedDate || null,
        expiryDate: p.expiredDate || null,
        productName: p.productName,
        supplierName: data.supplierName,
        quantityPerBoxStrip: qty,
        fob,
        cif,
        lc,
        lcNumber: p.lc ? p.lc.toString() : "",
        remarks: data.remarks || "",
        amount,
      });

      await doc.save();
      saved.push(doc);
      await updateReportInHand(p, "add");
    }

    res.status(201).json({
      message: `Purchase ${data.invoiceNumber} added successfully.`,
      purchases: saved,
    });
  } catch (err) {
    console.error("Add purchase error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 📊 Reports In Hand
router.get("/reports-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: reports.length, reports });
  } catch (err) {
    console.error("Fetch reports error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch reports" });
  }
});

export default router;
