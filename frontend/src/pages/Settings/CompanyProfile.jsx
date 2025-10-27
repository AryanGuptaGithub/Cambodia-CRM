import React, { useState, useEffect, useRef } from "react";
import { Eye, Edit, Trash2, UserPlus, Download, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const companiesPerPage = 7;

const CompanyProfile = () => {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const inputRef = useRef(null);

  const [form, setForm] = useState({
    companyCode: "",
    companyName: "",
    registrationNumber: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    taxNumber: "",
    establishedDate: "",
    description: "",
    _id: null,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/company-profile`);
      if (!response.ok) throw new Error("Failed to fetch companies");
      const data = await response.json();
      setCompanies(data.companies || []);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredCompanies = companies.filter(
    (company) =>
      company.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.registrationNumber
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      company.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if company profile already exists
  const hasCompanyProfile = companies.length > 0;

  // Pagination calculations
  const totalPages = Math.ceil(filteredCompanies.length / companiesPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentCompanies = filteredCompanies.slice(
    (currentPage - 1) * companiesPerPage,
    currentPage * companiesPerPage
  );

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

  // Select/unselect a company by id
  const toggleSelect = (company) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === company._id);

      if (exists) {
        return prev.filter((c) => c.id !== company._id);
      } else {
        return [...prev, { id: company._id, name: company.companyName }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentCompanies.map((s) => ({
        id: s._id,
        name: s.companyName,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> companies`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/company-profile`, {
          data: { ids: selected.map((s) => s.id) },
        });

        if (res.status === 200) {
          showToast("success", "Selected companies deleted successfully");
          fetchCompanies();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected companies.");
      }
    } else {
      setSelected([]);
    }
  };

  // Open edit modal with selected company data
  const editCompany = (company) => {
    setForm({
      ...company,
      establishedDate: company.establishedDate || "",
    });
    setIsEditModalOpen(true);
  };

  // Open view modal with selected company data
  const handleView = (company) => {
    setForm({
      ...company,
      establishedDate: company.establishedDate || "",
    });
    setIsViewModalOpen(true);
  };

  // Open add modal with empty form
  const openAddModal = () => {
    setForm({
      companyCode: "",
      companyName: "",
      registrationNumber: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      taxNumber: "",
      establishedDate: "",
      description: "",
      _id: null,
    });
    setIsAddModalOpen(true);
  };

  const deleteCompany = async (company) => {
    if (!company._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${company.companyName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/company-profile/${company._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Company <b>${company.companyName}</b> deleted successfully`
          );
          fetchCompanies();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete company.");
      }
    }
  };

  // Download Excel functionality
  const downloadExcel = () => {
    if (filteredCompanies.length === 0) {
      showToast("warning", "No data to download");
      return;
    }

    try {
      // Prepare data for Excel
      const excelData = filteredCompanies.map((company) => ({
        "Company Code": company.companyCode || "",
        "Company Name": company.companyName || "",
        "Registration Number": company.registrationNumber || "",
        Address: company.address || "",
        Phone: company.phone || "",
        Email: company.email || "",
        Website: company.website || "",
        "Tax Number": company.taxNumber || "",
        "Established Date": company.establishedDate
          ? formatDateToReadable(company.establishedDate)
          : "",
        Description: company.description || "",
        Status: company.enabled ? "Enabled" : "Disabled",
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Companies");

      // Generate Excel file and download
      XLSX.writeFile(
        wb,
        `companies_${new Date().toISOString().split("T")[0]}.xlsx`
      );

      showToast(
        "success",
        `Downloaded ${filteredCompanies.length} companies successfully`
      );
    } catch (error) {
      console.error("Error downloading Excel:", error);
      showToast("error", "Failed to download Excel file");
    }
  };

  // Update company on backend
  const handleUpdateCompany = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.put(
        `${backendUrl}/api/company-profile/${form._id}`,
        form
      );
      if (res.status === 200) {
        showToast(
          "success",
          `Company <b>${form.companyName}</b> updated successfully`
        );
        setIsEditModalOpen(false);
        fetchCompanies();
      }
    } catch (err) {
      showToast("error", "Failed to update company.");
    }
  };

  // Create new company
  const handleCreateCompany = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${backendUrl}/api/company-profile`, form);
      if (res.status === 201) {
        showToast(
          "success",
          `Company <b>${form.companyName}</b> created successfully`
        );
        setIsAddModalOpen(false);
        fetchCompanies();
      }
    } catch (err) {
      showToast("error", "Failed to create company.");
    }
  };

  const handleEnabledCompany = async (id) => {
    try {
      const company = companies.find((c) => c._id === id);
      if (!company) return;
      const updatedCompany = { ...company, enabled: !company.enabled };
      const response = await fetch(`${backendUrl}/api/company-profile/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: updatedCompany.enabled }),
      });

      if (!response.ok) throw new Error("Failed to update company");

      const data = await response.json();
      setCompanies((prev) =>
        prev.map((c) => (c._id === id ? { ...c, enabled: data.enabled } : c))
      );
    } catch (err) {
      console.error("Error updating company:", err);
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-3">
          {/* Only show Add New Company button if no company exists */}
          {!hasCompanyProfile && (
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
            >
              <UserPlus size={18} /> Add Company Profile
            </button>
          )}

          {/* Download Excel button - Only show when there are companies */}
          {hasCompanyProfile && (
            <button
              onClick={downloadExcel}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
            >
              <Download size={18} /> Download Excel
            </button>
          )}
        </div>
      </div>

      {/* Table - Only show when there are companies */}
      {hasCompanyProfile ? (
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 text-sm font-medium w-25">Sr No.</th>
                <th className="p-3 text-sm font-medium">Company Name</th>
                <th className="p-3 text-sm font-medium">Registration Number</th>
                <th className="p-3 text-sm font-medium">Address</th>
                <th className="p-3 text-sm font-medium">Phone</th>
                <th className="p-3 text-sm font-medium">Email</th>
                <th className="p-3 text-sm font-medium">Established Date</th>
                <th className="p-3 text-sm font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentCompanies.length > 0 ? (
                currentCompanies.map((company, index) => (
                  <tr
                    key={company._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % companiesPerPage === 0 ||
                      index + 1 === currentCompanies.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">{index + 1}</td>
                    <td className="p-3">{company.companyName}</td>
                    <td className="p-3">{company.registrationNumber}</td>
                    <td className="p-3 capitalize">{company.address}</td>
                    <td className="p-3">{company.phone}</td>
                    <td className="p-3">{company.email}</td>
                    <td className="p-3">
                      {formatDateToReadable(company.establishedDate)}
                    </td>

                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleView(company)}
                        className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => editCompany(company)}
                        className="text-green-600 hover:text-green-800 cursor-pointer transition-colors"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => deleteCompany(company)}
                        className="text-red-600 hover:text-red-800 cursor-pointer transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    No company records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {currentCompanies.length > 0 && (
            <div className="mt-4 p-5 flex justify-start gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Prev
              </button>
              {visiblePages.map((page, idx) =>
                page === "..." ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-3 py-1 text-gray-500 select-none cursor-pointer"
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
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        // Empty state when no company exists
        <div className="text-center py-12 bg-white rounded-2xl shadow border border-gray-200">
          <UserPlus size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No Company Profile Found
          </h3>
          <p className="text-gray-500 mb-6">
            Get started by creating your company profile
          </p>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-md cursor-pointer transition-colors mx-auto"
          >
            <UserPlus size={20} /> Add Company Profile
          </button>
        </div>
      )}

      {/* Add Company Modal */}
      {isAddModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAddModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Add Company Profile
              </h2>
              <form
                onSubmit={handleCreateCompany}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Code *
                  </label>
                  <input
                    type="text"
                    value={form.companyCode}
                    onChange={(e) =>
                      setForm({ ...form, companyCode: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) =>
                      setForm({ ...form, companyName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    value={form.registrationNumber}
                    onChange={(e) =>
                      setForm({ ...form, registrationNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tax Number
                  </label>
                  <input
                    type="text"
                    value={form.taxNumber}
                    onChange={(e) =>
                      setForm({ ...form, taxNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="text"
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    rows="3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Established Date
                  </label>
                  <DatePicker
                    selected={
                      form.establishedDate
                        ? new Date(form.establishedDate)
                        : null
                    }
                    onChange={(date) =>
                      date
                        ? setForm({
                            ...form,
                            establishedDate: date.toISOString().split("T")[0],
                          })
                        : setForm({ ...form, establishedDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
              </form>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCompany}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Create Company
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Edit Company Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Company
              </h2>
              <form
                onSubmit={handleUpdateCompany}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Code
                  </label>
                  <input
                    type="text"
                    value={form.companyCode}
                    onChange={(e) =>
                      setForm({ ...form, companyCode: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) =>
                      setForm({ ...form, companyName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    value={form.registrationNumber}
                    onChange={(e) =>
                      setForm({ ...form, registrationNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tax Number
                  </label>
                  <input
                    type="text"
                    value={form.taxNumber}
                    onChange={(e) =>
                      setForm({ ...form, taxNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="text"
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    rows="3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Established Date
                  </label>
                  <DatePicker
                    selected={
                      form.establishedDate
                        ? new Date(form.establishedDate)
                        : null
                    }
                    onChange={(date) =>
                      date
                        ? setForm({
                            ...form,
                            establishedDate: date.toISOString().split("T")[0],
                          })
                        : setForm({ ...form, establishedDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
              </form>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateCompany}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Update Company
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* View Company Modal */}
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
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Company
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Company Code
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.companyCode}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Company Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50 capitalize">
                    {form.companyName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Registration Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.registrationNumber}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Tax Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.taxNumber}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Phone
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.phone}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.email}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Website
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.website}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Address
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50 capitalize">
                    {form.address}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Description
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50 min-h-[80px]">
                    {form.description || "No description provided"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Established Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {formatDateToReadable(form.establishedDate)}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default CompanyProfile;
