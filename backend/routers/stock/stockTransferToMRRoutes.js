// import express from "express";
// import StockInMRHand from "../../models/stock/StockInMRHand.js";
// import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
// import ReportInHand from "../../models/reports/reportsInHand.js";
// import Product from "../../models/projectManger/product.js";
// import mongoose from "mongoose";
// import { protect } from "../../middleware/auth.js";
// import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
// import { all } from "axios";
// const router = express.Router();

// const deductFromReportInHand = async (productName, qty, session) => {
//   const productStock = await ReportInHand.findOne({
//     productName: { $regex: new RegExp(`^${productName}$`, "i") },
//   }).session(session);

//   if (!productStock)
//     throw new Error(`Product not in ReportInHand: ${productName}`);

//   let remaining = qty;
//   for (let batch of productStock.batches) {
//     if (remaining <= 0) break;
//     if (batch.boxes >= remaining) {
//       batch.boxes -= remaining;
//       remaining = 0;
//     } else {
//       remaining -= batch.boxes;
//       batch.boxes = 0;
//     }
//   }

//   if (remaining > 0) {
//     throw new Error(`Insufficient stock for ${productName}`);
//   }

//   productStock.totalBoxes = productStock.batches.reduce(
//     (sum, b) => sum + b.boxes,
//     0
//   );

//   const lastBatch = productStock.batches[productStock.batches.length - 1];
//   const lcValue = lastBatch?.lc || 0;
//   productStock.totalAmount = productStock.totalBoxes * lcValue;

//   await productStock.save({ session });
//   return lcValue;
// };

// const addBackToReportInHand = async (productName, qty, session) => {
//   const productStock = await ReportInHand.findOne({
//     productName: { $regex: new RegExp(`^${productName}$`, "i") },
//   }).session(session);

//   if (!productStock)
//     throw new Error(`Product not in ReportInHand: ${productName}`);

//   const lastBatch = productStock.batches[productStock.batches.length - 1];
//   if (!lastBatch) throw new Error(`No batch found for ${productName}`);

//   lastBatch.boxes += qty;
//   productStock.totalBoxes += qty;
//   productStock.totalAmount = productStock.totalBoxes * lastBatch.lc;

//   await productStock.save({ session });
//   return lastBatch.lc;
// };

// const updateStockInMRHand = async (
//   mrId,
//   mrName,
//   productId,
//   productName,
//   quantity,
//   operation,
//   session
// ) => {
//   const cleanedMrName = mrName.replace(/\s+/g, " ").trim();

//   let mrStock;
//   if (mrId) {
//     mrStock = await StockInMRHand.findOne({ mrId }).session(session);
//   }
//   if (!mrStock) {
//     mrStock = await StockInMRHand.findOne({
//       mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
//     }).session(session);
//   }

//   if (!mrStock) {
//     if (operation === "add") {
//       mrStock = new StockInMRHand({
//         mrId,
//         mrName: cleanedMrName,
//         productsInHand: [],
//       });
//     } else {
//       throw new Error(`MR ${cleanedMrName} not found in stock`);
//     }
//   }

//   if (!mrStock.productsInHand) mrStock.productsInHand = [];

//   let productEntry = mrStock.productsInHand.find(
//     (p) =>
//       (p.productId && p.productId.toString() === productId.toString()) ||
//       (p.productName &&
//         p.productName.toLowerCase() === productName.toLowerCase())
//   );

//   if (productEntry) {
//     if (operation === "add") {
//       productEntry.quantity += quantity;
//     } else {
//       productEntry.quantity = Math.max(0, productEntry.quantity - quantity);
//     }
//     productEntry.lastUpdated = new Date();
//   } else {
//     if (operation === "add") {
//       const product = await Product.findById(productId).session(session);
//       const lcValue = product?.lc || 0;
//       mrStock.productsInHand.push({
//         productId,
//         productName,
//         quantity,
//         lc: lcValue,
//         lastUpdated: new Date(),
//       });
//     } else {
//       throw new Error(
//         `Product ${productName} not found in MR ${cleanedMrName} stock`
//       );
//     }
//   }

//   mrStock.productsInHand = mrStock.productsInHand.filter(
//     (p) => p.quantity > 0
//   );

//   await mrStock.save({ session });
//   return mrStock;
// };

// const generateNextStockTransferNumber = async () => {
//   try {
//     const lastTransfer = await StockTransferToMR.findOne()
//       .sort({ invoiceNo: -1 })
//       .select("invoiceNo");
//     const match = lastTransfer?.invoiceNo?.match(/ST-(\d+)/);
//     const lastNum = match ? parseInt(match[1], 10) : 0;
//     return `ST-${(lastNum + 1).toString().padStart(4, "0")}`;
//   } catch (error) {
//     console.error("Error generating number:", error);
//     return "ST-0001";
//   }
// };

// router.get("/next-number", async (req, res) => {
//   try {
//     const nextNumber = await generateNextStockTransferNumber();
//     res.json({ success: true, nextNumber });
//   } catch (error) {
//     res.json({ success: true, nextNumber: "ST-0001" });
//   }
// });

// router.get("/last-number", async (req, res) => {
//   try {
//     const lastTransfer = await StockTransferToMR.findOne()
//       .sort({ invoiceNo: -1 })
//       .select("invoiceNo");
//     const match = lastTransfer?.invoiceNo?.match(/ST-(\d+)/);
//     const lastNumber = match ? parseInt(match[1], 10) : 0;
//     res.json({ success: true, lastNumber });
//   } catch (error) {
//     res.json({ success: true, lastNumber: 0 });
//   }
// });

// router.get("/", async (req, res) => {
//   try {
//     const transfers = await StockTransferToMR.find()
//       .populate({
//         path: "items.productId",
//         select: "productName lc costPrice",
//       })
//       .sort({ createdAt: -1 });

