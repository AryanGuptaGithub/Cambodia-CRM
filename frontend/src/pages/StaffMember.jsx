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

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");
  const [error, setError] = useState("");

  // UI modals
  const [modals, setModals] = useState({
    import: false,
    edit: false,
    view: false,
    delete: false,
  });

  // Staff Data
  const [staff, setStaff] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [selected, setSelected] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // Form State
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    contactNo: "",
    email: "",
    date: "",
    enabled: "",
    _id: null,
  });

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  const fetchTeams = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/staff/teams`);
      setAllTeams(res.data.map((t) => t.trim()).filter(Boolean));
    } catch (err) {
      console.error("Error loading teams:", err);
    }
  };

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

      return (
        matchesTab && (repMatch || teamMatch || contactMatch || emailMatch)
      );
    });
  }, [staff, selectedTab, searchTerm]);

  const teamSuggestions = useMemo(() => {
    if (!form.teamName) return [];
    return allTeams.filter((team) =>
      team.toLowerCase().includes(form.teamName.toLowerCase())
    );
  }, [form.teamName, allTeams]);

  const totalPages = useMemo(
    () => Math.ceil(filteredStaff.length / staffPerPage),
    [filteredStaff.length, staffPerPage]
  );

  const currentStaff = useMemo(() => {
    const startIndex = (currentPage - 1) * staffPerPage;
    return filteredStaff.slice(startIndex, startIndex + staffPerPage);
  }, [filteredStaff, currentPage, staffPerPage]);

  const visiblePages = useMemo(() => {
    if (totalPages <= 5) return [...Array(totalPages).keys()].map((i) => i + 1);

    if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
    if (currentPage >= totalPages - 2)
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];

    return [1, "...", currentPage, "...", totalPages];
  }, [currentPage, totalPages]);

  // Select / Deselect a single staff
  const toggleSelect = useCallback((staff) => {
    setSelected((prev) =>
      prev.some((c) => c.id === staff._id)
        ? prev.filter((c) => c.id !== staff._id)
        : [...prev, { id: staff._id, name: staff.medicalRepName }]
    );
  }, []);

  // Select / Deselect all visible staff
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

  // View handler
  const handleView = useCallback((staff) => {
    setForm(staff);
    setIsViewModalOpen(true);
  }, []);

  // Edit handler
  const handleEdit = useCallback((staff) => {
    setForm(staff);
    setIsEditModalOpen(true);
  }, []);

  // ⏬ Common fetch function to refresh staff data
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

  // ✅ Generic delete handler for single or multiple staff
  const handleDelete = async ({
    staffIds = [],
    staffName = "",
    isBulk = false,
  }) => {
    const confirm = await confirmDialog({
      title: "Delete",
      text: isBulk
        ? `Are you sure you want to delete <b>${staffIds.length}</b> staff member(s)?`
        : `Are you sure you want to delete <b>${staffName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) {
      setSelected([]);
      return;
    }

    try {
      const endpoint = isBulk
        ? `${backendUrl}/api/staffs`
        : `${backendUrl}/api/staff/${staffIds[0]}`;

      const config = isBulk ? { data: staffIds } : undefined;
      const res = await axios.delete(endpoint, config);

      if (res.status === 200) {
        const message = isBulk
          ? res.data.message
          : `Staff <b>${staffName}</b> deleted successfully`;

        showToast("success", message);
        await refreshStaffList();
        await fetchTeams();
      }
    } catch (err) {
      showToast(
        "error",
        err?.response?.data?.message || "Failed to delete staff."
      );
    }
  };

  // ✅ Bulk delete
  const deleteSelectedStaff = async () => {
    const staffIds = selected.map((s) => s.id);
    await handleDelete({ staffIds, isBulk: true });
  };

  // ✅ Single delete
  const deleteStaff = async (staff) => {
    if (!staff?._id) return;
    await handleDelete({
      staffIds: [staff._id],
      staffName: staff.medicalRepName,
      isBulk: false,
    });
  };

  // ✅ CORRECTED File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        let headerRowIndex = -1;
        let headersMap = {};

        // Find the row that contains headers (case-insensitive)
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const normalizedRow = row.map((cell) =>
            cell.toString().trim().toLowerCase()
          );

          // Match the exact column names from your Excel file
          if (
            normalizedRow.includes("no") &&
            normalizedRow.includes("mr name") &&
            normalizedRow.includes("team name") && // Fixed: was "team", now "team name"
            normalizedRow.includes("contact no") &&
            normalizedRow.includes("email")
          ) {
            headerRowIndex = i;
            headersMap = normalizedRow.reduce((acc, header, index) => {
              acc[index] = header;
              return acc;
            }, {});
            break;
          }
        }

        if (headerRowIndex === -1) {
          console.error("Header row not found.");
          showToast(
            "error",
            "Required headers not found in Excel file. Please ensure columns: No, MR Name, Team Name, Contact No, Email"
          );
          return;
        }

        const mappedData = rows
          .slice(headerRowIndex + 1)
          .map((row) => {
            const item = {};
            Object.entries(headersMap).forEach(([index, key]) => {
              item[key] = row[index] || "";
            });

            return {
              no: item["no"],
              medicalRepName: item["mr name"], // Fixed: was mrName, now medicalRepName
              teamName: item["team name"], // Fixed: was team, now teamName
              contactNo: item["contact no"],
              email: item["email"],
            };
          })
          .filter(
            (entry) =>
              entry.medicalRepName ||
              entry.teamName ||
              entry.contactNo ||
              entry.email
          );

        setParsedData(mappedData);
      } catch (error) {
        console.error("Error parsing file:", error);
        showToast("error", "Error parsing Excel file");
      }
    };

    reader.onerror = () => {
      showToast("error", "Error reading file");
    };

    reader.readAsArrayBuffer(file);
  };

  // ✅ Import staff
  const handleImport = async () => {
    if (!parsedData.length) {
      return showToast("warning", "Please upload a valid file first");
    }
    setIsUploading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/api/staffs/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Staff imported successfully!"
        );
        setShowImportModal(false);
        setParsedData([]);
        await refreshStaffList();
        await fetchTeams();
      }
    } catch (err) {
      const cleanMessage =
        err?.response?.data?.message?.replace(/<[^>]+>/g, "") ||
        "Failed to import staff.";
      showToast("error", cleanMessage);
    } finally {
      setIsUploading(false);
    }
  };

  // ✅ Toggle staff enabled/disabled
  const handlerEnabledStaff = async (id) => {
    const staffMember = staff.find((c) => c._id === id);
    if (!staffMember) return;

    try {
      const res = await axios.put(`${backendUrl}/api/staff/${id}`, {
        enabled: !staffMember.enabled,
      });

      if (res.status === 200) {
        setStaff((prev) =>
          prev.map((c) =>
            c._id === id ? { ...c, enabled: res.data.enabled } : c
          )
        );
      }
    } catch (err) {
      showToast("error", "Failed to update staff status.");
    }
  };

  const updateStaff = async (e) => {
    e.preventDefault();
    if (!form._id) return;

    try {
      const res = await axios.put(`${backendUrl}/api/staff/${form._id}`, form);

      if (res.status === 200) {
        showToast("success", "Staff updated successfully");
        setIsEditModalOpen(false);
        await refreshStaffList();
        await fetchTeams();
      }
    } catch (err) {
      showToast("error", "Failed to update staff.");
    }
  };

  useEffect(() => {
    setHighlightedIndex(-1); // Reset highlight on new suggestions
  }, [teamSuggestions]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "teamName") {
      setShowSuggestions(true);
    }
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
        if (highlightedIndex >= 0) {
          handleSelect(teamSuggestions[highlightedIndex]);
        }
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("add")}
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

      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        {staff.length > 0 ? (
          <div className="flex gap-4">
            {["All", "Enabled", "Disabled"].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`px-4 py-2 rounded-lg cursor-pointer ${
                  selectedTab === tab
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        ) : (
          <div></div>
        )}

        <div className="flex items-center gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredStaff.length}
            </span>
          </p>

          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-sm text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3">
                <div className="flex items-center gap-4">
                  {currentStaff.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentStaff.length &&
                        currentStaff.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  )}
                  <span>MR Name</span>
                </div>
              </th>
              <th className="p-3">Team</th>
              <th className="p-3">Contact No</th>
              <th className="p-3">Email</th>
              <th className="p-3">Joining Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentStaff.map((staff, index) => (
              <tr
                key={staff._id}
                className={`hover:bg-gray-50 ${
                  (index + 1) % staffPerPage === 0 ||
                  index + 1 === currentStaff.length
                    ? ""
                    : "border-b"
                }`}
              >
                <td className="p-3">
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selected.some((s) => s.id === staff._id)}
                      onChange={() => toggleSelect(staff)}
                    />
                    <span className="capitalize">{staff.medicalRepName}</span>
                  </div>
                </td>
                <td className="p-3">{staff.teamName}</td>
                <td className="p-3">{staff.contactNo || "--"}</td>
                <td className="p-3">{staff.email || "--"}</td>
                <td className="p-3">{formatDateToReadable(staff.date)}</td>
                <td>
                  <button
                    onClick={() => handlerEnabledStaff(staff._id)}
                    className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                      staff.enabled
                        ? "bg-green-100 text-green-600"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {staff.enabled ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td className="p-3 flex items-center justify-center gap-3">
                  <button
                    onClick={() => handleView(staff)}
                    className="text-blue-600 hover:text-blue-800 cursor-pointer"
                    title="View"
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => handleEdit(staff)}
                    className="text-green-600 hover:text-green-800 cursor-pointer"
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    className="text-red-600 hover:text-red-800 cursor-pointer"
                    title="Delete"
                    onClick={() => deleteStaff(staff)}
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {currentStaff.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center p-6 text-gray-500">
                  {loading ? "Loading..." : "No staff found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filteredStaff.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>
            {visiblePages.map((page, idx) =>
              page === "..." ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-3 py-1 text-gray-500 select-none"
                >
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                    currentPage === page
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              )
            )}
            <button
              onClick={() => {
                setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsViewModalOpen(false)}
              />

              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  View Staff
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      MR Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.medicalRepName || "--"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Team Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.teamName || "--"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Contact No
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.contactNo || "--"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Email
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.email || "--"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Joining Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.date
                        ? formatDateToReadable(form.date)
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Status
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsEditModalOpen(false)}
              />
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
                {/* Close Button */}
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                {/* Header */}
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Staff
                </h2>

                {/* Form Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* MR Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      MR Name
                    </label>
                    <input
                      type="text"
                      name="medicalRepName"
                      value={form.medicalRepName}
                      onChange={handleChange}
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  {/* Team Name + Suggestions */}
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
                      onBlur={() =>
                        setTimeout(() => setShowSuggestions(false), 150)
                      }
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
                            } ${
                              index !== teamSuggestions.length - 1
                                ? "border-b"
                                : ""
                            }`}
                          >
                            {team}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Contact No */}
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

                  {/* Email */}
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

                  {/* Created At */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                     Joining Date
                    </label>
                    <DatePicker
                      selected={
                        form.date ? new Date(form.date) : null
                      }
                      onChange={(date) =>
                        date
                          ? setForm({ ...form, date: date.toISOString() })
                          : null
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Status
                    </label>
                    <select
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
                </div>

                {/* Footer Buttons */}
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={updateStaff}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowImportModal(false)}
              />
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                {/* Close */}
                <button
                  onClick={() => setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>

                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Import Staff
                </h2>
                {isSampleFile && <SampleExcelDownloadStaff />}

                <div className="mb-6">
                  <label className="block text-gray-700 mb-2">File</label>
                  <input
                    type="file"
                    accept=".csv, .xlsx"
                    onChange={handleFileUpload}
                    className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                  />
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowImportModal(false)}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={isUploading || parsedData.length === 0}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading || parsedData.length === 0
                        ? "bg-blue-400 text-white cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isUploading
                      ? "Uploading…"
                      : `Upload (${parsedData.length})`}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default StaffMember;
