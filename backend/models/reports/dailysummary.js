// models/dailysummary.js
import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  salesQuantity: { type: Number, default: 0 },
  bonusQuantity: { type: Number, default: 0 },
  totalQuantity: {
    type: Number,
    default: function () {
      return this.salesQuantity + this.bonusQuantity;
    },
  },
  value: { type: Number, default: 0 },
});

const dailySummarySchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },
  products: [productSchema],
  totalDayQuantity: { type: Number, default: 0 },
});

export const DailySummary = mongoose.model("DailySummary", dailySummarySchema);

