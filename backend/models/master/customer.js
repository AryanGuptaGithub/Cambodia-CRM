import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      unique: true,
      required: true,
    }, // Auto-incremented Customer Code

    date: { type: Date },
    medicalRepName: { type: String },
    name: { type: String, required: false },
    typeOfBusiness: { type: String },
    customerNumber: { type: String },
    address: { type: String },
    zone: { type: String },
    province: { type: String },
    remark: { type: String },
    isNew: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// ✅ Add indexes for better performance
customerSchema.index({ province: 1 });
customerSchema.index({ isNew: 1 });
customerSchema.index({ medicalRepName: 1 });
customerSchema.index({ zone: 1 });

// ✅ Auto-increment logic before saving
customerSchema.pre("save", async function (next) {
  if (this.isNew) {
    const lastCustomer = await mongoose
      .model("Customer")
      .findOne({})
      .sort({ createdAt: -1 })
      .select("customerCode");

    let nextCode = 1;

    if (lastCustomer && lastCustomer.customerCode) {
      const parsed = parseInt(lastCustomer.customerCode, 10);
      if (!isNaN(parsed)) nextCode = parsed + 1;
    }

    this.customerCode = nextCode.toString().padStart(4, "0"); 
  }

  next();
});

export default mongoose.model("Customer", customerSchema);