//     const transfersWithCosts = transfers.map((transfer) => {
//       const transferObj = transfer.toObject();
//       let totalTransferCost = 0;

//       if (transfer.items && Array.isArray(transfer.items)) {
//         const itemsWithCosts = transfer.items.map((item) => {
//           const itemObj = item.toObject ? item.toObject() : item;
//           let lc =
//             item.lc || item.productId?.lc || item.productId?.costPrice || 0;
//           const boxQuantity = item.boxQuantity || 0;
//           const itemCost = lc * boxQuantity;
//           totalTransferCost += itemCost;

//           return {
//             ...itemObj,
//             lc,
//             itemCost,
//             productName:
//               item.productName ||
//               item.productId?.productName ||
//               "Unknown Product",
//           };
//         });
//         transferObj.items = itemsWithCosts;
//       }
//       transferObj.totalTransferCost = totalTransferCost;
//       return transferObj;
//     });

//     res.json(transfersWithCosts);
//   } catch (err) {
//     console.error("Failed to fetch transfers:", err);
//     res.status(500).json({ error: "Server Error" });
//   }
// });

// router.get("/mr-hand-admin", async (req, res) => {
//   try {
//     const { mrName, search } = req.query;
//     let matchStage = { $match: {} };
//     if (mrName && mrName !== "all") {
//       matchStage.$match.mrName = { $regex: new RegExp(`^${mrName}$`, "i") };
//     }

//     const stockAggregation = [
//       matchStage,
//       { $unwind: "$productsInHand" },
//       {
//         $lookup: {
//           from: "products",
//           localField: "productsInHand.productId",
//           foreignField: "_id",
//           as: "productDetails",
//         },
//       },
//       { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
//       {
//         $project: {
//           mrId: 1,
//           mrName: 1,
//           createdAt: 1,
//           updatedAt: 1,
//           productId: "$productsInHand.productId",
//           productName: {
//             $cond: {
//               if: { $gt: ["$productsInHand.productName", ""] },
//               then: "$productsInHand.productName",
//               else: "$productDetails.productName",
//             },
//           },
//           quantity: "$productsInHand.quantity",
//           lc: {
//             $cond: {
//               if: { $gt: ["$productsInHand.lc", 0] },
//               then: "$productsInHand.lc",
//               else: "$productDetails.lc",
//             },
//           },
//           costPrice: "$productDetails.costPrice",
//           unit: "$productDetails.unit",
//           category: "$productDetails.category",
//           packSize: "$productDetails.packSize",
//           productCode: "$productDetails.productCode",
//           stockId: "$_id",
//           lastUpdated: "$productsInHand.lastUpdated",
//         },
//       },
//       { $sort: { mrName: 1, productName: 1 } },
//     ];

//     const stockResults = await StockInMRHand.aggregate(stockAggregation);

//     const transferMatch = { transferType: "send" };
//     if (mrName && mrName !== "all") {
//       transferMatch.stockTransferToMr = {
//         $regex: new RegExp(`^${mrName}$`, "i"),
//       };
//     }

//     const transfers = await StockTransferToMR.find(transferMatch);

//     const assignedMap = {};
//     transfers.forEach((transfer) => {
//       transfer.items.forEach((item) => {
//         const key = `${transfer.stockTransferToMr}_${item.productId}`;
//         if (!assignedMap[key]) {
//           assignedMap[key] = {
//             totalAssigned: 0,
//             latestTransferDate: transfer.createdAt,
//             invoiceNo: transfer.invoiceNo,
//           };
//         }
//         assignedMap[key].totalAssigned += item.boxQuantity || 0;
//         if (transfer.createdAt > assignedMap[key].latestTransferDate) {
//           assignedMap[key].latestTransferDate = transfer.createdAt;
//         }
//       });
//     });

//     const formattedResult = stockResults.map((item, index) => {
//       const key = `${item.mrName}_${item.productId}`;
//       const assignedData = assignedMap[key] || {
//         totalAssigned: item.quantity || 0,
//         latestTransferDate: item.createdAt,
//         invoiceNo: null,
//       };
//       const remainingQty = item.quantity || 0;
//       const assignedQty = assignedData.totalAssigned;
//       const usedQty = Math.max(0, assignedQty - remainingQty);

//       return {
//         assignedDate: assignedData.latestTransferDate
//           ? new Date(assignedData.latestTransferDate)
//               .toISOString()
//               .split("T")[0]
//           : item.createdAt
//           ? new Date(item.createdAt).toISOString().split("T")[0]
//           : new Date().toISOString().split("T")[0],
//         assignedQty,
//         batch: "N/A",
//         createdAt: item.createdAt
//           ? new Date(item.createdAt).toISOString().split("T")[0]
//           : new Date().toISOString().split("T")[0],
//         expiry: "N/A",
//         id:
//           item.stockId?.toString() ||
//           `${item.mrName}-${item.productId}-${index}`,
//         invoiceNumbers: assignedData.invoiceNo ? [assignedData.invoiceNo] : [],
//         mrCode: item.mrName,
//         mrName: item.mrName,
//         productCode:
//           item.productCode ||
//           `PROD-${item.productId?.toString().slice(-4) || "0000"}`,
//         productId: item.productId,
//         productName: item.productName || "Unknown Product",
//         remainingQty,
//         usedQty,
//         status: remainingQty > 0 ? "Active" : "Depleted",
//         boxQuantity: item.quantity || 0,
//         quantity: item.quantity || 0,
//         lc: item.lc || 0,
//         unit: item.unit || "pcs",
//         category: item.category || "General",
//         packSize: item.packSize || 0,
//         costPrice: item.costPrice || 0,
//         lastUpdated: item.lastUpdated || item.createdAt,
//       };
//     });

