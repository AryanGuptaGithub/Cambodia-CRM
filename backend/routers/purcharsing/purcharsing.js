import express from "express";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import product from "../../models/projectManger/product.js";
const router = express.Router();

// POST /api/purchase-inventory/import
router.post("/purchase/import", async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data received" });
    }

    const converted = data.map((item) => {
      // Parse and calculate amount
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
        amount: amount,
        lcNumber: item.lcNumber?.toString() || "",
        qtyBox: qtyBoxValue,
        fob: parseFloat(item.fob) || 0,
        cif: parseFloat(item.cif) || 0,
        qtyPerCarton: qtyPerCartonValue,
        supplierName: item.supplierName || "", // Added supplierName
      };
    });

    const inserted = await purchaseInventory.insertMany(converted);

    res.status(200).json({
      message: `✅ Successfully imported ${inserted.length} purchase inventory records with calculated amounts.`,
      count: inserted.length,
    });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

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

    // Validate required fields
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

    // Validate each product
    for (const product of formData.products) {
      if (!product.productName) {
        return res.status(400).json({
          message: "Product name is required for all products.",
        });
      }
    }

    const purchaseDocuments = [];

    // Create a purchase document for each product
    for (const product of formData.products) {
      // Calculate amount if not provided
      const lcValue = parseFloat(product.lcNumber) || 0;
      const qtyBoxValue = parseFloat(product.qtyBox) || 0;
      const qtyPerCartonValue = parseFloat(product.qtyPerCarton) || 0;
      const amount =
        product.amount || lcValue * qtyBoxValue * qtyPerCartonValue;

      // Create new purchase document
      const newPurchase = new purchaseInventory({
        invoiceNumber: formData.invoiceNumber,
        invoiceDate: formData.invoiceDate || null,
        deliveryNumber: formData.deliveryNumber,
        receivedDate: formData.receivedDate || null,
        expiredDate: product.expiredDate || null,
        productId: product.productId,
        productName: product.productName,
        supplierName: formData.supplierName,
        qtyBox: product.qtyBox || 0,
        qtyPerCarton: product.qtyPerCarton || 0,
        fob: product.fob || 0,
        cif: product.cif || 0,
        lcNumber: product.lcNumber || "",
        remarks: formData.remarks || "",
        amount: amount,
      });

      await newPurchase.save();
      purchaseDocuments.push(newPurchase);
    }

    res.status(201).json({
      message: `Purchase for invoice <b>${formData.invoiceNumber}</b> added successfully with ${purchaseDocuments.length} products`,
      purchases: purchaseDocuments,
    });
  } catch (error) {
    console.error("Error adding purchase:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
