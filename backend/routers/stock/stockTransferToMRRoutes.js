import express from "express";
import StockInMRHand from "../../models/stock/StockInMRHand.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import mongoose from "mongoose";

const router = express.Router();

const deductFromReportInHand = async (productName, qty) => {
  // Case-insensitive search
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, 'i') }
  });

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  let remaining = qty;

  for (let batch of productStock.batches) {
    if (remaining <= 0) break;

    if (batch.boxes >= remaining) {
      batch.boxes -= remaining;
      remaining = 0;
    } else {
      remaining -= batch.boxes;
      batch.boxes = 0;
    }
  }

  if (remaining > 0) {
    throw new Error(`Insufficient stock for ${productName}`);
  }

  productStock.totalBoxes = productStock.batches.reduce(
    (sum, b) => sum + b.boxes,
    0
  );

  const lastBatch = productStock.batches[productStock.batches.length - 1];
  const lcValue = lastBatch?.lc || 0;
  productStock.totalAmount = productStock.totalBoxes * lcValue;

  await productStock.save();
  return lcValue;
};

const addBackToReportInHand = async (productName, qty) => {
  // Case-insensitive search
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, 'i') }
  });

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  const lastBatch = productStock.batches[productStock.batches.length - 1];

  if (!lastBatch) throw new Error(`No batch found for ${productName}`);

  lastBatch.boxes += qty;

  productStock.totalBoxes += qty;
  productStock.totalAmount = productStock.totalBoxes * lastBatch.lc;

  await productStock.save();
  return lastBatch.lc;
};

async function updateStockInMRHand(mrId, mrName, productId, productName, quantity, operation) {
  try {
    // Clean MR name - remove extra spaces
    const cleanedMrName = mrName.replace(/\s+/g, ' ').trim();
    
    // First, try to find the MR stock document by mrId if provided
    let mrStock;
    
    if (mrId) {
      mrStock = await StockInMRHand.findOne({ mrId: mrId });
    }
    
    // If not found by mrId, try by name
    if (!mrStock) {
      mrStock = await StockInMRHand.findOne({
        mrName: { $regex: new RegExp(`^${cleanedMrName}$`, 'i') }
      });
    }

    // If MR stock doesn't exist and we're adding, create it
    if (!mrStock) {
      if (operation === "add") {
        mrStock = new StockInMRHand({
          mrId: mrId,
          mrName: cleanedMrName,
          productsInHand: [] // Changed from products to productsInHand
        });
        await mrStock.save();
      } else {
        throw new Error(`MR ${cleanedMrName} not found in stock`);
      }
    }

    // Ensure productsInHand array exists (safety check)
    if (!mrStock.productsInHand) {
      mrStock.productsInHand = [];
    }

    // Find the product within the productsInHand array
    let productFound = false;
    let productIndex = -1;
    
    for (let i = 0; i < mrStock.productsInHand.length; i++) {
      const product = mrStock.productsInHand[i];
      
      // Case-insensitive comparison for product name
      if (product && product.productName && product.productName.toLowerCase() === productName.toLowerCase()) {
        productFound = true;
        productIndex = i;
        break;
      }
      
      // Also check by productId if available
      if (productId && product && product.productId && product.productId.toString() === productId.toString()) {
        productFound = true;
        productIndex = i;
        break;
      }
    }

    if (productFound) {
      // Update existing product
      if (operation === "add") {
        mrStock.productsInHand[productIndex].quantity += quantity; // Changed from boxQuantity to quantity
      } else if (operation === "subtract") {
        mrStock.productsInHand[productIndex].quantity = Math.max(0, mrStock.productsInHand[productIndex].quantity - quantity);
      }
      
      // Update lastUpdated timestamp
      mrStock.productsInHand[productIndex].lastUpdated = new Date();
    } else {
      // Product not found in MR stock
      if (operation === "add") {
        // Get lc value from product
        const productDetails = await Product.findById(productId);
        const lcValue = productDetails?.lc || 0;
        
        // Add new product to MR stock
        mrStock.productsInHand.push({
          productId: productId,
          productName: productName,
          quantity: quantity, // Changed from boxQuantity to quantity
          lc: lcValue,
          lastUpdated: new Date()
        });
      } else if (operation === "subtract") {
        throw new Error(`Product ${productName} not found in MR ${cleanedMrName} stock`);
      }
    }

    // Remove products with 0 quantity to clean up
    mrStock.productsInHand = mrStock.productsInHand.filter(product => product && product.quantity > 0);
    
    await mrStock.save();
    return mrStock;
  } catch (error) {
    console.error("Error updating MR stock:", error);
    throw error;
  }
}

