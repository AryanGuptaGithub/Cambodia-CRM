/**
 * observabilityRoutes.js
 * ──────────────────────────────────────────────
 * Internal query API for the observability system.
 *
 * All routes are admin-only (attach your auth middleware as needed).
 *
 * Endpoints:
 *   GET /api/observability/events
 *     Query SystemEvents with filters:
 *       ?eventType=SALE_CREATED
 *       ?status=FAILED
 *       ?traceId=TRACE-xxxxx
 *       ?entityType=SaleSummary
 *       ?entityId=SALE-00045
 *       ?from=2025-01-01&to=2025-12-31   (ISO date strings)
 *       ?page=1&limit=50                 (default: page 1, limit 50)
 *
 *   GET /api/observability/events/:traceId
 *     All SystemEvents for a single traceId (full request trace)
 *
 *   GET /api/observability/audit/:docId
 *     Full audit trail for a single document across all collections
 *
 *   GET /api/observability/audit
 *     Query AuditLogs with filters:
 *       ?module=Stock
 *       ?operation=DEDUCT
 *       ?traceId=TRACE-xxxxx
 *       ?from=2025-01-01&to=2025-12-31
 *       ?page=1&limit=50
 *
 *   POST /api/observability/reconciliation/run
 *     Trigger a manual reconciliation run immediately.
 *     Returns the list of issues found.
 */

import express from 'express';
import SystemEvent from '../../models/observability/SystemEvent.js';
import AuditLog    from '../../models/observability/AuditLog.js';
import { runReconciliation }        from '../../observability/reconciliation.js';
import { captureDashboardSnapshot } from '../../observability/dashboardSnapshot.js';

const router = express.Router();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Build a MongoDB date-range filter from query params.
 * @param {string} from  - ISO date string
 * @param {string} to    - ISO date string
 */
const dateRange = (from, to) => {
  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to)   filter.createdAt.$lte = new Date(to);
  }
  return filter;
};

/**
 * Parse pagination params with safe defaults.
 */
const parsePagination = (query) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(200, parseInt(query.limit) || 50);
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
};

// ─────────────────────────────────────────────
// GET /api/observability/events
// Query SystemEvents
// ─────────────────────────────────────────────
router.get('/events', async (req, res) => {
  try {
    const { eventType, status, traceId, entityType, entityId, from, to } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {
      ...dateRange(from, to),
    };
    if (eventType)  filter.eventType  = eventType;
    if (status)     filter.status     = status;
    if (traceId)    filter.traceId    = traceId;
    if (entityType) filter.entityType = entityType;
    if (entityId)   filter.entityId   = entityId;

    const [events, total] = await Promise.all([
      SystemEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SystemEvent.countDocuments(filter),
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      data: events,
    });
  } catch (err) {
    console.error('[observability] GET /events error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/observability/events/:traceId
// Full trace — all events for one request
// ─────────────────────────────────────────────
router.get('/events/trace/:traceId', async (req, res) => {
  try {
    const { traceId } = req.params;

    const events = await SystemEvent.find({ traceId })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      success: true,
      traceId,
      count: events.length,
      data: events,
    });
  } catch (err) {
    console.error('[observability] GET /events/trace/:traceId error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/observability/audit/:docId
// Full audit trail for a single document
// ─────────────────────────────────────────────
router.get('/audit/:docId', async (req, res) => {
  try {
    const { docId } = req.params;

    const logs = await AuditLog.find({ docId })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      success: true,
      docId,
      count: logs.length,
      data: logs,
    });
  } catch (err) {
    console.error('[observability] GET /audit/:docId error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/observability/audit
// Query AuditLogs
// ─────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const { module, operation, traceId, from, to } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {
      ...dateRange(from, to),
    };
    if (module)    filter.module    = module;
    if (operation) filter.operation = operation;
    if (traceId)   filter.traceId   = traceId;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      data: logs,
    });
  } catch (err) {
    console.error('[observability] GET /audit error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/observability/dashboard-snapshot
// Live values for all 8 dashboard cards.
// Called by the EventDrawer when no stored snapshot exists.
// ─────────────────────────────────────────────
router.get('/dashboard-snapshot', async (req, res) => {
  try {
    console.log('[observability] GET /dashboard-snapshot');
    const snapshot = await captureDashboardSnapshot();
    if (!snapshot) {
      // captureDashboardSnapshot already logged the real error to stderr
      return res.status(503).json({ success: false, error: 'Snapshot unavailable — check server logs for details' });
    }
    return res.json({ success: true, data: snapshot });
  } catch (err) {
    console.error('[observability] /dashboard-snapshot unexpected error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/observability/reconciliation/run
// Manual trigger — useful for testing / admin UI
// ─────────────────────────────────────────────
router.post('/reconciliation/run', async (req, res) => {
  try {
    console.log(`[observability] Manual reconciliation triggered by ${req.traceId}`);
    const issues = await runReconciliation();
    res.json({
      success: true,
      issuesFound: issues.length,
      data: issues,
    });
  } catch (err) {
    console.error('[observability] POST /reconciliation/run error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;