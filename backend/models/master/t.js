// Add this function for proper stock deduction
const deductStockFromReportInHandWithMatching = async (productName, salesQty, bonusQty) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const totalRequiredQty = fixPrecision(salesQty + bonusQty);
    
    if (totalRequiredQty <= 0) {
      await session.commitTransaction();
      session.endSession();
      return { success: true, deducted: 0, remaining: 0 };
    }

    console.log(`\n📦 Attempting to deduct stock: "${productName}"`);
    console.log(`   Required: ${totalRequiredQty} (Sales: ${salesQty}, Bonus: ${bonusQty})`);

    // FIRST: Find the product in ReportInHand with exact matching
    const stockResult = await calculateProductStock(productName, totalRequiredQty);
    
    if (!stockResult.success || !stockResult.found) {
      console.log(`❌ Cannot deduct: ${stockResult.message}`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Product "${productName}" not found in inventory`
      };
    }

    if (!stockResult.hasEnoughStock) {
      console.log(`❌ Insufficient stock: ${stockResult.message}`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: stockResult.insufficientQty,
        message: stockResult.message
      };
    }

    const actualProductName = stockResult.productName;
    console.log(`   ✅ Found: "${actualProductName}" with ${stockResult.availableStock} units available`);

    // Find the stock item in ReportInHand
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizeProductName(actualProductName))
    }).session(session);

    if (!stockItem) {
      console.log(`❌ Stock item not found in ReportInHand: "${actualProductName}"`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Stock record not found for "${actualProductName}"`
      };
    }

    // Check if we have batches
    if (!stockItem.batches || !Array.isArray(stockItem.batches) || stockItem.batches.length === 0) {
      console.log(`❌ No batches found for product: "${actualProductName}"`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `No stock batches found for "${actualProductName}"`
      };
    }

    // Sort batches by expiry date (oldest first - FIFO)
    const sortedBatches = [...stockItem.batches].sort((a, b) => {
      const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date('9999-12-31');
      const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date('9999-12-31');
      return dateA - dateB;
    });

    let remainingToDeduct = totalRequiredQty;
    let totalDeducted = 0;
    const updatedBatches = [];
    const deductionDetails = [];

    console.log(`   Sorting ${sortedBatches.length} batches by expiry (oldest first)`);

    // Deduct from batches
    for (const batch of sortedBatches) {
      if (remainingToDeduct <= 0) break;

      const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
      
      if (batchQty > 0) {
        const deductFromThisBatch = fixPrecision(Math.min(batchQty, remainingToDeduct));
        const remainingInBatch = fixPrecision(batchQty - deductFromThisBatch);
        
        console.log(`   - Batch ${batch.batchNumber || 'N/A'}: ${batchQty} -> ${remainingInBatch} (deducting ${deductFromThisBatch})`);

        if (remainingInBatch > 0) {
          // Update batch with remaining quantity
          updatedBatches.push({
            ...batch,
            boxes: remainingInBatch,
            quantity: remainingInBatch,
            amount: fixPrecision(remainingInBatch * (batch.lc || 0.71))
          });
        } // If batch is completely used up (0 remaining), don't add it back

        totalDeducted = fixPrecision(totalDeducted + deductFromThisBatch);
        remainingToDeduct = fixPrecision(remainingToDeduct - deductFromThisBatch);

        deductionDetails.push({
          batchNumber: batch.batchNumber,
          originalQty: batchQty,
          deducted: deductFromThisBatch,
          remainingInBatch: remainingInBatch,
          expiryDate: batch.expiryDate
        });
      } else {
        // Skip batches with 0 quantity
        continue;
      }
    }

    // Add any untouched batches (with positive quantity)
    for (const batch of sortedBatches) {
      const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
      const alreadyProcessed = deductionDetails.some(d => d.batchNumber === batch.batchNumber);
      
      if (!alreadyProcessed && batchQty > 0) {
        updatedBatches.push(batch);
      }
    }

    // Verify deduction
    if (remainingToDeduct > 0.001) {
      console.log(`❌ Failed to deduct full quantity. Only deducted ${totalDeducted} of ${totalRequiredQty}`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: totalDeducted,
        remaining: remainingToDeduct,
        message: `Could only deduct ${totalDeducted} of ${totalRequiredQty} units`,
        details: deductionDetails
      };
    }

    // Calculate new total from updated batches
    const newTotalFromBatches = updatedBatches.reduce((sum, batch) => {
      return fixPrecision(sum + fixPrecision(batch.boxes || batch.quantity || 0));
    }, 0);

    // Update stock item
    stockItem.batches = updatedBatches;
    stockItem.totalBoxes = fixPrecision(newTotalFromBatches);
    stockItem.updatedAt = new Date();

    await stockItem.save({ session });

    console.log(`✅ Successfully deducted ${totalDeducted} units from "${actualProductName}"`);
    console.log(`   New total stock: ${newTotalFromBatches} units`);

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      deducted: totalDeducted,
      remaining: 0,
      newStockLevel: newTotalFromBatches,
      message: `Successfully deducted ${totalDeducted} units from "${actualProductName}"`,
      details: deductionDetails
    };

  } catch (error) {
    console.error(`❌ Error in stock deduction for "${productName}":`, error);
    
    try {
      if (session.transaction && session.transaction.isActive) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error("Error aborting transaction:", abortError);
    }
    
    try {
      await session.endSession();
    } catch (endError) {
      console.error("Error ending session:", endError);
    }

    return {
      success: false,
      deducted: 0,
      remaining: salesQty + bonusQty,
      message: `Stock deduction failed: ${error.message}`,
      error: error.message
    };
  }
};

