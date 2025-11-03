import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { confirmDialog } from "../utils/confirmationDialog";
import { showToast } from "../utils/toast";
import * as XLSX from "xlsx";
import SampleExcelDownloadStaff from "../excels/SampleExcelDownloadStaff";
import { formatDateToReadable } from "../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const StaffMember = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const staffPerPage = 8;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");
  const [error, setError] = useState("");
  const [staff, setStaff] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [selected, setSelected] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Modals
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form state
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    contactNo: "",
    email: "",
    date: "",
    enabled: true,
    _id: null,
  });

  // Fetch data
  useEffect(() => {
    const fetchStaffs = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${backendUrl}/api/staffs`);
        if (!response.ok) throw new Error("Failed to fetch staff");
        const data = await response.json();
        setStaff(data);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    const fetchTeams = async () => {
      try {
        const res = await axios.get(`${backendUrl}/api/staff/teams`);
        setAllTeams(res.data.map((t) => t.trim()).filter(Boolean));
      } catch (err) {
        console.error("Error loading teams:", err);
      }
    };

    fetchStaffs();
    fetchTeams();
  }, []);

  const refreshStaffList = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/staffs`);
      const data = await res.json();
      setStaff(data);
      setSelected([]);
    } catch (err) {
      console.error("Error refreshing staff list:", err);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/staff/teams`);
      setAllTeams(res.data.map((t) => t.trim()).filter(Boolean));
    } catch (err) {
      console.error("Error loading teams:", err);
    }
  };

  // Filter logic
  const filteredStaff = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    return staff.filter((s) => {
      const matchesTab =
        selectedTab === "All" ||
        (selectedTab === "Enabled" && s.enabled === true) ||
        (selectedTab === "Disabled" && s.enabled === false);

      const repMatch = s.medicalRepName?.toLowerCase().includes(lowerSearch);
      const teamMatch = s.teamName?.toLowerCase().includes(lowerSearch);
      const contactMatch = s.contactNo?.toLowerCase().includes(lowerSearch);
      const emailMatch = s.email?.toLowerCase().includes(lowerSearch);

      return matchesTab && (repMatch || teamMatch || contactMatch || emailMatch);
    });
  }, [staff, selectedTab, searchTerm]);

  const totalPages = useMemo(
    () => Math.ceil(filteredStaff.length / staffPerPage),
    [filteredStaff.length, staffPerPage]
  );

  const currentStaff = useMemo(() => {
    const startIndex = (currentPage - 1) * staffPerPage;
    return filteredStaff.slice(startIndex, startIndex + staffPerPage);
  }, [filteredStaff, currentPage, staffPerPage]);

  const teamSuggestions = useMemo(() => {
    if (!form.teamName) return [];
    return allTeams.filter((team) =>
      team.toLowerCase().includes(form.teamName.toLowerCase())
    );
  }, [form.teamName, allTeams]);

  const toggleSelect = useCallback((staff) => {
    setSelected((prev) =>
      prev.some((c) => c.id === staff._id)
        ? prev.filter((c) => c.id !== staff._id)
        : [...prev, { id: staff._id, name: staff.medicalRepName }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentStaff.map((s) => ({
              id: s._id,
              name: s.medicalRepName,
              team: s.teamName,
            }))
          : []
      );
    },
    [currentStaff]
  );

  // Add Staff Member
  const handleAddStaff = async (e) => {
    e.preventDefault();

    if (!form.medicalRepName || !form.teamName) {
      showToast("warning", "Please fill all required fields.");
      return;
    }

    try {
      const res = await axios.post(`${backendUrl}/api/staffs`, form);
      if (res.status === 200) {
        showToast("success", "Staff added successfully!");
        setIsAddModalOpen(false);
        setForm({
          medicalRepName: "",
          teamName: "",
          contactNo: "",
          email: "",
          enabled: true,
          _id: null,
        });
        await refreshStaffList();
        await fetchTeams();
      }
    } catch (err) {
      showToast("error", "Failed to add staff.");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "teamName") setShowSuggestions(true);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || teamSuggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < teamSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : teamSuggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0)
          handleSelect(teamSuggestions[highlightedIndex]);
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
      default:
        break;
    }
  };

  const handleSelect = (team) => {
    setForm((prev) => ({ ...prev, teamName: team }));
    setShowSuggestions(false);
  };

  // UI

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Staff Member
          </button>

          <button
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            onClick={() => setShowImportModal(true)}
          >
            <Upload size={18} /> Import Staff Members
          </button>

          {selected.length > 0 && (
            <button
              onClick={() => deleteSelectedStaff()}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* === ADD STAFF MODAL === */}
      {isAddModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50">
            <div
              className="absolute inset-0"
              onClick={() => setIsAddModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Add New Staff Member
              </h2>

              <form onSubmit={handleAddStaff} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    MR Name
                  </label>
                  <input
                    type="text"
                    name="medicalRepName"
                    value={form.medicalRepName}
                    onChange={handleChange}
                    required
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Team Name
                  </label>
                  <input
                    type="text"
                    name="teamName"
                    value={form.teamName}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    className="w-full border px-3 py-2 rounded-lg"
                    placeholder="Type or select a team"
                    autoComplete="off"
                    required
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  />
                  {showSuggestions && teamSuggestions.length > 0 && (
                    <ul className="absolute z-10 bg-white border w-full max-h-40 overflow-y-auto mt-1 rounded shadow">
                      {teamSuggestions.map((team, index) => (
                        <li
                          key={index}
                          onMouseDown={() => handleSelect(team)}
                          className={`px-4 py-2 cursor-pointer ${
                            highlightedIndex === index
                              ? "bg-blue-100"
                              : "hover:bg-gray-100"
                          } ${index !== teamSuggestions.length - 1 ? "border-b" : ""}`}
                        >
                          {team}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Contact No
                  </label>
                  <input
                    type="text"
                    name="contactNo"
                    value={form.contactNo}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Status
                  </label>
                  <select
                    name="enabled"
                    value={form.enabled}
                    onChange={(e) =>
                      setForm({ ...form, enabled: e.target.value === "true" })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>

                <div className="col-span-2 flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Add Staff
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

    
    </div>
  );
};

export default StaffMember;
