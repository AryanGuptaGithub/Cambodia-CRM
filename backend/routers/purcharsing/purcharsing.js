import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import dayjs from "dayjs";

const router = express.Router();

/* ------------------------------------------------------ */
/* PRODUCT NAME NORMALIZATION & MATCHING FUNCTIONS */
/* ------------------------------------------------------ */

// 🔥 ENHANCED: Better product name normalization
const normalizeProductName = (name) => {
  if (!name) return "";
  
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/[^a-z0-9\s]/g, "") // Remove special characters
    .trim();
};

// 🔥 ENHANCED: Product name mapping for common variations
const productNameFixMap = {
  // Existing mappings from sales code
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
  "n sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  
  // 🔥 NEW: ECOMOL variations
  "ecomol 500": "ECOMOL 500",
  "ecomol500": "ECOMOL 500",
  "ecomol-500": "ECOMOL 500",
  "ecomol": "ECOMOL 500",
  
  // 🔥 NEW: General pattern for products with numbers
  "500mg": "500 MG",
  "500 mg": "500 MG",
  "500": "500 MG",
};

// 🔥 NEW: Function to remove all spaces and special characters for comparison
const getStrictNormalizedProductName = (name) => {
  if (!name) return "";
  
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Remove all non-alphanumeric characters
    .trim();
};

