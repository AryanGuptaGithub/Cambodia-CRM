import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isMobile={isMobile}          
      />

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-between bg-white shadow px-3 sm:px-4 py-2 z-20 flex-shrink-0 min-h-[52px]">

          {/* ☰ Hamburger — ONE button, always in the header */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
          </button>

          {/* Title */}
          <h1 className="font-bold text-sm sm:text-base md:text-xl text-gray-800 truncate px-2">
            CRM Cambodia Dashboard
          </h1>

          {/* Right: Date/Time + Logout + Avatar */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">

            {/* Date & time — hidden on very small screens */}
            <div className="hidden sm:block text-gray-700 font-medium text-xs sm:text-sm tabular-nums whitespace-nowrap">
              {dateTime.toLocaleDateString()}{" "}{dateTime.toLocaleTimeString()}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="text-gray-700 hover:text-red-600 transition p-1"
              title="Logout"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Avatar */}
            <button onClick={() => navigate("/login")}>
              <img
                src="https://i.pravatar.cc/40"
                alt="user"
                className="rounded-full w-7 h-7 sm:w-8 sm:h-8"
              />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