//     let filteredResult = formattedResult;
//     if (search && search.trim()) {
//       const searchLower = search.toLowerCase();
//       filteredResult = formattedResult.filter(
//         (item) =>
//           item.productName?.toLowerCase().includes(searchLower) ||
//           item.productCode?.toLowerCase().includes(searchLower) ||
//           item.mrName?.toLowerCase().includes(searchLower)
//       );
//     }

//     res.json({
//       success: true,
//       data: filteredResult,
//       count: filteredResult.length,
//     });
//   } catch (err) {
//     console.error("Failed to fetch MR stock:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// // GET flattened MR stock
// router.get("/mr-hand", async (req, res) => {
//   try {
//     const stock = await StockInMRHand.find()
//       .populate({
//         path: "productsInHand.productId",
//         select: "productName lc costPrice",
//       })
//       .sort({ mrName: 1 });

//     const flattenedStock = stock
//       .map((mrStock) => {
//         const products = (mrStock.productsInHand || []).map((product) => ({
//           mrId: mrStock.mrId,
//           mrName: mrStock.mrName,
//           productId: product.productId?._id || product.productId,
//           productName:
//             product.productName || product.productId?.productName,
//           quantity: product.quantity || 0,
//           boxQuantity: product.quantity || 0,
//           lc:
//             product.lc ||
//             product.productId?.lc ||
//             product.productId?.costPrice ||
//             0,
//           lastUpdated: product.lastUpdated || mrStock.updatedAt,
//         }));
//         return products;
//       })
//       .flat();

//     res.json(flattenedStock);
//   } catch (err) {
//     console.error("Failed to fetch MR stock:", err);
//     res.status(500).json({ error: "Server Error" });
//   }
// });

// // GET list of MRs
// router.get("/mrs", async (req, res) => {
//   try {
//     const mrs = await StockInMRHand.aggregate([
//       // ✅ Only include documents where productsInHand is NOT empty
//       {
//         $match: {
//           productsInHand: { $exists: true, $ne: [] }
//         }
//       },

//       // Group by MR
//       {
//         $group: {
//           _id: "$mrId",
//           mrName: { $first: "$mrName" }
//         }
//       },

//       // Format output
//       {
//         $project: {
//           mrId: "$_id",
//           mrName: 1,
//           _id: 0
//         }
//       },

//       // Sort by name
//       {
//         $sort: { mrName: 1 }
//       }
//     ]);

//     res.json({ success: true, data: mrs });

//   } catch (error) {
//     console.error("Error fetching MR list:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });


// router.post("/", protect, allowAdminOnly, async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const data = req.body;
//     let invoiceNo = data.invoiceNo;
//     if (!invoiceNo || invoiceNo === "ST-0001") {
//       invoiceNo = await generateNextStockTransferNumber();
//     }

//     const itemsWithLC = await Promise.all(
//       data.items.map(async (item) => {
//         try {
//           const product = await Product.findById(item.productId).session(session);
//           let lcValue = product?.lc || product?.costPrice || 0;

//           if (!lcValue) {
//             const productStock = await ReportInHand.findOne({
//               productName: item.productName,
//             }).session(session);
//             if (productStock?.batches?.length) {
//               const lastBatch =
//                 productStock.batches[productStock.batches.length - 1];
//               lcValue = lastBatch?.lc || 0;
//             }
//           }

//           return {
//             ...item,
//             lc: lcValue,
//             productName:
//               item.productName || product?.productName || "Unknown",
//           };
//         } catch (error) {
//           console.error(
//             `Error fetching lc for product ${item.productName}:`,
//             error
//           );
//           return { ...item, lc: 0, productName: item.productName || "Unknown" };
//         }
//       })
//     );

//     const transferData = { ...data, invoiceNo, items: itemsWithLC };
//     const [newTransfer] = await StockTransferToMR.create([transferData], {
//       session,
//     });

//     if (data.transferType === "send") {
//       const { mrId, stockTransferToMr: mrName } = data;
//       for (const item of itemsWithLC) {
//         await deductFromReportInHand(item.productName, item.boxQuantity, session);
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "add",
//           session
//         );
//       }
//     } else if (data.transferType === "receive") {
//       const { mrId, stockTransferFromMrToMain: mrName } = data;
//       for (const item of itemsWithLC) {
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "subtract",
//           session
//         );

//         const product = await Product.findById(item.productId).session(session);
//         let lcValue = product?.lc || product?.costPrice || 0;

//         const productStock = await ReportInHand.findOne({
//           productName: item.productName,
//         }).session(session);

//         if (!productStock) {
//           await ReportInHand.create(
//             [
//               {
//                 productName: item.productName,
//                 batches: [
//                   {
//                     batchNo: `BATCH-${Date.now()}`,
//                     boxes: item.boxQuantity,
//                     lc: lcValue,
//                     date: new Date().toISOString().split("T")[0],
//                   },
//                 ],
//                 totalBoxes: item.boxQuantity,
//                 totalAmount: item.boxQuantity * lcValue,
//               },
//             ],
//             { session }
//           );
//         } else {
//           const lastBatch =
//             productStock.batches[productStock.batches.length - 1];
//           if (!lastBatch || Math.abs(lastBatch.lc - lcValue) > 0.01) {
//             productStock.batches.push({
//               batchNo: `BATCH-${Date.now()}`,
//               boxes: item.boxQuantity,
//               lc: lcValue,
//               date: new Date().toISOString().split("T")[0],
//             });
//           } else {
//             lastBatch.boxes += item.boxQuantity;
//           }

//           productStock.totalBoxes += item.boxQuantity;
//           productStock.totalAmount = productStock.batches.reduce(
//             (sum, b) => sum + b.boxes * b.lc,
//             0
//           );
//           await productStock.save({ session });
//         }
//       }
//     }

//     await session.commitTransaction();
//     res.status(201).json({
//       success: true,
//       message: "Stock transfer created successfully!",
//       data: newTransfer,
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     console.error("TRANSFER CREATE ERROR →", error);
//     res.status(500).json({ success: false, error: error.message });
//   } finally {
//     session.endSession();
//   }
// });

