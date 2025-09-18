import React, { useState, useEffect, useMemo } from "react";
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

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const StaffMember = () => {
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const staffPerPage = 8;

  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    date: "",
    enabled: "",
    _id: null,
  });

  useEffect(() => {
    const fetchStaffs = async () => {
      try {
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

    fetchStaffs();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);
  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      const matchesTab =
        selectedTab === "All" ||
        (selectedTab === "Enabled" && s.enabled === true) ||
        (selectedTab === "Disabled" && s.enabled === false);

      const repMatch = s.medicalRepName
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const teamMatch = s.teamName
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      const matchesRepOrTeam = repMatch || teamMatch;

      return matchesTab && matchesRepOrTeam;
    });
  }, [staff, selectedTab, searchTerm]);

  const totalPages = Math.ceil(filteredStaff.length / staffPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const startIndex = (currentPage - 1) * staffPerPage;
  const endIndex = currentPage * staffPerPage;
  const currentStaff = filteredStaff.slice(startIndex, endIndex);
  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage, "...", totalPages];
  }

  const toggleSelect = (staff) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === staff.id);

      if (exists) {
        return prev.filter((c) => c.id !== staff.id);
      } else {
        return [...prev, { id: staff._id, name: staff.medicalRepName }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentStaff.map((s) => ({
        id: s._id,
        name: s.medicalRepName,
        team: s.teamName,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleView = (staff) => {
    setForm(staff);
    setIsViewModalOpen(true);
  };

  const handleEdit = (staff) => {
    setForm(staff);
    setIsEditModalOpen(true);
  };

  const deleteSelectedStaff = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete ${
        selected.length === 1
          ? `<b>${selected[0].name}</b>`
          : `<b>${selected.length}</b> staff members`
      }?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      const staffIdList = selected.map((s) => s.id);
      try {
        const res = await axios.delete(`${backendUrl}/api/staffs`, {
          data: staffIdList, // send IDs in request body
        });

        if (res.status === 200) {
          showToast("success", res.data.message);
          const refreshed = await fetch(`${backendUrl}/api/staffs`);
          const updated = await refreshed.json();
          setStaff(updated);
          setSelected([]);
        }
      } catch (err) {
        showToast("error", error.message);
      }
    } else {
      setSelected([]);
    }
  };

  const deleteStaff = async (staff) => {
    if (!staff._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${staff.medicalRepName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/staff/${staff._id}`);
        console.log('values of res', res);
        if (res.status === 200) {
          showToast(
            "success",
            `Staff <b>${staff.medicalRepName}</b> deleted successfully`
          );
          const refreshed = await fetch(`${backendUrl}/api/staffs`);
          const updated = await refreshed.json();
          setStaff(updated);
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    } else {
      setSelected([]);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      const HEADER_ROW_INDEX = 2;
      const rawHeaders = rows[HEADER_ROW_INDEX];
      const headersMap = {};
      rawHeaders.forEach((header, index) => {
        if (!header) return;
        const cleaned = header.toString().trim().toLowerCase();
        headersMap[index] = cleaned;
      });
      const dataRows = rows.slice(HEADER_ROW_INDEX + 1);
      const mappedData = dataRows
        .map((row, rowIndex) => {
          const item = {};
          Object.entries(headersMap).forEach(([index, key]) => {
            item[key] = row[index] || "";
          });

          const mappedRow = {
            no: item["no"],
            mrName: item["mr name"],
            teamName: item["team"],
          };

          return mappedRow;
        })
        .filter((entry) => entry.no);
      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!parsedData || parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

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

        const updated = await fetch(`${backendUrl}/api/staffs`);
        const updatedData = await updated.json();
        setStaff(updatedData);
      }
    } catch (err) {
      console.error("Import error:", err);

      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");
        showToast("error", cleanMessage || "Failed to import suppliers.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    }
  };

  const handlerEnabledStaff = async (id) => {
    try {
      const staffMember = staff.find((c) => c._id === id);

      if (!staffMember) {
        return;
      }

      const updatedStaff = { ...staffMember, enabled: !staffMember.enabled };
      const url = `${backendUrl}/api/staff/${id}`;

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: updatedStaff.enabled }),
      });
      console.log('values ofres', response);
      if (!response.ok) {
        throw new Error("Failed to update staff");
      }

      const data = await response.json();
      setStaff((prev) =>
        prev.map((c) => (c._id === id ? { ...c, enabled: data.enabled } : c))
      );
    } catch (err) {
      console.log("Caught error:", err);
    }
  };
    const updateStaff = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.put(
        `${backendUrl}/api/staff/${form._id}`,
        form
      );
      if (res.status === 200) {
        showToast("success", "Staff updated successfully");
        setIsEditModalOpen(false);
        const updated = await fetch(`${backendUrl}/api/staffs`);
        setStaff(await updated.json());
      }
    } catch (err) {
      showToast("error", "Failed to update staff.");
    }
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span>
        Staff Members
      </div>

      {/* Top Bar */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md"
            // You can add navigation here
          >
            <UserPlus size={18} /> Add New Staff Member
          </button>

          <button
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md"
            onClick={() => setShowImportModal(true)}
          >
            <Upload size={18} /> Import Staff Members
          </button>

          {selected.length > 0 && (
            <button
              onClick={() => deleteSelectedStaff()}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
        <div className="flex justify-between items-center mb-4 gap-8">
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

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["All", "Enabled", "Disabled"].map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 rounded-lg ${
              selectedTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-sm text-center">
          <thead className="bg-gray-100 text-gray-700">
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
              <th className="p-3">Created At</th>
              <th className="p-3">Status</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentStaff.map((staff) => (
              <tr key={staff._id} className="border-b hover:bg-gray-50">
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
                <td className="p-3">{formatDateToReadable(staff.createdAt)}</td>
                <td>
                  <button
                    onClick={() => handlerEnabledStaff(staff._id)}
                    className={`px-3 py-1 rounded-full text-sm ${
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
                    className="text-blue-600 hover:text-blue-800"
                    title="View"
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => handleEdit(staff)}
                    className="text-green-600 hover:text-green-800"
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    className="text-red-600 hover:text-red-800"
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
                <td colSpan={6} className="text-center p-6 text-gray-500">
                  No staff found.
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
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
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
                  className={`px-3 py-1 rounded w-10 text-center transition ${
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
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
        {isViewModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
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
                    Team
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.teamName || "--"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Created At
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.createdAt
                      ? formatDateToReadable(form.createdAt)
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
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Staff
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* MR Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    MR Name
                  </label>
                  <input
                    type="text"
                    value={form.medicalRepName}
                    onChange={(e) =>
                      setForm({ ...form, medicalRepName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Team */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Team
                  </label>
                  <input
                    type="text"
                    value={form.teamName}
                    onChange={(e) =>
                      setForm({ ...form, teamName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>
                {/* Date Picker (Editable - changes createdAt) */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Created At
                  </label>
                  <DatePicker
                    selected={form.createdAt ? new Date(form.createdAt) : null}
                    onChange={(date) =>
                      date
                        ? setForm({ ...form, createdAt: date.toISOString() })
                        : null
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

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

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
                >
                  Cancel
                </button>

                <button
                  onClick={updateStaff}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportModal && (
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              {/* Close */}
              <button
                onClick={() => setShowImportModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Supplier
              </h2>
              <SampleExcelDownloadStaff />

              {/* File Upload */}
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
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};

export default StaffMember;
