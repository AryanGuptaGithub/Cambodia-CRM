/**
 * SystemEvent.js
 * ──────────────────────────────────────────────
 * Central Event Log — every significant business
 * operation writes one document here.
 *
 * Collection name: systemevents
 *
 * Usage:
 *   import SystemEvent from '../models/observability/SystemEvent.js';
 *   await SystemEvent.emit({ traceId, eventType, entityType, entityId, triggeredBy, changes, metadata });
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

// ── Change sub-document ───────────────────────
const changeSchema = new Schema(
  {
    module:   { type: String, required: true },   // e.g. 'ReportInHand'
    action:   { type: String, required: true },   // e.g. 'STOCK_DEDUCTED'
    field:    { type: String },                   // optional: which field changed
    before:   { type: Schema.Types.Mixed },        // value before
    after:    { type: Schema.Types.Mixed },        // value after
    docId:    { type: String },                   // affected document _id
    status:   { type: String, enum: ['SUCCESS', 'FAILED', 'SKIPPED'], default: 'SUCCESS' },
    error:    { type: String },                   // error message if FAILED
  },
  { _id: false }
);

// ── Triggered-by sub-document ─────────────────
const triggeredBySchema = new Schema(
  {
    userId:   { type: String },
    name:     { type: String },
    email:    { type: String },
    role:     { type: String },
    ip:       { type: String },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────
const systemEventSchema = new Schema(
  {
    // Unique identifier for this event
    eventId: {
      type:    String,
      unique:  true,
      index:   true,
    },

    // Links every operation in a single request together
    traceId: {
      type: String,
      // index defined below in compound: { traceId: 1, createdAt: -1 }
    },

    // What happened — use the EVENT_TYPES constants below
    eventType: {
      type:     String,
      required: true,
      // index defined below in compound: { eventType: 1, createdAt: -1 }
    },

    // Which collection / entity was the primary target
    entityType: { type: String },   // e.g. 'SaleSummary'
    entityId:   { type: String },   // e.g. 'SALE-00045'

    // Who triggered this
    triggeredBy: { type: triggeredBySchema, default: {} },

    // Overall result
    status: {
      type:    String,
      enum:    ['SUCCESS', 'PARTIAL', 'FAILED'],
      default: 'SUCCESS',
      // index defined below in compound: { status: 1, createdAt: -1 }
    },

    // List of every side-effect this event caused
    changes: { type: [changeSchema], default: [] },

    // Any extra business context (invoiceNo, customerId, etc.)
    metadata: { type: Schema.Types.Mixed, default: {} },

    // Duration of the operation in milliseconds
    durationMs: { type: Number },

    // HTTP context
    httpMethod: { type: String },
    httpUrl:    { type: String },

    // Error message if the whole event failed
    errorMessage: { type: String },
    errorStack:   { type: String },
  },
  {
    timestamps:  true,   // adds createdAt / updatedAt
    collection:  'systemevents',
  }
);

// ── Indexes ───────────────────────────────────
systemEventSchema.index({ createdAt: -1 });
systemEventSchema.index({ eventType: 1, createdAt: -1 });
systemEventSchema.index({ traceId: 1, createdAt: -1 });
systemEventSchema.index({ entityType: 1, entityId: 1 });
systemEventSchema.index({ status: 1, createdAt: -1 });
// TTL: auto-delete events older than 90 days (optional — comment out to keep forever)
// systemEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// ── Static helper: emit ───────────────────────
/**
 * Persist a SystemEvent document.
 * Never throws — write failures are logged to stderr so they never
 * break the main business operation.
 *
 * @param {object} payload
 * @param {string} payload.traceId
 * @param {string} payload.eventType     - Use EVENT_TYPES constants
 * @param {string} [payload.entityType]
 * @param {string} [payload.entityId]
 * @param {object} [payload.triggeredBy]
 * @param {object[]} [payload.changes]
 * @param {object} [payload.metadata]
 * @param {'SUCCESS'|'PARTIAL'|'FAILED'} [payload.status]
 * @param {string} [payload.errorMessage]
 * @param {number} [payload.durationMs]
 * @param {string} [payload.httpMethod]
 * @param {string} [payload.httpUrl]
 * @returns {Promise<void>}
 */


systemEventSchema.statics.record = async function (payload) {
  // ── DEBUG: print full stack so we know exactly who called this ──
  const stack = new Error('SystemEvent.emit called').stack;
//   console.log('[SystemEvent.emit] payload:', JSON.stringify(payload, null, 2));
//   console.log('[SystemEvent.emit] call stack:\n', stack);
  // ───────────────────────────────────────────────────────────────

  if (!payload?.eventType) {
    console.error('[SystemEvent.emit] BLOCKED — eventType is missing. See stack above.');
    return;
  }

  try {
    const eventId = `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await this.create({ eventId, ...payload });
  } catch (err) {
    console.error('[SystemEvent] Failed to persist event:', err.message);
  }
};

const SystemEvent = mongoose.model('SystemEvent', systemEventSchema);

export default SystemEvent;

// ── Event type constants ──────────────────────
// Import these wherever you emit events to avoid magic strings.
export const EVENT_TYPES = {
  // Sales
  SALE_CREATED:          'SALE_CREATED',
  SALE_UPDATED:          'SALE_UPDATED',
  SALE_DELETED:          'SALE_DELETED',
  SALE_IMPORTED:         'SALE_IMPORTED',

  // Sale returns
  SALE_RETURN_CREATED:   'SALE_RETURN_CREATED',
  SALE_RETURN_UPDATED:   'SALE_RETURN_UPDATED',

  // Payments
  PAYMENT_RECEIVED:      'PAYMENT_RECEIVED',
  PAYMENT_UPDATED:       'PAYMENT_UPDATED',

  // Purchases
  PURCHASE_RECORDED:     'PURCHASE_RECORDED',
  PURCHASE_UPDATED:      'PURCHASE_UPDATED',
  PURCHASE_DELETED:      'PURCHASE_DELETED',

  // Stock
  STOCK_TRANSFERRED:     'STOCK_TRANSFERRED',
  STOCK_ADJUSTED:        'STOCK_ADJUSTED',
  STOCK_DEDUCTED:        'STOCK_DEDUCTED',
  STOCK_RETURNED:        'STOCK_RETURNED',

  // Payroll
  PAYROLL_PROCESSED:     'PAYROLL_PROCESSED',
  PAYROLL_DELETED:       'PAYROLL_DELETED',

  // Expenses
  EXPENSE_ADDED:         'EXPENSE_ADDED',
  EXPENSE_UPDATED:       'EXPENSE_UPDATED',   // PUT /:id
  EXPENSE_DELETED:       'EXPENSE_DELETED',   // DELETE /:id and bulk

  // Transactions
  TRANSACTION_CREATED:   'TRANSACTION_CREATED',
  TRANSACTION_UPDATED:   'TRANSACTION_UPDATED',
  TRANSACTION_DELETED:   'TRANSACTION_DELETED',

  // Outstanding
  OUTSTANDING_CREATED:   'OUTSTANDING_CREATED',
  OUTSTANDING_UPDATED:   'OUTSTANDING_UPDATED',

  // System
  RECONCILIATION_RUN:    'RECONCILIATION_RUN',
  RECONCILIATION_ALERT:  'RECONCILIATION_ALERT',
};