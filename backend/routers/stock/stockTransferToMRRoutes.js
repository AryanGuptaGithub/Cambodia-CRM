import express from "express";
import StockInMRHand from "../../models/stock/StockInMRHand.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import mongoose from "mongoose";

const router = express.Router();

const deductFromReportInHand = async (productName, qty) => {
  const productStock = await ReportInHand.findOne({ productName });

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
  const productStock = await ReportInHand.findOne({ productName });

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

const updateStockInMRHand = async (
  mrName,
  productId,
  productName,
  boxQuantity,
  operation
) => {
  // operation: 'add' for send, 'subtract' for receive
  const increment = operation === "add" ? boxQuantity : -boxQuantity;

  // Try to update existing product in array
  const result = await StockInMRHand.findOneAndUpdate(
    {
      mrName,
      "products.productId": productId,
    },
    {
      $inc: { "products.$.boxQuantity": increment },
    },
    { new: true }
  );

  // If product doesn't exist in array, add it
  if (!result) {
    if (operation === "add") {
      await StockInMRHand.findOneAndUpdate(
        { mrName },
        {
          $push: {
            products: {
              productId,
              productName,
              boxQuantity,
            },
          },
        },
        { upsert: true, new: true }
      );
    } else {
      throw new Error(`Product ${productName} not found in MR ${mrName} stock`);
    }
  } else if (operation === "subtract") {
    // Remove product from array if quantity becomes 0 or less
    const updatedDoc = await StockInMRHand.findOneAndUpdate(
      {
        mrName,
        "products.productId": productId,
        "products.boxQuantity": { $lte: 0 },
      },
      {
        $pull: { products: { productId } },
      },
      { new: true }
    );
  }
};

// ✅ FIXED: Generate next stock transfer number function
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

// ✅ FIXED: Route to get next stock transfer number
router.get("/stock-transfers-mr/next-number", async (req, res) => {
  try {
    const nextNumber = await generateNextStockTransferNumber();
    console.log("Generated next number:", nextNumber);
    res.json({ success: true, nextNumber });
  } catch (error) {
    console.error("Error generating next stock transfer number:", error);
    // Return a default starting number on error
    res.json({ success: true, nextNumber: "ST-0001" });
  }
});

// ✅ FIXED: Route to get last stock transfer number
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

    const newTransfer = await StockTransferToMR.create(transferData);

    if (data.transferType === "send") {
      const mrName = data.stockTransferToMr;

      for (const item of data.items) {
        const lcValue = await deductFromReportInHand(
          item.productName,
          item.boxQuantity
        );

        // Update MR hand stock (add product to array)
        await updateStockInMRHand(
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "add"
        );
      }
    }

    if (data.transferType === "receive") {
      const mrName = data.stockTransferFromMrToMain;

      for (const item of data.items) {
        // 1. Remove from MR stock (subtract from array)
        await updateStockInMRHand(
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

    res.status(201).json({
      success: true,
      message: "Stock transfer created successfully!",
      data: newTransfer,
    });
  } catch (error) {
    console.error("TRANSFER ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete("/stock-transfers-to-mr/:id", async (req, res) => {
  try {
    const transfer = await StockTransferToMR.findById(req.params.id);
    if (!transfer)
      return res.status(404).json({ message: "Transfer not found" });

    const data = transfer;

    if (data.transferType === "send") {
      const mrName = data.stockTransferToMr;

      for (const item of data.items) {
        // Subtract from MR stock (reverse the send)
        await updateStockInMRHand(
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
      const mrName = data.stockTransferFromMrToMain;

      for (const item of data.items) {
        // Add back to MR stock (reverse the receive)
        await updateStockInMRHand(
          mrName,
          item.productId,
          item.productName,
          item.boxQuantity,
          "add"
        );
        await deductFromReportInHand(item.productName, item.boxQuantity);
      }
    }

    await transfer.deleteOne();

    res.json({
      success: true,
      message: "Transfer deleted and stock reverted successfully!",
    });
  } catch (error) {
    console.error("DELETE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
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

router.get("/stock-in-mr-hand", async (req, res) => {
  try {
    const stock = await StockInMRHand.find()
      .populate({
        path: "products.productId",
        select: "productName lc costPrice",
      })
      .sort({ mrName: 1 });

    // Flatten the structure for easier frontend consumption
    const flattenedStock = stock
      .map((mrStock) => {
        const products = mrStock.products.map((product) => ({
          mrName: mrStock.mrName,
          productId: product.productId?._id || product.productId,
          productName: product.productName || product.productId?.productName,
          boxQuantity: product.boxQuantity,
          lc: product.productId?.lc || product.productId?.costPrice || 0,
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