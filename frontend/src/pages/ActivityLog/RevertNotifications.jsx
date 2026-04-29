import { useState, useEffect, useCallback } from "react";

const ACTION_COLORS = {
  DELETE: { bg: "#FCEBEB", text: "#A32D2D", icon: "×" },
  UPDATE: { bg: "#FAEEDA", text: "#854F0B", icon: "~" },
  CREATE: { bg: "#EAF3DE", text: "#3B6D11", icon: "+" },
  IMPORT: { bg: "#E1F5EE", text: "#0F6E56", icon: "↑" },
  UNKNOWN: { bg: "#F1EFE8", text: "#5F5E5A", icon: "?" },
};

function relTime(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Helper to get auth token
const getAuthToken = () => {
  return localStorage.getItem("token");
};

export default function RevertNotifications({ apiBase = "/api" }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    delete: 0,
    update: 0,
    create: 0,
    import: 0,
  });
  const [readIds, setReadIds] = useState(() => {
    try {
      const stored = localStorage.getItem("rn_read");
      if (stored) {
        return new Set(JSON.parse(stored));
      }
      return new Set();
    } catch {
      return new Set();
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNotifications = useCallback(async () => {
    const token = getAuthToken();

    if (!token) {
      console.warn("No auth token found, skipping fetch");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = `${apiBase}/activity-logs/revert-notifications?limit=20`;
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        console.warn("Authentication failed - token may be expired");
        setError("Authentication failed. Please refresh the page.");
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        setStats(
          data.stats || {
            total: 0,
            delete: 0,
            update: 0,
            create: 0,
            import: 0,
          },
        );
      } else {
        throw new Error(data.message || "Failed to fetch notifications");
      }
    } catch (err) {
      console.error("Failed to fetch revert notifications:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Calculate unread count
  const unreadCount = notifications.filter(
    (n) => n._id && !readIds.has(String(n._id)),
  ).length;

  const markRead = (id) => {
    if (!id) return;
    const next = new Set(readIds);
    next.add(String(id));
    setReadIds(next);
    localStorage.setItem("rn_read", JSON.stringify([...next]));
  };

  const markAllRead = () => {
    const next = new Set();
    notifications.forEach((n) => {
      if (n._id) next.add(String(n._id));
    });
    setReadIds(next);
    localStorage.setItem("rn_read", JSON.stringify([...next]));
  };

  // Clean up stale read IDs
  useEffect(() => {
    const validIds = new Set(notifications.map((n) => String(n._id)));
    const cleanedReadIds = new Set();
    readIds.forEach((id) => {
      if (validIds.has(id)) {
        cleanedReadIds.add(id);
      }
    });

    if (cleanedReadIds.size !== readIds.size) {
      setReadIds(cleanedReadIds);
      localStorage.setItem("rn_read", JSON.stringify([...cleanedReadIds]));
    }
  }, [notifications]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          
          @media (min-width: 768px) {
            .responsive-panel {
              position: absolute !important;
              top: calc(100% + 8px) !important;
              bottom: auto !important;
              left: auto !important;
              right: 0 !important;
              width: 400px !important;
              max-height: 500px !important;
              border-radius: 12px !important;
              box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
              animation: fadeIn 0.2s ease-out !important;
            }
            
            .responsive-panel .handle-bar {
              display: none !important;
            }
          }
        `}
      </style>

      {/* Bell button */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative",
          cursor: "pointer",
          padding: "8px",
          borderRadius: "8px",
          color: "var(--color-text-primary, #333)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(0,0,0,0.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
        title="Revert notifications"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2a6 6 0 00-6 6v3l-1.5 2.5h15L16 11V8a6 6 0 00-6-6z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d="M8 16a2 2 0 004 0"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-2px",
              right: "-2px",
              minWidth: "18px",
              height: "18px",
              padding: "0 5px",
              borderRadius: "9px",
              background: "#E24B4A",
              color: "#FFFFFF",
              fontSize: "10px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--color-background-primary, #fff)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {/* Dropdown Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              animation: "fadeIn 0.2s ease-out",
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: "fixed",
              top: "auto",
              bottom: 0,
              left: 0,
              right: 0,
              width: "100%",
              maxHeight: "85vh",
              zIndex: 10000,
              background: "#E5E7EB",
              borderRadius: "16px 16px 0 0",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              animation: "slideUp 0.3s ease-out",
            }}
            className="responsive-panel"
          >
            {/* Handle bar for mobile */}
            <div
              className="handle-bar"
              style={{
                width: "40px",
                height: "4px",
                background: "#9CA3AF",
                borderRadius: "2px",
                margin: "12px auto 8px",
                cursor: "pointer",
              }}
              onClick={() => setOpen(false)}
            />

            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                background: "#E5E7EB",
              }}
            >
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Revert activity {unreadCount > 0 && `(${unreadCount} new)`}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    fontSize: "12px",
                    color: "#3B82F6",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontWeight: 500,
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(59,130,246,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Stats row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 0,
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                background: "#E5E7EB",
                padding: "8px 0",
              }}
            >
              {[
                { key: "delete", label: "Delete", color: "#A32D2D" },
                { key: "update", label: "Update", color: "#854F0B" },
                { key: "create", label: "Create", color: "#3B6D11" },
                { key: "import", label: "Import", color: "#0F6E56" },
              ].map((s, i) => (
                <div
                  key={s.key}
                  style={{
                    padding: "8px 0",
                    textAlign: "center",
                    borderRight: i < 3 ? "1px solid rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "clamp(18px, 5vw, 22px)",
                      fontWeight: 700,
                      color: s.color,
                    }}
                  >
                    {stats[s.key] || 0}
                  </div>
                  <div
                    style={{
                      fontSize: "clamp(10px, 3vw, 11px)",
                      color: "#6B7280",
                      marginTop: "4px",
                      fontWeight: 500,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Notification list */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                minHeight: 0,
                WebkitOverflowScrolling: "touch",
              }}
            >
              {isLoading && notifications.length === 0 ? (
                <div
                  style={{
                    padding: "48px 20px",
                    textAlign: "center",
                    fontSize: "13px",
                    color: "#6B7280",
                    background: "#E5E7EB",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  >
                    Loading...
                  </div>
                </div>
              ) : error && notifications.length === 0 ? (
                <div
                  style={{
                    padding: "48px 20px",
                    textAlign: "center",
                    fontSize: "13px",
                    color: "#DC2626",
                    background: "#E5E7EB",
                  }}
                >
                  <div>⚠️ Failed to load notifications</div>
                  <button
                    onClick={fetchNotifications}
                    style={{
                      marginTop: "12px",
                      padding: "6px 12px",
                      background: "#3B82F6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div
                  style={{
                    padding: "48px 20px",
                    textAlign: "center",
                    fontSize: "13px",
                    color: "#6B7280",
                    background: "#E5E7EB",
                  }}
                >
                  🔔 No revert activity yet
                </div>
              ) : (
                notifications.map((n) => {
                  const isUnread = n._id && !readIds.has(String(n._id));
                  const ac =
                    ACTION_COLORS[n.originalAction] || ACTION_COLORS.UNKNOWN;
                  return (
                    <div
                      key={n._id}
                      onClick={() => markRead(n._id)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        padding: "12px 16px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        background: isUnread ? "#DBEAFE" : "#E5E7EB",
                        cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isUnread) {
                          e.currentTarget.style.background = "#D1D5DB";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isUnread) {
                          e.currentTarget.style.background = "#E5E7EB";
                        }
                      }}
                    >
                      {/* Unread dot */}
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: isUnread ? "#3B82F6" : "transparent",
                          flexShrink: 0,
                          marginTop: "8px",
                        }}
                      />

                      {/* Action icon */}
                      <div
                        style={{
                          width: "clamp(28px, 6vw, 32px)",
                          height: "clamp(28px, 6vw, 32px)",
                          borderRadius: "50%",
                          background: ac.bg,
                          color: ac.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "clamp(12px, 3vw, 14px)",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {ac.icon}
                      </div>

                      {/* Body */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "6px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "clamp(9px, 3vw, 10px)",
                              fontWeight: 600,
                              padding: "3px 8px",
                              borderRadius: "4px",
                              background: ac.bg,
                              color: ac.text,
                              flexShrink: 0,
                              textTransform: "uppercase",
                              letterSpacing: "0.3px",
                            }}
                          >
                            {n.originalAction}
                          </span>
                          <span
                            style={{
                              fontSize: "clamp(12px, 3.5vw, 13px)",
                              fontWeight: isUnread ? 600 : 500,
                              color: "#111827",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                            }}
                          >
                            {n.label || `${n.originalAction} reverted`}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "clamp(10px, 3vw, 11px)",
                            color: "#6B7280",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ color: "#4B5563", fontWeight: 500 }}>
                            {n.revertedBy || "System"}
                          </span>
                          <span style={{ color: "#9CA3AF" }}>•</span>
                          <span>
                            {n.tableLabel || n.tableName || "Unknown"}
                          </span>
                          <span style={{ color: "#9CA3AF" }}>•</span>
                          <span>{relTime(n.revertedAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div
                style={{
                  padding: "12px 16px",
                  textAlign: "center",
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  background: "#E5E7EB",
                  flexShrink: 0,
                }}
              >
                <span
                  onClick={() => {
                    setOpen(false);
                    window.location.href = "/activity-log?activityType=revert";
                  }}
                  style={{
                    fontSize: "13px",
                    color: "#3B82F6",
                    cursor: "pointer",
                    fontWeight: 600,
                    display: "inline-block",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(59,130,246,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  View all revert logs →
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
