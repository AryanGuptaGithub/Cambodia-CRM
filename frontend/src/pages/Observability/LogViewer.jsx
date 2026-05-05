/**
 * LogViewer.jsx
 * ──────────────────────────────────────────────────────────────
 * Server log viewer page — shows Winston log files from the backend.
 * Redesigned for Light Mode to match the existing Cambodia-CRM theme.
 *
 * Place at: frontend/src/pages/Observability/LogViewer.jsx
 * ──────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
  FileText, AlertCircle, Info, Bug, AlertTriangle,
  Search, X, ChevronLeft, ChevronRight, Calendar,
  RefreshCw, ChevronDown, ChevronUp, Database,
  Terminal, Clock, Filter, Layers,
} from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const BASE = `${backendUrl}/api/logs`;

// ─── Level config (Light Mode) ─────────────────────────────
const LEVEL_CONFIG = {
  error:   { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: AlertCircle,   label: "Error"   },
  warn:    { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: AlertTriangle,  label: "Warning" },
  warning: { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: AlertTriangle,  label: "Warning" },
  info:    { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: Info,           label: "Info"    },
  debug:   { color: "#64748B", bg: "#F1F5F9", border: "#E2E8F0", icon: Bug,            label: "Debug"   },
  unknown: { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0", icon: FileText,       label: "?"       },
};

const LOG_TYPES = [
  { id: "application",         label: "Application",       icon: Layers },
  { id: "error",               label: "Errors",            icon: AlertCircle },
  { id: "debug",               label: "Debug",             icon: Bug },
  { id: "user-activity",       label: "User Activity",     icon: Terminal },
  { id: "stock-calculations",  label: "Stock Calc",        icon: Database },
  { id: "database",            label: "Database",          icon: Database },
];

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ─── Sub-components ───────────────────────────────────────────

function LevelBadge({ level }) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.unknown;
  const Icon = cfg.icon;
  return (
    <span className={`level-badge level-${level || 'unknown'}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function StatBadge({ label, value, color, icon: Icon }) {
  return (
    <div className="stat-badge">
      <div className="stat-badge-icon" style={{ backgroundColor: `${color}15`, color: color }}>
        <Icon size={14} />
      </div>
      <div>
        <div className="stat-badge-value" style={{ color }}>{value ?? "—"}</div>
        <div className="stat-badge-label">{label}</div>
      </div>
    </div>
  );
}

function LogDetailDrawer({ entry, onClose }) {
  if (!entry) return null;
  const cfg = LEVEL_CONFIG[entry.level] || LEVEL_CONFIG.unknown;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-header-info">
            <LevelBadge level={entry.level} />
            <div className="drawer-header-meta">
              <span><Clock size={12} /> {fmtDate(entry.timestamp)} {fmt(entry.timestamp)}</span>
              <span>line #{entry.lineNo}</span>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <div className="drawer-section-title">
              <FileText size={12} />
              Message
            </div>
            <div className="drawer-message" style={{ borderLeftColor: cfg.color }}>
              {entry.message || "—"}
            </div>
          </div>

          {entry.meta && Object.keys(entry.meta).length > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-title">
                <Database size={12} />
                Metadata
              </div>
              <pre className="drawer-json">{JSON.stringify(entry.meta, null, 2)}</pre>
            </div>
          )}

          <div className="drawer-section">
            <div className="drawer-section-title">
              <Terminal size={12} />
              Raw Log Line
            </div>
            <pre className="drawer-raw">{entry.raw}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogRow({ entry, onClick, isSelected }) {
  const cfg = LEVEL_CONFIG[entry.level] || LEVEL_CONFIG.unknown;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`log-row ${hovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => onClick(entry)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderLeftColor: isSelected ? cfg.color : 'transparent' }}
    >
      <div className="log-time">{fmt(entry.timestamp)}</div>
      <div><LevelBadge level={entry.level} /></div>
      <div className="log-message" style={{ 
        color: entry.level === "error" ? "#DC2626" : 
               entry.level === "warn" || entry.level === "warning" ? "#D97706" : 
               "#1E293B" 
      }}>
        {entry.message || entry.raw}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function LogViewer() {
  const today = new Date().toISOString().slice(0, 10);

  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedType, setSelectedType] = useState("application");
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [levelFilter, setLevelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const debounceRef = useRef(null);
  const LIMIT = 50;

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    console.log("[LogViewer] Fetching dates from:", `${BASE}/dates`);
    axios.get(`${BASE}/dates`, { headers })
      .then(r => {
        console.log("[LogViewer] dates response:", r.data);
        const d = r.data.data || [];
        setDates(d);
        if (d.length && !d.includes(today)) setSelectedDate(d[0]);
        if (d.length === 0) console.warn("[LogViewer] No log dates found — logsDir:", r.data.logsDir);
      })
      .catch(err => console.error("[LogViewer] dates fetch FAILED:", err.message, err.response?.data));
  }, []);

  useEffect(() => {
    Promise.all([
      axios.get(`${BASE}/files?date=${selectedDate}`, { headers }),
      axios.get(`${BASE}/stats?date=${selectedDate}`, { headers }),
    ]).then(([fRes, sRes]) => {
      setFiles(fRes.data.data || []);
      setStats(sRes.data.data || null);
    }).catch(() => {});
  }, [selectedDate]);

  const loadEntries = useCallback(async (p = 1) => {
    setLoading(true);
    setSelectedEntry(null);
    try {
      const params = new URLSearchParams({
        date: selectedDate, type: selectedType,
        page: p, limit: LIMIT,
      });
      if (levelFilter) params.set("level", levelFilter);
      if (search) params.set("search", search);

      const url = `${BASE}/entries?${params}`;
      console.log("[LogViewer] Fetching entries:", url);
      const r = await axios.get(url, { headers });
      console.log("[LogViewer] entries response — total:", r.data.total, "rows:", r.data.data?.length, "sample:", r.data.data?.[0]);
      const d = r.data;
      setEntries(d.data || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
      setPage(p);
    } catch(err) {
      console.error("[LogViewer] entries FAILED:", err.message, err.response?.data);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedType, levelFilter, search]);

  useEffect(() => { loadEntries(1); }, [selectedDate, selectedType, levelFilter, search]);

  const handleSearchInput = (v) => {
    setSearchInput(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(v), 400);
  };

  const handlePage = (dir) => {
    const np = page + dir;
    if (np < 1 || np > pages) return;
    loadEntries(np);
  };

  const selectedFile = files.find(f => f.type === selectedType);

  return (
    <div className="log-viewer">
      <style>{`
        .log-viewer {
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
          --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          --font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        }

        .log-viewer * {
          box-sizing: border-box;
        }

        .log-viewer {
          min-height: 100vh;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
        }

        /* Scrollbar */
        .log-viewer ::-webkit-scrollbar { width: 6px; height: 6px; }
        .log-viewer ::-webkit-scrollbar-track { background: var(--bg-tertiary); border-radius: 3px; }
        .log-viewer ::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: 3px; }
        .log-viewer ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinning { animation: spin 1s linear infinite; }

        /* Top Bar */
        .top-bar {
          padding: 14px 24px;
          border-bottom: 1px solid var(--border-light);
          background: var(--bg-primary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .logo-area {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: var(--accent-green-light);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-green);
        }

        .logo-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.3px;
        }

        .logo-subtitle {
          font-size: 10px;
          color: var(--text-muted);
        }

        /* Date Selector */
        .date-selector {
          position: relative;
        }

        .date-button {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 34px;
          padding: 0 14px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 12px;
          cursor: pointer;
          font-family: var(--font-mono);
          transition: all 0.2s;
        }

        .date-button:hover {
          background: var(--bg-tertiary);
          border-color: var(--border-medium);
        }

        .date-dropdown {
          position: absolute;
          top: 40px;
          right: 0;
          z-index: 50;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 10px;
          overflow: hidden;
          min-width: 170px;
          box-shadow: var(--shadow-md);
        }

        .date-option {
          padding: 8px 14px;
          font-size: 12px;
          font-family: var(--font-mono);
          cursor: pointer;
          transition: all 0.15s;
        }

        .date-option:hover {
          background: var(--bg-tertiary);
        }

        .date-option.active {
          background: var(--accent-blue-light);
          color: var(--accent-blue);
        }

        .refresh-button {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 14px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-button:hover {
          background: var(--bg-tertiary);
          border-color: var(--border-medium);
        }

        /* Stats Row */
        .stats-row {
          padding: 14px 24px;
          border-bottom: 1px solid var(--border-light);
          background: var(--bg-primary);
        }

        .stats-grid {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .stat-badge {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 10px;
          padding: 10px 18px;
          flex: 1;
          min-width: 100px;
        }

        .stat-badge-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-badge-value {
          font-size: 20px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
        }

        .stat-badge-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        /* Main Layout */
        .main-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
          height: calc(100vh - 140px);
        }

        /* Sidebar */
        .sidebar {
          width: 210px;
          background: var(--bg-primary);
          border-right: 1px solid var(--border-light);
          flex-shrink: 0;
          overflow-y: auto;
        }

        .sidebar-header {
          padding: 14px 16px 10px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }

        .log-type-item {
          padding: 10px 16px;
          cursor: pointer;
          transition: all 0.15s;
          border-left: 2px solid transparent;
        }

        .log-type-item.active {
          background: var(--bg-tertiary);
          border-left-color: var(--accent-green);
        }

        .log-type-item:hover:not(.active) {
          background: var(--bg-tertiary);
        }

        .log-type-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 500;
        }

        .log-type-size {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 2px;
          padding-left: 24px;
        }

        /* Content Area */
        .content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-secondary);
        }

        /* Filter Bar */
        .filter-bar {
          padding: 12px 20px;
          border-bottom: 1px solid var(--border-light);
          background: var(--bg-primary);
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .level-filters {
          display: flex;
          gap: 6px;
        }

        .level-filter-btn {
          height: 30px;
          padding: 0 12px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          transition: all 0.15s;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          max-width: 320px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          padding: 0 12px;
          height: 32px;
        }

        .search-input {
          background: none;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 12px;
          flex: 1;
          font-family: inherit;
        }

        .search-input::placeholder {
          color: var(--text-muted);
        }

        .clear-search {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          display: flex;
        }

        .entry-count {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-muted);
        }

        /* Log Table */
        .log-table-header {
          display: grid;
          grid-template-columns: 85px 90px 1fr;
          gap: 12px;
          padding: 10px 20px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-light);
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          position: sticky;
          top: 0;
          z-index: 5;
        }

        .log-entries-list {
          flex: 1;
          overflow-y: auto;
        }

        .log-row {
          display: grid;
          grid-template-columns: 85px 90px 1fr;
          gap: 12px;
          padding: 10px 20px;
          border-bottom: 1px solid var(--border-light);
          cursor: pointer;
          align-items: flex-start;
          transition: all 0.15s;
          border-left: 3px solid transparent;
        }

        .log-row.hovered {
          background: var(--bg-tertiary);
        }

        .log-row.selected {
          background: var(--accent-blue-light);
        }

        .log-time {
          font-size: 11px;
          color: var(--text-muted);
          font-family: var(--font-mono);
          white-space: nowrap;
        }

        .log-message {
          font-size: 12px;
          line-height: 1.5;
          word-break: break-word;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Level Badge */
        .level-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .level-error {
          background: var(--accent-red-light);
          color: var(--accent-red);
          border: 1px solid #FECACA;
        }

        .level-warn, .level-warning {
          background: var(--accent-amber-light);
          color: var(--accent-amber);
          border: 1px solid #FDE68A;
        }

        .level-info {
          background: var(--accent-blue-light);
          color: var(--accent-blue);
          border: 1px solid #BFDBFE;
        }

        .level-debug {
          background: #F1F5F9;
          color: #64748B;
          border: 1px solid #E2E8F0;
        }

        .level-unknown {
          background: #F8FAFC;
          color: #64748B;
          border: 1px solid #E2E8F0;
        }

        /* Pagination */
        .pagination-bar {
          padding: 12px 20px;
          border-top: 1px solid var(--border-light);
          background: var(--bg-primary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
        }

        .pagination-controls {
          display: flex;
          gap: 8px;
        }

        .pagination-btn {
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

        .pagination-btn:hover:not(:disabled) {
          background: var(--bg-tertiary);
          border-color: var(--border-medium);
        }

        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Empty State */
        .empty-state {
          padding: 60px;
          text-align: center;
          color: var(--text-muted);
        }

        .empty-state svg {
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .empty-state-title {
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 4px;
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
          width: 540px;
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

        .drawer-header-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .drawer-header-meta {
          display: flex;
          gap: 16px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .drawer-header-meta span {
          display: flex;
          align-items: center;
          gap: 4px;
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
          margin-bottom: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }

        .drawer-message {
          background: var(--bg-tertiary);
          border-left: 3px solid;
          border-radius: 8px;
          padding: 14px 16px;
          font-size: 13px;
          line-height: 1.6;
          word-break: break-word;
          white-space: pre-wrap;
          color: var(--text-primary);
        }

        .drawer-json, .drawer-raw {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          padding: 14px 16px;
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 300px;
          overflow-y: auto;
          line-height: 1.6;
        }

        .drawer-raw {
          max-height: 200px;
          color: var(--text-muted);
        }
      `}</style>

      {/* Top Bar */}
      <div className="top-bar">
        <div className="logo-area">
          <div className="logo-icon">
            <Terminal size={15} />
          </div>
          <div>
            <div className="logo-title">Log Viewer</div>
            <div className="logo-subtitle">backend · winston · {selectedDate}</div>
          </div>
        </div>

        <div className="date-selector">
          <button className="date-button" onClick={() => setShowDatePicker(p => !p)}>
            <Calendar size={13} />
            {selectedDate}
            <ChevronDown size={12} />
          </button>

          {showDatePicker && (
            <div className="date-dropdown">
              {dates.length === 0
                ? <div className="date-option" style={{ color: 'var(--text-muted)' }}>No log dates found</div>
                : dates.map(d => (
                  <div
                    key={d}
                    className={`date-option ${d === selectedDate ? 'active' : ''}`}
                    onClick={() => { setSelectedDate(d); setShowDatePicker(false); setPage(1); }}
                  >
                    {d}
                  </div>
                ))
              }
            </div>
          )}
        </div>

        <button className="refresh-button" onClick={() => loadEntries(page)}>
          <RefreshCw size={12} className={loading ? 'spinning' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="stats-row">
          <div className="stats-grid">
            <StatBadge label="Total" value={stats.total} color="#2563EB" icon={Layers} />
            <StatBadge label="Errors" value={stats.error} color="#DC2626" icon={AlertCircle} />
            <StatBadge label="Warnings" value={stats.warn} color="#D97706" icon={AlertTriangle} />
            <StatBadge label="Info" value={stats.info} color="#2563EB" icon={Info} />
            <StatBadge label="Debug" value={stats.debug} color="#64748B" icon={Bug} />
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="main-layout">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">Log Files</div>
          {LOG_TYPES.map(({ id, label, icon: Icon }) => {
            const file = files.find(f => f.type === id);
            const isActive = selectedType === id;
            return (
              <div
                key={id}
                className={`log-type-item ${isActive ? 'active' : ''}`}
                onClick={() => { setSelectedType(id); setPage(1); setLevelFilter(""); setSearch(""); setSearchInput(""); }}
              >
                <div className="log-type-label">
                  <Icon size={13} color={isActive ? "#059669" : "#64748B"} />
                  <span style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {label}
                  </span>
                </div>
                {file && (
                  <div className="log-type-size">{fmtBytes(file.size)}</div>
                )}
                {!file && (
                  <div className="log-type-size">no file</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="content-area">
          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="level-filters">
              {["", "error", "warn", "info", "debug"].map(lvl => {
                const cfg = lvl ? LEVEL_CONFIG[lvl] : null;
                const active = levelFilter === lvl;
                return (
                  <button
                    key={lvl || "all"}
                    className="level-filter-btn"
                    onClick={() => { setLevelFilter(lvl); setPage(1); }}
                    style={{
                      border: active ? `1px solid ${cfg?.border || "#BFDBFE"}` : "1px solid var(--border-light)",
                      background: active ? (cfg?.bg || "#EFF6FF") : "var(--bg-primary)",
                      color: active ? (cfg?.color || "#2563EB") : "var(--text-muted)",
                    }}
                  >
                    {lvl || "ALL"}
                  </button>
                );
              })}
            </div>

            <div className="search-box">
              <Search size={12} />
              <input
                type="text"
                placeholder="Search logs…"
                className="search-input"
                value={searchInput}
                onChange={e => handleSearchInput(e.target.value)}
              />
              {searchInput && (
                <button className="clear-search" onClick={() => { setSearchInput(""); setSearch(""); }}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="entry-count">
              {loading ? "Loading…" : `${total.toLocaleString()} entries`}
            </div>
          </div>

          {/* Log Table */}
          <div className="log-table-header">
            <span>Time</span>
            <span>Level</span>
            <span>Message</span>
          </div>

          <div className="log-entries-list">
            {loading ? (
              <div className="empty-state">
                <RefreshCw size={28} className="spinning" />
                <div>Reading log file…</div>
              </div>
            ) : entries.length === 0 ? (
              <div className="empty-state">
                <Database size={32} />
                <div className="empty-state-title">
                  {dates.length === 0
                    ? "No log files found yet"
                    : selectedFile
                    ? "No entries match your filters"
                    : `No ${selectedType} log for ${selectedDate}`}
                </div>
                <div style={{ fontSize: "12px", marginTop: "8px", color: "var(--text-muted)" }}>
                  {dates.length === 0
                    ? "Log files are created automatically when the server runs. Check that your backend is running and logger.js is loaded."
                    : selectedFile
                    ? "Try clearing your level filter or search term"
                    : "This log file type may not have any entries for this date"}
                </div>
              </div>
            ) : (
              entries.map((entry, i) => (
                <LogRow
                  key={i}
                  entry={entry}
                  onClick={setSelectedEntry}
                  isSelected={selectedEntry === entry}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="pagination-bar">
              <span>
                Page {page} of {pages} — {total.toLocaleString()} entries
                {LIMIT < total ? `, showing ${LIMIT} per page` : ""}
              </span>
              <div className="pagination-controls">
                <button className="pagination-btn" onClick={() => handlePage(-1)} disabled={page <= 1}>
                  <ChevronLeft size={13} />
                </button>
                <button className="pagination-btn" onClick={() => handlePage(1)} disabled={page >= pages}>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedEntry && (
        <LogDetailDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}