/**
 * AuditLog.js
 * ──────────────────────────────────────────────
 * Immutable audit trail.  Every critical write
 * (create / update / delete) against any
 * business-critical collection should emit one
 * AuditLog document showing the full before →
 * after snapshot.
 *
 * Collection name: auditlogs
 *
 * Usage:
 *   import AuditLog from '../models/observability/AuditLog.js';
 *   await AuditLog.record({ traceId, module, operation, docId, before, after, triggeredBy, triggeredByEvent });
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

// ── Triggered-by sub-document ─────────────────
const bySchema = new Schema(
  {
    userId:  { type: String },
    name:    { type: String },
    email:   { type: String },
    role:    { type: String },
    ip:      { type: String },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────
const auditLogSchema = new Schema(
  {
    // Ties this entry back to the originating request
    traceId: { type: String, index: true },

    // Which business module owns this collection
    // e.g. 'Stock', 'Outstanding', 'Transaction', 'SaleSummary'
    module: { type: String, required: true, index: true },

    // What happened: CREATE | UPDATE | DELETE | DEDUCT | RESTORE | etc.
    operation: { type: String, required: true },

    // Collection name — redundant for quick queries
    // NOTE: named 'collectionName' because 'collection' is reserved by Mongoose
    collectionName: { type: String },

    // The _id of the affected document
    docId: { type: String, index: true },

    // Human-readable reference (invoice number, etc.)
    referenceNo: { type: String },

    // Full snapshots
    before: { type: Schema.Types.Mixed, default: null },
    after:  { type: Schema.Types.Mixed, default: null },

    // Who / what triggered this
    triggeredBy:    { type: bySchema, default: {} },

    // The eventType that caused this — links back to SystemEvent
    triggeredByEvent: { type: String },

    // Result
    status: {
      type:    String,
      enum:    ['SUCCESS', 'FAILED'],
      default: 'SUCCESS',
    },
    errorMessage: { type: String },
  },
  {
    timestamps: true,
    collection: 'auditlogs',
  }
);

// ── Indexes ───────────────────────────────────
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ docId: 1, createdAt: -1 });
auditLogSchema.index({ traceId: 1 });
auditLogSchema.index({ createdAt: -1 });

// ── Static helper: record ─────────────────────
/**
 * Write an audit entry.  Never throws.
 *
 * @param {object}  opts
 * @param {string}  opts.traceId
 * @param {string}  opts.module             e.g. 'Stock'
 * @param {string}  opts.operation          e.g. 'DEDUCT'
 * @param {string}  [opts.collectionName]    Mongoose collection name
 * @param {string}  [opts.docId]            _id of affected document
 * @param {string}  [opts.referenceNo]      Human-readable ref
 * @param {*}       [opts.before]           State before change
 * @param {*}       [opts.after]            State after change
 * @param {object}  [opts.triggeredBy]      { userId, name, email, role, ip }
 * @param {string}  [opts.triggeredByEvent] EVENT_TYPE string
 * @param {'SUCCESS'|'FAILED'} [opts.status]
 * @param {string}  [opts.errorMessage]
 */
auditLogSchema.statics.record = async function (opts) {
  try {
    await this.create(opts);
  } catch (err) {
    console.error('[AuditLog] Failed to write audit entry:', err.message);
  }
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;