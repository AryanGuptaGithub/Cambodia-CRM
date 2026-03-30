import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Menu, LogOut, Bell, RefreshCw } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useNavigate } from "react-router-dom";

function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [dateTime, setDateTime] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      setIsSidebarOpen(!mobile);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login", { replace: true });
  };

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const handleRefresh = () => window.location.reload();

  const userName = localStorage.getItem("username") || "User";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const userRole = (() => {
    const role = localStorage.getItem("role") || "User";
    return role
      .toLowerCase()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  })();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isMobile={isMobile}
      />

      {/* Mobile backdrop */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center justify-between bg-[#F0F4FF] px-4 py-3 z-30 flex-shrink-0 min-h-[56px]">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/60 transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
            <button
              className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/60 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
            </button>
            <button
              onClick={toggleSidebar}
              className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center hover:bg-gray-400 transition-colors flex-shrink-0"
              aria-label="Open menu"
            >
              <span className="text-sm font-semibold text-gray-700">
                {userInitials}
              </span>
            </button>
          </div>
        </header>

        {/* ── DESKTOP HEADER (≥ lg) ── original */}
        <header className="hidden lg:flex items-center justify-between bg-white shadow px-3 sm:px-4 py-2 z-20 flex-shrink-0 min-h-[52px]">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
          </button>
          <h1 className="font-bold text-sm sm:text-base md:text-xl text-gray-800 truncate px-2">
            CRM Cambodia Dashboard
          </h1>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <div className="hidden sm:block text-gray-700 font-medium text-xs sm:text-sm tabular-nums whitespace-nowrap">
              {dateTime.toLocaleDateString()} {dateTime.toLocaleTimeString()}
            </div>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5">
              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-xs flex-shrink-0">
                {userInitials}
              </div>
              <div className="hidden md:block">
                <div className="text-xs font-medium text-gray-800 leading-tight truncate max-w-[100px]">
                  {userName}
                </div>
                <div className="text-[10px] text-gray-500 leading-tight">
                  {userRole}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-700 hover:text-red-600 transition p-1"
              title="Logout"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>
        <main
          className={`flex-1 overflow-y-auto overflow-x-hidden ${isMobile ? "bg-[#F0F4FF] p-0" : "p-3 sm:p-4 bg-gray-100"}`}
        >
          <Outlet context={{ isMobile }} />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
