router.post("/import-with-stock-deduction", async (req, res) => {
  let sessionId = null;
  try {
    const { invoices, skipDuplicates = true } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];
    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }
    // Check if another import is already in progress
    if (isImportInProgress) {
      return res.status(429).json({
        success: false,
        message: "Another import is already in progress. Please wait.",
        retryAfter: 30,
      });
    }
    isImportInProgress = true;
    // Create session for import progress
    sessionId = `import_stock_deduction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    importProgressMap.set(sessionId, {
      sessionId,
      totalInvoices: invoiceData.length,
      processedInvoices: 0,
      successful: 0,
      failed: 0,
      skippedDuplicates: 0,
      progressPercentage: 0,
      startTime: Date.now(),
      lastUpdated: Date.now(),
      completed: false,
      errors: [],
      status: "initializing",
      importType: "stock_deduction",
    });
    // Start import immediately
    processImportWithStockDeduction(sessionId, invoiceData, skipDuplicates)
      .catch(error => {
        const progress = importProgressMap.get(sessionId);
        if (progress) {
          progress.status = "failed";
          progress.errors.push({
            message: "Import process failed unexpectedly",
            error: error.message,
            timestamp: new Date().toISOString()
          });
          progress.lastUpdated = Date.now();
        }
      })
      .finally(() => {
        isImportInProgress = false;
      });
    res.json({
      success: true,
      message: "Import with stock deduction started",
      sessionId,
      totalInvoices: invoiceData.length,
      note: "Stock will be deducted from ReportInHand for each sale",
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      startTime: new Date().toISOString(),
    });
  } catch (error) {
    if (sessionId) importProgressMap.delete(sessionId);
    isImportInProgress = false;
    res.status(500).json({
      success: false,
      message: "Import failed to start",
      error: error.message,
    });
  }
});

const processImportWithStockDeduction = async (
  sessionId,
  invoices,
  skipDuplicates = true
) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) {
    return;
  }
  const errors = [];
  let successful = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  progress.status = "processing";
  progress.startTime = Date.now();
  progress.lastUpdated = Date.now();
  try {
    // Process invoices ONE AT A TIME sequentially to avoid stock conflicts
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      try {
        // Validate invoice before processing
        if (!invoice.invoiceNumber?.trim()) {
          throw new Error("Invoice number is required");
        }
        // Skip duplicate check if enabled
        if (skipDuplicates) {
          const existingInvoice = await SaleSummary.findOne({
            invoiceNumber: invoice.invoiceNumber.trim(),
          });
          if (existingInvoice) {
            skippedDuplicates++;
            // Update progress for skipped invoice
            progress.processedInvoices = i + 1;
            progress.skippedDuplicates = skippedDuplicates;
            progress.progressPercentage = Math.round(
              ((i + 1) / progress.totalInvoices) * 100
            );
            progress.lastUpdated = Date.now();
            continue;
          }
        }
        // Process invoice with stock deduction - WAIT for completion before next invoice
        const result = await processSingleInvoiceWithStockDeduction(invoice, i);
        if (result.success) {
          successful++;
        } else {
          failed++;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error) {
        failed++;
        errors.push({
          row: i + 2,
          invoiceNumber: invoice.invoiceNumber || "Unknown",
          message: error.message,
          type: "unexpected_error",
          timestamp: new Date().toISOString()
        });
      }
      // Update progress after EACH invoice completes
      progress.processedInvoices = i + 1;
      progress.successful = successful;
      progress.failed = failed;
      progress.skippedDuplicates = skippedDuplicates;
      progress.progressPercentage = Math.round(
        ((i + 1) / progress.totalInvoices) * 100
      );
      progress.lastUpdated = Date.now();
    }
    // Mark import as completed
    progress.completed = true;
    progress.endTime = Date.now();
    progress.totalTime = progress.endTime - progress.startTime;
    progress.errors = errors;
    progress.status = "completed";
  } catch (error) {
    // Update progress with critical error
    progress.status = "failed";
    progress.errors.push({
      message: "Critical error in import process",
      error: error.message,
      timestamp: new Date().toISOString()
    });
    progress.lastUpdated = Date.now();
  }
};

const processSingleInvoiceWithStockDeduction = async (invoiceData, index) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }
    // Check for duplicate invoice
    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: invoiceData.invoiceNumber.trim(),
    }).session(session);
    if (existingInvoice) {
      await session.abortTransaction();
      await session.endSession();
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
    // CRITICAL: Check stock within the SAME session to get current/locked data
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;
      // Find stock item WITHIN THE SESSION to ensure we get current locked data
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${normalizeProductName(productName)}$`, "i") },
      }).session(session);
      if (!stockItem) {
        throw new Error(`Product "${productName}" not found in inventory`);
      }
      // Calculate available stock - PREFER sum from batches for accuracy
      let availableStock = 0;
      // Always sum from batches if they exist (source of truth)
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        stockItem.batches.forEach((batch) => {
          const batchQty = fixPrecision(Number(batch.boxes || batch.quantity || 0));
          if (batchQty > 0) {
            availableStock = fixPrecision(availableStock + batchQty);
          }
        });
      }
      // If batches sum is 0 or no batches, fall back to totalBoxesFromBatches
      if (availableStock <= 0 && stockItem.totalBoxesFromBatches && stockItem.totalBoxesFromBatches > 0) {
        availableStock = fixPrecision(Number(stockItem.totalBoxesFromBatches));
      }
      // If still 0, fall back to totalBoxes
      if (availableStock <= 0 && stockItem.totalBoxes && stockItem.totalBoxes > 0) {
        availableStock = fixPrecision(Number(stockItem.totalBoxes));
      }
      // Apply adjustments
      let totalAdjustments = 0;
      if (stockItem.addStockAdjustment) {
        totalAdjustments = fixPrecision(totalAdjustments + fixPrecision(Number(stockItem.addStockAdjustment)));
      }
      if (stockItem.removeStockAdjustment) {
        totalAdjustments = fixPrecision(totalAdjustments - fixPrecision(Number(stockItem.removeStockAdjustment)));
      }
      const finalStock = fixPrecision(Math.max(0, availableStock + totalAdjustments));
      if (finalStock < totalQty) {
        const shortage = fixPrecision(totalQty - finalStock);
        console.log(
          `❌ INSUFFICIENT STOCK - Invoice: ${invoiceData.invoiceNumber} | Product: "${productName}" | Required: ${totalQty} | Available: ${finalStock} | Short by: ${shortage}`,
        );
        throw new Error(
          `Insufficient stock for ${productName}. Required: ${totalQty}, Available: ${finalStock}, Short by: ${shortage}`
        );
      }
    }
    const processedProducts = [];
    let totalAmount = 0;
    const stockDeductionResults = [];
    // SECOND: Process products and deduct stock
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;
      // Find product to get LC value
      const productRecord = await Product.findOne({
        productName: { $regex: new RegExp(`^${normalizeProductName(productName)}$`, "i") },
      }).session(session);
      const lc = productRecord?.lc || 0;
      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = parseFloat(product.discount) || 0;
      const netSellingAmount = amount - discount;
      // Add to processed products
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
      // Deduct stock - pass the session so it uses the SAME transaction
      const deductionResult = await deductStockFromReportInHand(
        productName,
        salesQty,
        bonusQty,
        invoiceData.invoiceNumber,
        session // Pass existing session instead of creating new one
      );
      stockDeductionResults.push({ product: productName, ...deductionResult });
      if (!deductionResult.success) {
        throw new Error(
          `Stock deduction failed for ${productName}: ${deductionResult.message}`
        );
      }
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
      invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: invoiceData.customerName?.trim() || "Unknown Customer",
      customerCode: invoiceData.customerCode || "",
      customerId: invoiceData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate ? new Date(invoiceData.deliveryDate) : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: processedProducts.reduce(
        (sum, p) => sum + (p.profitLoss || 0),
        0,
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
    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
    };
  } catch (error) {
    try {
      if (session.transaction?.isActive) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      // Silent fail
    }
    try {
      await session.endSession();
    } catch (endError) {
      // Silent fail
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