// Replace the existing processSingleInvoiceWithStockDeduction function with this updated version:
const processSingleInvoiceWithStockDeduction = async (invoiceData, index) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log(`\n🔄 Processing invoice ${index}: ${invoiceData.invoiceNumber || 'No invoice number'}`);
    
    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: invoiceData.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      console.warn(`⚠️ Skipping duplicate invoice: ${invoiceData.invoiceNumber}`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        error: {
          row: index + 2,
          invoiceNumber: invoiceData.invoiceNumber,
          message: `Invoice number ${invoiceData.invoiceNumber} already exists`,
          type: "duplicate_error",
        },
      };
    }

    const processedProducts = [];
    let totalAmount = 0;
    const stockDeductionResults = [];

    // FIRST: Check if we have enough stock for all products
    console.log(`📋 Checking stock for ${invoiceData.products?.length || 0} products...`);
    
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalQty <= 0) {
        console.log(`   ⏭️ Skipping ${productName || 'unnamed product'} (quantity: ${totalQty})`);
        continue;
      }

      console.log(`   🔍 Checking stock for "${productName}" (Qty: ${totalQty})`);
      
      const stockCheck = await calculateProductStock(productName, totalQty);
      
      if (!stockCheck.success || !stockCheck.found) {
        console.log(`   ❌ Product not found: "${productName}"`);
        throw new Error(`Product "${productName}" not found in inventory`);
      }

      if (!stockCheck.hasEnoughStock) {
        console.log(`   ❌ Insufficient stock: ${stockCheck.message}`);
        throw new Error(stockCheck.message);
      }

      console.log(`   ✅ Stock available: ${stockCheck.availableStock} units`);
    }

    // SECOND: Process products and deduct stock
    console.log(`💾 Processing products and deducting stock...`);
    
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalQty <= 0) continue;

      // Find product to get LC value
      const productRecord = await Product.findOne({
        productName: buildProductNameRegex(normalizeProductName(productName))
      }).session(session);

      const lc = productRecord?.lc || 0;
      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = parseFloat(product.discount) || 0;
      const netSellingAmount = amount - discount;

      // Process the sale record
      processedProducts.push({
        productName: productName,
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: totalQty ? netSellingAmount / totalQty : 0,
        lc,
        profitLoss: (sellingPrice - lc) * salesQty,
        isProductAccept: true,
      });

      totalAmount += netSellingAmount;

      // Deduct stock from ReportInHand
      console.log(`   📉 Deducting stock for "${productName}"...`);
      const deductionResult = await deductStockFromReportInHandWithMatching(
        productName,
        salesQty,
        bonusQty
      );

      stockDeductionResults.push({
        product: productName,
        ...deductionResult
      });

      if (!deductionResult.success) {
        console.log(`   ❌ Stock deduction failed: ${deductionResult.message}`);
        throw new Error(
          `Stock deduction failed for ${productName}: ${deductionResult.message}`
        );
      }

      console.log(`   ✅ Stock deducted successfully`);
    }

    if (processedProducts.length === 0) {
      throw new Error("No valid products found in invoice");
    }

    // Create the sale record
    const paidAmount = parseFloat(invoiceData.paidAmount) || 0;
    const dueAmount = Math.max(0, totalAmount - paidAmount);

    const saleRecord = new SaleSummary({
      recordingDate: new Date(invoiceData.recordingDate || Date.now()),
      invoiceNumber: invoiceData.invoiceNumber.trim(),
      invoiceDate: invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate)
        : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: invoiceData.customerName?.trim() || "Unknown Customer",
      customerCode: invoiceData.customerCode || "",
      customerId: invoiceData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? new Date(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: processedProducts.reduce(
        (sum, p) => sum + (p.profitLoss || 0),
        0
      ),
      paymentStatus: mapPaymentStatus(invoiceData.paymentStatus),
      remark: invoiceData.remark || "",
      stockDeductionResults,
      importSource: "excel_import_with_stock_deduction",
      importTimestamp: new Date(),
    });

    await saleRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    console.log(`✅ Invoice processed successfully: ${invoiceData.invoiceNumber}`);

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
    };
  } catch (error) {
    console.error(`❌ Error processing invoice at index ${index}:`, error.message);
    
    try {
      if (session.transaction && session.transaction.isActive) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error("Error aborting transaction:", abortError);
    }
    
    try {
      await session.endSession();
    } catch (endError) {
      console.error("Error ending session:", endError);
    }

    return {
      success: false,
      error: {
        row: index + 2,
        invoiceNumber: invoiceData.invoiceNumber || "Unknown",
        message: error.message,
        type: "processing_error",
      },
    };
  }
};

// Update the main import endpoint to use stock deduction

// Update the processImportWithStockDeduction function


// Also update the regular import endpoint to use stock deduction by default

// Add endpoint to check stock before import


// Add a function to help debug stock issues


// Export router
export default router;