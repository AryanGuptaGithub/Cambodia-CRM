import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
const router = express.Router();

// Helper function to calculate stock status based on quantity
const calculateStockStatus = (totalPieces) => {
  if (totalPieces === 0) return 'Out of Stock';
  if (totalPieces < 10) return 'Critical';
  if (totalPieces < 25) return 'Low Stock';
  return 'In Stock';
};

// Helper function to update ReportInHand (add or subtract quantities)
const updateReportInHand = async (productData, operation = 'add') => {
  const { 
    productName, 
    supplierName, 
    qtyBox, 
    qtyPerCarton, 
    category, 
    pricePerPiece, 
    pricePerBox, 
    minStockLevel,
    lc,
    fob,
    cif 
  } = productData;
  
  const boxes = qtyBox || 0;
  const piecesPerBox = qtyPerCarton || 0;
  const totalPieces = boxes * piecesPerBox;
  
  const existingProduct = await ReportInHand.findOne({ productName });

  if (existingProduct) {
    // Calculate new quantities based on operation
    const multiplier = operation === 'add' ? 1 : -1;
    const updatedBoxes = existingProduct.quantity.boxes + (boxes * multiplier);
    const updatedTotalPieces = existingProduct.quantity.totalPieces + (totalPieces * multiplier);
    
    // Ensure quantities don't go negative
    const finalBoxes = Math.max(0, updatedBoxes);
    const finalTotalPieces = Math.max(0, updatedTotalPieces);
    
    const updatedStatus = calculateStockStatus(finalTotalPieces);

    // Calculate weighted average for LC, FOB, CIF when adding
    let updatedLc = existingProduct.lc;
    let updatedFob = existingProduct.fob;
    let updatedCif = existingProduct.cif;

    if (operation === 'add' && totalPieces > 0) {
      // Weighted average calculation for pricing fields
      const existingTotalPieces = existingProduct.quantity.totalPieces;
      const newTotalPieces = existingTotalPieces + totalPieces;
      
      if (newTotalPieces > 0) {
        updatedLc = ((existingProduct.lc * existingTotalPieces) + (lc * totalPieces)) / newTotalPieces;
        updatedFob = ((existingProduct.fob * existingTotalPieces) + (fob * totalPieces)) / newTotalPieces;
        updatedCif = ((existingProduct.cif * existingTotalPieces) + (cif * totalPieces)) / newTotalPieces;
      }
    }

    await ReportInHand.findByIdAndUpdate(
      existingProduct._id,
      {
        $set: {
          'quantity.boxes': finalBoxes,
          'quantity.totalPieces': finalTotalPieces,
          'status': updatedStatus,
          'supplierName': supplierName || existingProduct.supplierName,
          'category': category || existingProduct.category,
          'pricePerPiece': pricePerPiece || existingProduct.pricePerPiece,
          'pricePerBox': pricePerBox || existingProduct.pricePerBox,
          'minStockLevel': minStockLevel || existingProduct.minStockLevel,
          'lc': updatedLc,
          'fob': updatedFob,
          'cif': updatedCif
        }
      }
    );
  } else if (operation === 'add') {
    // Only create new entry when adding (not when deleting)
    const status = calculateStockStatus(totalPieces);
    
    await ReportInHand.create({
      supplierName: supplierName || "",
      productName: productName,
      quantity: {
        boxes: boxes,
        piecesPerBox: piecesPerBox,
        totalPieces: totalPieces
      },
      status: status,
      category: category || "",
      pricePerPiece: pricePerPiece || 0,
      pricePerBox: pricePerBox || 0,
      minStockLevel: minStockLevel || 0,
      lc: lc || 0,
      fob: fob || 0,
      cif: cif || 0
    });
  }
  // If operation is 'subtract' and product doesn't exist, do nothing
};

router.get("/purchase-invoice", async (req, res) => {
  try {
    const invoices = await purchaseInventory
      .find()
      .sort({ invoiceDate: -1 })
      .select("invoiceNumber invoiceDate supplierName amount paymentStatus");
    res.status(200).json(invoices);
  } catch (error) {
    console.error("Error fetching purchase invoices:", error);
    res.status(500).json({
      message: "Failed to fetch invoices",
      error: error.message,
    });
  }
});

