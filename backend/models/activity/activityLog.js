import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    // User info
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String, required: true },
    userRole: { type: String },
    userEmail: { type: String },

    // Action info
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "VIEW", "LOGIN", "LOGOUT", "EXPORT", "IMPORT"],
      required: true,
    },
    actionLabel: { type: String }, // e.g. "Added New Sale Invoice"

    // Table/Module info
    tableName: { type: String, required: true }, // e.g. "sales", "purchase"
    tableLabel: { type: String }, // e.g. "Sales Invoice"

    // Record info
    recordId: { type: String }, // MongoDB _id of affected record
    referenceNumber: { type: String }, // Invoice number, PO number etc.

    // Data snapshot
    previousData: { type: mongoose.Schema.Types.Mixed }, // Before update/delete
    newData: { type: mongoose.Schema.Types.Mixed },       // After create/update

    // Meta
    ipAddress: { type: String },
    userAgent: { type: String },
    description: { type: String },
  },
  { timestamps: true }
);

// Indexes for fast queries
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ tableName: 1, createdAt: -1 });
activityLogSchema.index({ referenceNumber: 1 });
activityLogSchema.index({ recordId: 1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);