// Generate next stock transfer number function
const generateNextStockTransferNumber = async () => {
  try {
    // Only use StockTransferToMR collection for numbering
    const lastTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");

    // Function to extract number from invoiceNo
    const extractNumber = (invoiceNo) => {
      if (!invoiceNo) return 0;
      const match = invoiceNo.match(/ST-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Get the last number
    const lastNumber = extractNumber(lastTransfer?.invoiceNo);
    const nextNumber = lastNumber + 1;

    // Format with leading zeros (ST-0001, ST-0002, etc.)
    return `ST-${nextNumber.toString().padStart(4, "0")}`;
  } catch (error) {
    console.error("Error generating stock transfer number:", error);
    // Return starting number if no transfers exist
    return "ST-0001";
  }
};

// Route to get next stock transfer number
router.get("/stock-transfers-mr/next-number", async (req, res) => {
  try {
    const nextNumber = await generateNextStockTransferNumber();
    res.json({ success: true, nextNumber });
  } catch (error) {
    console.error("Error generating next stock transfer number:", error);
    // Return a default starting number on error
    res.json({ success: true, nextNumber: "ST-0001" });
  }
});

// Route to get last stock transfer number
router.get("/stock-transfers-mr/last-number", async (req, res) => {
  try {
    const lastTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");

    // Function to extract number from invoiceNo
    const extractNumber = (invoiceNo) => {
      if (!invoiceNo) return 0;
      const match = invoiceNo.match(/ST-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const lastNumber = extractNumber(lastTransfer?.invoiceNo) || 0;

    res.json({ success: true, lastNumber });
  } catch (error) {
    console.error("Error fetching last stock transfer number:", error);
    res.json({ success: true, lastNumber: 0 });
  }
});

router.post("/stock-transfers-to-mr", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const data = req.body;
    // If invoiceNo is not provided, generate one
    let invoiceNo = data.invoiceNo;
    if (!invoiceNo || invoiceNo === "ST-0001") {
      invoiceNo = await generateNextStockTransferNumber();
    }

    // Prepare items with lc from ReportInHand
    const itemsWithLC = await Promise.all(
      data.items.map(async (item) => {
        try {
          // First try to get lc from Product model
          const product = await Product.findById(item.productId);
          let lcValue = product?.lc || product?.costPrice || 0;

          // If lc is 0, try to get from ReportInHand
          if (!lcValue || lcValue === 0) {
            const productStock = await ReportInHand.findOne({
              productName: item.productName,
            });
            if (productStock && productStock.batches.length > 0) {
              const lastBatch =
                productStock.batches[productStock.batches.length - 1];
              lcValue = lastBatch?.lc || 0;
            }
          }

          return {
            ...item,
            lc: lcValue,
            productName: item.productName || product?.productName || "Unknown",
          };
        } catch (error) {
          console.error(
            `Error fetching lc for product ${item.productName}:`,
            error
          );
          return {
            ...item,
            lc: 0,
            productName: item.productName || "Unknown",
          };
        }
      })
    );

    const transferData = {
      ...data,
      invoiceNo: invoiceNo,
      items: itemsWithLC,
    };

    const newTransfer = await StockTransferToMR.create([transferData], { session });

    if (data.transferType === "send") {
      const mrId = data.mrId;
      const mrName = data.stockTransferToMr;

      for (const item of data.items) {
        const lcValue = await deductFromReportInHand(
          item.productName,
          item.boxQuantity
        );

        // Update MR hand stock (add product to array)
        await updateStockInMRHand(
          mrId,
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "add"
        );
      }
    }

    if (data.transferType === "receive") {
      const mrId = data.mrId;
      const mrName = data.stockTransferFromMrToMain;

      for (const item of data.items) {
        // 1. Remove from MR stock (subtract from array)
        await updateStockInMRHand(
          mrId,
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "subtract"
        );

        // 2. Get lc from product to add back to main stock
        const product = await Product.findById(item.productId);
        let lcValue = product?.lc || product?.costPrice || 0;

        // 3. Add back to Main stock
        const productStock = await ReportInHand.findOne({
          productName: item.productName,
        });

        if (!productStock) {
          // If product doesn't exist in ReportInHand, create it
          await ReportInHand.create({
            productName: item.productName,
            batches: [
              {
                batchNo: `BATCH-${Date.now()}`,
                boxes: item.boxQuantity,
                lc: lcValue,
                date: new Date().toISOString().split("T")[0],
              },
            ],
            totalBoxes: item.boxQuantity,
            totalAmount: item.boxQuantity * lcValue,
          });
        } else {
          // Add to last batch
          const lastBatch =
            productStock.batches[productStock.batches.length - 1];

          // If lc is different, create a new batch
          if (!lastBatch || Math.abs(lastBatch?.lc - lcValue) > 0.01) {
            productStock.batches.push({
              batchNo: `BATCH-${Date.now()}`,
              boxes: item.boxQuantity,
              lc: lcValue,
              date: new Date().toISOString().split("T")[0],
            });
          } else {
            // Same lc, add to existing batch
            lastBatch.boxes += item.boxQuantity;
          }

          productStock.totalBoxes += item.boxQuantity;
          productStock.totalAmount = productStock.batches.reduce(
            (sum, batch) => sum + batch.boxes * batch.lc,
            0
          );

          await productStock.save();
        }
      }
    }

    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message: "Stock transfer created successfully!",
      data: newTransfer[0],
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("TRANSFER ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

router.delete("/stock-transfers-to-mr/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const transfer = await StockTransferToMR.findById(req.params.id).session(session);
    if (!transfer)
      return res.status(404).json({ message: "Transfer not found" });

    const data = transfer;

    if (data.transferType === "send") {
      const mrId = data.mrId;
      const mrName = data.stockTransferToMr;

      for (const item of data.items) {
        // Subtract from MR stock (reverse the send)
        await updateStockInMRHand(
          mrId,
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "subtract"
        );
        await addBackToReportInHand(item.productName, item.boxQuantity);
      }
    }

    if (data.transferType === "receive") {
      const mrId = data.mrId;
      const mrName = data.stockTransferFromMrToMain;

      for (const item of data.items) {
        // Add back to MR stock (reverse the receive)
        await updateStockInMRHand(
          mrId,
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "add"
        );
        await deductFromReportInHand(item.productName, item.boxQuantity);
      }
    }

    await transfer.deleteOne({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Transfer deleted and stock reverted successfully!",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// New route to delete by invoice number
router.delete("/stock-transfers-to-mr-by-invoice/:invoiceNo", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const invoiceNo = req.params.invoiceNo;
    
    const transfer = await StockTransferToMR.findOne({ invoiceNo: invoiceNo }).session(session);
    if (!transfer) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: `Transfer with invoice number ${invoiceNo} not found` 
      });
    }

    const data = transfer;

    if (data.transferType === "send") {
      const mrId = data.mrId;
      const mrName = data.stockTransferToMr;

      for (const item of data.items) {
        // Subtract from MR stock (reverse the send)
        await updateStockInMRHand(
          mrId,
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "subtract"
        );
        await addBackToReportInHand(item.productName, item.boxQuantity);
      }
    }

    if (data.transferType === "receive") {
      const mrId = data.mrId;
      const mrName = data.stockTransferFromMrToMain;

      for (const item of data.items) {
        // Add back to MR stock (reverse the receive)
        await updateStockInMRHand(
          mrId,
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "add"
        );
        await deductFromReportInHand(item.productName, item.boxQuantity);
      }
    }

    await transfer.deleteOne({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Transfer with invoice number ${invoiceNo} deleted and stock reverted successfully!`,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE BY INVOICE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

router.get("/stock-transfers-to-mr", async (req, res) => {
  try {
    const transfers = await StockTransferToMR.find()
      .populate({
        path: "items.productId",
        select: "productName lc costPrice",
      })
      .sort({ createdAt: -1 });

    const transfersWithCosts = transfers.map((transfer) => {
      const transferObj = transfer.toObject();
      let totalTransferCost = 0;

      if (transfer.items && Array.isArray(transfer.items)) {
        const itemsWithCosts = transfer.items.map((item) => {
          const itemObj = item.toObject ? item.toObject() : item;

          let lc = 0;
          if (item.lc && item.lc > 0) {
            lc = item.lc;
          } else if (item.productId?.lc) {
            lc = item.productId.lc;
          } else if (item.productId?.costPrice) {
            lc = item.productId.costPrice;
          }

          const boxQuantity = item.boxQuantity || 0;
          const itemCost = lc * boxQuantity;

          totalTransferCost += itemCost;

          return {
            ...itemObj,
            lc: lc,
            itemCost: itemCost,
            productName:
              item.productName ||
              item.productId?.productName ||
              "Unknown Product",
          };
        });

        transferObj.items = itemsWithCosts;
      }

      transferObj.totalTransferCost = totalTransferCost;
      return transferObj;
    });
    res.json(transfersWithCosts);
  } catch (err) {
    console.error("Failed to fetch transfers:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Fixed: Get stock in MR hand with correct field names
router.get("/stock-in-mr-hand-admin", async (req, res) => {
  try {
    const { mrName, search } = req.query;

    // Build match stage for aggregation
    let matchStage = { $match: {} };
    if (mrName && mrName !== "all") {
      matchStage.$match.mrName = { $regex: new RegExp(`^${mrName}$`, 'i') };
    }

    // Get current stock in hand from StockInMRHand
    const stockAggregation = [
      matchStage,
      { $unwind: "$productsInHand" }, // Changed from $products to $productsInHand
      {
        $lookup: {
          from: "products",
          localField: "productsInHand.productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          mrId: 1,
          mrName: 1,
          createdAt: 1,
          updatedAt: 1,
          productId: "$productsInHand.productId",
          productName: {
            $cond: {
              if: { $gt: ["$productsInHand.productName", ""] },
              then: "$productsInHand.productName",
              else: "$productDetails.productName",
            },
          },
          quantity: "$productsInHand.quantity", // Changed from boxQuantity to quantity
          lc: {
            $cond: {
              if: { $gt: ["$productsInHand.lc", 0] },
              then: "$productsInHand.lc",
              else: "$productDetails.lc",
            }
          },
          costPrice: "$productDetails.costPrice",
          unit: "$productDetails.unit",
          category: "$productDetails.category",
          packSize: "$productDetails.packSize",
          productCode: "$productDetails.productCode",
          stockId: "$_id",
          lastUpdated: "$productsInHand.lastUpdated",
        },
      },
      { $sort: { mrName: 1, productName: 1 } },
    ];

    const stockResults = await StockInMRHand.aggregate(stockAggregation);

    // Get all transfers to calculate assigned quantities
    const transferMatch = { transferType: "send" };
    if (mrName && mrName !== "all") {
      transferMatch.stockTransferToMr = { $regex: new RegExp(`^${mrName}$`, 'i') };
    }

    const transfers = await StockTransferToMR.find(transferMatch);

    // Create a map to track assigned quantities by MR and product
    const assignedMap = {};
    
    transfers.forEach(transfer => {
      transfer.items.forEach(item => {
        const key = `${transfer.stockTransferToMr}_${item.productId}`;
        if (!assignedMap[key]) {
          assignedMap[key] = {
            totalAssigned: 0,
            latestTransferDate: transfer.createdAt,
            invoiceNo: transfer.invoiceNo
          };
        }
        assignedMap[key].totalAssigned += item.boxQuantity || 0;
        
        // Keep the latest transfer date
        if (transfer.createdAt > assignedMap[key].latestTransferDate) {
          assignedMap[key].latestTransferDate = transfer.createdAt;
        }
      });
    });

    // Format the result with assigned and remaining values
    const formattedResult = stockResults.map((item, index) => {
      const key = `${item.mrName}_${item.productId}`;
      const assignedData = assignedMap[key] || {
        totalAssigned: item.quantity || 0,
        latestTransferDate: item.createdAt,
        invoiceNo: null
      };

      // Remaining quantity is the current quantity
      const remainingQty = item.quantity || 0;
      
      // Calculate used quantity
      const assignedQty = assignedData.totalAssigned;
      const usedQty = Math.max(0, assignedQty - remainingQty);

      return {
        // Original expected fields
        assignedDate: assignedData.latestTransferDate
          ? new Date(assignedData.latestTransferDate).toISOString().split("T")[0]
          : item.createdAt
          ? new Date(item.createdAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        assignedQty: assignedQty,
        batch: "N/A",
        createdAt: item.createdAt
          ? new Date(item.createdAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        expiry: "N/A",
        id: item.stockId
          ? item.stockId.toString()
          : `${item.mrName}-${item.productId}-${index}`,
        invoiceNumbers: assignedData.invoiceNo ? [assignedData.invoiceNo] : [],
        mrCode: item.mrName,
        mrName: item.mrName,
        productCode:
          item.productCode ||
          `PROD-${item.productId?.toString().slice(-4) || "0000"}`,
        productId: item.productId,
        productName: item.productName || "Unknown Product",
        remainingQty: remainingQty,
        usedQty: usedQty,
        status: remainingQty > 0 ? "Active" : "Depleted",

        // Additional data
        boxQuantity: item.quantity || 0, // Keeping boxQuantity for backward compatibility
        quantity: item.quantity || 0,
        lc: item.lc || 0,
        unit: item.unit || "pcs",
        category: item.category || "General",
        packSize: item.packSize || 0,
        costPrice: item.costPrice || 0,
        lastUpdated: item.lastUpdated || item.createdAt,
      };
    });

    // Apply search filter if provided
    let filteredResult = formattedResult;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredResult = formattedResult.filter(item =>
        item.productName?.toLowerCase().includes(searchLower) ||
        item.productCode?.toLowerCase().includes(searchLower) ||
        item.mrName?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      data: filteredResult,
      count: filteredResult.length,
    });
  } catch (err) {
    console.error("Failed to fetch MR stock:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/stock-in-mr-hand", async (req, res) => {
  try {
    const stock = await StockInMRHand.find()
      .populate({
        path: "productsInHand.productId", // Changed from products to productsInHand
        select: "productName lc costPrice",
      })
      .sort({ mrName: 1 });

    // Flatten the structure for easier frontend consumption
    const flattenedStock = stock
      .map((mrStock) => {
        // Ensure productsInHand array exists
        const products = (mrStock.productsInHand || []).map((product) => ({
          mrId: mrStock.mrId,
          mrName: mrStock.mrName,
          productId: product.productId?._id || product.productId,
          productName: product.productName || product.productId?.productName,
          quantity: product.quantity || 0, // Changed from boxQuantity to quantity
          boxQuantity: product.quantity || 0, // For backward compatibility
          lc: product.lc || product.productId?.lc || product.productId?.costPrice || 0,
          lastUpdated: product.lastUpdated || mrStock.updatedAt,
        }));

        return products;
      })
      .flat();

    res.json(flattenedStock);
  } catch (err) {
    console.error("Failed to fetch MR stock:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

export default router;