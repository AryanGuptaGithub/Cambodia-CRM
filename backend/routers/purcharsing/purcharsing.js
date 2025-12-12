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

const filterReportsWithBatches = (reports) => {
  return reports.filter(
    (report) => Array.isArray(report.batches) && report.batches.length > 0
  );
};

const updateReportInHand = async (productData, operation = "add") => {
  try {
    const {
      productName,
      supplierName,
      quantityPerBoxStrip,
      lc,
      fob,
      cif,
      expiryDate,
      type,
    } = productData;

    const qty = Number(quantityPerBoxStrip || 0);
    const validSupplier = supplierName?.trim() || "Unknown Supplier";

    let item = await ReportInHand.findOne({ productName });

    if (!item) {
      item = new ReportInHand({
        productName,
        supplierName: validSupplier,
        type: type || "Tablet",
        batches: [],
        totalBoxes: 0,
        totalAmount: 0,
      });
    }

    if (operation === "add") {
      const amount = qty * lc;

      item.batches.push({
        boxes: qty,
        lc,
        fob,
        cif,
        amount,
        expiryDate,
        date: new Date(),
      });
    }

    if (operation === "subtract") {
      let qtyToRemove = qty;

      for (const batch of item.batches) {
        if (qtyToRemove <= 0) break;

        if (batch.boxes > qtyToRemove) {
          batch.boxes -= qtyToRemove;
          batch.amount = batch.boxes * batch.lc;
          qtyToRemove = 0;
        } else {
          qtyToRemove -= batch.boxes;
          batch.boxes = 0;
          batch.amount = 0;
        }
      }

      item.batches = item.batches.filter((b) => b.boxes > 0);
    }

    item.totalBoxes = item.batches.reduce((sum, b) => sum + b.boxes, 0);
    item.totalAmount = item.batches.reduce((sum, b) => sum + b.amount, 0);

    if (item.totalBoxes <= 0) item.status = "Out of Stock";
    else if (item.totalBoxes < 10) item.status = "Critical";
    else if (item.totalBoxes < 25) item.status = "Low Stock";
    else item.status = "In Stock";

    await item.save();
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

    const productList = await Product.find(
      {},
      "productName type packing qtyPerBoxStrip sellingPrice"
    );

    const productMap = new Map();
    productList.forEach((p) => {
      productMap.set(p.productName, p);
    });

    const enhancedPurchases = purchases.map((invoice) => {
      const enhancedProducts = invoice.products.map((p) => {
        const productInfo = productMap.get(p.productName);

        return {
          ...p.toObject(),
          productType: p.type || productInfo?.type || "Tablet",
          productPacking: productInfo?.packing || "",
          productQtyPerBoxStrip: productInfo?.qtyPerBoxStrip || 0,
          sellingPrice: p.sellingPrice || productInfo?.sellingPrice || 0,
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

    const oldProducts = JSON.parse(JSON.stringify(oldInvoice.products));

    const updated = await purchaseInventory.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res
        .status(404)
        .json({ message: "Invoice not found after update" });
    }

    for (const oldProduct of oldProducts) {
      await updateReportInHand(
        {
          productName: oldProduct.productName,
          supplierName: oldInvoice.supplierName,
          quantityPerBoxStrip: oldProduct.quantityPerBoxStrip,
          lc: oldProduct.lc,
          fob: oldProduct.fob,
          cif: oldProduct.cif,
          expiryDate: oldProduct.expiryDate,
          type: oldProduct.type,
        },
        "subtract"
      );
    }

    for (const newProduct of updated.products) {
      await updateReportInHand(
        {
          productName: newProduct.productName,
          supplierName: updated.supplierName,
          quantityPerBoxStrip: newProduct.quantityPerBoxStrip,
          lc: newProduct.lc,
          fob: newProduct.fob,
          cif: newProduct.cif,
          expiryDate: newProduct.expiryDate,
          type: newProduct.type,
        },
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
        {
          ...p,
          supplierName: invoice.supplierName,
          type: p.type,
        },
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
          {
            ...p,
            supplierName: inv.supplierName,
            type: p.type,
          },
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

/* ADD SINGLE PURCHASE */
router.post("/purchase", async (req, res) => {
  try {
    const data = req.body;
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

    const productIds = data.products.map((p) => p.productId).filter((id) => id);
    const productsInfo = await Product.find(
      { _id: { $in: productIds } },
      "type"
    );
    const productTypeMap = new Map();
    productsInfo.forEach((p) => {
      productTypeMap.set(p._id.toString(), p.type);
    });

    const products = data.products.map((p) => {
      const qty = Number(p.quantityPerBoxStrip || 0);
      const lc = Number(p.lc || 0);
      const fob = Number(p.fob || 0);
      const cif = Number(p.cif || 0);
      const amount = qty * lc;

      totalAmount += amount;

      return {
        productName: p.productName,
        type: p.type || productTypeMap.get(p.productId) || "Tablet",
        expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
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

    for (const p of products) {
      await updateReportInHand(
        {
          productName: p.productName,
          supplierName: data.supplierName,
          quantityPerBoxStrip: p.quantityPerBoxStrip,
          lc: p.lc,
          fob: p.fob,
          cif: p.cif,
          expiryDate: p.expiryDate,
          type: p.type,
        },
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

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This invoice number already exists.",
      });
    }

    res.status(500).json({ message: "Server error" });
  }
});

/* IMPORT PURCHASES - CORRECTED VERSION */
/* IMPORT PURCHASES - FIXED VERSION */
/* IMPORT PURCHASES - FIXED VERSION */
router.post("/purchase/import", async (req, res) => {
  try {
    const rows = req.body; // This is array of product rows from Excel

    console.log("Received import request with", rows?.length, "rows");

    if (!Array.isArray(rows)) {
      return res.status(400).json({
        message: "Invalid data format. Expected array of purchase items.",
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ message: "No data to import" });
    }

    const skipped = [];
    const importedInvoices = [];

    // Group rows by invoice number and delivery number
    const invoiceMap = new Map();

    rows.forEach((row) => {
      const invoiceKey = `${row.invoiceNumber}-${row.deliveryNumber}`;
      if (!invoiceMap.has(invoiceKey)) {
        invoiceMap.set(invoiceKey, {
          invoiceNumber: row.invoiceNumber || "",
          invoiceDate: row.invoiceDate || new Date(),
          deliveryNumber: row.deliveryNumber || row.invoiceNumber || "",
          receivedDate: row.receivedDate || new Date(),
          supplierName: row.supplierName || "",
          remarks: row.remarks || "",
          products: [],
        });
      }

      const invoice = invoiceMap.get(invoiceKey);

      // Parse numeric values safely
      const quantityPerBoxStrip = parseFloat(row.quantityPerBoxStrip) || 0;
      const lc = parseFloat(row.lc) || parseFloat(row.lcNumber) || 0;
      const fob = parseFloat(row.fob) || 0;
      const cif = parseFloat(row.cif) || 0;
      const amount = quantityPerBoxStrip * lc;

      invoice.products.push({
        productName: row.productName || "",
        type: row.type || "Tablet", // Assuming type is passed or default
        expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
        quantityPerBoxStrip: quantityPerBoxStrip,
        lc: lc,
        fob: fob,
        cif: cif,
        amount: amount,
      });
    });

    // Get product info for auto-filling missing values
    const allProducts = await Product.find({});
    const productMap = new Map();
    allProducts.forEach((product) => {
      if (
        product.productName &&
        product.batches &&
        product.batches.length > 0
      ) {
        productMap.set(product.productName.toLowerCase(), {
          type: product.type || "Tablet",
        });
      }
    });

    // Process each invoice
    for (const [key, invoiceData] of invoiceMap) {
      try {
        console.log("Processing invoice:", invoiceData.invoiceNumber);

        // Validate required fields
        if (!invoiceData.invoiceNumber || !invoiceData.supplierName) {
          console.log("Skipping invoice - missing invoice number or supplier");
          skipped.push(invoiceData.invoiceNumber || "Unknown");
          continue;
        }

        if (!invoiceData.products || invoiceData.products.length === 0) {
          console.log("Skipping invoice - no products");
          skipped.push(invoiceData.invoiceNumber);
          continue;
        }

        // Check for duplicate
        const existing = await purchaseInventory.findOne({
          invoiceNumber: invoiceData.invoiceNumber,
          deliveryNumber: invoiceData.deliveryNumber,
        });

        if (existing) {
          console.log("Skipping duplicate invoice:", invoiceData.invoiceNumber);
          skipped.push(invoiceData.invoiceNumber);
          continue;
        }

        // Calculate total amount and process products
        let totalAmount = 0;
        const processedProducts = [];

        for (const product of invoiceData.products) {
          if (!product.productName) {
            console.log("Skipping product - no product name");
            continue;
          }

          // Look up product type if not provided
          const productKey = product.productName.toLowerCase().trim();
          const productInfo = productMap.get(productKey) || { type: "Tablet" };

          processedProducts.push({
            productName: product.productName.trim(),
            type: product.type || productInfo.type,
            expiryDate: product.expiryDate,
            quantityPerBoxStrip: product.quantityPerBoxStrip,
            lc: product.lc,
            fob: product.fob,
            cif: product.cif,
            amount: product.amount,
          });

          totalAmount += product.amount;
        }

        if (processedProducts.length === 0) {
          console.log("Skipping invoice - no valid products");
          skipped.push(invoiceData.invoiceNumber);
          continue;
        }

        // Create invoice
        const invoice = await purchaseInventory.create({
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: invoiceData.invoiceDate,
          deliveryNumber: invoiceData.deliveryNumber,
          receivedDate: invoiceData.receivedDate,
          supplierName: invoiceData.supplierName.trim(),
          remarks: invoiceData.remarks,
          products: processedProducts,
          totalAmount: totalAmount,
        });

        console.log("Created invoice:", invoice.invoiceNumber);

        // Update inventory for each product
        for (const product of processedProducts) {
          await updateReportInHand(
            {
              productName: product.productName,
              supplierName: invoiceData.supplierName.trim(),
              quantityPerBoxStrip: product.quantityPerBoxStrip,
              lc: product.lc,
              fob: product.fob,
              cif: product.cif,
              expiryDate: product.expiryDate,
              type: product.type,
            },
            "add"
          );
        }

        importedInvoices.push(invoice);
      } catch (err) {
        console.error(
          `Error processing invoice ${invoiceData.invoiceNumber}:`,
          err
        );
        skipped.push(invoiceData.invoiceNumber || "Unknown");
      }
    }

    console.log(
      `Import completed: ${importedInvoices.length} imported, ${skipped.length} skipped`
    );

    res.json({
      message: `Imported ${importedInvoices.length} invoices successfully`,
      importedCount: importedInvoices.length,
      skippedInvoices: skipped,
      details: {
        imported: importedInvoices.map((inv) => inv.invoiceNumber),
        skipped: skipped,
      },
    });
  } catch (err) {
    console.error("Import error:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        message:
          "Duplicate invoice number and delivery number combination found",
        error: err.message,
      });
    }

    res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
});

router.get("/reports-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });

    const filteredReports = filterReportsWithBatches(reports);
    res.status(200).json({
      success: true,
      count: filteredReports.length,
      reports: filteredReports,
    });
  } catch (error) {
    console.error("Error fetching reports in hand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Purchases");

    const header = [
      "Invoice Number",
      "Invoice Date",
      "Delivery No.",
      "Received Date",
      "Product Name",
      "Product Type",
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

    worksheet.columns = [
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 22 },
      { width: 15 },
      { width: 25 },
      { width: 15 },
      { width: 20 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 15 },
      { width: 20 },
    ];

    purchases.forEach((purchase) => {
      purchase.products.forEach((p) => {
        worksheet.addRow([
          purchase.invoiceNumber,
          dayjs(purchase.invoiceDate).format("DD/MM/YYYY"),
          purchase.deliveryNumber,
          dayjs(purchase.receivedDate).format("DD/MM/YYYY"),
          p.productName,
          p.type || "Tablet",
          purchase.supplierName,
          p.expiryDate ? dayjs(p.expiryDate).format("DD/MM/YYYY") : "",
          p.quantityPerBoxStrip,
          p.fob,
          p.cif,
          p.lc,
          p.amount ?? Number(p.quantityPerBoxStrip) * Number(p.lc || 0),
          purchase.remarks || "",
        ]);
      });
    });

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
