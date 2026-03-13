  import mongoose from "mongoose";
  const { Schema } = mongoose;

  // ✅ Helper to round to 4 decimals
  const roundToFour = (value) =>
    typeof value === "number"
      ? Math.round((value + Number.EPSILON) * 10000) / 10000
      : value;

  // ✅ Calculate profit/loss for a product
  const calculateProfitLoss = (sellingPrice, lc, quantity) => {
    const profit = (sellingPrice - lc) * quantity;
    return roundToFour(profit);
  };

  // ================= PRODUCT SUBSCHEMA =================
  const productSchema = new Schema(
    {
      productName: { type: String, required: true },
      originalProductName: { type: String },

      salesQty: { type: Number, required: true, set: roundToFour },
      bonusQty: { type: Number, default: 0, set: roundToFour },
      totalQty: { type: Number, required: true, set: roundToFour },

      sellingPrice: { type: Number, required: true, min: 0, set: roundToFour },
      amount: { type: Number, required: true, set: roundToFour },

      discount: { type: Number, default: 0, min: 0, set: roundToFour },
      netSellingAmount: { type: Number, required: true, set: roundToFour },
      averageUnitPrice: { type: Number, required: true, set: roundToFour },

      lc: { type: Number, required: true, set: roundToFour },

      profitLoss: { type: Number, default: 0, set: roundToFour },

      isProductAccept: { type: Boolean, default: true },
      isExchangeProduct: { type: Boolean, default: false },
      isReturnProduct: { type: Boolean, default: false },

      // ✅ MR sale purchase price (lc * (salesQty + bonusQty))
      mrSalePurchasePrice: { type: Number, default: 0, set: roundToFour },
    },
    {
      _id: true,
    }
  );

  // ================= SALE SUMMARY SCHEMA =================
  const saleSummarySchema = new Schema(
    {
      recordingDate: { type: Date, required: true },

      invoiceNumber: {
        type: String,
        required: true,
        trim: true,
        unique: true,
      },

      invoiceDate: { type: Date, required: true },

      mrName: { type: String, required: true, trim: true },

      mrId: {
        type: Schema.Types.ObjectId,
        ref: "Staff",
        required: false,
      },

      customerName: { type: String, required: true, trim: true },

      customerId: {
        type: Schema.Types.ObjectId,
        ref: "Customer",
        required: false,
      },

      customerCode: { type: String, trim: true },

      products: [productSchema],

      creditDays: { type: Number, default: 0, min: 0 },

      dueDate: { type: Date },
      deliveryDate: { type: Date },

      paidAmount: { type: Number, default: 0, min: 0, set: roundToFour },
      dueAmount: { type: Number, default: 0, set: roundToFour },
      totalAmount: { type: Number, required: true, set: roundToFour },

      paymentStatus: {
        type: String,
        enum: ["Cash", "Credit", "Partial Paid", "Paid", "Return", "Unpaid"],
        default: "Credit",
      },

      saleType: {
        type: String,
        enum: ["Normal Sale", "MR Sale"],
        default: "Normal Sale",
      },

      remark: { type: String, default: "", trim: true },

      isExchange: { type: Boolean, default: false },
      isReturn: { type: Boolean, default: false },

      importBatchId: { type: Number },
      importStatus: { type: String, default: "pending" },

      totalProfitLoss: { type: Number, default: 0, set: roundToFour },
    },
    {
      timestamps: true,
      toJSON: { virtuals: true },
      toObject: { virtuals: true },
    }
  );

  // ================= PRE-SAVE LOGIC =================
  saleSummarySchema.pre("save", function (next) {
    if (this.products && this.products.length > 0) {
      this.products.forEach((product) => {
        if (
          typeof product.salesQty === "number" &&
          typeof product.sellingPrice === "number" &&
          typeof product.lc === "number"
        ) {
          // ✅ Profit/Loss calculation
          product.profitLoss = calculateProfitLoss(
            product.sellingPrice,
            product.lc,
            product.salesQty
          );

          // ✅ MR Sale Purchase Price calculation
          product.mrSalePurchasePrice = roundToFour(
            product.lc * (product.salesQty + product.bonusQty)
          );
        }
      });

      // ✅ Total Profit/Loss
      this.totalProfitLoss = roundToFour(
        this.products.reduce((total, product) => {
          return total + (product.profitLoss || 0);
        }, 0)
      );
    }

    next();
  });

  // ================= INDEXES =================
  saleSummarySchema.index({ invoiceNumber: 1 }, { unique: true });
  saleSummarySchema.index({ customerId: 1, invoiceDate: -1 });
  saleSummarySchema.index({ mrId: 1, recordingDate: -1 });
  saleSummarySchema.index({ isExchange: 1 });
  saleSummarySchema.index({ isReturn: 1 });
  saleSummarySchema.index({ paymentStatus: 1 });
  saleSummarySchema.index({ totalProfitLoss: 1 });

  const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);

  export default SaleSummary;