import mongoose from "mongoose";

const returnItemSchema = new mongoose.Schema(
  {
    stockRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockInMrHand",
      required: true,
    },
    productId: {
      type: String,
      required: true,
    },
    productCode: {
      type: String,
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    batch: {
      type: String,
      required: true,
    },
    expiry: Date,
    returnQty: {
      type: Number,
      required: true,
      min: 1,
    },
    returnDate: {
      type: Date,
      required: true,
    },
    remarks: String,
    costPrice: Number,
    unit: String,
  },
  { _id: true }
);

const stockReturnSchema = new mongoose.Schema(
  {
    returnId: {
      type: String,
      unique: true,
      required: true,
    },
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MR",
      required: true,
    },
    mrCode: {
      type: String,
      required: true,
    },
    mrName: {
      type: String,
      required: true,
    },
    returnDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    items: [returnItemSchema],
    totalItems: {
      type: Number,
      required: true,
      default: 0,
    },
    totalQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    totalValue: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Completed", "Cancelled"],
      default: "Pending",
    },
    remarks: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: Date,
    rejectedReason: String,
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-save middleware to generate return ID
stockReturnSchema.pre("save", async function (next) {
  if (this.isNew) {
    const prefix = "SR";
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, "0");

    // Find the last return for this month
    const lastReturn = await this.constructor
      .findOne({
        returnId: new RegExp(`^${prefix}${year}${month}`),
      })
      .sort({ returnId: -1 });

    let sequence = 1;
    if (lastReturn && lastReturn.returnId) {
      const lastSeq = parseInt(lastReturn.returnId.slice(-4));
      sequence = lastSeq + 1;
    }

    this.returnId = `${prefix}${year}${month}${sequence
      .toString()
      .padStart(4, "0")}`;

    // Calculate totals
    this.totalItems = this.items.length;
    this.totalQuantity = this.items.reduce(
      (sum, item) => sum + item.returnQty,
      0
    );
    this.totalValue = this.items.reduce((sum, item) => {
      return sum + item.returnQty * (item.costPrice || 0);
    }, 0);
  }
  next();
});

// Indexes for better query performance
stockReturnSchema.index({ returnId: 1 });
stockReturnSchema.index({ mrCode: 1 });
stockReturnSchema.index({ mrName: 1 });
stockReturnSchema.index({ status: 1 });
stockReturnSchema.index({ returnDate: -1 });
stockReturnSchema.index({ createdAt: -1 });
stockReturnSchema.index({ isDeleted: 1 });

// Virtual for formatted return date
stockReturnSchema.virtual("formattedReturnDate").get(function () {
  return this.returnDate.toISOString().split("T")[0];
});

// Soft delete method
stockReturnSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  await this.save();
};

const StockReturn = mongoose.model("StockReturn", stockReturnSchema);

export default StockReturn;
