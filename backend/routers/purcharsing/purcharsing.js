import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import dayjs from "dayjs";

const router = express.Router();

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";

  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // Multiple spaces → single
    .replace(/[-_\/\\]/g, " ") // Dashes, slashes → space
    .replace(/alu\s*alu/gi, "alu alu") // Standardize ALU ALU variations
    .replace(/[^a-z0-9\s.]/g, "") // Remove special chars but keep dots for decimals
    .replace(/(\d+)\.(\d+)/g, "$1.$2") // Preserve decimal numbers
    .trim();
};

const productNameFixMap = {
  "n-lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene+wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene +wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene+ wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",

  "n flaxseed oil": "N-FLAXSEED OIL",
  "flaxseed oil": "N-FLAXSEED OIL",

  "n evening primrose oil": "N-EVENING PRIMROSE OIL",
  "evening primrose oil": "N-EVENING PRIMROSE OIL",

  "n multiz": "N-MULTIZ",
  multiz: "N-MULTIZ",

  "n garlic oil": "N-GARLIC OIL",
  "garlic oil": "N-GARLIC OIL",

  "n fenugreek oil": "N-FENUGREEK OIL",
  "fenugreek oil": "N-FENUGREEK OIL",

  "n nigella oil": "N-NIGELLA OIL",
  "nigella oil": "N-NIGELLA OIL",

  "n krill oil": "N-KRILL OIL",
  "krill oil": "N-KRILL OIL",

  "n sea buckthorn & oil lutein extract":
    "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",

  "ecomol 500": "ECOMOL 500",
  ecomol500: "ECOMOL 500",
  "ecomol-500": "ECOMOL 500",
  ecomol: "ECOMOL 500",

  // 🔥 NEW: ALU ALU ECOCID 20 variations
  "alu alu ecocid 20": "ALU ALU ECOCID 20",
  "alualu ecocid 20": "ALU ALU ECOCID 20",
  "alu alu ecocid20": "ALU ALU ECOCID 20",
  "ecocid 20 alu alu": "ALU ALU ECOCID 20",
  "ecocid alu alu 20": "ALU ALU ECOCID 20",
  "ecocid 20": "ALU ALU ECOCID 20",
  "alu alu ecocid": "ALU ALU ECOCID 20",

  // 🔥 FIX: Add product name fixes for products with decimals
  "sirmox cl 228.5 syp": "SIRMOX CL 228.5 SYP",
  "sirmox cl 2285 syp": "SIRMOX CL 228.5 SYP", // Handle missing decimal
  "sirmox cl 228.5": "SIRMOX CL 228.5",
  "sirmox cl 2285": "SIRMOX CL 228.5", // Handle missing decimal

  "sirmox cl 625": "SIRMOX CL 625",
  "sirmox cl 1000": "SIRMOX CL 1000",
  "sirmox 500": "SIRMOX 500",
  "sirmox 500 cap": "SIRMOX 500",
  "sirmox 250 syp": "SIRMOX 250 SYP",
  "sirmox 250 cap": "SIRMOX 250 CAP",
  "sirmox 250": "SIRMOX 250",

  "ecocid 20": "ECOCID 20",
  "ecoflam 400": "ECOFLAX 400",
  "ecofloxacin 200": "ECOFLOXCIN 200",
  "ecolevo 500": "ECOLEVO 500",
  "ecopred 5": "ECOPRED 5",
  "ecothrocin 500": "ECOTHROCIN 500",
  "ecothrocin 250": "ECOTHROCIN 250",
  "ecovastin 10": "ECOVASTIN 10",
  "ecovastin 20": "ECOVASTIN 20",
  "ecozin 5": "ECOZIN 5",
  "ecozin m": "ECOZIN M",
  "ecozole 400": "ECOZOLE 400",
  "esoprazole 20": "ESOPRAZOLE 20",
  "esoprazole 40": "ESOPRAZOLE 40",
  "kamzole 200": "KAMZOLE 200",
  "suprafen 500": "SUPRAFEN 500",
  "ecoflaz 6": "ECOFLAZ 6",
};

