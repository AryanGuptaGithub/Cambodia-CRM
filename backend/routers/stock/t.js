const recomputeMRStock = async (mrId, mrName, session) => {
  if (!mrId && !mrName) return;

  const cleanedMrName = mrName?.replace(/\s+/g, " ").trim() || "";

  const orConditions = [];
  if (mrId) {
    try {
      orConditions.push({ mrId: new mongoose.Types.ObjectId(mrId.toString()) });
    } catch {
      orConditions.push({ mrId });
    }
  }
  if (cleanedMrName) {
    orConditions.push({
      stockTransferToMr: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
    });
    orConditions.push({
      stockTransferFromMrToMain: {
        $regex: new RegExp(`^${cleanedMrName}$`, "i"),
      },
    });
    orConditions.push({
      mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
    });
  }
  if (orConditions.length === 0) return;

  // Sort by createdAt ascending so we process transfers in order
  const allTransfers = await StockTransferToMR.find({ $or: orConditions })
    .sort({ createdAt: 1 })
    .session(session);

  const productMap = new Map();

  for (const transfer of allTransfers) {
    if (!Array.isArray(transfer.items)) continue;

    for (const item of transfer.items) {
      const key = item.productId?.toString();
      if (!key) continue;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: item.productId,
          productName: item.productName || "Unknown",
          lc: item.lc || 0,
          sellingPrice: item.sellingPrice || 0,
          assignedQuantity: 0,
          quantity: 0,
          lastUpdated: transfer.updatedAt || transfer.createdAt || new Date(),
        });
      }

      const entry = productMap.get(key);

      if (item.lc) entry.lc = item.lc;
      if (item.sellingPrice) entry.sellingPrice = item.sellingPrice;
      if (item.productName) entry.productName = item.productName;

      const transferDate = transfer.updatedAt || transfer.createdAt || new Date();
      if (new Date(transferDate) > new Date(entry.lastUpdated)) {
        entry.lastUpdated = transferDate;
      }

      if (transfer.transferType === "send") {
        // Add to both quantity and assignedQuantity
        entry.assignedQuantity += item.boxQuantity || 0;
        entry.quantity += item.boxQuantity || 0;
      } else if (transfer.transferType === "receive") {
        // Subtract from both — MR is returning stock back to main
        const receiveQty = item.boxQuantity || 0;
        entry.quantity = Math.max(0, entry.quantity - receiveQty);
        entry.assignedQuantity = Math.max(0, entry.assignedQuantity - receiveQty);

        // If fully returned, force both to zero explicitly
        if (entry.quantity <= 0) {
          entry.quantity = 0;
          entry.assignedQuantity = 0;
        }
      }
    }
  }

  // Find existing stockInMRHand document
  let existingMRStock = null;
  if (mrId) {
    try {
      existingMRStock = await stockInMRHand
        .findOne({ mrId: new mongoose.Types.ObjectId(mrId.toString()) })
        .session(session);
    } catch {
      existingMRStock = await stockInMRHand.findOne({ mrId }).session(session);
    }
  }
  if (!existingMRStock && cleanedMrName) {
    existingMRStock = await stockInMRHand
      .findOne({ mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") } })
      .session(session);
  }

  // Build final product list — ONLY include products with quantity > 0
  const finalProducts = [];

  for (const [, entry] of productMap.entries()) {
    // STRICT FILTER: skip products with zero or negative quantity
    if (entry.quantity <= 0) continue;

    const lc = entry.lc || 0;
    const sellingPrice = entry.sellingPrice || 0;
    const finalQty = entry.quantity;
    const finalAssignedQty = entry.assignedQuantity;

    finalProducts.push({
      productId: entry.productId,
      productName: entry.productName,
      quantity: finalQty,
      assignedQuantity: finalAssignedQty,
      lc,
      sellingPrice,
      amount: lc * finalQty,
      productCost: Math.ceil(lc * finalQty),
      lastUpdated: entry.lastUpdated,
    });
  }

  const newTotalAmount = finalProducts.reduce((s, p) => s + (p.amount || 0), 0);
  const newTotalProductCost = finalProducts.reduce(
    (s, p) => s + (p.productCost || 0),
    0,
  );

  if (!existingMRStock) {
    if (finalProducts.length > 0) {
      const newMRStock = new stockInMRHand({
        mrId: mrId || undefined,
        mrName: cleanedMrName,
        productsInHand: finalProducts,
        totalAmount: newTotalAmount,
        totalProductCost: newTotalProductCost,
      });
      await newMRStock.save({ session });
      return newMRStock;
    }
  } else {
    if (mrId && !existingMRStock.mrId) existingMRStock.mrId = mrId;
    // REPLACE entire productsInHand with freshly computed list
    existingMRStock.productsInHand = finalProducts;
    existingMRStock.totalAmount = newTotalAmount;
    existingMRStock.totalProductCost = newTotalProductCost;
    await existingMRStock.save({ session });
    return existingMRStock;
  }
};