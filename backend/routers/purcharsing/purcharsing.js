import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js"

const router = express.Router();

/* ------------------------------------------------------ */
/* UTILITIES */
/* ------------------------------------------------------ */

const calculateStockStatus = (boxes) => {
  if (boxes <= 0) return "Out of Stock";
  if (boxes < 10) return "Critical";
  if (boxes < 25) return "Low Stock";
  return "In Stock";
};

const updateReportInHand = async (productData, operation = "add") => {
  try {
    const { productName, supplierName, quantityPerBoxStrip, lc, fob, cif } =
      productData;

    const validSupplier = supplierName?.trim() || "Unknown Supplier";
    const qty = Number(quantityPerBoxStrip || 0);

    let existing = await ReportInHand.findOne({ productName });

    if (existing) {
      const multiplier = operation === "add" ? 1 : -1;
      const newQty = Math.max(existing.quantity.boxes + qty * multiplier, 0);

      let newLc = existing.lc;
      let newFob = existing.fob;
      let newCif = existing.cif;

      if (operation === "add" && qty > 0) {
        const oldQty = existing.quantity.boxes;
        const total = oldQty + qty;

        if (total > 0) {
          newLc = (existing.lc * oldQty + lc * qty) / total;
          newFob = (existing.fob * oldQty + fob * qty) / total;
          newCif = (existing.cif * oldQty + cif * qty) / total;
        }
      }

      await ReportInHand.findByIdAndUpdate(existing._id, {
        $set: {
          "quantity.boxes": newQty,
          status: calculateStockStatus(newQty),
          supplierName: validSupplier,
          lc: newLc,
          fob: newFob,
          cif: newCif,
        },
      });
    } else if (operation === "add") {
      await ReportInHand.create({
        productName,
        supplierName: validSupplier,
        quantity: { boxes: qty },
        status: calculateStockStatus(qty),
        lc: lc || 0,
        fob: fob || 0,
        cif: cif || 0,
      });
    }
  } catch (err) {
    console.error("updateReportInHand ERROR:", err);
  }
};