router.get("/purchase", async (req, res) => {
  try {
    const purchases = await purchaseInventory.find().sort({ createdAt: -1 });

    // Get all products to map types
    const products = await product.find(
      {},
      "productName type packing qtyPerCarton"
    );

    // Create product map for quick lookup
    const productMap = new Map();
    products.forEach((product) => {
      productMap.set(product.productName, {
        type: product.type,
        packing: product.packing,
        qtyPerCarton: product.qtyPerCarton,
      });
    });

    // Enhance purchases with product data
    const enhancedPurchases = purchases.map((purchase) => {
      const productInfo = productMap.get(purchase.productName);
      return {
        ...purchase.toObject(),
        productType: productInfo?.type || "Unknown",
        productPacking: productInfo?.packing || "",
        productQtyPerCarton: productInfo?.qtyPerCarton || 0,
      };
    });

    res.status(200).json({
      success: true,
      count: enhancedPurchases.length,
      reports: enhancedPurchases,
    });
  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching purchases",
      error: error.message,
    });
  }
});

router.put("/purchase/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    // Get the original purchase before update
    const originalPurchase = await purchaseInventory.findById(id);
    if (!originalPurchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    // Update the purchase
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

    // Subtract original quantities from ReportInHand
    await updateReportInHand(
      {
        productName: originalPurchase.productName,
        supplierName: originalPurchase.supplierName,
        qtyBox: originalPurchase.qtyBox,
        qtyPerCarton: originalPurchase.qtyPerCarton,
        lc: originalPurchase.lcNumber || 0,
        fob: originalPurchase.fob || 0,
        cif: originalPurchase.cif || 0
      },
      'subtract'
    );

    // Add updated quantities to ReportInHand
    await updateReportInHand(
      {
        productName: updatedPurchase.productName,
        supplierName: updatedPurchase.supplierName,
        qtyBox: updatedPurchase.qtyBox,
        qtyPerCarton: updatedPurchase.qtyPerCarton,
        category: updateData.category,
        pricePerPiece: updateData.pricePerPiece,
        pricePerBox: updateData.pricePerBox,
        minStockLevel: updateData.minStockLevel,
        lc: updateData.lcNumber || updatedPurchase.lcNumber || 0,
        fob: updateData.fob || updatedPurchase.fob || 0,
        cif: updateData.cif || updatedPurchase.cif || 0
      },
      'add'
    );

    res.json(updatedPurchase);
  } catch (error) {
    console.error("Update purchase error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/purchase/:id", async (req, res) => {
  try {
    const purchaseToDelete = await purchaseInventory.findById(req.params.id);
    if (!purchaseToDelete) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    // Subtract quantities from ReportInHand before deleting
    await updateReportInHand(
      {
        productName: purchaseToDelete.productName,
        supplierName: purchaseToDelete.supplierName,
        qtyBox: purchaseToDelete.qtyBox,
        qtyPerCarton: purchaseToDelete.qtyPerCarton,
        lc: purchaseToDelete.lcNumber || 0,
        fob: purchaseToDelete.fob || 0,
        cif: purchaseToDelete.cif || 0
      },
      'subtract'
    );

    const deleted = await purchaseInventory.findByIdAndDelete(req.params.id);

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

    // Get all purchases to be deleted
    const purchasesToDelete = await purchaseInventory.find({
      _id: { $in: ids },
    });

    // Subtract quantities from ReportInHand for each purchase
    for (const purchase of purchasesToDelete) {
      await updateReportInHand(
        {
          productName: purchase.productName,
          supplierName: purchase.supplierName,
          qtyBox: purchase.qtyBox,
          qtyPerCarton: purchase.qtyPerCarton,
          lc: purchase.lcNumber || 0,
          fob: purchase.fob || 0,
          cif: purchase.cif || 0
        },
        'subtract'
      );
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

router.post("/purchase/import", async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data received" });
    }

    const converted = data.map((item) => {
      let lcValue = 0;
      if (item.lcNumber) {
        lcValue = parseFloat(item.lcNumber.toString().replace(/[^\d.-]/g, ""));
      }

      const qtyBoxValue = parseFloat(item.qtyBox) || 0;
      const qtyPerCartonValue = parseFloat(item.qtyPerCarton) || 0;
      const amount =
        !isNaN(lcValue) && !isNaN(qtyBoxValue)
          ? lcValue * qtyBoxValue * qtyPerCartonValue
          : 0;

      return {
        ...item,
        invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : null,
        receivedDate: item.receivedDate ? new Date(item.receivedDate) : null,
        expiredDate: item.expiredDate ? new Date(item.expiredDate) : null,
        amount,
        lcNumber: item.lcNumber?.toString() || "",
        qtyBox: qtyBoxValue,
        qtyPerCarton: qtyPerCartonValue,
        supplierName: item.supplierName || "",
        fob: parseFloat(item.fob) || 0,
        cif: parseFloat(item.cif) || 0,
        lc: lcValue
      };
    });

    const inserted = await purchaseInventory.insertMany(converted);

    // ✅ Update ReportInHand for each imported item
    for (const item of converted) {
      await updateReportInHand(
        {
          productName: item.productName,
          supplierName: item.supplierName,
          qtyBox: item.qtyBox,
          qtyPerCarton: item.qtyPerCarton,
          category: item.category,
          pricePerPiece: item.pricePerPiece,
          pricePerBox: item.pricePerBox,
          minStockLevel: item.minStockLevel,
          lc: item.lc,
          fob: item.fob,
          cif: item.cif
        },
        'add'
      );
    }

    res.status(200).json({
      message: `✅ Successfully imported ${inserted.length} purchase records and updated ReportInHand.`,
      count: inserted.length,
    });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/purchase", async (req, res) => {
  try {
    const formData = req.body;

    if (
      !formData.invoiceNumber ||
      !formData.supplierName ||
      !formData.products ||
      !Array.isArray(formData.products) ||
      formData.products.length === 0
    ) {
      return res.status(400).json({
        message:
          "Invoice number, supplier name, and at least one product are required.",
      });
    }

    const purchaseDocuments = [];

    for (const product of formData.products) {
      if (!product.productName) {
        return res.status(400).json({
          message: "Product name is required for all products.",
        });
      }

      const lcValue = parseFloat(product.lcNumber) || 0;
      const qtyBoxValue = parseFloat(product.qtyBox) || 0;
      const qtyPerCartonValue = parseFloat(product.qtyPerCarton) || 0;
      const amount =
        product.amount || lcValue * qtyBoxValue * qtyPerCartonValue;

      // ✅ Save purchase
      const newPurchase = new purchaseInventory({
        invoiceNumber: formData.invoiceNumber,
        invoiceDate: formData.invoiceDate || null,
        deliveryNumber: formData.deliveryNumber,
        receivedDate: formData.receivedDate || null,
        expiredDate: product.expiredDate || null,
        productId: product.productId,
        productName: product.productName,
        supplierName: formData.supplierName,
        qtyBox: qtyBoxValue,
        qtyPerCarton: qtyPerCartonValue,
        fob: product.fob || 0,
        cif: product.cif || 0,
        lcNumber: product.lcNumber || "",
        remarks: formData.remarks || "",
        amount,
      });

      await newPurchase.save();
      purchaseDocuments.push(newPurchase);

      // ✅ Update ReportInHand
      await updateReportInHand(
        {
          productName: product.productName,
          supplierName: formData.supplierName,
          qtyBox: qtyBoxValue,
          qtyPerCarton: qtyPerCartonValue,
          category: product.category,
          pricePerPiece: product.pricePerPiece,
          pricePerBox: product.pricePerBox,
          minStockLevel: product.minStockLevel,
          lc: lcValue,
          fob: product.fob || 0,
          cif: product.cif || 0
        },
        'add'
      );
    }

    res.status(201).json({
      message: `✅ Purchase for invoice <b>${formData.invoiceNumber}</b> added successfully with ${purchaseDocuments.length} products and updated ReportInHand.`,
      purchases: purchaseDocuments,
    });
  } catch (error) {
    console.error("Error adding purchase:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// New route to get reports in hand
router.get("/reports-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: reports.length,
      reports: reports
    });
  } catch (error) {
    console.error("Error fetching reports in hand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message
    });
  }
});

export default router;