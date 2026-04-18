import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Search, Download, X, Menu, Activity } from "lucide-react";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const UserActivity = () => {
  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef(null);
  const [selectedTab, setSelectedTab] = useState("today");

  // ✅ Mobile state
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ✅ Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleClearSearch = () => {
    setSearchTerm("");
    inputRef.current?.focus();
  };

  // ================= USERS =================
  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/activity-logs/users/list`);
      const formatted = res.data.data.map((u) => ({
        value: u.value,
        label:
          u.type === "staff"
            ? u.label.replace("(N/A)", "").trim() + " (MR)"
            : u.label,
        type: u.type === "staff" ? "MR" : "user",
      }));
      setUsers(formatted);
      if (formatted.length > 0) setActiveUser(formatted[0].value);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  // ================= DATA =================
  const fetchActivity = async () => {
    if (!activeUser) return;
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/activity-logs`, {
        params: { userId: activeUser, search: searchTerm },
      });
      setRecords(res.data.logs || []);
    } catch (err) {
      console.error("Error fetching activity:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);
  useEffect(() => {
    fetchActivity();
  }, [activeUser, searchTerm]);

  const totalActivity = records.length;

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {/* ✅ Sidebar (mobile only) */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ✅ MOBILE Header */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-3 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Activity className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">User Activity</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {totalActivity}
          </div>
        </div>
      )}

      {/* ✅ DESKTOP Header */}
      {!isMobileView && (
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-800">
              📊 User Activity
            </h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* SEARCH */}
            <div className="relative w-full sm:w-64">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              {searchTerm && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* EXPORT */}
            <button className="flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm">
              <Download size={14} /> Export
            </button>
          </div>
        </div>
      )}

      {/* ✅ MOBILE Search */}
      {isMobileView && (
        <div className="relative mb-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
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
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ================= FILTER BOX ================= */}
      <div
        className={`bg-white rounded-xl shadow ${isMobileView ? "p-3" : "p-4"} space-y-3 mb-4 border border-gray-200`}
      >
        {/* TABS */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: "today", label: "Today" },
            { key: "all", label: "All Records" },
            { key: "month", label: "Current Month" },
            { key: "quarter", label: "Jan - March" },
            { key: "custom", label: "Custom" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedTab(key)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg transition-colors ${
                selectedTab === key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ACTIVE FILTER */}
        <div
          className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600 flex flex-wrap gap-1`}
        >
          <span className="font-medium">Active Filter:</span>
          <span className="font-medium capitalize">
            {selectedTab === "month"
              ? "Current Month"
              : selectedTab === "quarter"
                ? "Jan - March"
                : selectedTab === "all"
                  ? "All Records"
                  : selectedTab}
          </span>
          <span>•</span>
          <span className="font-medium">User Activity</span>
        </div>

        {/* DROPDOWN */}
        <div className="w-full sm:w-72">
          <SearchableDropdown
            options={[{ value: "", label: "Select User / MR" }, ...users]}
            value={activeUser}
            onChange={setActiveUser}
          />
        </div>
      </div>

      {/* ================= CARDS ================= */}
      <div
        className={`grid gap-3 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-4"}`}
      >
        <div
          className={`bg-white rounded-xl shadow ${isMobileView ? "p-3" : "p-4"} border-l-4 border-green-500 border border-gray-200`}
        >
          <p
            className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
          >
            Total Activity
          </p>
          <h2 className={`${isMobileView ? "text-lg" : "text-2xl"} font-bold`}>
            {totalActivity}
          </h2>
        </div>

        <div
          className={`bg-white rounded-xl shadow ${isMobileView ? "p-3" : "p-4"} border-l-4 border-blue-500 border border-gray-200`}
        >
          <p
            className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
          >
            Selected User
          </p>
          <h2
            className={`${isMobileView ? "text-xs" : "text-sm"} font-bold truncate`}
          >
            {users.find((u) => u.value === activeUser)?.label || "-"}
          </h2>
        </div>

        <div
          className={`bg-white rounded-xl shadow ${isMobileView ? "p-3" : "p-4"} border-l-4 border-purple-500 border border-gray-200`}
        >
          <p
            className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
          >
            Search Results
          </p>
          <h2 className={`${isMobileView ? "text-lg" : "text-2xl"} font-bold`}>
            {records.length}
          </h2>
        </div>

        <div
          className={`bg-white rounded-xl shadow ${isMobileView ? "p-3" : "p-4"} border-l-4 border-orange-500 border border-gray-200`}
        >
          <p
            className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
          >
            Records
          </p>
          <h2 className={`${isMobileView ? "text-lg" : "text-2xl"} font-bold`}>
            {records.length}
          </h2>
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <div className="bg-white rounded-xl shadow overflow-x-auto border border-gray-200">
        <table
          className={`w-full text-center ${isMobileView ? "min-w-[500px] text-xs" : "text-sm"}`}
        >
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className={`${isMobileView ? "p-2" : "p-3"} font-medium`}>
                Date
              </th>
              <th className={`${isMobileView ? "p-2" : "p-3"} font-medium`}>
                User
              </th>
              <th className={`${isMobileView ? "p-2" : "p-3"} font-medium`}>
                Action
              </th>
              <th className={`${isMobileView ? "p-2" : "p-3"} font-medium`}>
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="text-center p-6">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
                    <span className="text-gray-500 text-sm">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : records.length ? (
              records.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t hover:bg-gray-50 ${isMobileView ? "text-xs" : "text-sm"}`}
                >
                  <td
                    className={`${isMobileView ? "p-2" : "p-3"} whitespace-nowrap text-gray-600`}
                  >
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td
                    className={`${isMobileView ? "p-2" : "p-3"} font-medium text-gray-800`}
                  >
                    {r.userName}
                  </td>
                  <td className={`${isMobileView ? "p-2" : "p-3"}`}>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        r.action === "CREATE"
                          ? "bg-green-100 text-green-700"
                          : r.action === "UPDATE"
                            ? "bg-blue-100 text-blue-700"
                            : r.action === "DELETE"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td
                    className={`${isMobileView ? "p-2" : "p-3"} text-gray-600 max-w-[200px] truncate`}
                  >
                    {r.actionLabel || r.description || "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="4"
                  className="text-center p-8 text-gray-400 text-sm"
                >
                  No activity data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserActivity;
