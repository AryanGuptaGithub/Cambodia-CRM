import mongoose from "mongoose";

const ReportInHandSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    supplierName: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    sellingPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    batches: [
      {
        productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        default: null,
        },
        boxes: { type: Number, default: 0 },
        lc: { type: Number, default: 0 },
        sellingPrice: { type: Number, default: 0, min: 0 },
        fob: { type: Number, default: 0 },
        cif: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
        expiryDate: { type: Date },
        date: { type: Date, default: Date.now },
        adjustmentType: {
          type: String,
          enum: ["batch", "add", "remove", "return"],
          default: "batch",
        },
        adjustmentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StockAdjustment",
        },
        saleReturnId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SalesReturn",
        },
        invoiceNumber: { type: String },
      },
    ],
    totalBoxes: { type: Number, default: 0 },
    totalBoxesFromBatches: { type: Number, default: 0 },
    addStockAdjustment: { type: Number, default: 0 },
    removeStockAdjustment: { type: Number, default: 0 },
    returnStockAdjustment: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    averagePrice: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Out of Stock", "Critical", "Low Stock", "In Stock"],
      default: "In Stock",
    },
    minStockLevel: { type: Number, default: 10 },
    pendingReturns: [
      {
        saleReturnId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SalesReturn",
        },
        invoiceNumber: { type: String },
        quantity: { type: Number, default: 0 },
        originalLc: { type: Number, default: 0 },
        returnDate: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ["pending", "processed", "cancelled"],
          default: "pending",
        },
      },
    ],
    totalPendingReturnBoxes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Pre-save middleware to recalculate totals
ReportInHandSchema.pre("save", function (next) {
  console.log(`📊 [PRE-SAVE] Calculating totals for ${this.productName}`);
  console.log(`   Total batches: ${this.batches.length}`);

  // ✅ Calculate batch boxes (ONLY from purchase batches - adjustmentType "batch")
  // This should NOT include return batches
  const batchBoxes = this.batches
    .filter((batch) => batch.adjustmentType === "batch")
    .reduce((sum, batch) => sum + (batch.boxes || 0), 0);
  this.totalBoxesFromBatches = batchBoxes;
  console.log(`  - Batch boxes (from purchases only): ${batchBoxes}`);

  // Calculate add adjustments
  this.addStockAdjustment = this.batches
    .filter((batch) => batch.adjustmentType === "add")
    .reduce((sum, batch) => sum + (batch.boxes || 0), 0);
  console.log(`  - Add adjustments: ${this.addStockAdjustment}`);

  // Calculate remove adjustments (sales)
  this.removeStockAdjustment = this.batches
    .filter((batch) => batch.adjustmentType === "remove")
    .reduce((sum, batch) => sum + (batch.boxes || 0), 0);
  console.log(`  - Remove adjustments (sales): ${this.removeStockAdjustment}`);

  // ✅ Calculate return adjustments (sales returns) - SEPARATE tracking
  this.returnStockAdjustment = this.batches
    .filter((batch) => batch.adjustmentType === "return")
    .reduce((sum, batch) => sum + (batch.boxes || 0), 0);
  console.log(`  - Return adjustments: ${this.returnStockAdjustment}`);

  // ✅ Total boxes = original batches + additions - removals + returns
  // This is the ACTUAL physical stock in warehouse
  this.totalBoxes =
    this.totalBoxesFromBatches +
    this.addStockAdjustment -
    this.removeStockAdjustment +
    this.returnStockAdjustment;
  console.log(`  - Total boxes (physical stock): ${this.totalBoxes}`);

  // Calculate total amount including returns
  // Only include batch and return amounts (add/remove don't have amounts)
  let totalAmount = 0;
  let totalQuantityForAvg = 0;

  // Add amounts from batch entries (purchases)
  for (const batch of this.batches) {
    if (batch.adjustmentType === "batch") {
      const boxes = batch.boxes || 0;
      const lc = batch.lc || 0;
      const batchAmount = boxes * lc;
      batch.amount = batchAmount;
      totalAmount += batchAmount;
      totalQuantityForAvg += boxes;
      console.log(`    Batch: ${boxes} boxes @ LC ${lc} = ${batchAmount}`);
    }
  }

  // Add amounts from return entries (returns come back to stock)
  for (const batch of this.batches) {
    if (batch.adjustmentType === "return") {
      const boxes = batch.boxes || 0;
      const lc = batch.lc || 0;
      const returnAmount = boxes * lc;
      batch.amount = returnAmount;
      totalAmount += returnAmount;
      totalQuantityForAvg += boxes;
      console.log(`    Return: ${boxes} boxes @ LC ${lc} = ${returnAmount}`);
    }
  }

  this.totalAmount = totalAmount;
  this.averagePrice =
    totalQuantityForAvg > 0 ? totalAmount / totalQuantityForAvg : 0;
  console.log(`  - Total amount: ${this.totalAmount}`);
  console.log(`  - Average price: ${this.averagePrice}`);

  // Calculate total pending return boxes
  this.totalPendingReturnBoxes = this.pendingReturns
    .filter((pr) => pr.status === "pending")
    .reduce((sum, pr) => sum + (pr.quantity || 0), 0);
  console.log(`  - Pending returns: ${this.totalPendingReturnBoxes}`);

  // Update status based on stock level
  if (this.totalBoxes <= 0) {
    this.status = "Out of Stock";
  } else if (this.totalBoxes <= this.minStockLevel * 0.3) {
    this.status = "Critical";
  } else if (this.totalBoxes <= this.minStockLevel) {
    this.status = "Low Stock";
  } else {
    this.status = "In Stock";
  }
  console.log(`  - Status: ${this.status}`);

  next();
});

