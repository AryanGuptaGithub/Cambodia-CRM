import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import dayjs from "dayjs";

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
    console.log(rows);

    if (!Array.isArray(rows))
      return res.status(400).json({ message: "Invalid data" });

    const invoices = new Map();
    const skipped = [];

    for (const row of rows) {
      if (!row.invoiceNumber) continue;

      const invoiceNumber = row.invoiceNumber.trim(); // 🔥 trim spaces

      // Check if invoice already exists in DB
      const exists = await purchaseInventory.findOne({ invoiceNumber });

      if (exists) {
        skipped.push(invoiceNumber);
        continue;
      }

      if (!invoices.has(invoiceNumber)) {
        invoices.set(invoiceNumber, {
          invoiceNumber,
          invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : null,
          deliveryNumber: row.deliveryNumber?.trim() || "",
          receivedDate: row.receivedDate ? new Date(row.receivedDate) : null,
          supplierName: row.supplierName?.trim() || "Unknown Supplier",
          products: [],
          totalAmount: 0,
        });
      }

      const inv = invoices.get(invoiceNumber);

      const qty = Number(row.quantityPerBoxStrip || 0);
      const lc = Number(row.lc || 0);
      const fob = Number(row.fob || 0);
      const cif = Number(row.cif || 0);

      const amount = lc * qty;

      inv.products.push({
        productName: row.productName?.trim() || "Unknown Product",
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

    if (finalInvoices.length > 0) {
      await purchaseInventory.insertMany(finalInvoices);

      // Update report in-hand
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
    }

    res.json({
      message: `Imported ${finalInvoices.length} invoices`,
      importedCount: finalInvoices.length,
      skippedInvoices: skipped,
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
    console.log("values of data", data);
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

router.post("/purchases/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const purchases = await purchaseInventory
      .find({
        invoiceDate: { $gte: start, $lte: end },
      })
      .lean();

    if (purchases.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No purchases found for selected date range",
      });
    }

    // ------------------------------
    // Create Workbook
    // ------------------------------
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Purchases");

    // ------------------------------
    // Header Row
    // ------------------------------
    const header = [
      "Invoice Number",
      "Invoice Date",
      "Delivery No.",
      "Received Date",
      "Product Name",
      "Supplier Name",
      "Expiry Date",
      "Quantity Per Box/Strip",
      "FOB (USD)",
      "CIF (USD)",
      "LC (USD)",
      "Amount",
      "Remarks",
    ];

    const headerRow = worksheet.addRow(header);
    headerRow.font = { bold: true };

    // ------------------------------
    // Column Widths
    // ------------------------------
    worksheet.columns = [
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 22 },
      { width: 25 },
      { width: 15 },
      { width: 20 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 15 },
      { width: 20 },
    ];

    // ------------------------------
    // Add Data
    // ------------------------------
    purchases.forEach((purchase) => {
      purchase.products.forEach((p) => {
        worksheet.addRow([
          purchase.invoiceNumber,
          dayjs(purchase.invoiceDate).format("DD/MM/YYYY"),
          purchase.deliveryNumber,
          dayjs(purchase.receivedDate).format("DD/MM/YYYY"),
          p.productName,
          purchase.supplierName,
          dayjs(p.expiryDate).format("DD/MM/YYYY"),
          p.quantityPerBoxStrip,
          p.fob,
          p.cif,
          p.lc,
          p.amount ?? Number(p.quantityPerBoxStrip) * Number(p.lc || 0),
          purchase.remarks || "",
        ]);
      });
    });

    // ------------------------------
    // Add borders
    // ------------------------------
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
        };
      });
    });

    // ------------------------------
    // Download Excel File
    // ------------------------------
    const fileName = `purchase_summary_${dayjs(startDate).format(
      "DD-MM-YYYY"
    )}_to_${dayjs(endDate).format("DD-MM-YYYY")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating purchase Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate purchase excel file",
      error: error.message,
    });
  }
});

export default router;