// router.put("/:id", protect, allowAdminOnly, async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   console.log('called this rout 604');
//   try {
//     const { id } = req.params;
//     const existing = await StockTransferToMR.findById(id).session(session);
//     if (!existing) {
//       await session.abortTransaction();
//       return res
//         .status(404)
//         .json({ success: false, message: "Transfer not found" });
//     }

//     // Revert original stock movements
//     if (existing.transferType === "send") {
//       const { mrId, stockTransferToMr: mrName } = existing;
//       for (const item of existing.items) {
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "subtract",
//           session
//         );
//         await addBackToReportInHand(item.productName, item.boxQuantity, session);
//       }
//     } else if (existing.transferType === "receive") {
//       const { mrId, stockTransferFromMrToMain: mrName } = existing;
//       for (const item of existing.items) {
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "add",
//           session
//         );
//         await deductFromReportInHand(
//           item.productName,
//           item.boxQuantity,
//           session
//         );
//       }
//     }

//     const data = req.body;
//     const itemsWithLC = await Promise.all(
//       data.items.map(async (item) => {
//         try {
//           const product = await Product.findById(item.productId).session(session);
//           let lcValue = product?.lc || product?.costPrice || 0;
//           if (!lcValue) {
//             const productStock = await ReportInHand.findOne({
//               productName: item.productName,
//             }).session(session);
//             if (productStock?.batches?.length) {
//               const lastBatch =
//                 productStock.batches[productStock.batches.length - 1];
//               lcValue = lastBatch?.lc || 0;
//             }
//           }
//           return {
//             ...item,
//             lc: lcValue,
//             productName:
//               item.productName || product?.productName || "Unknown",
//           };
//         } catch (error) {
//           return {
//             ...item,
//             lc: 0,
//             productName: item.productName || "Unknown",
//           };
//         }
//       })
//     );

//     const updated = await StockTransferToMR.findByIdAndUpdate(
//       id,
//       { ...data, items: itemsWithLC },
//       { new: true, runValidators: true, session }
//     );

//     // Apply new stock movements
//     if (data.transferType === "send") {
//       const { mrId, stockTransferToMr: mrName } = data;
//       for (const item of itemsWithLC) {
//         await deductFromReportInHand(item.productName, item.boxQuantity, session);
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "add",
//           session
//         );
//       }
//     } else if (data.transferType === "receive") {
//       const { mrId, stockTransferFromMrToMain: mrName } = data;
//       for (const item of itemsWithLC) {
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "subtract",
//           session
//         );

//         const product = await Product.findById(item.productId).session(session);
//         let lcValue = product?.lc || product?.costPrice || 0;

//         const productStock = await ReportInHand.findOne({
//           productName: item.productName,
//         }).session(session);

//         if (!productStock) {
//           await ReportInHand.create(
//             [
//               {
//                 productName: item.productName,
//                 batches: [
//                   {
//                     batchNo: `BATCH-${Date.now()}`,
//                     boxes: item.boxQuantity,
//                     lc: lcValue,
//                     date: new Date().toISOString().split("T")[0],
//                   },
//                 ],
//                 totalBoxes: item.boxQuantity,
//                 totalAmount: item.boxQuantity * lcValue,
//               },
//             ],
//             { session }
//           );
//         } else {
//           const lastBatch =
//             productStock.batches[productStock.batches.length - 1];
//           if (!lastBatch || Math.abs(lastBatch.lc - lcValue) > 0.01) {
//             productStock.batches.push({
//               batchNo: `BATCH-${Date.now()}`,
//               boxes: item.boxQuantity,
//               lc: lcValue,
//               date: new Date().toISOString().split("T")[0],
//             });
//           } else {
//             lastBatch.boxes += item.boxQuantity;
//           }
//           productStock.totalBoxes += item.boxQuantity;
//           productStock.totalAmount = productStock.batches.reduce(
//             (sum, b) => sum + b.boxes * b.lc,
//             0
//           );
//           await productStock.save({ session });
//         }
//       }
//     }

//     await session.commitTransaction();
//     res.json({
//       success: true,
//       message: "Transfer updated successfully",
//       data: updated,
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     console.error("TRANSFER UPDATE ERROR →", error);
//     res.status(500).json({ success: false, error: error.message });
//   } finally {
//     session.endSession();
//   }
// });

// router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const transfer = await StockTransferToMR.findById(req.params.id).session(
//       session
//     );
//     if (!transfer) {
//       await session.abortTransaction();
//       return res.status(404).json({ message: "Transfer not found" });
//     }

//     if (transfer.transferType === "send") {
//       const { mrId, stockTransferToMr: mrName } = transfer;
//       for (const item of transfer.items) {
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "subtract",
//           session
//         );
//         await addBackToReportInHand(item.productName, item.boxQuantity, session);
//       }
//     } else if (transfer.transferType === "receive") {
//       const { mrId, stockTransferFromMrToMain: mrName } = transfer;
//       for (const item of transfer.items) {
//         await updateStockInMRHand(
//           mrId,
//           mrName,
//           item.productId,
//           item.productName,
//           item.boxQuantity,
//           "add",
//           session
//         );
//         await deductFromReportInHand(
//           item.productName,
//           item.boxQuantity,
//           session
//         );
//       }
//     }

//     await transfer.deleteOne({ session });
//     await session.commitTransaction();

//     res.json({
//       success: true,
//       message: "Transfer deleted and stock reverted successfully!",
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     console.error("DELETE ERROR →", error);
//     res.status(500).json({ success: false, error: error.message });
//   } finally {
//     session.endSession();
//   }
// });

