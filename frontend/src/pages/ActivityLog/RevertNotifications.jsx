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
      return new Set(JSON.parse(localStorage.getItem("rn_read") || "[]"));
    } catch {
      return new Set();
    }
  });

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBase}/activity/revert-notifications?limit=20`,
        {
          credentials: "include",
        },
      );

      // Check if response is OK before parsing JSON
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications);
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch revert notifications:", err);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000); // poll every 60s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter(
    (n) => !readIds.has(String(n._id)),
  ).length;

  const markRead = (id) => {
    const next = new Set(readIds).add(String(id));
    setReadIds(next);
    localStorage.setItem("rn_read", JSON.stringify([...next]));
  };

  const markAllRead = () => {
    const next = new Set(notifications.map((n) => String(n._id)));
    setReadIds(next);
    localStorage.setItem("rn_read", JSON.stringify([...next]));
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* ── Bell button ── */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative",
          cursor: "pointer",
          padding: "6px",
          borderRadius: "8px",
          color: "var(--color-text-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 8,
              background: "#E24B4A",
              color: "#FCEBEB",
              fontSize: 10,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--color-background-primary)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {/* ── Dropdown panel ── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />

          {/* Panel */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 360,
              zIndex: 1000,
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderBottom: "0.5px solid var(--color-border-tertiary)",
                background: "var(--color-background-secondary)",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                }}
              >
                Revert activity
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-info)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
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
                borderBottom: "0.5px solid var(--color-border-tertiary)",
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
                    padding: "8px 10px",
                    textAlign: "center",
                    borderRight:
                      i < 3
                        ? "0.5px solid var(--color-border-tertiary)"
                        : "none",
                  }}
                >
                  <div
                    style={{ fontSize: 18, fontWeight: 500, color: s.color }}
                  >
                    {stats[s.key]}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-tertiary)",
                      marginTop: 1,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Notification list */}
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  No revert activity yet
                </div>
              ) : (
                notifications.map((n) => {
                  const isUnread = !readIds.has(String(n._id));
                  const ac =
                    ACTION_COLORS[n.originalAction] || ACTION_COLORS.UNKNOWN;
                  return (
                    <div
                      key={n._id}
                      onClick={() => markRead(n._id)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "10px 14px",
                        borderBottom:
                          "0.5px solid var(--color-border-tertiary)",
                        background: isUnread
                          ? "#E6F1FB"
                          : "var(--color-background-primary)",
                        cursor: "pointer",
                      }}
                    >
                      {/* Unread dot */}
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: isUnread ? "#378ADD" : "transparent",
                          flexShrink: 0,
                          marginTop: 7,
                        }}
                      />

                      {/* Action icon */}
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: ac.bg,
                          color: ac.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 500,
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
                            gap: 6,
                            marginBottom: 2,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: ac.bg,
                              color: ac.text,
                              flexShrink: 0,
                            }}
                          >
                            {n.originalAction} reverted
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--color-text-primary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {n.label}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary)",
                          }}
                        >
                          <span
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {n.revertedBy}
                          </span>
                          &nbsp;·&nbsp;{n.tableLabel || n.tableName}
                          &nbsp;·&nbsp;{relTime(n.revertedAt)}
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
                  padding: "8px 14px",
                  textAlign: "center",
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                  background: "var(--color-background-secondary)",
                }}
              >
                <span
                  onClick={() => {
                    setOpen(false);
                    window.location.href = "/activity-log?activityType=revert";
                  }}
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-info)",
                    cursor: "pointer",
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
