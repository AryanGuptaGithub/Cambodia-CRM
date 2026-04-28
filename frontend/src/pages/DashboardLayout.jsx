import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useNavigate } from "react-router-dom";
import RevertNotifications from "./ActivityLog/RevertNotifications";

function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [dateTime, setDateTime] = useState(new Date());
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

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

  const role = (localStorage.getItem("role") || "").toLowerCase().trim();
  const isSuperAdmin = role === "super admin";

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
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ================= MOBILE HEADER ================= */}
        {isMobile && (
          <header className="flex items-center justify-between bg-[#F0F4FF] px-4 py-3 min-h-[56px]">
            <div>
              <img
                src="/mainlogo.png"
                alt="Logo"
                className="h-8 w-auto object-contain"
              />
            </div>

            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <button
                  onClick={() => navigate("/user-activity")}
                  className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                >
                  User Activity
                </button>
              )}

              {/* Revert Notifications Component */}
              <div className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/60">
                <RevertNotifications apiBase={`${backendUrl}/api`} />
              </div>

              <button
                onClick={toggleSidebar}
                className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center"
              >
                <span className="text-sm font-semibold text-gray-700">
                  {userInitials}
                </span>
              </button>
            </div>
          </header>
        )}

        {/* ================= DESKTOP HEADER ================= */}
        <header className="hidden lg:flex items-center justify-between bg-white px-4 py-2 border-b border-gray-200 shadow-sm shadow-gray-200">
          <button onClick={toggleSidebar}>
            <Menu className="w-6 h-6 text-gray-700" />
          </button>

          <h1 className="font-bold text-lg text-gray-800">
            CRM Cambodia Dashboard
          </h1>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm text-gray-700">
              {isSuperAdmin && (
                <button
                  onClick={() => navigate("/user-activity")}
                  className="px-3 py-1 text-lg font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
                >
                  User Activity
                </button>
              )}

              {/* Revert Notifications Component for Desktop */}
              <RevertNotifications apiBase={`${backendUrl}/api`} />

              <span>
                {dateTime.toLocaleDateString()} {dateTime.toLocaleTimeString()}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-lg">
              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-semibold">
                {userInitials}
              </div>

              <div className="hidden md:block">
                <div className="text-xs font-medium">{userName}</div>
                <div className="text-[10px] text-gray-500">{userRole}</div>
              </div>
            </div>

            <button onClick={handleLogout}>
              <LogOut className="w-5 h-5 text-gray-600 hover:text-red-500 cursor-pointer" />
            </button>
          </div>
        </header>

        {/* ================= MAIN ================= */}
        <main
          className={`flex-1 overflow-y-auto ${
            isMobile ? "bg-[#F0F4FF]" : "p-4 bg-gray-100"
          }`}
        >
          <Outlet context={{ isMobile }} />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