const getStrictNormalizedProductName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
};

const findProductInReportInHand = async (productName) => {
  try {
    const normalizedInput = normalizeProductName(productName);
    const fixedName = productNameFixMap[normalizedInput] || normalizedInput;
    // 1. Try exact match on fixed name (case-insensitive)
    let item = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${fixedName}$`, "i") },
    }).lean();

    if (item) {
      return item;
    }

    // 2. Try contains match on fixed name
    item = await ReportInHand.findOne({
      productName: { $regex: fixedName, $options: "i" },
    }).lean();

    if (item) {
      return item;
    }

    // 3. Try to match by removing spaces and special chars
    const strictNormalizedInput = getStrictNormalizedProductName(productName);
    const allItems = await ReportInHand.find({}).lean();
    for (const doc of allItems) {
      const strictNormalizedDoc = getStrictNormalizedProductName(
        doc.productName
      );

      if (strictNormalizedDoc === strictNormalizedInput) {
        return doc;
      }

      // Check if either contains the other
      if (
        strictNormalizedDoc.includes(strictNormalizedInput) ||
        strictNormalizedInput.includes(strictNormalizedDoc)
      ) {
        return doc;
      }
    }

    // 4. Special ALU ALU + ECOCID fallback
    if (
      normalizedInput.includes("alu alu") &&
      normalizedInput.includes("ecocid")
    ) {
      const aluItem = await ReportInHand.findOne({
        productName: {
          $regex: "alu alu.*ecocid|ecocid.*alu alu",
          $options: "i",
        },
      }).lean();

      if (aluItem) {
        return aluItem;
      }
    }

    return null;
  } catch (error) {
    console.error(
      `Error finding "${productName}" in ReportInHand:`,
      error.message
    );
    return null;
  }
};

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

    if (!productName || productName.trim() === "") {
      console.warn("Skipping updateReportInHand: productName missing");
      return;
    }

    const qty = Number(quantityPerBoxStrip || 0);
    const validSupplier = supplierName?.trim() || "Unknown Supplier";

    // Normalize and fix product name
    const normalized = normalizeProductName(productName);
    const fixedProductName =
      productNameFixMap[normalized] || productName.trim().toUpperCase();
    if (operation === "add") {
      const amount = qty * (lc || 0);
      const newBatch = {
        boxes: qty,
        lc: lc || 0,
        fob: fob || 0,
        cif: cif || 0,
        amount,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        date: new Date(),
      };

      // Try to find existing document
      const existingDoc = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${fixedProductName}$`, "i") },
      }).lean();

      if (existingDoc) {
        const updatedBatches = [...(existingDoc.batches || []), newBatch];
        const totalBoxes = updatedBatches.reduce(
          (sum, b) => sum + (b.boxes || 0),
          0
        );
        const totalAmount = updatedBatches.reduce(
          (sum, b) => sum + (b.amount || 0),
          0
        );

        // Calculate weighted average price
        const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

        await ReportInHand.updateOne(
          { _id: existingDoc._id },
          {
            $set: {
              batches: updatedBatches,
              totalBoxes,
              totalAmount,
              averagePrice,
              status: calculateStockStatus(totalBoxes),
            },
          }
        );
      } else {
        // Create new document
        const averagePrice = qty > 0 ? amount / qty : 0;
        await ReportInHand.create({
          productName: fixedProductName,
          supplierName: validSupplier,
          type: type || "",
          batches: [newBatch],
          totalBoxes: qty,
          totalAmount: amount,
          averagePrice,
          status: calculateStockStatus(qty),
        });
      }
    } else if (operation === "subtract") {
      // For subtraction (purchase return or deletion)
      const item = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${fixedProductName}$`, "i") },
      }).lean();

      if (!item) {
        console.warn(
          `Cannot subtract: "${fixedProductName}" not found in ReportInHand`
        );
        return;
      }

      if (!item.batches || item.batches.length === 0) {
        console.warn(`No batches to subtract from for "${fixedProductName}"`);
        return;
      }

      const sortedBatches = [...item.batches].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );
      let remaining = qty;
      const updatedBatches = [];

      for (const batch of sortedBatches) {
        if (remaining <= 0) {
          updatedBatches.push(batch);
          continue;
        }

        if (batch.boxes > remaining) {
          // Partial deduction
          const newBoxes = batch.boxes - remaining;
          const newAmount = newBoxes * (batch.lc || 0);
          updatedBatches.push({
            ...batch,
            boxes: newBoxes,
            amount: newAmount,
          });
          remaining = 0;
        } else {
          // Full deduction
          remaining -= batch.boxes;
          // Don't push this batch (it's fully consumed)
        }
      }

      // Filter out batches with 0 boxes
      const finalBatches = updatedBatches.filter((b) => b.boxes > 0);

      // Calculate new totals
      const totalBoxes = finalBatches.reduce(
        (sum, b) => sum + (b.boxes || 0),
        0
      );
      const totalAmount = finalBatches.reduce(
        (sum, b) => sum + (b.amount || 0),
        0
      );

      // Calculate new weighted average price
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;
      const status = calculateStockStatus(totalBoxes);

      if (totalBoxes <= 0) {
        // Delete if empty
        await ReportInHand.findByIdAndDelete(item._id);
      } else {
        await ReportInHand.updateOne(
          { _id: item._id },
          {
            $set: {
              batches: finalBatches,
              totalBoxes,
              totalAmount,
              averagePrice,
              status,
            },
          }
        );
      }
    }
  } catch (err) {
    console.error("updateReportInHand ERROR:", err.message || err);
  }
};

router.get("/purchase-invoice", async (req, res) => {
  try {
    const invoices = await purchaseInventory
      .find()
      .sort({ invoiceDate: -1 })
      .select("invoiceNumber invoiceDate supplierName totalAmount")
      .lean();

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

router.get("/purchase", async (req, res) => {
  try {
    const purchases = await purchaseInventory
      .find()
      .sort({ createdAt: -1 })
      .lean();

    const productList = await Product.find(
      {},
      "productName type packing qtyPerBoxStrip sellingPrice batches"
    ).lean();

    // 🔹 Build product map with normalized names
    const productMap = new Map();
    productList.forEach((prod) => {
      if (prod.productName) {
        // Normalize product name for matching
        const normalizedKey = normalizeProductName(prod.productName);
        productMap.set(normalizedKey, prod);
      }
    });

    const enhancedPurchases = purchases.map((invoice) => {
      const enhancedProducts = invoice.products.map((p) => {
        // Normalize the purchase product name
        const normalizedProductName = normalizeProductName(p.productName);

        // Find matching product in database
        const productInfo = productMap.get(normalizedProductName);

        // Try to find product with exact match first, then try partial match
        let matchedProduct = productInfo;
        if (!matchedProduct) {
          // Try to find by partial match
          for (const [key, prod] of productMap.entries()) {
            if (
              normalizedProductName.includes(key) ||
              key.includes(normalizedProductName)
            ) {
              matchedProduct = prod;
              break;
            }
          }
        }

        return {
          ...p,
          // Get type from matched product database, fallback to purchase product type or empty
          productType: matchedProduct?.type || p?.type || "",
          productPacking: matchedProduct?.packing || "",
          productQtyPerBoxStrip: matchedProduct?.qtyPerBoxStrip || 0,
          sellingPrice: p.sellingPrice || matchedProduct?.sellingPrice || 0,
          fob: p.fob || matchedProduct?.batches?.[0]?.fob || 0,
          cif: p.cif || matchedProduct?.batches?.[0]?.cif || 0,
          lc: p.lc || matchedProduct?.batches?.[0]?.lc || 0,
        };
      });

      return {
        ...invoice,
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

    const oldInvoice = await purchaseInventory.findById(id).lean();
    if (!oldInvoice) return res.status(404).json({ message: "Not found" });

    const oldProducts = oldInvoice.products || [];
    for (const oldProduct of oldProducts) {
      await updateReportInHand(
        {
          productName: oldProduct.productName || "",
          supplierName: oldInvoice.supplierName || "Unknown Supplier",
          quantityPerBoxStrip: oldProduct.quantityPerBoxStrip || 0,
          lc: oldProduct.lc || 0,
          fob: oldProduct.fob || 0,
          cif: oldProduct.cif || 0,
          expiryDate: oldProduct.expiryDate,
          type: oldProduct.type || "",
        },
        "subtract"
      );
    }

    // Prepare new products data
    const newProducts = req.body.products || [];
    let totalAmount = 0;
    const productIds = newProducts.map((p) => p.productId).filter((id) => id);
    const productsInfo = await Product.find(
      { _id: { $in: productIds } },
      "productName type batches"
    ).lean();

    const productTypeMap = new Map();
    const productBatchMap = new Map();
    const productNameMap = new Map();

    productsInfo.forEach((p) => {
      if (p._id) {
        productTypeMap.set(p._id.toString(), p.type || "");
        if (p.batches && p.batches.length > 0) {
          productBatchMap.set(p._id.toString(), p.batches[0]);
        }
        productNameMap.set(p._id.toString(), p.productName);
      }
    });

    const processedProducts = newProducts.map((p) => {
      const qty = Number(p.quantityPerBoxStrip || 0);
      const productBatch = productBatchMap.get(p.productId);

      const lc = Number(p.lc) || productBatch?.lc || 0;
      const fob = Number(p.fob) || productBatch?.fob || 0;
      const cif = Number(p.cif) || productBatch?.cif || 0;
      const amount = qty * lc;

      totalAmount += amount;

      let productNameToUse = p.productName;
      if (p.productId && productNameMap.has(p.productId.toString())) {
        productNameToUse = productNameMap.get(p.productId.toString());
      } else {
        const normalized = normalizeProductName(p.productName);
        productNameToUse =
          productNameFixMap[normalized] || p.productName.toUpperCase();
      }

      return {
        productName: productNameToUse,
        type: p.type || productTypeMap.get(p.productId) || "",
        expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
        quantityPerBoxStrip: qty,
        lc,
        fob,
        cif,
        amount,
      };
    });

    // Now update the purchase inventory
    const updated = await purchaseInventory.findByIdAndUpdate(
      id,
      {
        ...req.body,
        products: processedProducts,
        totalAmount,
      },
      {
        new: true,
        runValidators: true,
        lean: true,
      }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ message: "Invoice not found after update" });
    }

    for (const newProduct of processedProducts) {  
      await updateReportInHand(
        {
          productName: newProduct.productName || "",
          supplierName: updated.supplierName || "Unknown Supplier",
          quantityPerBoxStrip: newProduct.quantityPerBoxStrip || 0,
          lc: newProduct.lc || 0,
          fob: newProduct.fob || 0,
          cif: newProduct.cif || 0,
          expiryDate: newProduct.expiryDate,
          type: newProduct.type || "",
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
    const invoice = await purchaseInventory.findById(req.params.id).lean();
    if (!invoice) return res.status(404).json({ error: "Not found" });
    for (const p of invoice.products) {
      await updateReportInHand(
        {
          productName: p.productName || "",
          supplierName: invoice.supplierName || "Unknown Supplier",
          quantityPerBoxStrip: p.quantityPerBoxStrip || 0,
          lc: p.lc || 0,
          fob: p.fob || 0,
          cif: p.cif || 0,
          expiryDate: p.expiryDate,
          type: p.type || "",
        },
        "subtract"
      );
    }

    await purchaseInventory.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete purchase error:", err);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

router.delete("/purchase", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: "No purchase IDs provided for deletion",
      });
    }

    const invoices = await purchaseInventory.find({ _id: { $in: ids } }).lean();

    if (invoices.length === 0) {
      return res.status(404).json({
        error: "No purchases found with the provided IDs",
      });
    }

    for (const inv of invoices) {
      for (const p of inv.products) {
        try {
          await updateReportInHand(
            {
              productName: p.productName || "",
              supplierName: inv.supplierName || "Unknown Supplier",
              quantityPerBoxStrip: p.quantityPerBoxStrip || 0,
              lc: p.lc || 0,
              fob: p.fob || 0,
              cif: p.cif || 0,
              expiryDate: p.expiryDate,
              type: p.type || "",
            },
            "subtract"
          );
        } catch (productError) {
          console.error(
            `Error processing product ${p.productName}:`,
            productError
          );
        }
      }
    }

    const result = await purchaseInventory.deleteMany({ _id: { $in: ids } });
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} invoices successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("Delete multiple purchases error:", err);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

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
      "productName type batches"
    ).lean();

    const productTypeMap = new Map();
    const productBatchMap = new Map();
    const productNameMap = new Map();

    productsInfo.forEach((p) => {
      if (p._id) {
        productTypeMap.set(p._id.toString(), p.type || "");
        if (p.batches && p.batches.length > 0) {
          productBatchMap.set(p._id.toString(), p.batches[0]);
        }
        productNameMap.set(p._id.toString(), p.productName);
      }
    });

    const products = data.products.map((p) => {
      const qty = Number(p.quantityPerBoxStrip || 0);
      const productBatch = productBatchMap.get(p.productId);

      const lc = Number(p.lc) || productBatch?.lc || 0;
      const fob = Number(p.fob) || productBatch?.fob || 0;
      const cif = Number(p.cif) || productBatch?.cif || 0;
      const amount = qty * lc;

      totalAmount += amount;

      let productNameToUse = p.productName;
      if (p.productId && productNameMap.has(p.productId.toString())) {
        productNameToUse = productNameMap.get(p.productId.toString());
      } else {
        const normalized = normalizeProductName(p.productName);
        productNameToUse =
          productNameFixMap[normalized] || p.productName.toUpperCase();
      }

      return {
        productName: productNameToUse,
        type: p.type || productTypeMap.get(p.productId) || "",
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

router.post("/purchase/import", async (req, res) => {
  try {
    const rows = req.body;

    if (!Array.isArray(rows)) {
      return res.status(400).json({
        message: "Invalid data format. Expected array of invoices.",
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ message: "No data to import" });
    }

    const allProducts = await Product.find(
      {},
      "productName type batches"
    ).lean();
    const productMap = new Map();

    allProducts.forEach((product) => {
      if (product.productName) {
        const normalized = normalizeProductName(product.productName);
        const fixedName = productNameFixMap[normalized] || normalized;
        // Use the fixed name in lowercase as the key, and store the product document
        productMap.set(fixedName.toLowerCase(), product);
      }
    });

    const skipped = [];
    const importedInvoices = [];

    // Get the last invoice number from database to start incrementing from there
    const lastInvoice = await purchaseInventory
      .findOne({}, { invoiceNumber: 1 })
      .sort({ createdAt: -1 })
      .lean();

    let invoiceCounter = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/INC(\d+)/);
      if (match) {
        invoiceCounter = parseInt(match[1]) + 1;
      }
    }

    // Process each invoice (already grouped by frontend)
    for (const invoiceData of rows) {
      try {
        if (!invoiceData.products || invoiceData.products.length === 0) {
          skipped.push(invoiceData.invoiceNumber || "Unknown");
          continue;
        }
        // Generate or validate invoice number
        let invoiceNumber = invoiceData.invoiceNumber;

        // Check if this invoice number already exists in database
        if (invoiceNumber) {
          const existingInvoice = await purchaseInventory.findOne({
            invoiceNumber: invoiceNumber,
          });

          if (existingInvoice) {
            invoiceNumber = `INC${String(invoiceCounter).padStart(5, "0")}`;
            invoiceCounter++;
          }
        } else {
          invoiceNumber = `INC${String(invoiceCounter).padStart(5, "0")}`;
          invoiceCounter++;
        }

        // Also check if we already processed this invoice number in this import batch
        const alreadyProcessedInThisBatch = importedInvoices.some(
          (inv) => inv.invoiceNumber === invoiceNumber
        );

        if (alreadyProcessedInThisBatch) {
          // If duplicate in same batch, generate new one
          invoiceNumber = `INC${String(invoiceCounter).padStart(5, "0")}`;
          invoiceCounter++;
        }

        const deliveryNumber = invoiceData.deliveryNumber || invoiceNumber;

        // Process each product in the invoice with enhanced matching
        const processedProducts = invoiceData.products.map((product, idx) => {
          const quantityPerBoxStrip =
            parseFloat(product.quantityPerBoxStrip) || 0;
          let lc = parseFloat(product.lc) || parseFloat(product.lcNumber) || 0;
          let fob = parseFloat(product.fob) || 0;
          let cif = parseFloat(product.cif) || 0;

          const normalizedInput = normalizeProductName(product.productName);
          const fixedInputName =
            productNameFixMap[normalizedInput] || normalizedInput;
          const productInfo = productMap.get(fixedInputName.toLowerCase());

          let productNameToUse = product.productName;
          if (productInfo) {
            productNameToUse = productInfo.productName;
            if (fob === 0) {
              fob = productInfo.batches?.[0]?.fob || 0;
            }
            if (cif === 0) {
              cif = productInfo.batches?.[0]?.cif || 0;
            }
            if (lc === 0) {
              lc = productInfo.batches?.[0]?.lc || 0;
            }
          } else {
            // Use the fixed input name if not found in database
            productNameToUse = fixedInputName.toUpperCase();
          }

          const amount = quantityPerBoxStrip * lc;
          return {
            productName: productNameToUse,
            type: product.type || productInfo?.type || "",
            expiryDate: product.expiryDate
              ? new Date(product.expiryDate)
              : null,
            quantityPerBoxStrip,
            lc,
            fob,
            cif,
            amount,
          };
        });

        // Calculate total amount
        const totalAmount = processedProducts.reduce(
          (sum, product) => sum + (product.amount || 0),
          0
        );
        // Create invoice
        const invoice = await purchaseInventory.create({
          invoiceNumber: invoiceNumber,
          invoiceDate: invoiceData.invoiceDate,
          deliveryNumber: deliveryNumber,
          receivedDate: invoiceData.receivedDate,
          supplierName: invoiceData.supplierName,
          remarks: invoiceData.remarks,
          products: processedProducts,
          totalAmount: totalAmount,
        });

        // Update inventory for each product
        for (const product of processedProducts) {
          await updateReportInHand(
            {
              productName: product.productName,
              supplierName: invoiceData.supplierName,
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
          `❌ Error processing invoice ${invoiceData.invoiceNumber}:`,
          err.message
        );
        skipped.push(invoiceData.invoiceNumber || "Unknown");
      }
    }

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

// Get reports in hand
router.get("/reports-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 }).lean();
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

router.post("/reports-in-hand/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    // Build query
    let query = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // We need to filter batches by date, so we'll fetch all and filter in memory
      // or use aggregation to filter batches
      query = {};
    }

    // Fetch reports with batches
    const reports = await ReportInHand.find(query).lean();

    // Filter out reports with no batches
    const filteredReports = reports.filter(
      (report) => Array.isArray(report.batches) && report.batches.length > 0
    );

    // If date range is provided, filter batches within that range
    let finalData = [];
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // End of day

      filteredReports.forEach((report) => {
        const filteredBatches = report.batches.filter((batch) => {
          const batchDate = new Date(batch.date);
          return batchDate >= start && batchDate <= end;
        });

        if (filteredBatches.length > 0) {
          // Calculate totals for filtered batches only
          const totalBoxes = filteredBatches.reduce(
            (sum, b) => sum + b.boxes,
            0
          );
          const totalAmount = filteredBatches.reduce(
            (sum, b) => sum + b.amount,
            0
          );

          filteredBatches.forEach((batch) => {
            finalData.push({
              ...report,
              batchData: batch,
              filteredTotalBoxes: totalBoxes,
              filteredTotalAmount: totalAmount,
              filteredStatus: calculateStockStatus(totalBoxes),
            });
          });
        }
      });
    } else {
      // No date filter - include all batches
      filteredReports.forEach((report) => {
        report.batches.forEach((batch) => {
          finalData.push({
            ...report,
            batchData: batch,
            filteredTotalBoxes: report.totalBoxes,
            filteredTotalAmount: report.totalAmount,
            filteredStatus: report.status,
          });
        });
      });
    }

    if (finalData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No reports found for selected criteria",
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Reports in Hand");

    // Define headers
    const headers = [
      "Product Name",
      "Supplier Name",
      "Type",
      "Batch Date",
      "Expiry Date",
      "Boxes in Batch",
      "LC (USD per box)",
      "FOB (USD per box)",
      "CIF (USD per box)",
      "Batch Amount (USD)",
      "Total Boxes (Product)",
      "Total Amount (Product)",
      "Stock Status",
    ];

    // Add headers
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Set column widths
    worksheet.columns = [
      { width: 25 }, // Product Name
      { width: 25 }, // Supplier Name
      { width: 15 }, // Type
      { width: 15 }, // Batch Date
      { width: 15 }, // Expiry Date
      { width: 15 }, // Boxes in Batch
      { width: 15 }, // LC
      { width: 15 }, // FOB
      { width: 15 }, // CIF
      { width: 18 }, // Batch Amount
      { width: 20 }, // Total Boxes
      { width: 20 }, // Total Amount
      { width: 15 }, // Stock Status
    ];

    // Add data rows
    finalData.forEach((item) => {
      const row = worksheet.addRow([
        item.productName,
        item.supplierName,
        item.type || "",
        item.batchData.date
          ? dayjs(item.batchData.date).format("DD/MM/YYYY")
          : "",
        item.batchData.expiryDate
          ? dayjs(item.batchData.expiryDate).format("DD/MM/YYYY")
          : "",
        item.batchData.boxes,
        item.batchData.lc,
        item.batchData.fob,
        item.batchData.cif,
        item.batchData.amount,
        item.filteredTotalBoxes,
        item.filteredTotalAmount,
        item.filteredStatus,
      ]);

      // Color code based on status
      let statusColor = "FFFFFF"; // Default white
      switch (item.filteredStatus) {
        case "Out of Stock":
          statusColor = "FFCCCC"; // Light red
          break;
        case "Critical":
          statusColor = "FFE5CC"; // Light orange
          break;
        case "Low Stock":
          statusColor = "FFFFCC"; // Light yellow
          break;
        case "In Stock":
          statusColor = "CCFFCC"; // Light green
          break;
      }

      // Apply color to status cell
      const statusCell = row.getCell(13);
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: statusColor },
      };
    });

    // Apply borders to all cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
    });

    // Format number cells
    const numberColumns = [6, 7, 8, 9, 10, 11, 12]; // Columns with numbers
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        // Skip header
        numberColumns.forEach((col) => {
          const cell = row.getCell(col);
          cell.numFmt = "#,##0.00";
        });
      }
    });

    // Add a summary row
    const totalRow = worksheet.addRow([]);
    totalRow.getCell(1).value = "TOTAL";
    totalRow.getCell(1).font = { bold: true };

    // Calculate totals
    const totalBoxes = finalData.reduce(
      (sum, item) => sum + item.batchData.boxes,
      0
    );
    const totalAmount = finalData.reduce(
      (sum, item) => sum + item.batchData.amount,
      0
    );

    totalRow.getCell(6).value = totalBoxes;
    totalRow.getCell(10).value = totalAmount;
    totalRow.getCell(10).numFmt = "#,##0.00";
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDDEBF7" },
    };

    // Generate filename
    let fileName = "reports_in_hand";
    if (startDate && endDate) {
      fileName += `_${dayjs(startDate).format("DD-MM-YYYY")}_to_${dayjs(
        endDate
      ).format("DD-MM-YYYY")}`;
    } else {
      fileName += `_${dayjs().format("DD-MM-YYYY")}`;
    }
    fileName += ".xlsx";

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // Send the file
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating reports in hand Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate reports excel file",
      error: error.message,
    });
  }
});

// Download purchase excel - FIXED VERSION
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
    // Set end date to end of day
    end.setHours(23, 59, 59, 999);
    const purchases = await purchaseInventory
      .find({
        invoiceDate: { $gte: start, $lte: end },
      })
      .lean();

    if (purchases.length === 0) {
      return res.status(200).json({
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

    let totalRows = 0;
    purchases.forEach((purchase, purchaseIndex) => {
      if (purchase.products && Array.isArray(purchase.products)) {
        purchase.products.forEach((product, productIndex) => {
          // Calculate amount if not provided
          const quantity = Number(product.quantityPerBoxStrip) || 0;
          const lc = Number(product.lc) || 0;
          const amount = product.amount || quantity * lc;

          const rowData = [
            purchase.invoiceNumber || "",
            purchase.invoiceDate
              ? dayjs(purchase.invoiceDate).format("DD/MM/YYYY")
              : "",
            purchase.deliveryNumber || "",
            purchase.receivedDate
              ? dayjs(purchase.receivedDate).format("DD/MM/YYYY")
              : "",
            product.productName || "",
            product.type || "",
            purchase.supplierName || "",
            product.expiryDate
              ? dayjs(product.expiryDate).format("DD/MM/YYYY")
              : "",
            quantity,
            product.fob || 0,
            product.cif || 0,
            lc,
            amount,
            purchase.remarks || "",
          ];

          worksheet.addRow(rowData);
          totalRows++;
        });
      }
    });

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
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
  } catch (error) {
    console.error("🔥 Error occurred in purchase download-excel endpoint:");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    if (error.code) {
      console.error("Error code:", error.code);
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate purchase excel file",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

// 🔥 NEW: Debug endpoint for product matching in purchase context
router.get("/debug/purchase-product-match/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const normalized = normalizeProductName(productName);

    // Search in Product collection
    const productMatches = await Product.find({
      productName: { $regex: productName, $options: "i" },
    }).lean();

    // Search in ReportInHand
    const reportInHandMatches = await ReportInHand.find({
      productName: { $regex: productName, $options: "i" },
    }).lean();

    res.json({
      searchTerm: productName,
      normalizedTerm: normalized,
      fixedName: productNameFixMap[normalized] || "Not in fix map",
      productMatches: productMatches.map((p) => ({
        id: p._id,
        productName: p.productName,
        type: p.type,
        batches: p.batches,
      })),
      reportInHandMatches: reportInHandMatches.map((p) => ({
        id: p._id,
        productName: p.productName,
        totalBoxes:
          p.totalBoxes ||
          p.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) ||
          0,
        supplierName: p.supplierName,
      })),
      allProductsInProductCollection: (await Product.find({}).lean())
        .map((p) => p.productName)
        .slice(0, 20), // First 20 products
      allProductsInReportInHand: (await ReportInHand.find({}).lean())
        .map((p) => p.productName)
        .slice(0, 20), // First 20 products
    });
  } catch (error) {
    console.error("Purchase debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/purchases/check", async (req, res) => {
  try {
    const count = await purchaseInventory.countDocuments();

    res.status(200).json({
      success: true,
      exists: count > 0,
      count: count,
      message:
        count > 0
          ? "Purchase inventories found"
          : "No purchase inventories found",
    });
  } catch (error) {
    console.error("Error checking purchase inventories:", error);
    res.status(500).json({
      success: false,
      message: "Error checking purchase inventories",
      error: error.message,
    });
  }
});

export default router;
