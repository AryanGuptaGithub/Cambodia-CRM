import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      required: true,
      unique: true,        // Keep this – it's your business identifier
      trim: true,
      index: true,
      default: function() {
        return "00001";
      }
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    medicalRepName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    medicalRepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff"
    },
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    typeOfBusiness: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    customerNumber: {
      type: String,
      trim: true,
      // unique: true,   // <-- REMOVED – this was causing duplicate null errors
      //sparse: true      // optional – can stay
    },
    address: {
      type: String,
      trim: true,
      lowercase: true,
      default: ""
    },
    zone: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    province: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    remark: {
      type: String,
      trim: true,
      lowercase: true,
      default: ""
    },
    enabled: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound indexes for performance
customerSchema.index({ name: 1, customerNumber: 1 });
customerSchema.index({ province: 1, zone: 1 });
customerSchema.index({ medicalRepName: 1 });
customerSchema.index({ enabled: 1 });

// Pre-save middleware to ensure customerCode is 5 digits
customerSchema.pre("save", async function(next) {
  if (this.isNew && !this.customerCode) {
    try {
      const lastCustomer = await this.constructor.findOne({})
        .sort({ customerCode: -1 })
        .select("customerCode");

      let nextCode = 1;
      if (lastCustomer && lastCustomer.customerCode) {
        const codeMatch = lastCustomer.customerCode.match(/\d+/);
        if (codeMatch) {
          const parsed = parseInt(codeMatch[0], 10);
          if (!isNaN(parsed)) nextCode = parsed + 1;
        }
      }
      this.customerCode = nextCode.toString().padStart(5, "0");
    } catch (error) {
      console.error("Error generating customer code:", error);
      this.customerCode = Date.now().toString().slice(-5).padStart(5, "0");
    }
  }
  
  if (this.customerCode && /^\d+$/.test(this.customerCode)) {
    this.customerCode = this.customerCode.padStart(5, "0");
  }
  
  next();
});

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;