// models/activity/deletedRecord.js
import mongoose from "mongoose";

const deletedRecordSchema = new mongoose.Schema(
  {
    // ── Original record info ──────────────────────────────────────────────
    originalId: { type: String, required: true }, // Original MongoDB _id
    tableName: { type: String, required: true }, // e.g. "customers", "sales"
    tableLabel: { type: String }, // e.g. "Customer"
    referenceNumber: { type: String }, // Invoice / customer code etc.

    // ── Deleted data snapshot ────────────────────────────────────────────
    deletedData: { type: mongoose.Schema.Types.Mixed, required: true }, // Full record data

    // ── Who deleted it ──────────────────────────────────────────────────
    deletedBy: { type: String, required: true }, // userName
    deletedByUserId: { type: mongoose.Schema.Types.Mixed }, // User ID
    deletedByRole: { type: String },
    deletedAt: { type: Date, default: Date.now },

    // ── Revert info ──────────────────────────────────────────────────────
    isReverted: { type: Boolean, default: false },
    revertedAt: { type: Date },
    revertedBy: { type: String },

    // ── Activity log reference ───────────────────────────────────────────
    activityLogId: { type: mongoose.Schema.Types.ObjectId, ref: "ActivityLog" },

    // ── TTL: auto-delete after exactly 1 month (30 days) ─────────────────
    expiresAt: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d;
      },
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true },
);

// Indexes
deletedRecordSchema.index({ tableName: 1, deletedAt: -1 });
deletedRecordSchema.index({ originalId: 1 });
deletedRecordSchema.index({ deletedByUserId: 1 });
deletedRecordSchema.index({ isReverted: 1 });
deletedRecordSchema.index({ expiresAt: 1 });

export default mongoose.model("DeletedRecord", deletedRecordSchema);
