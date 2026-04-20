import mongoose from "mongoose";

const snapshotRowSchema = new mongoose.Schema(
  {
    recordId: { type: String },
    refNumber: { type: String },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.Mixed },
    userName: { type: String, required: true },
    userRole: { type: String },
    userEmail: { type: String },
    action: {
      type: String,
      enum: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "VIEW",
        "LOGIN",
        "LOGOUT",
        "EXPORT",
        "IMPORT",
        "REVERT",
      ],
      required: true,
    },
    actionLabel: { type: String },
    tableName: { type: String, required: true },
    tableLabel: { type: String },
    recordId: { type: String },
    referenceNumber: { type: String },
    previousSnapshots: { type: [snapshotRowSchema], default: undefined },
    newSnapshots: { type: [snapshotRowSchema], default: undefined },
    previousData: { type: mongoose.Schema.Types.Mixed },
    newData: { type: mongoose.Schema.Types.Mixed },
    isReverted: { type: Boolean, default: false },
    revertedAt: { type: Date },
    revertedBy: { type: String },
    revertLogId: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    description: { type: String },
    expiresAt: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d;
      },
    },
  },
  { timestamps: true },
);

activityLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ tableName: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ referenceNumber: 1 });
activityLogSchema.index({ recordId: 1 });
activityLogSchema.index({ createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);
