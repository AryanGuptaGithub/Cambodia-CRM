import express from "express";
import mongoose from "mongoose";
import SalesReturn from "../../models/sale/saleReturn.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ProductInventory from "../../models/purcharsing/purchaseInventory.js"; 
import ExcelJS from "exceljs";

const router = express.Router();

// Helper function to calculate product totals with profit/loss
const calculateProductTotals = (products) => {
  return products.reduce(
    (totals, product) => {
      const salesQty = parseFloat(product.salesQty) || 0;
      const bonusQty = parseFloat(product.bonusQty) || 0;
      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const discount = parseFloat(product.discount) || 0;
      const returnQuantity = parseFloat(product.returnQuantity) || 0;
      const lc = parseFloat(product.lc) || 0;

      // Calculate amounts based on used quantity
      const usedQty = parseFloat(product.usedQty) || salesQty - returnQuantity;
      const amount = usedQty * sellingPrice;
      const netSellingAmount = amount - discount;
      const totalQty = usedQty + bonusQty;
      const usedAmount = usedQty * sellingPrice;
      const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;
      
      // Calculate profit/loss
      const profitLoss = netSellingAmount - (usedQty * lc);

      // Update product with calculated values
      product.amount = amount;
      product.netSellingAmount = netSellingAmount;
      product.totalQty = totalQty;
      product.usedQty = usedQty;
      product.usedAmount = usedAmount;
      product.averageUnitPrice = averageUnitPrice;
      product.profitLoss = profitLoss;

      // Update totals
      totals.totalAmount += netSellingAmount;
      totals.totalAmount += parseFloat(product.amount) || 0;

      return totals;
    },
    { totalAmount: 0, totalAmount: 0 }
  );
};

// Helper function to format dates for Excel
const formatDateToReadable = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

