// routes/purchasing/purchaseInventory.js
import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

const calculateStockStatus = (boxes) => {
  if (boxes === 0) return "Out of Stock";
  if (boxes < 10) return "Critical";
  if (boxes < 25) return "Low Stock";
  return "In Stock";
};

// CORRECTED: updateReportInHand function to handle boxes field
const updateReportInHand = async (productData, operation = "add") => {
  try {
    const {
      productName,
      supplierName,
      quantityPerBoxStrip,
      qtyBox, // Add qtyBox for compatibility
      category,
      pricePerPiece,
      pricePerBox,
      minStockLevel,
      lc,
      fob,
      cif,
    } = productData;

    // FIX 1: Ensure supplierName is not empty
    const validSupplierName = supplierName?.trim() || "Unknown Supplier";

    // CORRECTED: Use boxes instead of totalPieces
    const boxesToUpdate = quantityPerBoxStrip || qtyBox || 0;
    const existing = await ReportInHand.findOne({ productName });

    if (existing) {
      const multiplier = operation === "add" ? 1 : -1;

      // CORRECTED: Update boxes field instead of totalPieces
      const newBoxes = existing.quantity.boxes + boxesToUpdate * multiplier;
      const finalBoxes = Math.max(0, newBoxes);
      const newStatus = calculateStockStatus(finalBoxes);

      let newLc = existing.lc;
      let newFob = existing.fob;
      let newCif = existing.cif;

      if (operation === "add" && boxesToUpdate > 0) {
        const oldBoxes = existing.quantity.boxes;
        const total = oldBoxes + boxesToUpdate;
        if (total > 0) {
          newLc = (existing.lc * oldBoxes + (lc || 0) * boxesToUpdate) / total;
          newFob =
            (existing.fob * oldBoxes + (fob || 0) * boxesToUpdate) / total;
          newCif =
            (existing.cif * oldBoxes + (cif || 0) * boxesToUpdate) / total;
        }
      }

      await ReportInHand.findByIdAndUpdate(existing._id, {
        $set: {
          "quantity.boxes": finalBoxes, // CORRECTED: Update boxes field
          status: newStatus,
          supplierName: validSupplierName,
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
      const status = calculateStockStatus(boxesToUpdate);
      await ReportInHand.create({
        productName,
        supplierName: validSupplierName,
        quantity: {
          boxes: boxesToUpdate, // CORRECTED: Set boxes field
          pieces: 0,
        },
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
  } catch (error) {
    console.error("Error in updateReportInHand:", error);
    throw error;
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

// 🧹 Bulk delete - FIXED
router.delete("/purchase", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: "No IDs provided" });

    // FIX 2: Extract just the ID strings from the objects
    const idStrings = ids.map((item) =>
      typeof item === "object" && item.id ? item.id : item
    );

    const purchases = await purchaseInventory.find({ _id: { $in: idStrings } });

    for (const p of purchases) {
      await updateReportInHand(p, "subtract");
    }

    const result = await purchaseInventory.deleteMany({
      _id: { $in: idStrings },
    });

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

      // FIX 1: Ensure supplierName is not empty
      const validSupplierName = item.supplierName?.trim() || "Unknown Supplier";

      return {
        ...item,
        invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : null,
        receivedDate: item.receivedDate ? new Date(item.receivedDate) : null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        supplierName: validSupplierName,
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

// ➕ Add new purchase manually - FIXED
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

    // FIX 1: Ensure supplierName is not empty
    const validSupplierName = data.supplierName?.trim();
    if (!validSupplierName) {
      return res.status(400).json({
        message: "Supplier name is required and cannot be empty.",
      });
    }

    const saved = [];
    for (const p of data.products) {
      const qty = parseFloat(p.qtyBox || p.quantityPerBoxStrip) || 0;
      const lc = parseFloat(p.lc) || 0;
      const fob = parseFloat(p.fob) || 0;
      const cif = parseFloat(p.cif) || 0;

      // Use the amount from frontend as-is
      const amount = parseFloat(p.amount) || lc * qty;

      const doc = new purchaseInventory({
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate || null,
        deliveryNumber: data.deliveryNumber,
        receivedDate: data.receivedDate || null,
        expiryDate: p.expiredDate || null,
        productName: p.productName,
        supplierName: validSupplierName,
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

      // CORRECTED: Pass both quantityPerBoxStrip and qtyBox for compatibility
      await updateReportInHand(
        {
          ...p,
          supplierName: validSupplierName,
          quantityPerBoxStrip: qty,
          qtyBox: qty, // Add qtyBox for compatibility
          lc,
          fob,
          cif,
        },
        "add"
      );
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
