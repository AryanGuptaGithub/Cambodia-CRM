import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      default: function() {
        // This will be overridden by the backend logic
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
      unique: true,
      sparse: true
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

// Add compound index for better query performance
customerSchema.index({ name: 1, customerNumber: 1 });
customerSchema.index({ province: 1, zone: 1 });
customerSchema.index({ medicalRepName: 1 });
customerSchema.index({ enabled: 1 });

// Pre-save middleware to ensure customerCode is 5 digits
customerSchema.pre("save", async function(next) {
  if (this.isNew && !this.customerCode) {
    try {
      // Find the highest customer code
      const lastCustomer = await this.constructor.findOne({})
        .sort({ customerCode: -1 })
        .select("customerCode");

      let nextCode = 1;
      if (lastCustomer && lastCustomer.customerCode) {
        // Extract numeric part (handles "00001", "CUST00001", etc.)
        const codeMatch = lastCustomer.customerCode.match(/\d+/);
        if (codeMatch) {
          const parsed = parseInt(codeMatch[0], 10);
          if (!isNaN(parsed)) {
            nextCode = parsed + 1;
          }
        }
      }

      // Format as 5-digit string
      this.customerCode = nextCode.toString().padStart(5, "0");
    } catch (error) {
      console.error("Error generating customer code:", error);
      // Fallback to timestamp-based code
      this.customerCode = Date.now().toString().slice(-5).padStart(5, "0");
    }
  }
  
  // Ensure customerCode is exactly 5 digits
  if (this.customerCode && /^\d+$/.test(this.customerCode)) {
    this.customerCode = this.customerCode.padStart(5, "0");
  }
  
  next();
});

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;