// POST - Create Sales Return Records
router.post("/salesreturn", async (req, res) => {
  try {
    const data = req.body;
    console.log(data);
    
    // Handle both single object and array
    const records = Array.isArray(data) ? data : [data];

    if (records.length === 0) {
      return res.status(400).json({
        message: "Expected a non-empty array of sales return records",
      });
    }

    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerId",
      "customerName",
      "products",
    ];

    // Validate and process each record
    const processedData = await Promise.all(
      records.map(async (record, index) => {
        for (const field of requiredFields) {
          if (record[field] === undefined || record[field] === null) {
            throw new Error(
              `Missing required field "${field}" in record ${index + 1}`
            );
          }
        }

        // Validate customerId
        if (!mongoose.Types.ObjectId.isValid(record.customerId)) {
          throw new Error(`Invalid customerId in record ${index + 1}`);
        }

        // Validate products array
        if (!Array.isArray(record.products) || record.products.length === 0) {
          throw new Error(
            `Products array is required and cannot be empty in record ${index + 1}`
          );
        }

        // Calculate product totals and amounts
        const { totalAmount } = calculateProductTotals(record.products);

        const amount = parseFloat(record.amount) || 0;
        const dueAmount = Math.max(0, totalAmount - amount);

        // Calculate due date from credit days
        const creditDays = parseInt(record.creditDays) || 0;
        const dueDate =
          creditDays > 0
            ? new Date(
                new Date(record.invoiceDate).setDate(
                  new Date(record.invoiceDate).getDate() + creditDays
                )
              )
            : new Date(record.invoiceDate);

        return {
          ...record,
          customerId: new mongoose.Types.ObjectId(record.customerId),
          products: record.products.map((product) => ({
            ...product,
            salesQty: Number(product.salesQty) || 0,
            bonusQty: Number(product.bonusQty) || 0,
            sellingPrice: Number(product.sellingPrice) || 0,
            discount: Number(product.discount) || 0,
            lc: Number(product.lc) || 0,
            returnQuantity: Number(product.returnQuantity) || 0,
            usedPrice: Number(product.usedPrice) || 0,
            usedQty: Number(product.usedQty) || 0,
            usedAmount: Number(product.usedAmount) || 0,
          })),
          creditDays: creditDays,
          dueDate: dueDate,
          deliveryDate: record.deliveryDate || record.invoiceDate,
          amount: amount,
          dueAmount: dueAmount,
          totalAmount: totalAmount,
          paymentStatus: record.paymentStatus || "Pending",
          remark: record.remark || "",
        };
      })
    );

    // Save all sales return records
    const savedReturns = await SalesReturn.insertMany(processedData);

    // Update inventory with return quantities
    const inventoryUpdatePromises = processedData.flatMap((record) =>
      record.products.map(async (product) => {
        if (product.returnQuantity > 0) {
          // Find the inventory item by product name
          const inventoryItem = await ProductInventory.findOne({
            productName: product.productName
          });

          if (inventoryItem) {
            // Update the total boxes by adding return quantity
            inventoryItem.totalBoxes += product.returnQuantity;
            
            // Update the first batch or add a new batch for returned items
            if (inventoryItem.batches && inventoryItem.batches.length > 0) {
              inventoryItem.batches[0].boxes += product.returnQuantity;
              inventoryItem.batches[0].amount = inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
            } else {
              inventoryItem.batches.push({
                boxes: product.returnQuantity,
                lc: product.lc || 0.9,
                fob: 1.1,
                cif: 1.2,
                amount: product.returnQuantity * (product.lc || 0.9),
                expiryDate: new Date('2029-11-21'),
                date: new Date()
              });
            }

            // Update total amount
            inventoryItem.totalAmount = inventoryItem.batches.reduce((sum, batch) => sum + batch.amount, 0);
            
            // Update status based on stock level
            inventoryItem.status = inventoryItem.totalBoxes > inventoryItem.minStockLevel ? "In Stock" : "Out of Stock";
            
            await inventoryItem.save();
          }
        }
      })
    );

    await Promise.all(inventoryUpdatePromises);

    // Update SaleSummary: set isProductAccept = false for returned products
    const updatePromises = processedData.flatMap((record) =>
      record.products.map((product) =>
        SaleSummary.updateMany(
          {
            invoiceNumber: record.invoiceNumber,
            "products.productName": product.productName,
            customerId: record.customerId,
          },
          {
            $set: {
              "products.$.isProductAccept": false,
              "products.$.returnQuantity": product.returnQuantity,
              "products.$.usedQty": product.usedQty,
              "products.$.usedPrice": product.usedPrice,
              "products.$.usedAmount": product.usedAmount,
              "products.$.profitLoss": product.profitLoss,
              "products.$.netSellingAmount": product.netSellingAmount,
              "products.$.amount": product.amount,
              "products.$.totalQty": product.totalQty,
              "products.$.averageUnitPrice": product.averageUnitPrice,
            },
          }
        )
      )
    );

    await Promise.all(updatePromises);

    return res.status(201).json({
      message: `${savedReturns.length} sales return records saved successfully, and related sales updated.`,
      data: savedReturns,
    });
  } catch (error) {
    console.error("Error saving sales returns:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// GET - Fetch Sales Return Records
router.get("/salesreturn", async (req, res) => {
  try {
    const filters = {};

    // Add filter options
    if (req.query.invoiceNumber) {
      filters.invoiceNumber = {
        $regex: req.query.invoiceNumber,
        $options: "i",
      };
    }
    if (req.query.customerName) {
      filters.customerName = { $regex: req.query.customerName, $options: "i" };
    }
    if (req.query.mrName) {
      filters.mrName = { $regex: req.query.mrName, $options: "i" };
    }
    if (req.query.paymentStatus) {
      filters.paymentStatus = req.query.paymentStatus;
    }

    const returns = await SalesReturn.find(filters)
      .populate("customerId", "name code")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Sales return records fetched successfully.",
      data: returns,
    });
  } catch (error) {
    console.error("Error fetching sales return records:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// GET - Fetch single sales return by ID
router.get("/salesreturn/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sales return ID",
      });
    }

    const saleReturn = await SalesReturn.findById(id).populate(
      "customerId",
      "name code"
    );

    if (!saleReturn) {
      return res.status(404).json({
        success: false,
        message: "Sales return record not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: saleReturn,
    });
  } catch (error) {
    console.error("Error fetching sales return:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// PUT - Update sale product based on invoiceNumber and productName
router.put("/salesreturn/update-product", async (req, res) => {
  try {
    const { invoiceNumber, productName, salesQty, bonusQty, returnQuantity } = req.body;

    if (!invoiceNumber || !productName) {
      return res.status(400).json({
        success: false,
        message: "invoiceNumber and productName are required",
      });
    }

    // Find the sale record by invoiceNumber
    const saleRecord = await SaleSummary.findOne({ invoiceNumber });
    
    if (!saleRecord) {
      return res.status(404).json({
        success: false,
        message: "Sale record not found with the provided invoice number",
      });
    }

    // Find the specific product in the products array
    const productIndex = saleRecord.products.findIndex(
      product => product.productName === productName
    );

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in the sale record",
      });
    }

    const product = saleRecord.products[productIndex];
    
    // Update the product quantities
    const updatedSalesQty = salesQty !== undefined ? Number(salesQty) : product.salesQty;
    const updatedBonusQty = bonusQty !== undefined ? Number(bonusQty) : product.bonusQty;
    const updatedReturnQuantity = returnQuantity !== undefined ? Number(returnQuantity) : product.returnQuantity;
    
    // Calculate used quantity
    const usedQty = Math.max(0, updatedSalesQty - updatedReturnQuantity);
    
    // Calculate total quantity
    const totalQty = usedQty + updatedBonusQty;
    
    // Calculate amounts
    const amount = usedQty * product.sellingPrice;
    const netSellingAmount = amount - product.discount;
    const usedAmount = usedQty * product.sellingPrice;
    const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;
    const profitLoss = netSellingAmount - (usedQty * product.lc);

    // Update the product
    saleRecord.products[productIndex] = {
      ...product,
      salesQty: updatedSalesQty,
      bonusQty: updatedBonusQty,
      returnQuantity: updatedReturnQuantity,
      usedQty: usedQty,
      totalQty: totalQty,
      amount: amount,
      netSellingAmount: netSellingAmount,
      usedAmount: usedAmount,
      averageUnitPrice: averageUnitPrice,
      profitLoss: profitLoss,
      isProductAccept: updatedReturnQuantity > 0 ? false : product.isProductAccept
    };

    // Recalculate total amounts for the entire sale record
    const totalNetSellingAmount = saleRecord.products.reduce((sum, prod) => sum + prod.netSellingAmount, 0);
    const totalDueAmount = Math.max(0, totalNetSellingAmount - saleRecord.amount);

    saleRecord.totalAmount = totalNetSellingAmount;
    saleRecord.dueAmount = totalDueAmount;

    // Save the updated sale record
    await saleRecord.save();

    // Update inventory if return quantity changed
    if (returnQuantity !== undefined && returnQuantity > 0) {
      const inventoryItem = await ProductInventory.findOne({
        productName: productName
      });

      if (inventoryItem) {
        // Calculate the difference in return quantity
        const returnQtyDifference = returnQuantity - product.returnQuantity;
        
        if (returnQtyDifference !== 0) {
          inventoryItem.totalBoxes += returnQtyDifference;
          
          if (inventoryItem.batches && inventoryItem.batches.length > 0) {
            inventoryItem.batches[0].boxes += returnQtyDifference;
            inventoryItem.batches[0].amount = inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
          }

          inventoryItem.totalAmount = inventoryItem.batches.reduce((sum, batch) => sum + batch.amount, 0);
          inventoryItem.status = inventoryItem.totalBoxes > inventoryItem.minStockLevel ? "In Stock" : "Out of Stock";
          
          await inventoryItem.save();
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: saleRecord,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// PUT - Update a single sales return by ID
router.put("/salesreturn/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    
    // ✅ Validate main ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sales return ID",
      });
    }

    // ✅ Validate required fields
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerId",
      "customerName",
      "products",
    ];

    for (const field of requiredFields) {
      if (updatedData[field] === undefined || updatedData[field] === null) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    // ✅ Handle customerId object structure
    const customerId =
      typeof updatedData.customerId === "object"
        ? updatedData.customerId._id
        : updatedData.customerId;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customerId",
      });
    }

    // ✅ Recalculate totals using the helper function
    const { totalAmount } = calculateProductTotals(updatedData.products);

    const amount = parseFloat(updatedData.amount) || 0;
    const dueAmount = Math.max(0, totalAmount - amount);
    const creditDays = parseInt(updatedData.creditDays) || 0;

    const invoiceDate = new Date(updatedData.invoiceDate);
    const dueDate =
      creditDays > 0
        ? new Date(invoiceDate.setDate(invoiceDate.getDate() + creditDays))
        : invoiceDate;

    // ✅ Prepare sanitized update data
    const updateData = {
      ...updatedData,
      customerId: new mongoose.Types.ObjectId(customerId),
      products: updatedData.products.map((product) => ({
        ...product,
        salesQty: Number(product.salesQty) || 0,
        bonusQty: Number(product.bonusQty) || 0,
        sellingPrice: Number(product.sellingPrice) || 0,
        discount: Number(product.discount) || 0,
        lc: Number(product.lc) || 0,
        returnQuantity: Number(product.returnQuantity) || 0,
        usedPrice: Number(product.usedPrice) || 0,
        usedQty: Number(product.usedQty) || 0,
        usedAmount: Number(product.usedAmount) || 0,
        profitLoss: Number(product.profitLoss) || 0,
      })),
      creditDays,
      dueDate,
      deliveryDate: updatedData.deliveryDate || updatedData.invoiceDate,
      amount,
      dueAmount,
      totalAmount,
    };

    // ✅ Update sales return document
    const updatedReturn = await SalesReturn.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedReturn) {
      return res.status(404).json({
        success: false,
        message: "Sales return record not found",
      });
    }

    // ✅ Update inventory for returned products
    const inventoryUpdatePromises = updatedData.products.map(async (product) => {
      if (product.returnQuantity > 0) {
        const inventoryItem = await ProductInventory.findOne({
          productName: product.productName
        });

        if (inventoryItem) {
          // For update, we need to find the old record to calculate the difference
          const oldRecord = await SalesReturn.findById(id);
          const oldProduct = oldRecord.products.find(p => p.productName === product.productName);
          
          if (oldProduct) {
            const returnQtyDifference = product.returnQuantity - oldProduct.returnQuantity;
            
            if (returnQtyDifference !== 0) {
              inventoryItem.totalBoxes += returnQtyDifference;
              
              if (inventoryItem.batches && inventoryItem.batches.length > 0) {
                inventoryItem.batches[0].boxes += returnQtyDifference;
                inventoryItem.batches[0].amount = inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
              }

              inventoryItem.totalAmount = inventoryItem.batches.reduce((sum, batch) => sum + batch.amount, 0);
              inventoryItem.status = inventoryItem.totalBoxes > inventoryItem.minStockLevel ? "In Stock" : "Out of Stock";
              
              await inventoryItem.save();
            }
          }
        }
      }
    });

    await Promise.all(inventoryUpdatePromises);

    // ✅ Also update related SaleSummary entries
    await Promise.all(
      updatedData.products.map((product) =>
        SaleSummary.updateMany(
          {
            invoiceNumber: updatedData.invoiceNumber,
            "products.productName": product.productName,
            customerId: new mongoose.Types.ObjectId(customerId),
          },
          {
            $set: {
              "products.$.isProductAccept": product.returnQuantity > 0 ? false : true,
              "products.$.returnQuantity": product.returnQuantity,
              "products.$.usedQty": product.usedQty,
              "products.$.usedPrice": product.usedPrice,
              "products.$.usedAmount": product.usedAmount,
              "products.$.profitLoss": product.profitLoss,
              "products.$.netSellingAmount": product.netSellingAmount,
              "products.$.amount": product.amount,
              "products.$.totalQty": product.totalQty,
              "products.$.averageUnitPrice": product.averageUnitPrice,
            },
          }
        )
      )
    );

    return res.status(200).json({
      success: true,
      message: "Sales return updated successfully",
      data: updatedReturn,
    });
  } catch (error) {
    console.error("Error updating sales return:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// DELETE - Delete Sales Return Records by IDs
router.delete("/salesreturn", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No sale return IDs provided for deletion",
      });
    }

    const validIds = [];
    const invalidIds = [];

    ids.forEach((id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        validIds.push(new mongoose.Types.ObjectId(id));
      } else {
        invalidIds.push(id);
      }
    });

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid MongoDB ObjectId(s): ${invalidIds.join(", ")}`,
        invalidIds,
      });
    }

    // Get the records before deletion to update inventory
    const recordsToDelete = await SalesReturn.find({ _id: { $in: validIds } });

    const result = await SalesReturn.deleteMany({ _id: { $in: validIds } });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No sale returns found with the provided IDs",
      });
    }

    // Revert inventory changes
    const inventoryRevertPromises = recordsToDelete.flatMap((record) =>
      record.products.map(async (product) => {
        if (product.returnQuantity > 0) {
          const inventoryItem = await ProductInventory.findOne({
            productName: product.productName
          });

          if (inventoryItem) {
            inventoryItem.totalBoxes -= product.returnQuantity;
            
            if (inventoryItem.batches && inventoryItem.batches.length > 0) {
              inventoryItem.batches[0].boxes -= product.returnQuantity;
              inventoryItem.batches[0].amount = inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
            }

            inventoryItem.totalAmount = inventoryItem.batches.reduce((sum, batch) => sum + batch.amount, 0);
            inventoryItem.status = inventoryItem.totalBoxes > inventoryItem.minStockLevel ? "In Stock" : "Out of Stock";
            
            await inventoryItem.save();
          }
        }
      })
    );

    await Promise.all(inventoryRevertPromises);

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} sale return(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting sales return:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting sale returns",
      error: error.message,
    });
  }
});

// DELETE single sales return by ID
router.delete("/salesreturn/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid sales return ID",
    });
  }

  try {
    // Get the record before deletion to update inventory
    const recordToDelete = await SalesReturn.findById(id);

    if (!recordToDelete) {
      return res.status(404).json({
        success: false,
        message: "Sales return not found",
      });
    }

    const deleted = await SalesReturn.findByIdAndDelete(id);

    // Revert inventory changes
    const inventoryRevertPromises = recordToDelete.products.map(async (product) => {
      if (product.returnQuantity > 0) {
        const inventoryItem = await ProductInventory.findOne({
          productName: product.productName
        });

        if (inventoryItem) {
          inventoryItem.totalBoxes -= product.returnQuantity;
          
          if (inventoryItem.batches && inventoryItem.batches.length > 0) {
            inventoryItem.batches[0].boxes -= product.returnQuantity;
            inventoryItem.batches[0].amount = inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
          }

          inventoryItem.totalAmount = inventoryItem.batches.reduce((sum, batch) => sum + batch.amount, 0);
          inventoryItem.status = inventoryItem.totalBoxes > inventoryItem.minStockLevel ? "In Stock" : "Out of Stock";
          
          await inventoryItem.save();
        }
      }
    });

    await Promise.all(inventoryRevertPromises);

    res.status(200).json({
      success: true,
      message: "Sales return deleted successfully",
      data: deleted,
    });
  } catch (error) {
    console.error("Error deleting sales return:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting sales return",
      error: error.message,
    });
  }
});

router.post("/salesreturn/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    // === Validation ===
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    // === Fetch filtered Sales Return records ===
    const filteredReturns = await SalesReturn.find({
      invoiceDate: { $gte: start, $lte: end },
    })
      .populate("customerId")
      .sort({ invoiceDate: 1 });

    if (filteredReturns.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales return data found for the selected date range",
      });
    }

    // === Create Excel Workbook ===
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Return Summary");

    // === Title Rows ===
    worksheet.mergeCells("A1:AC1");
    worksheet.getCell("A1").value = "HEALTHCARE SOUTH EAST ASIA";
    worksheet.getCell("A1").font = { bold: true, size: 16 };
    worksheet.getCell("A1").alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    worksheet.mergeCells("A2:AC2");
    worksheet.getCell("A2").value = `Sales Return Summary (${formatDateToReadable(
      startDate
    )} - ${formatDateToReadable(endDate)})`;
    worksheet.getCell("A2").font = { bold: true, size: 14 };
    worksheet.getCell("A2").alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    // === Column Definitions ===
    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "recordingDate", width: 18 },
      { key: "invoiceNumber", width: 18 },
      { key: "invoiceDate", width: 18 },
      { key: "mrName", width: 18 },
      { key: "customerName", width: 25 },
      { key: "productName", width: 25 },
      { key: "salesQty", width: 10 },
      { key: "bonusQty", width: 10 },
      { key: "totalQty", width: 10 },
      { key: "sellingPrice", width: 12 },
      { key: "amount", width: 12 },
      { key: "discount", width: 10 },
      { key: "netSellingAmount", width: 25 },
      { key: "averageUnitPrice", width: 25 },
      { key: "lc", width: 10 },
      { key: "profitLoss", width: 12 },
      { key: "returnQuantity", width: 12 },
      { key: "usedQty", width: 10 },
      { key: "usedPrice", width: 12 },
      { key: "usedAmount", width: 12 },
      { key: "isProductAccept", width: 15 },
      { key: "creditDays", width: 15 },
      { key: "dueDate", width: 15 },
      { key: "deliveryDate", width: 20 },
      { key: "amount", width: 15 },
      { key: "dueAmount", width: 15 },
      { key: "totalAmount", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
    ];

    // === Header Row ===
    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "No",
      "Recording Date",
      "Invoice Number",
      "Invoice Date",
      "MR Name",
      "Customer Name",
      "Product Name",
      "Sales Qty",
      "Bonus Qty",
      "Total Qty",
      "Selling Price",
      "Amount",
      "Discount",
      "Net Selling Amount",
      "Average Unit Price",
      "LC",
      "Profit/Loss",
      "Return Quantity",
      "Used Qty",
      "Used Price",
      "Used Amount",
      "Product Accept",
      "Credit Days",
      "Due Date",
      "Delivery Date",
      "Amount",
      "Due Amount",
      "Total Amount",
      "Payment Status",
      "Remark",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    // === Add Data ===
    let index = 0;
    filteredReturns.forEach((sale) => {
      sale.products.forEach((prod) => {
        worksheet.addRow({
          no: ++index,
          recordingDate: sale.recordingDate,
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.invoiceDate,
          mrName: sale.mrName,
          customerName:
            sale.customerId?.name || sale.customerName || "Unknown Customer",
          productName: prod.productName,
          salesQty: prod.salesQty,
          bonusQty: prod.bonusQty,
          totalQty: prod.totalQty,
          sellingPrice: prod.sellingPrice,
          amount: prod.amount,
          discount: prod.discount,
          netSellingAmount: prod.netSellingAmount,
          averageUnitPrice: prod.averageUnitPrice,
          lc: prod.lc,
          profitLoss: prod.profitLoss,
          returnQuantity: prod.returnQuantity,
          usedQty: prod.usedQty,
          usedPrice: prod.usedPrice,
          usedAmount: prod.usedAmount,
          isProductAccept: prod.isProductAccept ? "Yes" : "No",
          creditDays: sale.creditDays,
          dueDate: sale.dueDate,
          deliveryDate: sale.deliveryDate,
          amount: sale.amount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          remark: sale.remark,
        });
      });
    });

    // === File Name & Response ===
    const fileName = `sales_return_summary_${formatDateToReadable(
      startDate
    )}_to_${formatDateToReadable(endDate)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error generating Sales Return Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Sales Return Excel",
      error: error.message,
    });
  }
});

export default router;