// router.delete(
//   "/by-invoice/:invoiceNo",
//   protect,
//   allowAdminOnly,
//   async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const { invoiceNo } = req.params;
//       const transfer = await StockTransferToMR.findOne({ invoiceNo }).session(
//         session
//       );
//       if (!transfer) {
//         await session.abortTransaction();
//         return res.status(404).json({
//           success: false,
//           message: `Transfer with invoice number ${invoiceNo} not found`,
//         });
//       }

//       if (transfer.transferType === "send") {
//         const { mrId, stockTransferToMr: mrName } = transfer;
//         for (const item of transfer.items) {
//           await updateStockInMRHand(
//             mrId,
//             mrName,
//             item.productId,
//             item.productName,
//             item.boxQuantity,
//             "subtract",
//             session
//           );
//           await addBackToReportInHand(
//             item.productName,
//             item.boxQuantity,
//             session
//           );
//         }
//       } else if (transfer.transferType === "receive") {
//         const { mrId, stockTransferFromMrToMain: mrName } = transfer;
//         for (const item of transfer.items) {
//           await updateStockInMRHand(
//             mrId,
//             mrName,
//             item.productId,
//             item.productName,
//             item.boxQuantity,
//             "add",
//             session
//           );
//           await deductFromReportInHand(
//             item.productName,
//             item.boxQuantity,
//             session
//           );
//         }
//       }

//       await transfer.deleteOne({ session });
//       await session.commitTransaction();

//       res.json({
//         success: true,
//         message: `Transfer ${invoiceNo} deleted and stock reverted successfully!`,
//       });
//     } catch (error) {
//       await session.abortTransaction();
//       console.error("DELETE BY INVOICE ERROR →", error);
//       res.status(500).json({ success: false, error: error.message });
//     } finally {
//       session.endSession();
//     }
//   }
// );

// export default router;

import express from "express";
import StockInMRHand from "../../models/stock/StockInMRHand.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const deductFromReportInHand = async (productName, qty, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

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

  if (remaining > 0) throw new Error(`Insufficient stock for ${productName}`);

  productStock.totalBoxes = productStock.batches.reduce((sum, b) => sum + b.boxes, 0);
  const lastBatch = productStock.batches[productStock.batches.length - 1];
  productStock.totalAmount = productStock.totalBoxes * (lastBatch?.lc || 0);
  await productStock.save({ session });
};

const addBackToReportInHand = async (productName, qty, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  const lastBatch = productStock.batches[productStock.batches.length - 1];
  if (!lastBatch) throw new Error(`No batch found for ${productName}`);

  lastBatch.boxes += qty;
  productStock.totalBoxes += qty;
  productStock.totalAmount = productStock.totalBoxes * lastBatch.lc;
  await productStock.save({ session });
};

/**
 * recomputeMRStockFromTransfers
 *
 * THE KEY FIX: Instead of incrementally adding/subtracting, we recompute the
 * MR's productsInHand by summing ALL active "send" transfers for that MR,
 * then subtracting all "receive" transfers. This guarantees accuracy
 * regardless of prior state — no stale data, no double-counting.
 *
 * Called after every POST/PUT/DELETE that affects an MR's stock.
 */
const recomputeMRStockFromTransfers = async (mrId, mrName, session) => {
  const cleanedMrName = mrName?.replace(/\s+/g, " ").trim() || "";

  // Fetch ALL transfers for this MR (both send and receive)
  const allTransfers = await StockTransferToMR.find({
    $or: [
      { mrId: mrId },
      { stockTransferToMr: { $regex: new RegExp(`^${cleanedMrName}$`, "i") } },
      { stockTransferFromMrToMain: { $regex: new RegExp(`^${cleanedMrName}$`, "i") } },
    ],
  }).session(session);

  // Aggregate totals per product across all transfers
  // productMap: { productIdStr -> { productName, lc, quantity } }
  const productMap = new Map();

  for (const transfer of allTransfers) {
    if (!Array.isArray(transfer.items)) continue;

    for (const item of transfer.items) {
      const key = item.productId?.toString();
      if (!key) continue;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: item.productId,
          productName: item.productName,
          lc: item.lc || 0,
          quantity: 0,
        });
      }

      const entry = productMap.get(key);

      if (transfer.transferType === "send") {
        // Sent to MR → increases MR hand
        entry.quantity += item.boxQuantity || 0;
      } else if (transfer.transferType === "receive") {
        // Received back from MR → decreases MR hand
        entry.quantity -= item.boxQuantity || 0;
      }
    }
  }

  // Build the final productsInHand array (only products with qty > 0)
  const productsInHand = [];
  for (const [, entry] of productMap.entries()) {
    if (entry.quantity > 0) {
      productsInHand.push({
        productId: entry.productId,
        productName: entry.productName,
        quantity: entry.quantity,
        lc: entry.lc || 0,
        lastUpdated: new Date(),
      });
    }
  }

  // Find or create the MR stock document
  let mrStock;
  if (mrId) {
    mrStock = await StockInMRHand.findOne({ mrId }).session(session);
  }
  if (!mrStock && cleanedMrName) {
    mrStock = await StockInMRHand.findOne({
      mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
    }).session(session);
  }

  if (!mrStock) {
    mrStock = new StockInMRHand({ mrId, mrName: cleanedMrName, productsInHand });
  } else {
    mrStock.productsInHand = productsInHand;
  }

  await mrStock.save({ session });
  return mrStock;
};

