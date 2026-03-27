import React, { useState, useEffect } from "react";
import { LogOut } from "lucide-react";

export const buildUserInfo = () => {
  const rawUsername = localStorage.getItem("username") || "";
  const role = localStorage.getItem("role") || "User";
  const displayName = rawUsername || "User";
  const initials = displayName.slice(0, 2).toUpperCase();
  const roleLabel = role
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return { name: displayName, initials, role: roleLabel };
};

// Live clock hook
const useLiveClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

export const DashboardHeader = ({ user, onLogout }) => {
  const now = useLiveClock();
  const resolvedUser = buildUserInfo();

  const displayUser = {
    name: user?.name && user.name !== "User" ? user.name : resolvedUser.name,
    initials:
      user?.initials && user.initials !== "U"
        ? user.initials
        : resolvedUser.initials,
    role: user?.role && user.role !== "User" ? user.role : resolvedUser.role,
  };

  const dateStr = now.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 mb-2">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 gap-2 min-h-[56px]">
        {/*
          ── Left: Title
          pl-12 on mobile to clear the fixed hamburger button (≈48px wide).
          On lg+ the sidebar is static, no padding needed.
        */}
        <div className="pl-12 lg:pl-0 flex-shrink-0 min-w-0">
          <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-800 leading-tight truncate">
            CRM Cambodia
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium leading-tight">
            Dashboard
          </p>
        </div>

        {/* ── Right: date/time + user chip + logout ── */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-shrink-0">
          {/* Date & Time pill – hidden on very small screens */}
          <div className="hidden xs:flex sm:flex flex-col items-end bg-indigo-50 border border-indigo-100 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 flex-shrink-0">
            <span className="text-xs sm:text-sm font-semibold text-indigo-700 leading-tight tabular-nums whitespace-nowrap">
              {dateStr}
            </span>
            <span className="text-[10px] sm:text-xs text-indigo-500 leading-tight tabular-nums whitespace-nowrap">
              {timeStr}
            </span>
          </div>

          {/* User avatar chip */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-xs sm:text-sm flex-shrink-0">
              {displayUser.initials}
            </div>
            <div className="hidden sm:block">
              <div className="text-xs sm:text-sm font-medium text-gray-800 leading-tight truncate max-w-[100px]">
                {displayUser.name}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500 leading-tight truncate">
                {displayUser.role}
              </div>
            </div>
          </div>

          {/* Logout button */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 sm:p-2 rounded-lg bg-gray-50 border border-gray-100 text-gray-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors flex-shrink-0"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;
