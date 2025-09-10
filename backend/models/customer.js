const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  warehouse: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  status: { type: String, enum: ["enabled", "disabled"], default: "enabled" },
  password: { type: String, required: true },
  taxNumber: { type: String },
  openingBalance: { type: Number, default: 0 },
  type: { type: String, enum: ["receive", "pay"], default: "receive" },
  creditPeriod: { type: Number },
  creditLimit: { type: Number },
  profileImage: { type: String }, // If you're storing image URLs
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Customer", customerSchema);
