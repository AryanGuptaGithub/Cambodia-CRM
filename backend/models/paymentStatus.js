import mongoose from "mongoose";

const paymentStatus = new mongoose.Schema({
  type: {
    type: String,
    required: true,
  },

  date: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("paymentStatusType", paymentStatus);
