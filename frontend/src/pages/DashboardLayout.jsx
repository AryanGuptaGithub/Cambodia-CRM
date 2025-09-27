import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import Sidebar from "../components/Sidebar";
import SettingsSidebar from "../components/SettingsSidebar";
import { useNavigate } from "react-router-dom";
function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [dateTime, setDateTime] = useState(new Date());
  const navigate = useNavigate();

  const handleClick = () => {
    navigate("/login"); // ✅ Navigate to login page
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login", { replace: true });
  };

  // Update date/time every second
  useEffect(() => {
    const timer = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-screen w-screen overflow-y-auto bg-gray-100">
      {/* Main Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        openSettingsSidebar={() => setIsSettingsOpen(true)}
      />

      {/* Settings Sidebar (slides beside main sidebar) */}
      {isSettingsOpen && (
        <SettingsSidebar onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1">
        {/* Top bar */}
        <header className="flex items-center justify-between bg-white shadow px-4 py-2">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <Menu className="w-6 h-6" />
          </button>

          {/* Center: Title */}
          <h1 className="font-bold text-xl">CRM Cambodia Dashboard</h1>

          {/* Right: Date + User + Logout */}
          <div className="flex items-center gap-4">
            {/* Date & Time */}
            <div className="text-gray-700 font-medium animate-pulse">
              {dateTime.toLocaleDateString()} {dateTime.toLocaleTimeString()}
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="text-gray-700 hover:text-red-600 transition cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>

            {/* User Avatar */}
            <button onClick={handleClick}>
              <img
                src="https://i.pravatar.cc/40"
                alt="user"
                className="rounded-full w-8 h-8"
              />
            </button>
          </div>
        </header>

        {/* Page Outlet */}
        <main className="flex-1  p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