// 🔥 ENHANCED: Find product in Product collection with better matching
const findProductInProducts = async (productName) => {
  try {
    const normalizedProductName = normalizeProductName(productName);
    const strictNormalizedProductName = getStrictNormalizedProductName(productName);
    
    // First, check the fix map
    const fixedProductName = productNameFixMap[normalizedProductName] || productNameFixMap[strictNormalizedProductName];
    
    if (fixedProductName) {
      // Try exact match with the fixed name
      const exactMatchWithFixed = await Product.findOne({
        productName: { $regex: new RegExp(`^${fixedProductName}$`, "i") },
      });
      
      if (exactMatchWithFixed) {
        return exactMatchWithFixed;
      }
    }
    
    // 🔥 NEW: Get all products from Product collection for better matching
    const allProducts = await Product.find({});
    
    // 🔥 NEW: Try multiple matching strategies
    for (const product of allProducts) {
      const inventoryNormalized = normalizeProductName(product.productName);
      const inventoryStrict = getStrictNormalizedProductName(product.productName);
      
      // Strategy 1: Exact match (case-insensitive)
      if (product.productName.toLowerCase() === productName.toLowerCase()) {
        return product;
      }
      
      // Strategy 2: Normalized match
      if (inventoryNormalized === normalizedProductName) {
        return product;
      }
      
      // Strategy 3: Strict normalized match (remove all non-alphanumeric)
      if (inventoryStrict === strictNormalizedProductName) {
        return product;
      }
      
      // Strategy 4: Contains match
      if (product.productName.toLowerCase().includes(productName.toLowerCase()) ||
          productName.toLowerCase().includes(product.productName.toLowerCase())) {
        return product;
      }
      
      // Strategy 5: Handle ECOMOL specifically
      if (productName.toLowerCase().includes("ecomol") && 
          product.productName.toLowerCase().includes("ecomol")) {
        
        // Extract numbers from both names
        const inputNumber = productName.replace(/\D/g, "") || "500";
        const productNumber = product.productName.replace(/\D/g, "") || "500";
        
        if (inputNumber === productNumber) {
          return product;
        }
      }
    }
    
    // 🔥 NEW: Try fuzzy matching for common product patterns
    const searchTerm = productName.toLowerCase();
    
    for (const product of allProducts) {
      const productTerm = product.productName.toLowerCase();
      
      // Check for common patterns
      if (productTerm.includes("ecomol") && searchTerm.includes("ecomol")) {
        return product;
      }
      
      // Check for same base name with different numbers
      const baseName = searchTerm.replace(/\d+/g, "").trim();
      const productBaseName = productTerm.replace(/\d+/g, "").trim();
      
      if (baseName === productBaseName && baseName.length > 3) {
        return product;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding product "${productName}" in Product collection:`, error);
    return null;
  }
};

// 🔥 ENHANCED: Find product in ReportInHand with better matching
const findProductInReportInHand = async (productName) => {
  try {
    const normalizedProductName = normalizeProductName(productName);
    const strictNormalizedProductName = getStrictNormalizedProductName(productName);
    
    // First, check the fix map
    const fixedProductName = productNameFixMap[normalizedProductName] || productNameFixMap[strictNormalizedProductName];
    
    if (fixedProductName) {
      // Try exact match with the fixed name
      const exactMatchWithFixed = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${fixedProductName}$`, "i") },
      });
      
      if (exactMatchWithFixed) {
        return exactMatchWithFixed;
      }
    }
    
    // 🔥 NEW: Get all products from ReportInHand for better matching
    const allProducts = await ReportInHand.find({});
    
    // 🔥 NEW: Try multiple matching strategies
    for (const product of allProducts) {
      const inventoryNormalized = normalizeProductName(product.productName);
      const inventoryStrict = getStrictNormalizedProductName(product.productName);
      
      // Strategy 1: Exact match (case-insensitive)
      if (product.productName.toLowerCase() === productName.toLowerCase()) {
        return product;
      }
      
      // Strategy 2: Normalized match
      if (inventoryNormalized === normalizedProductName) {
        return product;
      }
      
      // Strategy 3: Strict normalized match (remove all non-alphanumeric)
      if (inventoryStrict === strictNormalizedProductName) {
        return product;
      }
      
      // Strategy 4: Contains match
      if (product.productName.toLowerCase().includes(productName.toLowerCase()) ||
          productName.toLowerCase().includes(product.productName.toLowerCase())) {
        return product;
      }
      
      // Strategy 5: Handle ECOMOL specifically
      if (productName.toLowerCase().includes("ecomol") && 
          product.productName.toLowerCase().includes("ecomol")) {
        
        // Extract numbers from both names
        const inputNumber = productName.replace(/\D/g, "") || "500";
        const productNumber = product.productName.replace(/\D/g, "") || "500";
        
        if (inputNumber === productNumber) {
          return product;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding product "${productName}" in ReportInHand:`, error);
    return null;
  }
};

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

// 🔥 MODIFIED: Enhanced updateReportInHand with product name normalization
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

    // Validate required fields
    if (!productName || productName.trim() === "") {
      console.warn(
        "Skipping updateReportInHand: productName is missing or empty"
      );
      return;
    }

    const qty = Number(quantityPerBoxStrip || 0);
    const validSupplier = supplierName?.trim() || "Unknown Supplier";
    
    // 🔥 FIXED: Normalize product name before processing
    const normalizedProductName = normalizeProductName(productName);
    const fixedProductName = productNameFixMap[normalizedProductName] || productName.trim();
    
    // 🔥 FIXED: Use enhanced product finder to find existing product
    let item = await findProductInReportInHand(fixedProductName);

    // If subtracting and item doesn't exist, nothing to do
    if (operation === "subtract" && !item) {
      console.warn(
        `Cannot subtract: Product "${fixedProductName}" not found in ReportInHand`
      );
      return;
    }

    // If adding and item doesn't exist, create new
    if (operation === "add" && !item) {
      item = new ReportInHand({
        productName: fixedProductName, // Use fixed product name
        supplierName: validSupplier,
        type: type || "Tablet",
        batches: [],
        totalBoxes: 0,
        totalAmount: 0,
        status: "Out of Stock",
      });
    }

    if (operation === "add") {
      const amount = qty * (lc || 0);

      item.batches.push({
        boxes: qty,
        lc: lc || 0,
        fob: fob || 0,
        cif: cif || 0,
        amount,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        date: new Date(),
      });
    }

    if (operation === "subtract") {
      if (!item || !Array.isArray(item.batches) || item.batches.length === 0) {
        console.warn(
          `No batches found for product "${fixedProductName}" to subtract from`
        );
        return;
      }

      let qtyToRemove = qty;

      // Sort batches by date (FIFO: First In First Out)
      item.batches.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Create a copy of batches to avoid mutation during iteration
      const batchesCopy = [...item.batches];

      for (let i = 0; i < batchesCopy.length; i++) {
        if (qtyToRemove <= 0) break;

        const batch = batchesCopy[i];

        if (batch.boxes > qtyToRemove) {
          batch.boxes -= qtyToRemove;
          batch.amount = batch.boxes * (batch.lc || 0);
          qtyToRemove = 0;
        } else {
          qtyToRemove -= batch.boxes;
          batch.boxes = 0;
          batch.amount = 0;
        }
      }

      // Remove batches with 0 boxes
      item.batches = batchesCopy.filter((b) => b.boxes > 0);
    }

    // Recalculate totals
    item.totalBoxes = item.batches.reduce((sum, b) => sum + (b.boxes || 0), 0);
    item.totalAmount = item.batches.reduce(
      (sum, b) => sum + (b.amount || 0),
      0
    );

    // Update status based on total boxes
    if (item.totalBoxes <= 0) {
      item.status = "Out of Stock";
    } else if (item.totalBoxes < 10) {
      item.status = "Critical";
    } else if (item.totalBoxes < 25) {
      item.status = "Low Stock";
    } else {
      item.status = "In Stock";
    }

    // If no boxes left, remove the item completely
    if (item.totalBoxes <= 0) {
      await ReportInHand.findByIdAndDelete(item._id);
    } else {
      await item.save();
    }
  } catch (err) {
    console.error("updateReportInHand ERROR:", err.message || err);
    // Don't throw the error here, just log it
  }
};

/* ------------------------------------------------------ */
/* PURCHASE ROUTES */
/* ------------------------------------------------------ */

// Get purchase invoices
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

// Get all purchases
router.get("/purchase", async (req, res) => {
  try {
    const purchases = await purchaseInventory.find().sort({ createdAt: -1 });

    const productList = await Product.find(
      {},
      "productName type packing qtyPerBoxStrip sellingPrice batches"
    );

    // 🔥 MODIFIED: Create product map with normalized keys
    const productMap = new Map();
    productList.forEach((p) => {
      if (p.productName) {
        const normalizedKey = normalizeProductName(p.productName);
        productMap.set(normalizedKey, p);
      }
    });

    const enhancedPurchases = purchases.map((invoice) => {
      const enhancedProducts = invoice.products.map((p) => {
        const normalizedProductName = normalizeProductName(p.productName);
        const productInfo = productMap.get(normalizedProductName);

        return {
          ...p.toObject(),
          productType: p.type || productInfo?.type || "Tablet",
          productPacking: productInfo?.packing || "",
          productQtyPerBoxStrip: productInfo?.qtyPerBoxStrip || 0,
          sellingPrice: p.sellingPrice || productInfo?.sellingPrice || 0,
          fob: p.fob || productInfo?.batches?.[0]?.fob || 0,
          cif: p.cif || productInfo?.batches?.[0]?.cif || 0,
          lc: p.lc || productInfo?.batches?.[0]?.lc || 0,
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

// Update purchase
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

    // Subtract old products
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
          type: oldProduct.type || "Tablet",
        },
        "subtract"
      );
    }

    // Add new products
    for (const newProduct of updated.products) {
      await updateReportInHand(
        {
          productName: newProduct.productName || "",
          supplierName: updated.supplierName || "Unknown Supplier",
          quantityPerBoxStrip: newProduct.quantityPerBoxStrip || 0,
          lc: newProduct.lc || 0,
          fob: newProduct.fob || 0,
          cif: newProduct.cif || 0,
          expiryDate: newProduct.expiryDate,
          type: newProduct.type || "Tablet",
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

// Delete single purchase
router.delete("/purchase/:id", async (req, res) => {
  try {
    const invoice = await purchaseInventory.findById(req.params.id);
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
          type: p.type || "Tablet",
        },
        "subtract"
      );
    }

    await purchaseInventory.findByIdAndDelete(invoice._id);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete purchase error:", err);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Delete multiple purchases
router.delete("/purchase", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: "No purchase IDs provided for deletion",
      });
    }

    // Find all invoices to be deleted
    const invoices = await purchaseInventory.find({
      _id: { $in: ids },
    });

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
              type: p.type || "Tablet",
            },
            "subtract"
          );
        } catch (productError) {
          console.error(
            `Error processing product ${p.productName}:`,
            productError
          );
          // Continue with other products even if one fails
        }
      }
    }

    // Delete all invoices
    const result = await purchaseInventory.deleteMany({
      _id: { $in: ids },
    });

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

// Add single purchase
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
    );

    const productTypeMap = new Map();
    const productBatchMap = new Map();
    const productNameMap = new Map();

    productsInfo.forEach((p) => {
      if (p._id) {
        productTypeMap.set(p._id.toString(), p.type || "Tablet");
        if (p.batches && p.batches.length > 0) {
          productBatchMap.set(p._id.toString(), p.batches[0]);
        }
        productNameMap.set(p._id.toString(), p.productName);
      }
    });

    const products = data.products.map((p) => {
      const qty = Number(p.quantityPerBoxStrip || 0);
      const productBatch = productBatchMap.get(p.productId);

      // Use provided values or fetch from product batches
      const lc = Number(p.lc) || productBatch?.lc || 0;
      const fob = Number(p.fob) || productBatch?.fob || 0;
      const cif = Number(p.cif) || productBatch?.cif || 0;
      const amount = qty * lc;

      totalAmount += amount;

      // 🔥 FIXED: Use normalized product name from database or input
      let productNameToUse = p.productName;
      if (p.productId && productNameMap.has(p.productId.toString())) {
        productNameToUse = productNameMap.get(p.productId.toString());
      } else {
        // Normalize the product name
        const normalized = normalizeProductName(p.productName);
        productNameToUse = productNameFixMap[normalized] || p.productName;
      }

      return {
        productName: productNameToUse,
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

// Import purchases
// 🔥 MODIFIED: Import purchases with enhanced product name matching
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

    // 🔥 FIXED: Fetch all products with enhanced matching
    const allProducts = await Product.find({}, "productName type batches");
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
      .sort({ createdAt: -1 });

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
            // Generate new unique invoice number
            invoiceNumber = `INC${String(invoiceCounter).padStart(5, "0")}`;
            invoiceCounter++;
          }
        } else {
          // Generate new invoice number if not provided
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
        const processedProducts = invoiceData.products.map((product) => {
          const quantityPerBoxStrip =
            parseFloat(product.quantityPerBoxStrip) || 0;
          let lc = parseFloat(product.lc) || parseFloat(product.lcNumber) || 0;
          let fob = parseFloat(product.fob) || 0;
          let cif = parseFloat(product.cif) || 0;

          // 🔥 FIXED: Use enhanced product name matching
          const normalizedInput = normalizeProductName(product.productName);
          const fixedInputName = productNameFixMap[normalizedInput] || normalizedInput;
          const productInfo = productMap.get(fixedInputName.toLowerCase());

          let productNameToUse = product.productName;
          if (productInfo) {
            // Use the exact product name from the database
            productNameToUse = productInfo.productName;
            
            // Get missing values from product database
            if (fob === 0) fob = productInfo.batches?.[0]?.fob || 0;
            if (cif === 0) cif = productInfo.batches?.[0]?.cif || 0;
            if (lc === 0) lc = productInfo.batches?.[0]?.lc || 0;
          } else {
            // Use the fixed input name if not found in database
            productNameToUse = fixedInputName;
          }

          const amount = quantityPerBoxStrip * lc;

          return {
            productName: productNameToUse,
            type: product.type || productInfo?.type || "Tablet",
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
          `Error processing invoice ${invoiceData.invoiceNumber}:`,
          err
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

// Download reports in hand Excel
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
        item.type || "Tablet",
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

// Download purchase excel
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

// 🔥 NEW: Debug endpoint for product matching in purchase context
router.get("/debug/purchase-product-match/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const normalized = normalizeProductName(productName);

    // Search in Product collection
    const productMatches = await Product.find({
      productName: { $regex: productName, $options: "i" },
    });

    // Search with enhanced finder
    const foundProduct = await findProductInProducts(productName);

    // Search in ReportInHand
    const reportInHandMatches = await ReportInHand.find({
      productName: { $regex: productName, $options: "i" },
    });

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
      foundByEnhancedFinder: foundProduct
        ? {
            id: foundProduct._id,
            productName: foundProduct.productName,
            type: foundProduct.type,
            batches: foundProduct.batches,
          }
        : null,
      reportInHandMatches: reportInHandMatches.map((p) => ({
        id: p._id,
        productName: p.productName,
        totalBoxes:
          p.totalBoxes ||
          p.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) ||
          0,
        supplierName: p.supplierName,
      })),
      allProductsInProductCollection: (await Product.find({}))
        .map((p) => p.productName)
        .slice(0, 20), // First 20 products
      allProductsInReportInHand: (await ReportInHand.find({}))
        .map((p) => p.productName)
        .slice(0, 20), // First 20 products
    });
  } catch (error) {
    console.error("Purchase debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;