import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Search,
  Download,
  X,
  Menu,
  Activity,
  Filter,
  Calendar,
  Eye,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_STYLE = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  IMPORT: "bg-yellow-100 text-yellow-800",
  EXPORT: "bg-purple-100 text-purple-800",
  REVERT: "bg-orange-100 text-orange-800",
  LOGIN: "bg-emerald-100 text-emerald-800",
  LOGOUT: "bg-gray-100 text-gray-700",
  VIEW: "bg-sky-100 text-sky-800",
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIXED: isSuperAdmin — case-insensitive, matches "SuperAdmin", "superadmin",
//    "super", "Super Admin" etc. Mirrors the backend isSuperAdminRole() helper.
// ─────────────────────────────────────────────────────────────────────────────
const checkIsSuperAdmin = (user) => {
  const role = user?.role?.toLowerCase().replace(/\s+/g, "");
  return role === "superadmin" || role === "super";
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIXED: Dynamic quarter label & date range
//    - If current month is Jan–Mar  → shows "Jan – Mar (Q1)"  with those dates
//    - If current month is Apr–Jun  → shows "Jan – Mar (Q1)"  (last complete Q)
//    - If current month is Jul–Sep  → shows "Apr – Jun (Q2)"
//    - If current month is Oct–Dec  → shows "Jul – Sep (Q3)"
//    Always returns the LAST COMPLETED quarter so data is never empty.
// ─────────────────────────────────────────────────────────────────────────────
const getLastCompleteQuarter = () => {
  const now = new Date();
  const m = now.getMonth(); // 0-based
  const y = now.getFullYear();

  // Determine which quarter we are currently IN (0-indexed)
  const currentQ = Math.floor(m / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4

  // Last complete quarter
  let lastQ = currentQ - 1;
  let qYear = y;
  if (lastQ < 0) {
    lastQ = 3;
    qYear = y - 1;
  }

  const QUARTERS = [
    { label: "Jan – Mar", startMonth: 0, endMonth: 2 },
    { label: "Apr – Jun", startMonth: 3, endMonth: 5 },
    { label: "Jul – Sep", startMonth: 6, endMonth: 8 },
    { label: "Oct – Dec", startMonth: 9, endMonth: 11 },
  ];

  const q = QUARTERS[lastQ];
  const startDate = new Date(qYear, q.startMonth, 1);
  const endDate = new Date(qYear, q.endMonth + 1, 0, 23, 59, 59, 999); // last day of month

  return {
    label: `${q.label} ${qYear} (Q${lastQ + 1})`,
    startDate,
    endDate,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIXED: Date display helpers
//    - formatDateTime → full "DD Month YYYY HH:MM:SS AM/PM"
//    - formatDateOnly → "DD Month YYYY" (used when filter is date-range only)
// ─────────────────────────────────────────────────────────────────────────────
const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${day} ${month} ${year} ${time}`;
};

const formatDateOnly = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

// Decide whether to show date-only or full datetime depending on the active filter
const formatLogDate = (iso, selectedTab, dateRange) => {
  if (selectedTab === "custom" && dateRange.start && dateRange.end) {
    // If start and end are the same calendar day, show full time
    if (dateRange.start === dateRange.end) return formatDateTime(iso);
    return formatDateOnly(iso);
  }
  if (selectedTab === "today") return formatDateTime(iso); // same day → show time
  return formatDateTime(iso); // default: always show full datetime
};

// ─────────────────────────────────────────────────────────────────────────────
// Skip _id and __v from snapshots
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_FIELDS = ["__v", "_id"];

const flatten = (obj, prefix = "") => {
  if (!obj || typeof obj !== "object") return {};
  return Object.entries(obj).reduce((acc, [k, v]) => {
    if (SKIP_FIELDS.includes(k)) return acc;
    const key = prefix ? `${prefix}.${k}` : k;
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date)
    ) {
      Object.assign(acc, flatten(v, key));
    } else if (Array.isArray(v)) {
      acc[key] = JSON.stringify(v);
    } else {
      acc[key] =
        v == null ? "" : v instanceof Date ? formatDateTime(v) : String(v);
    }
    return acc;
  }, {});
};

const humanKey = (key, tableName) => {
  if (tableName === "customers" && key === "date") return "Joining Date";
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/\./g, " › ")
    .replace(/^./, (c) => c.toUpperCase());
};
const getFieldLabel = (field, tableName) => humanKey(field, tableName);

// ─────────────────────────────────────────────────────────────────────────────
// DeleteSnapshotTable
// ─────────────────────────────────────────────────────────────────────────────
const DeleteSnapshotTable = ({ log, onRevertSingleRecord, isSuperAdmin }) => {
  const rows = log.previousSnapshots?.length
    ? log.previousSnapshots
    : Array.isArray(log.previousData)
      ? log.previousData.map((d) => ({ data: d }))
      : log.previousData
        ? [{ data: log.previousData }]
        : [];

  if (!rows.length)
    return (
      <p className="text-gray-500 italic text-sm">
        No deleted record snapshot available.
      </p>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-red-700">
        🗑 {rows.length} Deleted Record{rows.length > 1 ? "s" : ""}
      </p>
      {rows.map((row, idx) => {
        const doc = row.data || row;
        const flat = flatten(doc);
        const entries = Object.entries(flat);
        const recordId = doc._id || doc.id || `record-${idx}`;

        return (
          <div
            key={idx}
            className="border border-red-200 rounded-lg overflow-hidden"
          >
            <div className="bg-red-50 px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-red-700 uppercase tracking-wide">
                Record {rows.length > 1 ? `#${idx + 1}` : ""}{" "}
                {row.refNumber ? `— ${row.refNumber}` : ""}
              </span>
              {isSuperAdmin && !log.isReverted && (
                <button
                  onClick={() => onRevertSingleRecord(log, recordId, idx)}
                  className="flex items-center gap-1 px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded transition-colors"
                >
                  <RotateCcw size={12} /> Revert This Record
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {entries.map(([k, v]) => (
                  <tr
                    key={k}
                    className="border-t border-red-100 hover:bg-red-50"
                  >
                    <td className="px-4 py-2 font-medium text-red-800 w-1/3 align-top">
                      {getFieldLabel(k, log.tableName)}
                    </td>
                    <td className="px-4 py-2 text-red-700 break-all">
                      {v || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// UpdateDiffTable
// ─────────────────────────────────────────────────────────────────────────────
const UpdateDiffTable = ({ log }) => {
  const prevDoc = log.previousSnapshots?.[0]?.data || log.previousData;
  const newDoc = log.newSnapshots?.[0]?.data || log.newData;

  if (!prevDoc && !newDoc)
    return (
      <p className="text-gray-500 italic text-sm">
        No snapshot data available.
      </p>
    );

  const prevFlat = flatten(prevDoc || {});
  const newFlat = flatten(newDoc || {});
  const allKeys = [
    ...new Set([...Object.keys(prevFlat), ...Object.keys(newFlat)]),
  ];
  const changed = allKeys.filter((k) => prevFlat[k] !== newFlat[k]);
  const unchanged = allKeys.filter((k) => prevFlat[k] === newFlat[k]);

  return (
    <div className="space-y-4">
      {changed.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-blue-700 mb-2">
            ✏️ {changed.length} Changed Field{changed.length > 1 ? "s" : ""}
          </p>
          <div className="border border-blue-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-50">
                  <th className="px-4 py-2 text-left font-semibold text-blue-800 w-1/4">
                    Field
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-red-700 w-[37.5%]">
                    Before
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-green-700 w-[37.5%]">
                    After
                  </th>
                </tr>
              </thead>
              <tbody>
                {changed.map((k) => (
                  <tr key={k} className="border-t border-blue-100">
                    <td className="px-4 py-2 font-medium text-gray-700">
                      {getFieldLabel(k, log.tableName)}
                    </td>
                    <td className="px-4 py-2 bg-red-50   text-red-700   break-all">
                      {prevFlat[k] || "—"}
                    </td>
                    <td className="px-4 py-2 bg-green-50 text-green-700 break-all">
                      {newFlat[k] || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {unchanged.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
            {unchanged.length} unchanged field{unchanged.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {unchanged.map((k) => (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-500 w-1/3">
                      {getFieldLabel(k, log.tableName)}
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {newFlat[k] || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {changed.length === 0 && (
        <p className="text-gray-500 italic text-sm">
          No field differences detected.
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GenericSnapshotTable
// ─────────────────────────────────────────────────────────────────────────────
const GenericSnapshotTable = ({ log }) => {
  const snapshots = log.newSnapshots?.length
    ? log.newSnapshots
    : log.previousSnapshots?.length
      ? log.previousSnapshots
      : null;

  const flat = flatten(
    snapshots?.[0]?.data || log.newData || log.previousData || {},
  );
  const entries = Object.entries(flat);

  if (!entries.length)
    return (
      <p className="text-gray-500 italic text-sm">
        No data snapshot available.
      </p>
    );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-700 w-1/3">
                {getFieldLabel(k, log.tableName)}
              </td>
              <td className="px-4 py-2 text-gray-600 break-all">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
const DetailModal = ({
  log,
  onClose,
  onRevertClick,
  onRevertSingleRecord,
  isSuperAdmin,
}) => {
  if (!log) return null;

  const renderContent = () => {
    switch (log.action) {
      case "DELETE":
        return (
          <DeleteSnapshotTable
            log={log}
            onRevertSingleRecord={onRevertSingleRecord}
            isSuperAdmin={isSuperAdmin}
          />
        );
      case "UPDATE":
        return <UpdateDiffTable log={log} />;
      default:
        return <GenericSnapshotTable log={log} />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ACTION_STYLE[log.action] || "bg-gray-100 text-gray-700"}`}
              >
                {log.action}
              </span>
              {log.isReverted && (
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                  ↩ Reverted
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-800">
              {log.actionLabel ||
                `${log.action} on ${log.tableLabel || log.tableName}`}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDateTime(log.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Meta */}
        <div className="px-5 py-4 bg-gray-50 border-b text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {[
              ["User", log.userName || "System"],
              ["Role", log.userRole || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                  {label}
                </span>
                <span className="text-gray-700 font-medium truncate">
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              Description
            </span>
            <span className="text-gray-700 font-medium">
              {log.description || "—"}
            </span>
          </div>
        </div>

        {/* Revert info */}
        {log.isReverted && (
          <div className="mx-5 mt-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
            <span className="font-semibold text-orange-800">↩ Reverted</span> by{" "}
            <span className="font-semibold">{log.revertedBy}</span> on{" "}
            {formatDateTime(log.revertedAt)}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-gray-50 rounded-b-2xl">
          {isSuperAdmin &&
            !log.isReverted &&
            ["DELETE", "UPDATE"].includes(log.action) && (
              <button
                onClick={() => {
                  onClose();
                  onRevertClick(log);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <RotateCcw size={14} /> Revert All
              </button>
            )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Revert Confirm Modal
// ─────────────────────────────────────────────────────────────────────────────
const RevertModal = ({
  log,
  recordId,
  recordIndex,
  onConfirm,
  onCancel,
  loading,
}) => {
  if (!log) return null;

  const isSingleRecord = recordId !== null && recordId !== undefined;
  const message = isSingleRecord
    ? `You are about to revert Record #${recordIndex + 1} from this deletion.`
    : `You are about to revert: ${log.actionLabel}. ${
        log.action === "DELETE"
          ? "All deleted records will be restored to the database."
          : "The record will be rolled back to its previous state."
      }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-3">
          ⚠️ Confirm Revert
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-5">
          {message}
          <br />
          <br />
          <strong className="text-red-600">This cannot be undone.</strong>
        </p>
        <div className="flex gap-3 justify-end">
          <button
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold rounded-lg"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg disabled:opacity-60"
          >
            <RotateCcw size={14} />
            {loading ? "Reverting…" : "Yes, Revert"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type }) => (
  <div
    className={`fixed top-5 right-5 z-[999] px-5 py-3 rounded-xl shadow-lg text-sm font-semibold border ${
      type === "error"
        ? "bg-red-50 text-red-800 border-red-200"
        : "bg-green-50 text-green-800 border-green-200"
    }`}
  >
    {msg}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const UserActivity = ({ currentUser: propCurrentUser }) => {
  // ✅ Read user from prop first, fallback to localStorage
  const [currentUser, setCurrentUser] = useState(() => {
    if (propCurrentUser) return propCurrentUser;
    try {
      const raw = localStorage.getItem("user");
      if (raw) return JSON.parse(raw);
      // fallback from flat keys
      const email = localStorage.getItem("email");
      const role = localStorage.getItem("role");
      if (email || role) return { name: email || "User", email, role };
    } catch {}
    return null;
  });

  useEffect(() => {
    if (propCurrentUser) setCurrentUser(propCurrentUser);
  }, [propCurrentUser]);

  // ✅ isSuperAdmin is now case-insensitive
  const isSuperAdmin = checkIsSuperAdmin(currentUser);

  const [users, setUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeUser, setActiveUser] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("today");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedLog, setSelectedLog] = useState(null);
  const [revertLog, setRevertLog] = useState(null);
  const [singleRecordRevert, setSingleRecordRevert] = useState(null);
  const [reverting, setReverting] = useState(false);
  const [toast, setToast] = useState(null);

  const inputRef = useRef(null);

  // ✅ Compute quarter info once and reuse
  const quarterInfo = getLastCompleteQuarter();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ✅ FIXED: getDateFilter uses dynamic quarterInfo
  const getDateFilter = useCallback(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ymd = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    switch (selectedTab) {
      case "today":
        return { startDate: ymd(now), endDate: now.toISOString() };
      case "month":
        return {
          startDate: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
          endDate: now.toISOString(),
        };
      case "quarter":
        return {
          startDate: quarterInfo.startDate.toISOString(),
          endDate: quarterInfo.endDate.toISOString(),
        };
      case "custom":
        return {
          startDate: dateRange.start
            ? new Date(dateRange.start).toISOString()
            : undefined,
          endDate: dateRange.end
            ? new Date(dateRange.end + "T23:59:59").toISOString()
            : undefined,
        };
      default: // "all"
        return {};
    }
  }, [selectedTab, dateRange, quarterInfo]);

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    axios
      .get(`${backendUrl}/api/activity-logs/users/list`)
      .then((res) => {
        if (!res.data.success) return;
        const formatted = res.data.data.map((u) => ({
          value: u.value,
          label:
            u.type === "staff"
              ? u.label.replace("(N/A)", "").trim() + " (MR)"
              : u.label,
          type: u.type,
        }));
        setUsers([
          { value: "all", label: "👥 All Users", type: "all" },
          ...formatted,
        ]);
      })
      .catch(console.error);
  }, []);

  const fetchActivity = useCallback(
    async (goPage = 1) => {
      setLoading(true);
      try {
        const dateFilter = getDateFilter();
        const params = { page: goPage, limit: 50 };
        if (activeUser && activeUser !== "all") params.userId = activeUser;
        if (searchTerm.trim()) params.search = searchTerm.trim();
        if (dateFilter.startDate) params.startDate = dateFilter.startDate;
        if (dateFilter.endDate) params.endDate = dateFilter.endDate;

        const res = await axios.get(`${backendUrl}/api/activity-logs`, {
          params,
        });
        setRecords(res.data.logs || []);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
        setPage(goPage);
      } catch (err) {
        console.error("Error fetching activity:", err);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [activeUser, searchTerm, getDateFilter],
  );

  useEffect(() => {
    fetchActivity(1);
  }, [activeUser, searchTerm, selectedTab, dateRange]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const dateFilter = getDateFilter();
      const params = new URLSearchParams();
      if (activeUser && activeUser !== "all") params.set("userId", activeUser);
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (dateFilter.startDate) params.set("startDate", dateFilter.startDate);
      if (dateFilter.endDate) params.set("endDate", dateFilter.endDate);

      const res = await fetch(
        `${backendUrl}/api/activity-logs/export?${params}`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity_logs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Export downloaded successfully!");
    } catch {
      showToast("Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  const handleRevert = async () => {
    if (!revertLog) return;
    setReverting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${backendUrl}/api/activity-logs/${revertLog._id}/revert`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data.success) {
        showToast("Action reverted successfully!");
        setRevertLog(null);
        fetchActivity(page);
      } else {
        showToast(res.data.message || "Revert failed", "error");
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Revert failed", "error");
    } finally {
      setReverting(false);
    }
  };

  const handleSingleRecordRevert = async () => {
    if (!singleRecordRevert) return;
    const { log, recordId, recordIndex } = singleRecordRevert;
    setReverting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${backendUrl}/api/activity-logs/${log._id}/revert-single`,
        { recordId, recordIndex },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data.success) {
        showToast(`Record #${recordIndex + 1} reverted successfully!`);
        setSingleRecordRevert(null);
        fetchActivity(page);
      } else {
        showToast(res.data.message || "Revert failed", "error");
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Revert failed", "error");
    } finally {
      setReverting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile
        />
      )}

      <DetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        onRevertClick={(log) => setRevertLog(log)}
        onRevertSingleRecord={(log, recordId, recordIndex) =>
          setSingleRecordRevert({ log, recordId, recordIndex })
        }
        isSuperAdmin={isSuperAdmin}
      />
      <RevertModal
        log={revertLog}
        recordId={null}
        recordIndex={null}
        onConfirm={handleRevert}
        onCancel={() => setRevertLog(null)}
        loading={reverting}
      />
      <RevertModal
        log={singleRecordRevert?.log}
        recordId={singleRecordRevert?.recordId}
        recordIndex={singleRecordRevert?.recordIndex}
        onConfirm={handleSingleRecordRevert}
        onCancel={() => setSingleRecordRevert(null)}
        loading={reverting}
      />

      {/* Mobile Header */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-white shadow-sm active:bg-gray-100"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Activity className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">User Activity</h1>
          </div>
          <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {total}
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobileView && (
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-2 rounded-xl">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                User Activity Logs
              </h1>
              <p className="text-sm text-gray-500">
                Track all user actions • Auto-deleted after 30 days
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by user, action, reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
            >
              <Download size={16} /> {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
        </div>
      )}

      {/* Mobile search */}
      {isMobileView && (
        <div className="relative mb-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search activities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Filter box */}
      <div
        className={`bg-white rounded-xl shadow-sm ${isMobileView ? "p-3" : "p-4"} space-y-3 mb-4 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2">
          {/* ✅ FIXED: "quarter" tab now shows dynamic label e.g. "Jan – Mar 2025 (Q1)" */}
          {[
            { key: "today", label: "Today" },
            { key: "all", label: "All Records" },
            { key: "month", label: "Current Month" },
            { key: "quarter", label: quarterInfo.label },
            { key: "custom", label: "Custom" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedTab(key)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg transition-all duration-200 ${
                selectedTab === key
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {selectedTab === "custom" && (
          <div className="flex flex-wrap gap-3 items-center pt-1">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange({ ...dateRange, start: e.target.value })
                }
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <span className="text-gray-500 text-sm">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange({ ...dateRange, end: e.target.value })
              }
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {(dateRange.start || dateRange.end) && (
              <button
                onClick={() => setDateRange({ start: "", end: "" })}
                className="text-red-500 text-sm hover:text-red-700"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
          <Filter size={12} />
          <span>Filter:</span>
          <span className="font-medium text-gray-700">
            {selectedTab === "custom"
              ? `${dateRange.start || "any"} to ${dateRange.end || "any"}`
              : selectedTab === "all"
                ? "All time"
                : selectedTab === "quarter"
                  ? quarterInfo.label
                  : selectedTab}
          </span>
          {activeUser !== "all" && (
            <>
              <span>•</span>
              <span>
                User:{" "}
                <span className="font-medium">
                  {users.find((u) => u.value === activeUser)?.label ||
                    activeUser}
                </span>
              </span>
            </>
          )}
          <span>•</span>
          <span className="text-orange-600 font-medium">
            Logs auto-delete after 30 days
          </span>
        </div>

        <div className="w-full sm:w-80">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Select User
          </label>
          <SearchableDropdown
            options={users}
            value={activeUser}
            onChange={(value) => setActiveUser(value)}
            placeholder="Select User / MR"
          />
        </div>
      </div>

      {/* Stats cards */}
      <div
        className={`grid gap-3 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-4"}`}
      >
        {[
          {
            label: "Total Activity",
            value: total,
            color: "border-green-500",
            sub: "All records",
          },
          {
            label: "Selected User",
            value:
              activeUser === "all"
                ? "All Users"
                : users.find((u) => u.value === activeUser)?.label || "—",
            color: "border-blue-500",
            sub: "Current filter",
            small: true,
          },
          {
            label: "Search Results",
            value: records.length,
            color: "border-purple-500",
            sub: "Matching records",
          },
          {
            label: "Unique Actions",
            value: new Set(records.map((r) => r.action)).size,
            color: "border-orange-500",
            sub: "Action types",
          },
        ].map(({ label, value, color, sub, small }) => (
          <div
            key={label}
            className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${color} border border-gray-200 hover:shadow-md transition-shadow`}
          >
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {label}
            </p>
            <h2
              className={`font-bold text-gray-800 mt-1 ${small ? "text-sm truncate" : "text-2xl"}`}
            >
              {value}
            </h2>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto border border-gray-200">
        <table
          className={`w-full text-center ${isMobileView ? "min-w-[640px] text-xs" : "text-sm"}`}
        >
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 border-b">
            <tr>
              {["Date & Time", "User", "Action", "Details", ""].map((col) => (
                <th
                  key={col}
                  className={`${isMobileView ? "p-3" : "p-4"} font-semibold text-left`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center p-8">
                  <div className="flex justify-center items-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span className="text-gray-500">Loading activities…</span>
                  </div>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Activity size={48} className="text-gray-300" />
                    <p className="text-gray-400 font-medium">
                      No activity data found
                    </p>
                    <p className="text-gray-400 text-sm">
                      Try changing your filters or search criteria
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((r, i) => (
                <tr
                  key={r._id || i}
                  className={`border-t hover:bg-gray-50 transition-colors duration-150 ${
                    r.isReverted
                      ? "bg-orange-50"
                      : i % 2 === 0
                        ? "bg-white"
                        : "bg-gray-50/50"
                  }`}
                >
                  {/* ✅ FIXED: date column uses formatLogDate which is date-only for multi-day ranges */}
                  <td
                    className={`${isMobileView ? "p-3" : "p-4"} text-left whitespace-nowrap text-gray-600 font-mono text-xs`}
                  >
                    {formatLogDate(r.createdAt, selectedTab, dateRange)}
                  </td>
                  <td className={`${isMobileView ? "p-3" : "p-4"} text-left`}>
                    <span className="font-medium text-gray-800">
                      {r.userName || "System"}
                    </span>
                    {r.userRole && (
                      <span className="block text-xs text-gray-400">
                        {r.userRole}
                      </span>
                    )}
                  </td>
                  <td className={`${isMobileView ? "p-3" : "p-4"} text-left`}>
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ACTION_STYLE[r.action] || "bg-gray-100 text-gray-700"}`}
                    >
                      {r.action}
                    </span>
                    {r.isReverted && (
                      <span className="block text-xs text-orange-500 mt-0.5">
                        ↩ reverted
                      </span>
                    )}
                  </td>
                  <td
                    className={`${isMobileView ? "p-3" : "p-4"} text-left text-gray-600 max-w-xs truncate`}
                    title={r.actionLabel || r.description}
                  >
                    {r.actionLabel || r.description || "—"}
                  </td>
                  <td
                    className={`${isMobileView ? "p-3" : "p-4"} text-left whitespace-nowrap`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedLog(r)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Eye size={12} /> View
                      </button>
                      {isSuperAdmin &&
                        !r.isReverted &&
                        ["DELETE", "UPDATE"].includes(r.action) && (
                          <button
                            onClick={() => setRevertLog(r)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <RotateCcw size={12} /> Revert
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          <button
            disabled={page === 1}
            onClick={() => fetchActivity(page - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(
            (p) => (
              <button
                key={p}
                onClick={() => fetchActivity(p)}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
                  p === page
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            disabled={page === totalPages}
            onClick={() => fetchActivity(page + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-4">
        Activity logs are automatically deleted after 30 days.
      </p>
    </div>
  );
};

export default UserActivity;
