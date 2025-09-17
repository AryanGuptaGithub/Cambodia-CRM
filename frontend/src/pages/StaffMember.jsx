import React, { useState, useEffect } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { confirmDialog } from "../utils/confirmationDialog";
import { showToast } from "../utils/toast";
import * as XLSX from "xlsx";
import SampleExcelDownloadStaff from "../excels/SampleExcelDownloadStaff";
import { formatDateToReadable } from "../utils/dateUtil";

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
  const staffPerPage = 8;

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

  const filteredStaff = staff.filter((s) => {
    const repMatch = s.medicalRepName
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const nameMatch = s.teamName
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    return repMatch || nameMatch;
  });

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

  // Select/unselect supplier
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked) => {
    setSelected(checked ? currentSuppliers.map((s) => s._id) : []);
  };

  const handleView = (supplier) => {
    setForm(supplier);
    setIsViewModalOpen(true);
  };

  const handleEdit = (supplier) => {
    setForm(supplier);
    setIsEditModalOpen(true);
  };
  // Delete selected
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> suppliers?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/staffs`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Staff  deleted successfully");
          const refreshed = await fetch(`${backendUrl}/api/staffs`);
          const updated = await refreshed.json();
          setStaff(updated);
          setSelected([]);
        }
      } catch (err) {
        showToast("error", "Failed to delete staff.");
      }
    } else {
      setSelected([]); // uncheck all if user cancels
    }
  };

  // Delete one
  const deleteSupplier = async (supplier) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${supplier.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/staffs/${supplier._id}`
        );

        if (res.status === 200) {
          showToast("success", res.data.message);
          const refreshed = await fetch(`${backendUrl}/api/staffs`);
          const updated = await refreshed.json();
          setStaff(updated);
        }
      } catch (err) {
        showToast("error", error.message);
      }
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
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border px-3 py-2 rounded-lg shadow-sm"
        />
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
                <input
                  type="checkbox"
                  checked={
                    currentStaff.length > 0 &&
                    currentStaff.every((s) => selected.includes(s.id))
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3">MR Name</th>
              <th className="p-3">Team</th>
              <th className="p-3">Created At</th>
              <th className="p-3">Status</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentStaff.map((staff) => (
              <tr key={staff._id} className="border-b hover:bg-gray-50">
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(staff.id)}
                    onChange={() => toggleSelect(staff.id)}
                  />
                </td>
                <td className="p-3">{staff.medicalRepName}</td>
                <td className="p-3">{staff.teamName}</td>
                <td className="p-3">{formatDateToReadable(staff.createdAt)}</td>
                <td className="p-3 capitalize">{staff.enabled ? "enabled" : "disabled"}</td>
                <td className="p-3 flex items-center justify-center gap-3">
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    title="View"
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    className="text-green-600 hover:text-green-800"
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    className="text-red-600 hover:text-red-800"
                    title="Delete"
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
