/**
 * ObservabilityDashboard.jsx
 * ─────────────────────────────────────────────────────────────
 * Full observability dashboard — System Events + Audit Logs
 * Enhanced with warning when triggeredBy user info is missing.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  Database,
  Zap,
  TrendingUp,
  Eye,
  GitBranch,
  User,
  Globe,
  Calendar,
  Hash,
  ChevronDown,
  Play,
  Layers,
  FileText,
  Server,
  Shield,
  Settings,
  ShoppingCart,
  Package,
  Receipt,
  DollarSign,
  AlertCircle,
  CreditCard,
  Building2,
  BarChart2,
} from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const BASE = `${backendUrl}/api/observability`;

// ─── Constants ────────────────────────────────────────────────
const EVENT_TYPES = [
  "SALE_CREATED", "SALE_UPDATED", "SALE_DELETED", "SALE_IMPORTED",
  "SALE_RETURN_CREATED", "SALE_RETURN_UPDATED",
  "PAYMENT_RECEIVED", "PAYMENT_UPDATED",
  "PURCHASE_RECORDED", "PURCHASE_UPDATED", "PURCHASE_DELETED",
  "STOCK_TRANSFERRED", "STOCK_ADJUSTED", "STOCK_DEDUCTED", "STOCK_RETURNED",
  "PAYROLL_PROCESSED", "PAYROLL_DELETED",
  "EXPENSE_ADDED", "EXPENSE_UPDATED", "EXPENSE_DELETED",
  "TRANSACTION_CREATED", "TRANSACTION_UPDATED", "TRANSACTION_DELETED",
  "OUTSTANDING_CREATED", "OUTSTANDING_UPDATED",
  "RECONCILIATION_RUN", "RECONCILIATION_ALERT",
];

const MODULE_OPTIONS = [
  "SaleSummary", "Stock", "Outstanding", "Transaction",
  "Purchase", "Expense", "Payroll", "SaleReturn", "PurchaseReturn",
];

const OPERATION_OPTIONS = [
  "CREATE", "UPDATE", "DELETE", "DEDUCT", "RESTORE", "TRANSFER", "ADJUST",
];

// ─── Light Mode Color helpers ─────────────────────────────────
const eventTypeColor = (et) => {
  if (!et) return { text: "#5B6E8C", bg: "#F1F5F9" };
  if (et.startsWith("SALE")) return { text: "#2563EB", bg: "#EFF6FF" };
  if (et.startsWith("PURCHASE")) return { text: "#059669", bg: "#ECFDF5" };
  if (et.startsWith("STOCK")) return { text: "#D97706", bg: "#FFFBEB" };
  if (et.startsWith("PAYROLL")) return { text: "#7C3AED", bg: "#F5F3FF" };
  if (et.startsWith("EXPENSE")) return { text: "#DC2626", bg: "#FEF2F2" };
  if (et.startsWith("TRANSACTION")) return { text: "#10B981", bg: "#ECFDF5" };
  if (et.startsWith("RECONCILIATION")) return { text: "#EA580C", bg: "#FFF7ED" };
  if (et.startsWith("OUTSTANDING")) return { text: "#3B82F6", bg: "#EFF6FF" };
  return { text: "#475569", bg: "#F8FAFC" };
};

const statusStyle = (s) => {
  if (s === "SUCCESS") return { color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" };
  if (s === "FAILED")  return { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" };
  if (s === "PARTIAL") return { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" };
  return { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" };
};

// ─── Formatters ───────────────────────────────────────────────
const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const fmtRelative = (iso) => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmt(iso);
};

const shortTrace = (t) => t ? t.replace("TRACE-", "").substring(0, 10) + "…" : "—";

// ─── Helper to detect missing user info ──────────────────────
const isTriggeredByUnknown = (triggeredBy) => {
  return !triggeredBy || triggeredBy.name === "unknown" || triggeredBy.name === "Unknown" || !triggeredBy.name;
};

// ─── Sub-components ───────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color = "#3B82F6", loading }) {
  return (
    <div className="metric-card">
      <div className="metric-card-header">
        <span className="metric-card-label">{label}</span>
        <div className="metric-card-icon" style={{ backgroundColor: `${color}15`, color: color }}>
          <Icon size={16} />
        </div>
      </div>
      <div className="metric-card-value" style={{ color: loading ? "#CBD5E1" : color }}>
        {loading ? "—" : value ?? "—"}
      </div>
      {sub && <div className="metric-card-sub">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = statusStyle(status);
  return (
    <span className={`status-badge status-${status?.toLowerCase() || 'unknown'}`}>
      {status === "SUCCESS" && <CheckCircle2 size={12} />}
      {status === "FAILED" && <XCircle size={12} />}
      {status === "PARTIAL" && <AlertTriangle size={12} />}
      {status || "—"}
    </span>
  );
}

function EventTypeBadge({ type }) {
  const c = eventTypeColor(type);
  return (
    <span className="event-type-badge" style={{ backgroundColor: c.bg, color: c.text }}>
      {type || "—"}
    </span>
  );
}

// New component for displaying triggeredBy with warning
function TriggeredByDisplay({ triggeredBy }) {
  const unknown = isTriggeredByUnknown(triggeredBy);
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">
        <User size={12} />
        Triggered By
        {unknown && (
          <span className="warning-badge" title="No user info captured. Ensure backend route uses 'protect' middleware and passes req.user.">
            <AlertCircle size={12} /> Missing auth
          </span>
        )}
      </div>
      <div className="drawer-kv-grid">
        <div className="drawer-kv-label">Name</div>
        <div className="drawer-kv-value">
          {triggeredBy?.name || "—"}
          {unknown && <span className="unknown-hint"> (unknown – backend not sending user)</span>}
        </div>
        <div className="drawer-kv-label">Role</div>
        <div className="drawer-kv-value">{triggeredBy?.role || "—"}</div>
        <div className="drawer-kv-label">User ID</div>
        <div className="drawer-kv-value mono">{triggeredBy?.userId || "—"}</div>
        <div className="drawer-kv-label">IP</div>
        <div className="drawer-kv-value mono">{triggeredBy?.ip || "—"}</div>
      </div>
    </div>
  );
}

function FilterBar({ filters, setFilters, onApply, onClear, type = "events" }) {
  const [open, setOpen] = useState(true);

  const Field = ({ label, children }) => (
    <div className="filter-field">
      <label className="filter-label">{label}</label>
      {children}
    </div>
  );

  return (
    <div className="filter-bar">
      <div className="filter-bar-header" onClick={() => setOpen(o => !o)}>
        <div className="filter-bar-title">
          <Filter size={14} />
          Filters
        </div>
        <ChevronDown size={14} className={`filter-chevron ${open ? 'open' : ''}`} />
      </div>

      {open && (
        <div className="filter-bar-content">
          {type === "events" ? (
            <>
              <Field label="Event Type">
                <select 
                  className="filter-select"
                  value={filters.eventType || ""} 
                  onChange={e => setFilters(f => ({ ...f, eventType: e.target.value }))}
                >
                  <option value="">All types</option>
                  {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select 
                  className="filter-select"
                  value={filters.status || ""} 
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="">All</option>
                  <option>SUCCESS</option><option>FAILED</option><option>PARTIAL</option>
                </select>
              </Field>
              <Field label="Trace ID">
                <input 
                  className="filter-input"
                  placeholder="TRACE-xxxxxxxx" 
                  value={filters.traceId || ""} 
                  onChange={e => setFilters(f => ({ ...f, traceId: e.target.value }))}
                />
              </Field>
              <Field label="Entity Type">
                <input 
                  className="filter-input"
                  placeholder="SaleSummary" 
                  value={filters.entityType || ""} 
                  onChange={e => setFilters(f => ({ ...f, entityType: e.target.value }))}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Module">
                <select 
                  className="filter-select"
                  value={filters.module || ""} 
                  onChange={e => setFilters(f => ({ ...f, module: e.target.value }))}
                >
                  <option value="">All modules</option>
                  {MODULE_OPTIONS.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Operation">
                <select 
                  className="filter-select"
                  value={filters.operation || ""} 
                  onChange={e => setFilters(f => ({ ...f, operation: e.target.value }))}
                >
                  <option value="">All</option>
                  {OPERATION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Trace ID">
                <input 
                  className="filter-input"
                  placeholder="TRACE-xxxxxxxx" 
                  value={filters.traceId || ""} 
                  onChange={e => setFilters(f => ({ ...f, traceId: e.target.value }))}
                />
              </Field>
              <Field label="Doc ID">
                <input 
                  className="filter-input"
                  placeholder="Document _id" 
                  value={filters.docId || ""} 
                  onChange={e => setFilters(f => ({ ...f, docId: e.target.value }))}
                />
              </Field>
            </>
          )}

          <Field label="From">
            <input type="date" className="filter-input" value={filters.from || ""} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          </Field>
          <Field label="To">
            <input type="date" className="filter-input" value={filters.to || ""} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          </Field>

          <div className="filter-actions">
            <button className="btn-primary" onClick={onApply}>Apply</button>
            <button className="btn-secondary" onClick={onClear}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Pager({ page, totalPages, total, limit, onPrev, onNext }) {
  const from = ((page - 1) * limit) + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="pager">
      <span className="pager-info">{total > 0 ? `Showing ${from}–${to} of ${total} records` : "No records"}</span>
      <div className="pager-controls">
        <button className="pager-button" onClick={onPrev} disabled={page <= 1}>
          <ChevronLeft size={14} />
        </button>
        <span className="pager-page">{page} / {totalPages || 1}</span>
        <button className="pager-button" onClick={onNext} disabled={page >= totalPages}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard Snapshot Cards ─────────────────────────────────
const SNAPSHOT_CARDS = [
  { key: 'totalSales',        label: 'Total Sales',         icon: ShoppingCart, color: '#2563EB' },
  { key: 'currentMonthSales', label: 'Month Sales',         icon: TrendingUp,   color: '#EA580C' },
  { key: 'stockInHands',      label: 'Stock in Hands',      icon: Package,      color: '#059669' },
  { key: 'totalExpense',      label: 'Total Expense',       icon: Receipt,      color: '#DC2626' },
  { key: 'totalPayroll',      label: 'Total Payroll',       icon: DollarSign,   color: '#7C3AED' },
  { key: 'overdue',           label: 'Overdue',             icon: AlertCircle,  color: '#DC2626' },
  { key: 'pendingCollection', label: 'Pending Collection',  icon: CreditCard,   color: '#4F46E5' },
  { key: 'companyBalance',    label: 'Company Balance',     icon: Building2,    color: '#0D9488' },
];

function fmtMoney(val) {
  if (val == null) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SnapshotSection({ storedSnapshot }) {
  // support both old single-snapshot and new before/after format
  const before = storedSnapshot?.snapshotBefore || null;
  const after  = storedSnapshot?.snapshotAfter  || storedSnapshot || null;
  const hasDiff = before && after;

  if (!after) {
    return (
      <div className="drawer-section">
        <div className="drawer-section-title"><BarChart2 size={12} />Dashboard Snapshot</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          No snapshot — recorded before snapshot capture was enabled.
        </div>
      </div>
    );
  }

  return (
    <div className="drawer-section">
      <div className="drawer-section-title">
        <BarChart2 size={12} />
        Dashboard Snapshot
        {after?.capturedAt && (
          <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
            — at event time · {fmt(after.capturedAt)}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: hasDiff ? '1fr 1fr' : '1fr', gap: 12 }}>
        {hasDiff && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Before
            </div>
            <div className="snapshot-grid">
              {SNAPSHOT_CARDS.map(({ key, label, icon: Icon, color }) => (
                <div key={key} className="snapshot-card">
                  <div className="snapshot-card-icon" style={{ backgroundColor: `${color}15`, color }}>
                    <Icon size={13} />
                  </div>
                  <div className="snapshot-card-body">
                    <div className="snapshot-card-label">{label}</div>
                    <div className="snapshot-card-value" style={{ color }}>{fmtMoney(before[key])}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
            {hasDiff ? 'After' : 'At event time'}
          </div>
          <div className="snapshot-grid">
            {SNAPSHOT_CARDS.map(({ key, label, icon: Icon, color }) => {
              const delta = hasDiff && before[key] != null && after[key] != null
                ? after[key] - before[key] : null;
              return (
                <div key={key} className="snapshot-card">
                  <div className="snapshot-card-icon" style={{ backgroundColor: `${color}15`, color }}>
                    <Icon size={13} />
                  </div>
                  <div className="snapshot-card-body">
                    <div className="snapshot-card-label">{label}</div>
                    <div className="snapshot-card-value" style={{ color }}>{fmtMoney(after[key])}</div>
                    {delta !== null && delta !== 0 && (
                      <div style={{
                        fontSize: 10, fontWeight: 600, marginTop: 2,
                        color: delta > 0 ? '#059669' : '#DC2626',
                      }} className="border rounded-lg pl-5">
                        {delta > 0 ? '▲' : '▼'} {fmtMoney(Math.abs(delta))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Event Detail Drawer (uses TriggeredByDisplay) ──────────
function EventDrawer({ event, onClose }) {
  if (!event) return null;

  const KVRow = ({ label, value, mono }) => (
    <>
      <div className="drawer-kv-label">{label}</div>
      <div className={`drawer-kv-value ${mono ? 'mono' : ''}`}>{value ?? "—"}</div>
    </>
  );

  const storedSnapshot = (event.metadata?.snapshotBefore || event.metadata?.snapshotAfter)
  ? {
      snapshotBefore: event.metadata.snapshotBefore,
      snapshotAfter:  event.metadata.snapshotAfter,
    }
  : null;

  return (
    <div className="drawer-overlay">
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <div className="drawer-header-subtitle">Event Detail</div>
            <EventTypeBadge type={event.eventType} />
          </div>
          <button className="drawer-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-header-meta">
          <StatusBadge status={event.status} />
          {event.durationMs != null && (
            <span className="drawer-duration">
              <Clock size={12} />
              {event.durationMs}ms
            </span>
          )}
        </div>

        <div className="drawer-body">
          <SnapshotSection eventId={event._id} storedSnapshot={storedSnapshot} />

          <div className="drawer-section">
            <div className="drawer-section-title">
              <Zap size={12} />
              Event Details
            </div>
            <div className="drawer-kv-grid">
              <KVRow label="Event ID" value={event.eventId} mono />
              <KVRow label="Trace ID" value={event.traceId} mono />
              <KVRow label="Entity Type" value={event.entityType} />
              <KVRow label="Entity ID" value={event.entityId} mono />
              <KVRow label="Timestamp" value={fmt(event.createdAt)} />
              <KVRow label="HTTP" value={event.httpMethod ? `${event.httpMethod} ${event.httpUrl}` : null} mono />
            </div>
            {event.errorMessage && (
              <div className="drawer-error">{event.errorMessage}</div>
            )}
          </div>

          {event.triggeredBy && <TriggeredByDisplay triggeredBy={event.triggeredBy} />}

          {event.changes?.length > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-title">
                <GitBranch size={12} />
                Tables affected ({event.changes.length})
              </div>

              <div className="impact-flow-header">
                <span className="impact-trigger-badge" style={{ backgroundColor: eventTypeColor(event.eventType).bg, color: eventTypeColor(event.eventType).text }}>
                  {event.eventType}
                </span>
                <div className="impact-flow-arrow">→</div>
                <span className="impact-count">{event.changes.length} table{event.changes.length !== 1 ? 's' : ''} affected</span>
              </div>

              <div className="impact-cards">
                {event.changes.map((c, i) => {
                  const hasDiff = c.before != null || c.after != null;
                  const delta = (typeof c.before === 'number' && typeof c.after === 'number')
                    ? c.after - c.before : null;
                  const isIncrease = delta !== null && delta > 0;
                  const isDecrease = delta !== null && delta < 0;
                  const moduleColor = {
                    ReportInHand:  { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', icon: '📦' },
                    StockInMRHand: { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412', icon: '🧑' },
                    MRCash:        { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', icon: '💵' },
                    SaleSummary:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', icon: '🧾' },
                    Outstanding:   { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E', icon: '📋' },
                    Transaction:   { bg: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6', icon: '💳' },
                    Expense:       { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: '💸' },
                    Payroll:       { bg: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6', icon: '👥' },
                    PurchaseReturn:{ bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', icon: '↩️' },
                  }[c.module] || { bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', icon: '🗃️' };

                  return (
                    <div key={i} className="impact-card" style={{ borderColor: moduleColor.border, backgroundColor: moduleColor.bg }}>
                      <div className="impact-card-header">
                        <div className="impact-card-module" style={{ color: moduleColor.text }}>
                          <span>{moduleColor.icon}</span>
                          <span>{c.module}</span>
                          {c.field && <span className="impact-card-field">· {c.field}</span>}
                        </div>
                        <div className="impact-card-right">
                          <span className="impact-card-action">{c.action?.replace(/_/g, ' ')}</span>
                          <StatusBadge status={c.status || 'SUCCESS'} />
                        </div>
                      </div>

                      {hasDiff && (
                        <div className="impact-diff-row">
                          <div className="impact-diff-before">
                            <div className="impact-diff-label">BEFORE</div>
                            <div className="impact-diff-value before">
                              {c.before != null ? (typeof c.before === 'object' ? JSON.stringify(c.before) : String(c.before)) : 'null'}
                            </div>
                          </div>
                          <div className="impact-diff-arrow-col">
                            {delta !== null ? (
                              <div className={`impact-delta ${isIncrease ? 'increase' : isDecrease ? 'decrease' : 'neutral'}`}>
                                {isIncrease ? '▲' : isDecrease ? '▼' : '='} {Math.abs(delta).toLocaleString()}
                              </div>
                            ) : (
                              <div className="impact-diff-arrow">→</div>
                            )}
                          </div>
                          <div className="impact-diff-after">
                            <div className="impact-diff-label">AFTER</div>
                            <div className="impact-diff-value after">
                              {c.after != null ? (typeof c.after === 'object' ? JSON.stringify(c.after) : String(c.after)) : 'null'}
                            </div>
                          </div>
                        </div>
                      )}

                      {c.error && <div className="impact-card-error">{c.error}</div>}
                      {c.docId && <div className="impact-card-docid">doc: {c.docId}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {event.metadata && Object.keys(event.metadata).filter(k => k !== 'dashboardSnapshot').length > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-title">
                <Hash size={12} />
                Metadata
              </div>
              <div className="drawer-kv-grid">
                {Object.entries(event.metadata)
                  .filter(([k]) => k !== 'dashboardSnapshot')
                  .map(([k, v]) => (
                    <React.Fragment key={k}>
                      <div className="drawer-kv-label">{k}</div>
                      <div className="drawer-kv-value mono">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </div>
                    </React.Fragment>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditDrawer({ log, onClose }) {
  if (!log) return null;
  return (
    <div className="drawer-overlay">
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <div className="drawer-header-subtitle">Audit Log</div>
            <div className="drawer-header-title">{log.module} · {log.operation}</div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Database size={12} />
              Details
            </div>
            <div className="drawer-kv-grid">
              <div className="drawer-kv-label">Doc ID</div><div className="drawer-kv-value mono">{log.docId || "—"}</div>
              <div className="drawer-kv-label">Reference</div><div className="drawer-kv-value mono">{log.referenceNo || "—"}</div>
              <div className="drawer-kv-label">Collection</div><div className="drawer-kv-value">{log.collectionName || "—"}</div>
              <div className="drawer-kv-label">Trace ID</div><div className="drawer-kv-value mono">{log.traceId || "—"}</div>
              <div className="drawer-kv-label">Status</div><div><StatusBadge status={log.status} /></div>
              <div className="drawer-kv-label">Timestamp</div><div className="drawer-kv-value">{fmt(log.createdAt)}</div>
            </div>
          </div>

          {log.triggeredBy && <TriggeredByDisplay triggeredBy={log.triggeredBy} />}

          <div className="drawer-section">
            <div className="drawer-section-title">
              <GitBranch size={12} />
              Before → After
            </div>
            <div className="diff-grid">
              <div>
                <div className="diff-label before">Before</div>
                <pre className="diff-code before">{log.before != null ? JSON.stringify(log.before, null, 2) : "null"}</pre>
              </div>
              <div>
                <div className="diff-label after">After</div>
                <pre className="diff-code after">{log.after != null ? JSON.stringify(log.after, null, 2) : "null"}</pre>
              </div>
            </div>
          </div>

          {log.errorMessage && (
            <div className="drawer-error">{log.errorMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Events Table ─────────────────────────────────────────────
function EventsTable({ events, loading, onRowClick }) {
  const cols = [
    { label: "Timestamp", w: "160px" },
    { label: "Event Type", w: "1fr" },
    { label: "Trace ID", w: "140px" },
    { label: "Entity", w: "130px" },
    { label: "Status", w: "100px" },
    { label: "By", w: "120px" },
    { label: "Duration", w: "90px" },
  ];

  return (
    <div className="data-table">
      <div className="data-table-header">
        {cols.map(c => <span key={c.label} style={{ width: c.w !== "1fr" ? c.w : undefined, flex: c.w === "1fr" ? 1 : undefined }}>{c.label}</span>)}
      </div>

      {loading ? (
        <div className="data-table-loading">
          <RefreshCw size={20} className="spinning" />
          <div>Loading events…</div>
        </div>
      ) : events.length === 0 ? (
        <div className="data-table-empty">
          <Activity size={32} />
          <div>No events found</div>
          <div>Try adjusting your filters</div>
        </div>
      ) : (
        events.map((ev, i) => {
          const failed = ev.status === "FAILED";
          const partial = ev.status === "PARTIAL";
          const unknownUser = isTriggeredByUnknown(ev.triggeredBy);
          return (
            <div 
              key={ev._id || i}
              className={`data-table-row ${failed ? 'failed' : partial ? 'partial' : ''}`}
              onClick={() => onRowClick(ev)}
            >
              <div style={{ width: 160 }}>
                <div className="data-table-timestamp">{fmt(ev.createdAt)}</div>
                <div className="data-table-relative">{fmtRelative(ev.createdAt)}</div>
              </div>
              <div style={{ flex: 1 }}><EventTypeBadge type={ev.eventType} /></div>
              <div style={{ width: 140 }} className="mono text-muted" title={ev.traceId}>{shortTrace(ev.traceId)}</div>
              <div style={{ width: 130 }} className="text-muted">{ev.entityType || "—"}</div>
              <div style={{ width: 100 }}><StatusBadge status={ev.status} /></div>
              <div style={{ width: 120 }} className="text-muted">
                {ev.triggeredBy?.name || "—"}
                {unknownUser && <span className="unknown-indicator" title="User info missing"> ⚠️</span>}
              </div>
              <div style={{ width: 90 }} className="mono text-muted">{ev.durationMs != null ? `${ev.durationMs}ms` : "—"}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Audit Logs Table ─────────────────────────────────────────
function AuditTable({ logs, loading, onRowClick }) {
  const cols = [
    { label: "Timestamp", w: "160px" },
    { label: "Module", w: "140px" },
    { label: "Operation", w: "100px" },
    { label: "Doc ID", w: "180px" },
    { label: "Reference", w: "130px" },
    { label: "Status", w: "100px" },
    { label: "By", w: "120px" },
  ];

  const opColor = { CREATE: "#059669", UPDATE: "#2563EB", DELETE: "#DC2626", DEDUCT: "#D97706" };

  return (
    <div className="data-table">
      <div className="data-table-header">
        {cols.map(c => <span key={c.label} style={{ width: c.w }}>{c.label}</span>)}
      </div>

      {loading ? (
        <div className="data-table-loading">
          <RefreshCw size={20} className="spinning" />
          <div>Loading audit logs…</div>
        </div>
      ) : logs.length === 0 ? (
        <div className="data-table-empty">
          <Database size={32} />
          <div>No audit logs found</div>
        </div>
      ) : (
        logs.map((log, i) => {
          const unknownUser = isTriggeredByUnknown(log.triggeredBy);
          return (
            <div key={log._id || i} className="data-table-row" onClick={() => onRowClick(log)}>
              <div style={{ width: 160 }}>
                <div className="data-table-timestamp">{fmt(log.createdAt)}</div>
                <div className="data-table-relative">{fmtRelative(log.createdAt)}</div>
              </div>
              <div style={{ width: 140 }}><span className="module-badge">{log.module || "—"}</span></div>
              <div style={{ width: 100 }}><span className="operation-badge" style={{ color: opColor[log.operation] || "#64748B" }}>{log.operation || "—"}</span></div>
              <div style={{ width: 180 }} className="mono text-muted" title={log.docId}>{log.docId?.substring(0, 20) || "—"}{log.docId?.length > 20 ? "…" : ""}</div>
              <div style={{ width: 130 }} className="text-muted">{log.referenceNo || "—"}</div>
              <div style={{ width: 100 }}><StatusBadge status={log.status} /></div>
              <div style={{ width: 120 }} className="text-muted">
                {log.triggeredBy?.name || "—"}
                {unknownUser && <span className="unknown-indicator" title="User info missing"> ⚠️</span>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Reconciliation Panel ─────────────────────────────────────
function ReconciliationPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const r = await axios.post(`${BASE}/reconciliation/run`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(r.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="reconciliation-panel">
      <div className="reconciliation-header">
        <div className="reconciliation-title">
          <RefreshCw size={16} />
          Data Reconciliation
          <span className="reconciliation-subtitle">— verify data consistency across collections</span>
        </div>
        <button className="btn-primary" onClick={run} disabled={running}>
          <Play size={12} />
          {running ? "Running…" : "Run Reconciliation"}
        </button>
      </div>

      <div className="reconciliation-content">
        {!result && !error && !running && (
          <div className="reconciliation-empty">
            <RefreshCw size={32} />
            <div>Click "Run Reconciliation" to check data consistency</div>
            <div>This will compare expected vs actual counts across collections</div>
          </div>
        )}

        {running && (
          <div className="reconciliation-loading">
            <RefreshCw size={24} className="spinning" />
            <div>Reconciliation in progress…</div>
          </div>
        )}

        {error && (
          <div className="reconciliation-error">{error}</div>
        )}

        {result && (
          <div>
            <div className="reconciliation-stats">
              <div className="reconciliation-stat">
                <div className="stat-value">{result.issuesFound}</div>
                <div className="stat-label">Issues Found</div>
              </div>
            </div>

            {result.data?.length === 0 ? (
              <div className="reconciliation-success">
                <CheckCircle2 size={32} />
                <div>All data is consistent. No issues found.</div>
              </div>
            ) : (
              <div className="reconciliation-issues">
                {result.data?.map((issue, i) => (
                  <div key={i} className="reconciliation-issue">
                    <div className="issue-type">{issue.type || "Issue"}</div>
                    <div className="issue-details">{JSON.stringify(issue)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function ObservabilityDashboard({ tab: propTab }) {
  const [activeTab, setActiveTab] = useState(propTab || "events");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [eventFilters, setEventFilters] = useState({});
  const [auditFilters, setAuditFilters] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const autoRefreshRef = useRef(null);
  const LIMIT = 25;

  const token = localStorage.getItem("token");
  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

  const buildEventQuery = (p = page) => {
    const params = new URLSearchParams({ page: p, limit: LIMIT });
    if (eventFilters.eventType) params.set("eventType", eventFilters.eventType);
    if (eventFilters.status) params.set("status", eventFilters.status);
    if (eventFilters.traceId) params.set("traceId", eventFilters.traceId);
    if (eventFilters.entityType) params.set("entityType", eventFilters.entityType);
    if (eventFilters.from) params.set("from", eventFilters.from);
    if (eventFilters.to) params.set("to", eventFilters.to);
    return params.toString();
  };

  const buildAuditQuery = (p = page) => {
    const params = new URLSearchParams({ page: p, limit: LIMIT });
    if (auditFilters.module) params.set("module", auditFilters.module);
    if (auditFilters.operation) params.set("operation", auditFilters.operation);
    if (auditFilters.traceId) params.set("traceId", auditFilters.traceId);
    if (auditFilters.from) params.set("from", auditFilters.from);
    if (auditFilters.to) params.set("to", auditFilters.to);
    return params.toString();
  };

  const loadEvents = useCallback(async (p = page) => {
    console.log("[Observability] loadEvents() — page:", p, "filters:", eventFilters);
    setLoading(true);
    try {
      const url = `${BASE}/events?${buildEventQuery(p)}`;
      console.log("[Observability] GET", url);
      const [evRes, failRes, partialRes, successRes] = await Promise.all([
        axios.get(url, authHeader),
        axios.get(`${BASE}/events?status=FAILED&limit=1`, authHeader),
        axios.get(`${BASE}/events?status=PARTIAL&limit=1`, authHeader),
        axios.get(`${BASE}/events?status=SUCCESS&limit=1`, authHeader),
      ]);
      console.log("[Observability] events OK — total:", evRes.data.total, "rows:", evRes.data.data?.length, "sample:", evRes.data.data?.[0]);
      const d = evRes.data;
      setEvents(d.data || []);
      setTotal(d.total || 0);
      setTotalPages(d.pages || 1);

      const evs = d.data || [];
      const durs = evs.filter(e => e.durationMs != null).map(e => e.durationMs);
      const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;

      setMetrics({
        total: d.total,
        success: successRes.data.total,
        failed: failRes.data.total,
        partial: partialRes.data.total,
        avgDur,
      });
      console.log("[Observability] metrics — total:", d.total, "success:", successRes.data.total, "failed:", failRes.data.total);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("[Observability] loadEvents FAILED:", err.message, err.response?.status, err.response?.data);
    } finally {
      setLoading(false);
    }
  }, [page, eventFilters]);

  const loadAuditLogs = useCallback(async (p = page) => {
    console.log("[Observability] loadAuditLogs() — page:", p, "filters:", auditFilters);
    setLoading(true);
    try {
      const url = `${BASE}/audit?${buildAuditQuery(p)}`;
      console.log("[Observability] GET", url);
      const r = await axios.get(url, authHeader);
      console.log("[Observability] audit OK — total:", r.data.total, "rows:", r.data.data?.length, "sample:", r.data.data?.[0]);
      const d = r.data;
      setAuditLogs(d.data || []);
      setTotal(d.total || 0);
      setTotalPages(d.pages || 1);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("[Observability] loadAuditLogs FAILED:", err.message, err.response?.status, err.response?.data);
    } finally {
      setLoading(false);
    }
  }, [page, auditFilters]);

  useEffect(() => {
    if (activeTab === "events") loadEvents(1);
    else if (activeTab === "audit") loadAuditLogs(1);
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "events") {
      autoRefreshRef.current = setInterval(() => loadEvents(page), 30000);
    }
    return () => clearInterval(autoRefreshRef.current);
  }, [activeTab, page, eventFilters]);

  const handleApplyFilters = () => {
    setPage(1);
    if (activeTab === "events") loadEvents(1);
    else loadAuditLogs(1);
  };

  const handleClearFilters = () => {
    if (activeTab === "events") { setEventFilters({}); }
    else { setAuditFilters({}); }
    setPage(1);
    setTimeout(() => {
      if (activeTab === "events") loadEvents(1);
      else loadAuditLogs(1);
    }, 0);
  };

  const handlePage = (dir) => {
    const np = page + dir;
    if (np < 1 || np > totalPages) return;
    setPage(np);
    if (activeTab === "events") loadEvents(np);
    else loadAuditLogs(np);
  };

  const tabs = [
    { id: "events", label: "System Events", icon: Activity },
    { id: "audit", label: "Audit Logs", icon: Database },
    { id: "reconciliation", label: "Reconciliation", icon: RefreshCw },
  ];

  return (
    <div className="observability-dashboard">
      <style>{`
        /* ──────────────────────────────────────────────────────────── */
        /* Light Mode CSS Variables & Reset */
        /* ──────────────────────────────────────────────────────────── */
        .observability-dashboard {
          --bg-primary: #FFFFFF;
          --bg-secondary: #F8FAFC;
          --bg-tertiary: #F1F5F9;
          --border-light: #E2E8F0;
          --border-medium: #CBD5E1;
          --text-primary: #0F172A;
          --text-secondary: #475569;
          --text-muted: #64748B;
          --accent-blue: #2563EB;
          --accent-blue-light: #EFF6FF;
          --accent-green: #059669;
          --accent-green-light: #ECFDF5;
          --accent-red: #DC2626;
          --accent-red-light: #FEF2F2;
          --accent-amber: #D97706;
          --accent-amber-light: #FFFBEB;
          --accent-purple: #7C3AED;
          --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          --font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        }

        .observability-dashboard * {
          box-sizing: border-box;
        }

        /* Scrollbar */
        .observability-dashboard ::-webkit-scrollbar { width: 6px; height: 6px; }
        .observability-dashboard ::-webkit-scrollbar-track { background: var(--bg-tertiary); border-radius: 3px; }
        .observability-dashboard ::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: 3px; }
        .observability-dashboard ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        /* Animations */
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinning { animation: spin 1s linear infinite; }

        /* Layout */
        .observability-dashboard {
          min-height: 100vh;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
        }

        /* Header */
        .dashboard-header {
          padding: 20px 28px 0;
          border-bottom: 1px solid var(--border-light);
          background: var(--bg-primary);
        }

        .header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: var(--accent-blue-light);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-blue);
        }

        .header-title h1 {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }

        .header-title p {
          font-size: 12px;
          color: var(--text-muted);
          margin: 2px 0 0;
        }

        .live-indicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: 12px;
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-green);
          animation: pulse 2s infinite;
        }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

        .refresh-button {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 34px;
          padding: 0 16px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-button:hover {
          background: var(--bg-tertiary);
          border-color: var(--border-medium);
        }

        /* Tabs */
        .dashboard-tabs {
          display: flex;
          gap: 4px;
        }

        .tab-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          margin-bottom: -1px;
        }

        .tab-button.active {
          color: var(--accent-blue);
          border-bottom-color: var(--accent-blue);
        }

        .tab-button:hover:not(.active) {
          color: var(--text-secondary);
          background: var(--bg-tertiary);
          border-radius: 6px 6px 0 0;
        }

        /* Content */
        .dashboard-content {
          padding: 24px 28px;
        }

        /* Metrics Grid */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .metric-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 16px 20px;
          transition: all 0.2s;
        }

        .metric-card:hover {
          box-shadow: var(--shadow-md);
          border-color: var(--border-medium);
        }

        .metric-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .metric-card-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .metric-card-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .metric-card-value {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
          font-variant-numeric: tabular-nums;
        }

        .metric-card-sub {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        /* Filter Bar */
        .filter-bar {
          border: 1px solid var(--border-light);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 20px;
          background: var(--bg-primary);
        }

        .filter-bar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: var(--bg-tertiary);
          cursor: pointer;
        }

        .filter-bar-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .filter-chevron {
          transition: transform 0.2s;
          color: var(--text-muted);
        }

        .filter-chevron.open {
          transform: rotate(180deg);
        }

        .filter-bar-content {
          padding: 18px;
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          align-items: flex-end;
        }

        .filter-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .filter-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .filter-select, .filter-input {
          height: 36px;
          padding: 0 12px;
          border: 1px solid var(--border-light);
          border-radius: 8px;
          font-size: 13px;
          background: var(--bg-primary);
          color: var(--text-primary);
          outline: none;
          transition: all 0.2s;
        }

        .filter-select:focus, .filter-input:focus {
          border-color: var(--accent-blue);
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .filter-select {
          cursor: pointer;
        }

        .filter-actions {
          display: flex;
          gap: 10px;
          align-items: flex-end;
        }

        /* Buttons */
        .btn-primary {
          height: 36px;
          padding: 0 18px;
          background: var(--accent-blue);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1D4ED8;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-secondary {
          height: 36px;
          padding: 0 16px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: var(--bg-tertiary);
          border-color: var(--border-medium);
        }

        /* Data Table */
        .data-table {
          border: 1px solid var(--border-light);
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-primary);
        }

        .data-table-header {
          display: flex;
          padding: 12px 16px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-light);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .data-table-row {
          display: flex;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-light);
          cursor: pointer;
          transition: background 0.15s;
          align-items: center;
        }

        .data-table-row:hover {
          background: var(--bg-tertiary);
        }

        .data-table-row.failed {
          border-left: 3px solid var(--accent-red);
          padding-left: 13px;
        }

        .data-table-row.partial {
          border-left: 3px solid var(--accent-amber);
          padding-left: 13px;
        }

        .data-table-timestamp {
          font-size: 12px;
          font-family: var(--font-mono);
          color: var(--text-secondary);
        }

        .data-table-relative {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .data-table-loading, .data-table-empty {
          padding: 48px;
          text-align: center;
          color: var(--text-muted);
        }

        .data-table-empty svg {
          margin-bottom: 12px;
          opacity: 0.5;
        }

        /* Badges */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
        }

        .status-success {
          background: var(--accent-green-light);
          color: var(--accent-green);
          border: 1px solid #A7F3D0;
        }

        .status-failed {
          background: var(--accent-red-light);
          color: var(--accent-red);
          border: 1px solid #FECACA;
        }

        .status-partial {
          background: var(--accent-amber-light);
          color: var(--accent-amber);
          border: 1px solid #FDE68A;
        }

        .event-type-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
          font-family: var(--font-mono);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }

        .module-badge {
          font-size: 11px;
          font-weight: 600;
          background: var(--accent-blue-light);
          color: var(--accent-blue);
          padding: 3px 8px;
          border-radius: 6px;
        }

        .operation-badge {
          font-size: 11px;
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .mono {
          font-family: var(--font-mono);
          font-size: 11px;
        }

        .text-muted {
          color: var(--text-muted);
        }

        /* Warning indicator (yellow triangle) */
        .unknown-indicator {
          display: inline-block;
          margin-left: 4px;
          color: var(--accent-amber);
          font-weight: bold;
        }

        .warning-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: var(--accent-amber-light);
          color: var(--accent-amber);
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 12px;
          margin-left: 8px;
          cursor: help;
        }

        .unknown-hint {
          font-size: 10px;
          color: var(--accent-amber);
          margin-left: 6px;
        }

        /* Pager */
        .pager {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 20px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .pager-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .pager-button {
          width: 32px;
          height: 32px;
          border: 1px solid var(--border-light);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .pager-button:hover:not(:disabled) {
          background: var(--bg-tertiary);
          border-color: var(--border-medium);
        }

        .pager-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pager-page {
          padding: 0 12px;
          height: 32px;
          display: flex;
          align-items: center;
          border: 1px solid var(--border-light);
          border-radius: 8px;
          background: var(--bg-primary);
        }

        /* Reconciliation Panel */
        .reconciliation-panel {
          border: 1px solid var(--border-light);
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-primary);
        }

        .reconciliation-header {
          padding: 16px 20px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-light);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .reconciliation-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .reconciliation-subtitle {
          font-size: 12px;
          font-weight: normal;
          color: var(--text-muted);
        }

        .reconciliation-content {
          padding: 24px;
        }

        .reconciliation-empty, .reconciliation-loading {
          text-align: center;
          color: var(--text-muted);
          padding: 48px 0;
        }

        .reconciliation-empty svg, .reconciliation-loading svg {
          margin-bottom: 12px;
          opacity: 0.5;
        }

        .reconciliation-error {
          padding: 14px 18px;
          background: var(--accent-red-light);
          border: 1px solid var(--accent-red);
          border-radius: 10px;
          color: var(--accent-red);
          font-size: 13px;
        }

        .reconciliation-stats {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
        }

        .reconciliation-stat {
          flex: 1;
          background: var(--accent-amber-light);
          border: 1px solid #FDE68A;
          border-radius: 10px;
          padding: 16px;
          text-align: center;
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--accent-amber);
        }

        .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .reconciliation-success {
          text-align: center;
          padding: 48px 0;
          color: var(--accent-green);
        }

        .reconciliation-success svg {
          margin-bottom: 12px;
        }

        .reconciliation-issues {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .reconciliation-issue {
          padding: 14px 18px;
          background: var(--accent-amber-light);
          border: 1px solid #FDE68A;
          border-radius: 10px;
        }

        .issue-type {
          font-weight: 600;
          color: var(--accent-amber);
          margin-bottom: 6px;
          font-size: 13px;
        }

        .issue-details {
          font-size: 12px;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          word-break: break-all;
        }

        /* Drawer */
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
        }

        .drawer {
          width: 50%;
          background: var(--bg-primary);
          height: 100%;
          overflow-y: auto;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
        }

        .drawer-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-light);
          background: var(--bg-primary);
          position: sticky;
          top: 0;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .drawer-header-subtitle {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 6px;
        }

        .drawer-header-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .drawer-close {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .drawer-close:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .drawer-header-meta {
          padding: 12px 24px;
          border-bottom: 1px solid var(--border-light);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .drawer-duration {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .drawer-body {
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .drawer-section {
          border-bottom: 1px solid var(--border-light);
          padding-bottom: 20px;
        }

        .drawer-section:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .drawer-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .drawer-kv-grid {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 12px 16px;
        }

        .drawer-kv-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
        }

        .drawer-kv-value {
          font-size: 12px;
          color: var(--text-primary);
          word-break: break-word;
        }

        .drawer-kv-value.mono {
          font-family: var(--font-mono);
          font-size: 11px;
        }

        .drawer-error {
          margin-top: 12px;
          padding: 12px;
          background: var(--accent-red-light);
          border-radius: 8px;
          font-size: 12px;
          font-family: var(--font-mono);
          color: var(--accent-red);
          border: 1px solid var(--accent-red);
        }

        /* ── Impact flow ── */
        .impact-flow-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          padding: 8px 0;
        }

        .impact-trigger-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
          letter-spacing: 0.02em;
        }

        .impact-flow-arrow {
          font-size: 16px;
          color: var(--text-muted);
        }

        .impact-count {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .impact-cards {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .impact-card {
          border: 1px solid;
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .impact-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }

        .impact-card-module {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
        }

        .impact-card-field {
          font-weight: 400;
          font-size: 12px;
          opacity: 0.75;
        }

        .impact-card-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .impact-card-action {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          background: rgba(0,0,0,0.06);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .impact-diff-row {
          display: grid;
          grid-template-columns: 1fr 60px 1fr;
          gap: 8px;
          align-items: center;
        }

        .impact-diff-before,
        .impact-diff-after {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .impact-diff-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }

        .impact-diff-value {
          font-family: var(--font-mono, monospace);
          font-size: 13px;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: 6px;
          word-break: break-all;
        }

        .impact-diff-value.before {
          background: rgba(220, 38, 38, 0.08);
          color: #B91C1C;
        }

        .impact-diff-value.after {
          background: rgba(5, 150, 105, 0.08);
          color: #065F46;
        }

        .impact-diff-arrow-col {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .impact-diff-arrow {
          font-size: 18px;
          color: var(--text-muted);
        }

        .impact-delta {
          font-size: 12px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          text-align: center;
          line-height: 1.3;
        }

        .impact-delta.increase {
          background: rgba(5, 150, 105, 0.1);
          color: #065F46;
        }

        .impact-delta.decrease {
          background: rgba(220, 38, 38, 0.1);
          color: #B91C1C;
        }

        .impact-delta.neutral {
          background: rgba(100, 116, 139, 0.1);
          color: #475569;
        }

        .impact-card-error {
          font-size: 11px;
          color: #B91C1C;
          background: #FEF2F2;
          padding: 6px 8px;
          border-radius: 6px;
          border-left: 3px solid #FECACA;
        }

        .impact-card-docid {
          font-size: 10px;
          font-family: var(--font-mono, monospace);
          color: var(--text-muted);
        }

        /* ── Snapshot Cards ── */
        .snapshot-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .snapshot-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 10px;
          transition: all 0.15s;
        }

        .snapshot-card:hover {
          border-color: var(--border-medium);
          background: var(--bg-tertiary);
        }

        .snapshot-card-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .snapshot-card-body {
          flex: 1;
          min-width: 0;
        }

        .snapshot-card-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 2px;
        }

        .snapshot-card-value {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.3px;
          font-variant-numeric: tabular-nums;
        }
      `}</style>

      <div className="dashboard-header">
        <div className="header-top">
          <div className="header-logo">
            <div className="header-icon">
              <Eye size={18} />
            </div>
            <div className="header-title">
              <h1>Observability</h1>
              <p>
                {lastRefresh ? `Last refreshed ${fmtRelative(lastRefresh)}` : "Loading…"}
                <span className="live-indicator">
                  <span className="live-dot" />
                  live
                </span>
              </p>
            </div>
          </div>
          <button className="refresh-button" onClick={() => activeTab === "events" ? loadEvents(page) : loadAuditLogs(page)}>
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        <div className="dashboard-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tab-button ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-content">
        {activeTab === "events" && (
          <>
            <div className="metrics-grid">
              <MetricCard icon={TrendingUp} label="Total Events" value={metrics?.total} color="#2563EB" loading={loading && !metrics} />
              <MetricCard icon={CheckCircle2} label="Success" value={metrics?.success} color="#059669" loading={loading && !metrics} />
              <MetricCard icon={XCircle} label="Failed (all)" value={metrics?.failed} color="#DC2626" loading={loading && !metrics} />
              <MetricCard icon={AlertTriangle} label="Partial (all)" value={metrics?.partial} color="#D97706" loading={loading && !metrics} />
              <MetricCard icon={Clock} label="Avg Duration" value={metrics?.avgDur != null ? `${metrics.avgDur}ms` : "—"} color="#7C3AED" loading={loading && !metrics} />
            </div>
            <FilterBar
              filters={eventFilters}
              setFilters={setEventFilters}
              onApply={handleApplyFilters}
              onClear={handleClearFilters}
              type="events"
            />
            <EventsTable events={events} loading={loading} onRowClick={setSelectedEvent} />
            <Pager page={page} totalPages={totalPages} total={total} limit={LIMIT} onPrev={() => handlePage(-1)} onNext={() => handlePage(1)} />
          </>
        )}

        {activeTab === "audit" && (
          <>
            <FilterBar
              filters={auditFilters}
              setFilters={setAuditFilters}
              onApply={handleApplyFilters}
              onClear={handleClearFilters}
              type="audit"
            />
            <AuditTable logs={auditLogs} loading={loading} onRowClick={setSelectedAudit} />
            <Pager page={page} totalPages={totalPages} total={total} limit={LIMIT} onPrev={() => handlePage(-1)} onNext={() => handlePage(1)} />
          </>
        )}

        {activeTab === "reconciliation" && <ReconciliationPanel />}
      </div>

      {selectedEvent && <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {selectedAudit && <AuditDrawer log={selectedAudit} onClose={() => setSelectedAudit(null)} />}
    </div>
  );
}