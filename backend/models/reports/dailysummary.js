const dailySalesSchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },

  salesQtyAsOf: { type: Number, default: 0 },
  bonusQtyAsOf: { type: Number, default: 0 },
  totalQtyAsOf: { type: Number, default: 0 },

  products: [
    {
      productName: { type: String, required: true },
      salesQuantity: { type: Number, default: 0 },
      bonusQuantity: { type: Number, default: 0 },
      totalQuantity: {
        type: Number,
        default: function () {
          return this.salesQuantity + this.bonusQuantity;
        },
      },
    }
  ],

  totalDayQuantity: { type: Number, default: 0 }
});