// Method to add a sale return
ReportInHandSchema.methods.addSaleReturn = async function (
  returnQuantity,
  invoiceNumber,
  saleReturnId,
  originalLc,
) {
  console.log(`📦 [addSaleReturn] Adding return for ${this.productName}`);
  console.log(`  - Quantity: ${returnQuantity}`);
  console.log(`  - Invoice: ${invoiceNumber}`);
  console.log(`  - Sale Return ID: ${saleReturnId}`);
  console.log(`  - Original LC provided: ${originalLc}`);
  console.log(`  - Current average price: ${this.averagePrice}`);
  console.log(
    `  - Current totalBoxesFromBatches: ${this.totalBoxesFromBatches}`,
  );
  console.log(
    `  - Current returnStockAdjustment: ${this.returnStockAdjustment}`,
  );
  console.log(`  - Current totalBoxes: ${this.totalBoxes}`);
  console.log(`  - Current totalAmount: ${this.totalAmount}`);

  // Use the provided LC or current average price
  const returnLc = originalLc || this.averagePrice || 1.2;
  const returnAmount = returnQuantity * returnLc;

  console.log(`  - Using return LC: ${returnLc}`);
  console.log(`  - Return amount to add: ${returnAmount}`);

  // Add return as a new batch entry with adjustmentType "return"
  // This will NOT affect totalBoxesFromBatches (only "batch" type affects that)
  this.batches.push({
    boxes: returnQuantity,
    lc: returnLc,
    amount: returnAmount,
    adjustmentType: "return",
    date: new Date(),
    saleReturnId: saleReturnId,
    invoiceNumber: invoiceNumber,
  });
  console.log(`  ✅ Added return batch to batches array`);

  // Add to pending returns
  this.pendingReturns.push({
    saleReturnId: saleReturnId,
    invoiceNumber: invoiceNumber,
    quantity: returnQuantity,
    originalLc: returnLc,
    status: "pending",
    returnDate: new Date(),
  });
  console.log(`  ✅ Added to pending returns`);

  // Save will trigger pre-save middleware to recalculate totals
  await this.save();

  console.log(`  ✅ After save:`);
  console.log(`     - totalBoxesFromBatches: ${this.totalBoxesFromBatches}`);
  console.log(`     - returnStockAdjustment: ${this.returnStockAdjustment}`);
  console.log(`     - totalBoxes: ${this.totalBoxes}`);
  console.log(`     - totalAmount: ${this.totalAmount}`);

  return this;
};

// Method to process a pending return
ReportInHandSchema.methods.processPendingReturn = async function (
  pendingReturnId,
) {
  console.log(
    `📦 [processPendingReturn] Processing pending return for ${this.productName}`,
  );
  console.log(`  - Pending Return ID: ${pendingReturnId}`);

  const pendingReturn = this.pendingReturns.id(pendingReturnId);
  if (!pendingReturn) {
    throw new Error("Pending return not found");
  }

  console.log(
    `  - Found pending return: ${pendingReturn.invoiceNumber}, Quantity: ${pendingReturn.quantity}`,
  );

  pendingReturn.status = "processed";
  console.log(`  - Status changed to "processed"`);

  await this.save();
  console.log(`  ✅ Pending return processed successfully`);

  return this;
};

// Method to get pending returns for dropdown
ReportInHandSchema.methods.getPendingReturnsForDropdown = function () {
  const pending = this.pendingReturns
    .filter((pr) => pr.status === "pending")
    .map((pr) => ({
      id: pr._id,
      saleReturnId: pr.saleReturnId,
    invoiceNumber: pr.invoiceNumber,
      quantity: pr.quantity,
      returnDate: pr.returnDate,
      displayText: `${pr.invoiceNumber} - ${pr.quantity} boxes (${new Date(pr.returnDate).toLocaleDateString()})`,
    }));

  console.log(
    `📦 [getPendingReturnsForDropdown] Found ${pending.length} pending returns for ${this.productName}`,
  );
  return pending;
};

export default mongoose.model("ReportInHand", ReportInHandSchema);