const generateNextStockTransferNumber = async () => {
  try {
    const lastTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");
    const match = lastTransfer?.invoiceNo?.match(/ST-(\d+)/);
    const lastNum = match ? parseInt(match[1], 10) : 0;
    return `ST-${(lastNum + 1).toString().padStart(4, "0")}`;
  } catch (error) {
    console.error("Error generating number:", error);
    return "ST-0001";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /next-number
// ─────────────────────────────────────────────────────────────────────────────
router.get("/next-number", async (req, res) => {
  try {
    const nextNumber = await generateNextStockTransferNumber();
    res.json({ success: true, nextNumber });
  } catch (error) {
    res.json({ success: true, nextNumber: "ST-0001" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /last-number
// ─────────────────────────────────────────────────────────────────────────────
router.get("/last-number", async (req, res) => {
  try {
    const lastTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");
    const match = lastTransfer?.invoiceNo?.match(/ST-(\d+)/);
    const lastNumber = match ? parseInt(match[1], 10) : 0;
    res.json({ success: true, lastNumber });
  } catch (error) {
    res.json({ success: true, lastNumber: 0 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET / — list all transfers
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const transfers = await StockTransferToMR.find()
      .populate({ path: "items.productId", select: "productName lc costPrice" })
      .sort({ createdAt: -1 });

    const transfersWithCosts = transfers.map((transfer) => {
      const transferObj = transfer.toObject();
      let totalTransferCost = 0;

      if (transfer.items && Array.isArray(transfer.items)) {
        const itemsWithCosts = transfer.items.map((item) => {
          const itemObj = item.toObject ? item.toObject() : item;
          const lc = item.lc || item.productId?.lc || item.productId?.costPrice || 0;
          const boxQuantity = item.boxQuantity || 0;
          const itemCost = lc * boxQuantity;
          totalTransferCost += itemCost;
          return {
            ...itemObj,
            lc,
            itemCost,
            productName: item.productName || item.productId?.productName || "Unknown Product",
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-hand-admin
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-hand-admin", async (req, res) => {
  try {
    const { mrName, search } = req.query;
    let matchStage = { $match: {} };
    if (mrName && mrName !== "all") {
      matchStage.$match.mrName = { $regex: new RegExp(`^${mrName}$`, "i") };
    }

    const stockAggregation = [
      matchStage,
      { $unwind: "$productsInHand" },
      {
        $lookup: {
          from: "products",
          localField: "productsInHand.productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
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
          quantity: "$productsInHand.quantity",
          lc: {
            $cond: {
              if: { $gt: ["$productsInHand.lc", 0] },
              then: "$productsInHand.lc",
              else: "$productDetails.lc",
            },
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

    const transferMatch = { transferType: "send" };
    if (mrName && mrName !== "all") {
      transferMatch.stockTransferToMr = { $regex: new RegExp(`^${mrName}$`, "i") };
    }

    const transfers = await StockTransferToMR.find(transferMatch);
    const assignedMap = {};
    transfers.forEach((transfer) => {
      transfer.items.forEach((item) => {
        const key = `${transfer.stockTransferToMr}_${item.productId}`;
        if (!assignedMap[key]) {
          assignedMap[key] = { totalAssigned: 0, latestTransferDate: transfer.createdAt, invoiceNo: transfer.invoiceNo };
        }
        assignedMap[key].totalAssigned += item.boxQuantity || 0;
        if (transfer.createdAt > assignedMap[key].latestTransferDate) {
          assignedMap[key].latestTransferDate = transfer.createdAt;
        }
      });
    });

    const formattedResult = stockResults.map((item, index) => {
      const key = `${item.mrName}_${item.productId}`;
      const assignedData = assignedMap[key] || { totalAssigned: item.quantity || 0, latestTransferDate: item.createdAt, invoiceNo: null };
      const remainingQty = item.quantity || 0;
      const assignedQty = assignedData.totalAssigned;
      const usedQty = Math.max(0, assignedQty - remainingQty);
      return {
        assignedDate: assignedData.latestTransferDate ? new Date(assignedData.latestTransferDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        assignedQty, batch: "N/A",
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        expiry: "N/A",
        id: item.stockId?.toString() || `${item.mrName}-${item.productId}-${index}`,
        invoiceNumbers: assignedData.invoiceNo ? [assignedData.invoiceNo] : [],
        mrCode: item.mrName, mrName: item.mrName,
        productCode: item.productCode || `PROD-${item.productId?.toString().slice(-4) || "0000"}`,
        productId: item.productId, productName: item.productName || "Unknown Product",
        remainingQty, usedQty, status: remainingQty > 0 ? "Active" : "Depleted",
        boxQuantity: item.quantity || 0, quantity: item.quantity || 0,
        lc: item.lc || 0, unit: item.unit || "pcs", category: item.category || "General",
        packSize: item.packSize || 0, costPrice: item.costPrice || 0,
        lastUpdated: item.lastUpdated || item.createdAt,
      };
    });

    let filteredResult = formattedResult;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredResult = formattedResult.filter(
        (item) =>
          item.productName?.toLowerCase().includes(searchLower) ||
          item.productCode?.toLowerCase().includes(searchLower) ||
          item.mrName?.toLowerCase().includes(searchLower)
      );
    }

    res.json({ success: true, data: filteredResult, count: filteredResult.length });
  } catch (err) {
    console.error("Failed to fetch MR stock:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-hand
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-hand", async (req, res) => {
  try {
    const stock = await StockInMRHand.find()
      .populate({ path: "productsInHand.productId", select: "productName lc costPrice" })
      .sort({ mrName: 1 });

    const flattenedStock = stock
      .map((mrStock) =>
        (mrStock.productsInHand || []).map((product) => ({
          mrId: mrStock.mrId,
          mrName: mrStock.mrName,
          productId: product.productId?._id || product.productId,
          productName: product.productName || product.productId?.productName,
          quantity: product.quantity || 0,
          boxQuantity: product.quantity || 0,
          lc: product.lc || product.productId?.lc || product.productId?.costPrice || 0,
          lastUpdated: product.lastUpdated || mrStock.updatedAt,
        }))
      )
      .flat();

    res.json(flattenedStock);
  } catch (err) {
    console.error("Failed to fetch MR stock:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mrs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mrs", async (req, res) => {
  try {
    const mrs = await StockInMRHand.aggregate([
      { $match: { productsInHand: { $exists: true, $ne: [] } } },
      { $group: { _id: "$mrId", mrName: { $first: "$mrName" } } },
      { $project: { mrId: "$_id", mrName: 1, _id: 0 } },
      { $sort: { mrName: 1 } },
    ]);
    res.json({ success: true, data: mrs });
  } catch (error) {
    console.error("Error fetching MR list:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — Create new transfer
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = req.body;
    let invoiceNo = data.invoiceNo;
    if (!invoiceNo || invoiceNo === "ST-0001") {
      invoiceNo = await generateNextStockTransferNumber();
    }

    // ── Resolve LC for each item ─────────────────────────────────────────────
    const itemsWithLC = await Promise.all(
      data.items.map(async (item) => {
        try {
          const product = await Product.findById(item.productId).session(session);
          let lcValue = product?.lc || product?.costPrice || 0;
          if (!lcValue) {
            const productStock = await ReportInHand.findOne({ productName: item.productName }).session(session);
            if (productStock?.batches?.length) {
              lcValue = productStock.batches[productStock.batches.length - 1]?.lc || 0;
            }
          }
          return { ...item, lc: lcValue, productName: item.productName || product?.productName || "Unknown" };
        } catch {
          return { ...item, lc: 0, productName: item.productName || "Unknown" };
        }
      })
    );

    // ── Merge duplicate productIds in items (sum quantities) ─────────────────
    const mergedItemsMap = new Map();
    for (const item of itemsWithLC) {
      const key = item.productId?.toString();
      if (mergedItemsMap.has(key)) {
        const ex = mergedItemsMap.get(key);
        ex.boxQuantity = (ex.boxQuantity || 0) + (item.boxQuantity || 0);
        ex.productCost = parseFloat(((ex.lc || 0) * ex.boxQuantity).toFixed(2));
      } else {
        mergedItemsMap.set(key, { ...item });
      }
    }
    const mergedItems = Array.from(mergedItemsMap.values());

    // ── Save the transfer document FIRST ────────────────────────────────────
    const transferData = { ...data, invoiceNo, items: mergedItems };
    const [newTransfer] = await StockTransferToMR.create([transferData], { session });

    // ── Adjust ReportInHand ──────────────────────────────────────────────────
    if (data.transferType === "send") {
      for (const item of mergedItems) {
        await deductFromReportInHand(item.productName, item.boxQuantity, session);
      }
    } else if (data.transferType === "receive") {
      for (const item of mergedItems) {
        const product = await Product.findById(item.productId).session(session);
        let lcValue = product?.lc || product?.costPrice || 0;
        const productStock = await ReportInHand.findOne({ productName: item.productName }).session(session);
        if (!productStock) {
          await ReportInHand.create([{
            productName: item.productName,
            batches: [{ batchNo: `BATCH-${Date.now()}`, boxes: item.boxQuantity, lc: lcValue, date: new Date().toISOString().split("T")[0] }],
            totalBoxes: item.boxQuantity,
            totalAmount: item.boxQuantity * lcValue,
          }], { session });
        } else {
          const lastBatch = productStock.batches[productStock.batches.length - 1];
          if (!lastBatch || Math.abs(lastBatch.lc - lcValue) > 0.01) {
            productStock.batches.push({ batchNo: `BATCH-${Date.now()}`, boxes: item.boxQuantity, lc: lcValue, date: new Date().toISOString().split("T")[0] });
          } else {
            lastBatch.boxes += item.boxQuantity;
          }
          productStock.totalBoxes += item.boxQuantity;
          productStock.totalAmount = productStock.batches.reduce((sum, b) => sum + b.boxes * b.lc, 0);
          await productStock.save({ session });
        }
      }
    }

    // ── Recompute MR stock from ALL transfers (the key fix) ──────────────────
    // The transfer document is already saved above, so the recompute
    // will naturally include it in the sum.
    const mrId = data.mrId;
    const mrName = data.stockTransferToMr || data.stockTransferFromMrToMain || data.mrName;
    if (mrId || mrName) {
      await recomputeMRStockFromTransfers(mrId, mrName, session);
    }

    await session.commitTransaction();
    res.status(201).json({ success: true, message: "Stock transfer created successfully!", data: newTransfer });
  } catch (error) {
    await session.abortTransaction();
    console.error("TRANSFER CREATE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id — Update transfer
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const existing = await StockTransferToMR.findById(id).session(session);
    if (!existing) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Transfer not found" });
    }

    const data = req.body;

    // ── Resolve LC for new items ─────────────────────────────────────────────
    const newItemsWithLC = await Promise.all(
      data.items.map(async (item) => {
        try {
          const product = await Product.findById(item.productId).session(session);
          let lcValue = product?.lc || product?.costPrice || 0;
          if (!lcValue) {
            const productStock = await ReportInHand.findOne({ productName: item.productName }).session(session);
            if (productStock?.batches?.length) {
              lcValue = productStock.batches[productStock.batches.length - 1]?.lc || 0;
            }
          }
          return { ...item, lc: lcValue, productName: item.productName || product?.productName || "Unknown" };
        } catch {
          return { ...item, lc: 0, productName: item.productName || "Unknown" };
        }
      })
    );

    // ── Merge duplicate productIds in new items ──────────────────────────────
    const newItemsMap = new Map();
    for (const item of newItemsWithLC) {
      const key = item.productId?.toString();
      if (newItemsMap.has(key)) {
        const ex = newItemsMap.get(key);
        ex.boxQuantity = (ex.boxQuantity || 0) + (item.boxQuantity || 0);
        ex.productCost = parseFloat(((ex.lc || 0) * ex.boxQuantity).toFixed(2));
      } else {
        newItemsMap.set(key, { ...item });
      }
    }
    const mergedNewItems = Array.from(newItemsMap.values());

    // ── Compute ReportInHand adjustments (net diff between old and new) ──────
    // Build old items map
    const oldItemsMap = new Map();
    for (const item of existing.items) {
      const key = item.productId?.toString();
      if (oldItemsMap.has(key)) {
        oldItemsMap.get(key).boxQuantity += item.boxQuantity || 0;
      } else {
        oldItemsMap.set(key, { boxQuantity: item.boxQuantity || 0, productName: item.productName, lc: item.lc || 0 });
      }
    }

    if (existing.transferType === "send") {
      // For products that changed or were removed: adjust warehouse
      for (const [key, oldItem] of oldItemsMap.entries()) {
        const newItem = newItemsMap.get(key);
        const oldQty = oldItem.boxQuantity || 0;
        const newQty = newItem?.boxQuantity || 0;
        const diff = newQty - oldQty;

        if (diff > 0) {
          await deductFromReportInHand(oldItem.productName, diff, session);
        } else if (diff < 0) {
          await addBackToReportInHand(oldItem.productName, Math.abs(diff), session);
        }
        // If product removed entirely (newQty === 0 because not in newItemsMap):
        if (!newItem) {
          await addBackToReportInHand(oldItem.productName, oldQty, session);
        }
      }
      // For brand new products not in old items:
      for (const [key, newItem] of newItemsMap.entries()) {
        if (!oldItemsMap.has(key)) {
          await deductFromReportInHand(newItem.productName, newItem.boxQuantity, session);
        }
      }
    } else if (existing.transferType === "receive") {
      for (const [key, oldItem] of oldItemsMap.entries()) {
        const newItem = newItemsMap.get(key);
        const oldQty = oldItem.boxQuantity || 0;
        const newQty = newItem?.boxQuantity || 0;
        const diff = newQty - oldQty;
        if (diff > 0) {
          // Received more — add more to warehouse
          const product = await Product.findById(key).session(session);
          const lcValue = product?.lc || product?.costPrice || oldItem.lc || 0;
          const productStock = await ReportInHand.findOne({ productName: oldItem.productName }).session(session);
          if (productStock) {
            const lastBatch = productStock.batches[productStock.batches.length - 1];
            if (!lastBatch || Math.abs(lastBatch.lc - lcValue) > 0.01) {
              productStock.batches.push({ batchNo: `BATCH-${Date.now()}`, boxes: diff, lc: lcValue, date: new Date().toISOString().split("T")[0] });
            } else {
              lastBatch.boxes += diff;
            }
            productStock.totalBoxes += diff;
            productStock.totalAmount = productStock.batches.reduce((sum, b) => sum + b.boxes * b.lc, 0);
            await productStock.save({ session });
          }
        } else if (diff < 0) {
          await deductFromReportInHand(oldItem.productName, Math.abs(diff), session);
        }
        if (!newItem) {
          await deductFromReportInHand(oldItem.productName, oldQty, session);
        }
      }
    }

    // ── Save updated transfer document ───────────────────────────────────────
    const updated = await StockTransferToMR.findByIdAndUpdate(
      id,
      { ...data, items: mergedNewItems },
      { new: true, runValidators: true, session }
    );

    // ── Recompute MR stock from ALL transfers ────────────────────────────────
    // Now that the transfer is updated in DB, recompute gives the correct total.
    const mrId = existing.mrId || data.mrId;
    const mrName = existing.stockTransferToMr || existing.stockTransferFromMrToMain
      || data.stockTransferToMr || data.stockTransferFromMrToMain || data.mrName;
    if (mrId || mrName) {
      await recomputeMRStockFromTransfers(mrId, mrName, session);
    }

    await session.commitTransaction();
    res.json({ success: true, message: "Transfer updated successfully", data: updated });
  } catch (error) {
    await session.abortTransaction();
    console.error("TRANSFER UPDATE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transfer = await StockTransferToMR.findById(req.params.id).session(session);
    if (!transfer) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transfer not found" });
    }

    const mrId = transfer.mrId;
    const mrName = transfer.stockTransferToMr || transfer.stockTransferFromMrToMain;

    // ── Revert ReportInHand ──────────────────────────────────────────────────
    if (transfer.transferType === "send") {
      for (const item of transfer.items) {
        await addBackToReportInHand(item.productName, item.boxQuantity, session);
      }
    } else if (transfer.transferType === "receive") {
      for (const item of transfer.items) {
        await deductFromReportInHand(item.productName, item.boxQuantity, session);
      }
    }

    // ── Delete the transfer document ─────────────────────────────────────────
    await transfer.deleteOne({ session });

    // ── Recompute MR stock (this transfer is now gone, so sum is correct) ────
    if (mrId || mrName) {
      await recomputeMRStockFromTransfers(mrId, mrName, session);
    }

    await session.commitTransaction();
    res.json({ success: true, message: "Transfer deleted and stock reverted successfully!" });
  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /by-invoice/:invoiceNo
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/by-invoice/:invoiceNo", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceNo } = req.params;
    const transfer = await StockTransferToMR.findOne({ invoiceNo }).session(session);
    if (!transfer) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: `Transfer with invoice number ${invoiceNo} not found` });
    }

    const mrId = transfer.mrId;
    const mrName = transfer.stockTransferToMr || transfer.stockTransferFromMrToMain;

    if (transfer.transferType === "send") {
      for (const item of transfer.items) {
        await addBackToReportInHand(item.productName, item.boxQuantity, session);
      }
    } else if (transfer.transferType === "receive") {
      for (const item of transfer.items) {
        await deductFromReportInHand(item.productName, item.boxQuantity, session);
      }
    }

    await transfer.deleteOne({ session });

    if (mrId || mrName) {
      await recomputeMRStockFromTransfers(mrId, mrName, session);
    }

    await session.commitTransaction();
    res.json({ success: true, message: `Transfer ${invoiceNo} deleted and stock reverted successfully!` });
  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE BY INVOICE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

export default router;
