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

// Get latest batch values from product
const getProductBatchValues = async (productName) => {
  try {
    const product = await Product.findOne({ 
      productName: { $regex: new RegExp(`^${productName}$`, 'i') }
    }).lean();

    if (!product || !product.batches || product.batches.length === 0) {
      return { lc: 0, fob: 0, cif: 0, type: "Tablet" };
    }

    // Sort batches by date (newest first)
    const sortedBatches = [...product.batches].sort((a, b) => 
      new Date(b.date || 0) - new Date(a.date || 0)
    );

    const latestBatch = sortedBatches[0];
    
    return {
      lc: latestBatch.lc || 0,
      fob: latestBatch.fob || 0,
      cif: latestBatch.cif || 0,
      type: product.type || "Tablet"
    };
  } catch (error) {
    console.error("Error fetching product batch values:", error);
    return { lc: 0, fob: 0, cif: 0, type: "Tablet" };
  }
};

/* IMPORT PURCHASES - ENHANCED VERSION */
router.post("/purchase/import", async (req, res) => {
  try {
    const rows = req.body;

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
    // If invoice number is missing, group by supplier and date
    const invoiceMap = new Map();

    rows.forEach((row, index) => {
      try {
        // Generate a unique key for grouping
        let invoiceKey;
        
        if (row.invoiceNumber && row.deliveryNumber) {
          invoiceKey = `${row.invoiceNumber}-${row.deliveryNumber}`;
        } else if (row.invoiceNumber) {
          invoiceKey = `${row.invoiceNumber}-${row.supplierName || 'Unknown'}`;
        } else if (row.deliveryNumber) {
          invoiceKey = `${row.deliveryNumber}-${row.supplierName || 'Unknown'}`;
        } else {
          // Group by supplier and product if no invoice/delivery number
          invoiceKey = `NO-INVOICE-${row.supplierName || 'Unknown'}-${index}`;
        }

        if (!invoiceMap.has(invoiceKey)) {
          invoiceMap.set(invoiceKey, {
            invoiceNumber: row.invoiceNumber || `INV-${dayjs().format('YYYYMMDD')}-${index}`,
            invoiceDate: row.invoiceDate || new Date(),
            deliveryNumber: row.deliveryNumber || row.invoiceNumber || `DEL-${dayjs().format('YYYYMMDD')}-${index}`,
            receivedDate: row.receivedDate || new Date(),
            supplierName: row.supplierName || "Unknown Supplier",
            remarks: row.remarks || "",
            products: [],
          });
        }

        const invoice = invoiceMap.get(invoiceKey);

        // Parse numeric values safely
        const quantityPerBoxStrip = parseFloat(row.quantityPerBoxStrip) || 0;
        let lc = parseFloat(row.lc) || parseFloat(row.lcNumber) || 0;
        let fob = parseFloat(row.fob) || 0;
        let cif = parseFloat(row.cif) || 0;
        
        // Amount calculation
        const amount = row.amount || (quantityPerBoxStrip * lc);

        invoice.products.push({
          productName: row.productName || "",
          type: row.type || "Tablet",
          expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
          quantityPerBoxStrip: quantityPerBoxStrip,
          lc: lc,
          fob: fob,
          cif: cif,
          amount: amount,
        });
      } catch (error) {
        console.error(`Error processing row ${index}:`, error);
        skipped.push(`Row ${index + 1}: ${error.message}`);
      }
    });

    console.log(`Grouped into ${invoiceMap.size} invoices`);

    // Process each invoice
    for (const [key, invoiceData] of invoiceMap) {
      try {
        console.log("Processing invoice:", invoiceData.invoiceNumber);

        // Validate required fields
        if (!invoiceData.supplierName || invoiceData.supplierName === "Unknown Supplier") {
          console.log("Skipping invoice - missing supplier");
          skipped.push(invoiceData.invoiceNumber || "Unknown");
          continue;
        }

        if (!invoiceData.products || invoiceData.products.length === 0) {
          console.log("Skipping invoice - no products");
          skipped.push(invoiceData.invoiceNumber);
          continue;
        }

        // Check for duplicate (only if we have invoice number)
        if (invoiceData.invoiceNumber && !invoiceData.invoiceNumber.startsWith("INV-")) {
          const existing = await purchaseInventory.findOne({
            $or: [
              { invoiceNumber: invoiceData.invoiceNumber },
              { deliveryNumber: invoiceData.deliveryNumber }
            ]
          });

          if (existing) {
            console.log("Skipping duplicate invoice:", invoiceData.invoiceNumber);
            skipped.push(invoiceData.invoiceNumber);
            continue;
          }
        }

        // Calculate total amount and enhance products with batch data
        let totalAmount = 0;
        const processedProducts = [];

        for (const product of invoiceData.products) {
          if (!product.productName) {
            console.log("Skipping product - no product name");
            continue;
          }

          // Get batch values from product if missing
          if (product.lc === 0 || product.fob === 0 || product.cif === 0) {
            const batchValues = await getProductBatchValues(product.productName);
            
            // Only replace if current value is 0 and batch has value
            if (product.lc === 0 && batchValues.lc > 0) {
              product.lc = batchValues.lc;
            }
            if (product.fob === 0 && batchValues.fob > 0) {
              product.fob = batchValues.fob;
            }
            if (product.cif === 0 && batchValues.cif > 0) {
              product.cif = batchValues.cif;
            }
            
            // Update type from product if not set
            if ((!product.type || product.type === "Tablet") && batchValues.type) {
              product.type = batchValues.type;
            }
            
            // Recalculate amount with updated LC
            product.amount = product.quantityPerBoxStrip * product.lc;
          }

          processedProducts.push({
            productName: product.productName.trim(),
            type: product.type,
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
        console.error(`Error processing invoice ${invoiceData.invoiceNumber}:`, err);
        skipped.push(invoiceData.invoiceNumber || "Unknown");
      }
    }

    console.log(
      `Import completed: ${importedInvoices.length} imported, ${skipped.length} skipped`
    );

    res.json({
      message: `Imported ${importedInvoices.length} invoices successfully`,
      importedCount: importedInvoices.length,
      skippedCount: skipped.length,
      skippedInvoices: skipped,
      details: {
        imported: importedInvoices.map((inv) => inv.invoiceNumber),
        skipped: skipped.slice(0, 10), // Limit skipped items in response
      },
    });
  } catch (err) {
    console.error("Import error:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        message: "Duplicate invoice number found",
        error: err.message,
      });
    }

    res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
});

// ... rest of your existing routes remain the same
// GET /purchase, PUT /purchase/:id, DELETE /purchase, etc.

export default router;