router.get("/purchase-invoice", async (req, res) => {
  try {
    const invoices = await purchaseInventory
      .find()
      .sort({ invoiceDate: -1 })
      .select("invoiceNumber invoiceDate supplierName totalAmount");

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

router.get("/purchase", async (req, res) => {
  try {
    const purchases = await purchaseInventory.find().sort({ createdAt: -1 });

    // Fetch all products once
    const productList = await Product.find(
      {},
      "productName type packing qtyPerBoxStrip sellingPrice"
    );

    // Convert to Map for fast lookup
    const productMap = new Map();
    productList.forEach((p) => {
      productMap.set(p.productName, p);
    });

    // Enhance each purchase invoice
    const enhancedPurchases = purchases.map((invoice) => {
      const enhancedProducts = invoice.products.map((p) => {
        const productInfo = productMap.get(p.productName);

        return {
          ...p.toObject(),
          productType: productInfo?.type || "Unknown",
          productPacking: productInfo?.packing || "",
          productQtyPerBoxStrip: productInfo?.qtyPerBoxStrip || 0,
          sellingPrice: productInfo?.sellingPrice || 0,
        };
      });

      return {
        ...invoice.toObject(),
        products: enhancedProducts,
      };
    });

    res.json({
      success: true,
      count: enhancedPurchases.length,
      purchases: enhancedPurchases,
    });
  } catch (err) {
    console.error("Error fetching purchases:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.put("/purchase/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const oldInvoice = await purchaseInventory.findById(id);
    if (!oldInvoice) return res.status(404).json({ message: "Not found" });

    // Remove old stock
    for (const p of oldInvoice.products) {
      await updateReportInHand(
        { ...p, supplierName: oldInvoice.supplierName },
        "subtract"
      );
    }

    // Update invoice
    const updated = await purchaseInventory.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    // Add new stock
    for (const p of updated.products) {
      await updateReportInHand(
        { ...p, supplierName: updated.supplierName },
        "add"
      );
    }

    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/purchase/:id", async (req, res) => {
  try {
    const invoice = await purchaseInventory.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Not found" });

    for (const p of invoice.products) {
      await updateReportInHand(
        { ...p, supplierName: invoice.supplierName },
        "subtract"
      );
    }

    await purchaseInventory.findByIdAndDelete(invoice._id);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/purchase", async (req, res) => {
  try {
    const { ids } = req.body;

    const invoices = await purchaseInventory.find({ _id: { $in: ids } });

    for (const inv of invoices) {
      for (const p of inv.products) {
        await updateReportInHand(
          { ...p, supplierName: inv.supplierName },
          "subtract"
        );
      }
    }

    const result = await purchaseInventory.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `Deleted ${result.deletedCount} invoices`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* IMPORT EXCEL WITH DUPLICATE CHECK */
router.post("/purchase/import", async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows))
      return res.status(400).json({ message: "Invalid data" });

    const invoices = new Map();
    const skipped = [];

    for (const row of rows) {
      if (!row.invoiceNumber) continue;

      // 🔥 CHECK IF INVOICE ALREADY EXISTS
      const exists = await purchaseInventory.findOne({
        invoiceNumber: row.invoiceNumber,
      });

      if (exists) {
        skipped.push(row.invoiceNumber);
        continue;
      }

      const key = row.invoiceNumber;
      if (!invoices.has(key)) {
        invoices.set(key, {
          invoiceNumber: key,
          invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : null,
          deliveryNumber: row.deliveryNumber || "",
          receivedDate: row.receivedDate ? new Date(row.receivedDate) : null,
          supplierName: row.supplierName?.trim() || "Unknown Supplier",
          products: [],
          totalAmount: 0,
        });
      }

      const inv = invoices.get(key);

      const qty = Number(row.quantityPerBoxStrip || 0);
      const lc = Number(row.lc || 0);
      const fob = Number(row.fob || 0);
      const cif = Number(row.cif || 0);

      const amount = lc * qty;

      inv.products.push({
        productName: row.productName,
        expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
        quantityPerBoxStrip: qty,
        lc,
        fob,
        cif,
        amount,
      });

      inv.totalAmount += amount;
    }

    const finalInvoices = Array.from(invoices.values());

    await purchaseInventory.insertMany(finalInvoices);

    for (const inv of finalInvoices) {
      for (const p of inv.products) {
        await updateReportInHand(
          {
            productName: p.productName,
            quantityPerBoxStrip: p.quantityPerBoxStrip,
            supplierName: inv.supplierName,
            lc: p.lc,
            fob: p.fob,
            cif: p.cif,
          },
          "add"
        );
      }
    }

    res.json({
      message: `Imported ${finalInvoices.length} invoices`,
      importedCount: finalInvoices.length,
      skippedInvoices: skipped, // 🔥 return skipped duplicates
    });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


/* ADD NEW PURCHASE MANUALLY */
router.post("/purchase", async (req, res) => {
  try {
    const data = req.body;
    console.log('values of data', data);
    if (
      !data.invoiceNumber ||
      !data.supplierName ||
      !Array.isArray(data.products)
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existing = await purchaseInventory.findOne({
      invoiceNumber: data.invoiceNumber,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Invoice '${data.invoiceNumber}' already exists.`,
      });
    }

    let totalAmount = 0;

    const products = data.products.map((p) => {
      const qty = Number(p.qtyBox || 0);
      const lc = Number(p.lc || 0);
      const fob = Number(p.fob || 0);
      const cif = Number(p.cif || 0);
      const amount = lc * qty;

      totalAmount += amount;

      return {
        productName: p.productName,
        expiryDate: p.expiredDate ? new Date(p.expiredDate) : null,
        quantityPerBoxStrip: qty,
        lc,
        fob,
        cif,
        amount,
      };
    });

    const invoice = await purchaseInventory.create({
      ...data,
      supplierName: data.supplierName.trim(),
      products,
      totalAmount,
    });

    // Update stock
    for (const p of products) {
      await updateReportInHand(
        { ...p, supplierName: data.supplierName },
        "add"
      );
    }

    res.status(201).json({
      success: true,
      message: "Purchase added",
      purchase: invoice,
    });
  } catch (err) {
    console.error("Add error:", err);

    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This invoice number already exists.",
      });
    }

    res.status(500).json({ message: "Server error" });
  }
});

router.get("/reports-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });
    res.json({ success: true, count: reports.length, reports });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch reports" });
  }
});

export default router;
