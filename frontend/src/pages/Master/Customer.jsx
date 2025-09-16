import React, { useState, useEffect, useMemo } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import SampleExcelDownloadCustomer from "../../excels/SampleExcelDownloadCustomer";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const customersPerPage = 10;

const Customer = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);

  const [form, setForm] = useState({
    customerCode: "",
    date: "",
    medicalRepName: "",
    name: "",
    typeOfBusiness: "",
    customerNumber: "",
    address: "",
    zone: "",
    location: "",
    remark: "",
    _id: null,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${backendUrl}/api/customers`);
        if (!response.ok) throw new Error("Failed to fetch customers");
        const data = await response.json();
        setCustomers(data);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredCustomers = customers.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.typeOfBusiness.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.medicalRepName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.zone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.date.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredCustomers.length / customersPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentCustomers = filteredCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
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

  // Select/unselect a customer by id
  const toggleSelect = (customer) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === customer.id);

      if (exists) {
        // Remove if already selected
        return prev.filter((c) => c.id !== customer._id);
      } else {
        // Add new selection
        return [...prev, { id: customer._id, name: customer.name }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentCustomers.map((s) => ({
        id: s._id,
        name: s.name,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> customers`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/customers`, {
          data: { ids: selected }, // send IDs in request body
        });

        if (res.status === 200) {
          showToast("success", "Selected customers deleted successfully");
          // Refresh customer list
          const updated = await fetch(`${backendUrl}/api/customers`);
          const data = await updated.json();
          setCustomers(data);

          // Clear selection
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    } else {
      setSelected([]);
    }
  };

  // Open edit modal with selected customer data
  const editCustomer = (customer) => {
    setForm({ ...customer });
    setIsEditModalOpen(true);
  };

  // Open view modal with selected customer data
  const handleView = (customer) => {
    setForm({ ...customer });
    setIsViewModalOpen(true);
  };

  const deleteCustomer = async (customer) => {
    if (!customer._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${customer.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/customers/${customer._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Customer <b>${customer.name}</b> deleted successfully`
          );
          const updated = await axios.get(`${backendUrl}/api/customers`);
          setCustomers(updated.data);
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };

  // File upload and parsing logic for import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

      if (rows.length === 0) {
        console.warn("Excel file is empty");
        return;
      }

      const HEADER_ROW_INDEX = 3;
      const rawHeaders = rows[HEADER_ROW_INDEX];

      const headersMap = {};
      rawHeaders.forEach((header, index) => {
        if (!header) return;
        const cleaned = header.toString().trim().toLowerCase();
        headersMap[index] = cleaned;
      });

      // ✅ Data starts from index 4 (i.e., 5th row in Excel)
      const dataRows = rows.slice(HEADER_ROW_INDEX + 1);

      const mappedData = dataRows
        .map((row, rowIndex) => {
          const item = {};

          Object.entries(headersMap).forEach(([index, key]) => {
            item[key] = row[index] || "";
          });

          return {
            customerCode: item["customer code"],
            date: parseExcelDate(item["date"]),
            medicalRepName: item["medical representative name"],
            name: item["customer name in english"],
            typeOfBusiness: item["types of business"],
            customerNumber: item["customer number"],
            address: item["customer address"],
            zone: item["zone"],
            location: item["location"],
            remark: item["remark"],
          };
        })
        .filter((entry) => entry.customerCode); // ✅ Only rows with data
      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  // 🔁 Convert Excel serial date or string to JS Date (helper)
  const parseExcelDate = (value) => {
    if (!value) return null;

    if (typeof value === "number") {
      const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return jsDate.toISOString(); // Or keep as Date object
    }

    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  // Import parsed customers to backend
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/customers/import`,
        parsedData
      );

      // If import is successful
      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Customers imported successfully!"
        );
        setShowImportModal(false);

        // Refresh customer list
        const updated = await fetch(`${backendUrl}/api/customers`);
        setCustomers(await updated.json());
      }
    } catch (err) {
      console.error("Import error:", err);

      // Handle backend validation errors (400) and server errors (500)
      if (err.response) {
        const { message } = err.response.data;

        // Optional: sanitize HTML tags from message (if needed)
        const cleanMessage = message.replace(/<[^>]+>/g, "");

        showToast("error", cleanMessage || "Failed to import customers.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Update customer on backend
  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.put(
        `${backendUrl}/api/customers/${form._id}`,
        form
      );
      if (res.status === 200) {
        showToast("success", "Customer updated successfully");
        setIsEditModalOpen(false);
        const updated = await fetch(`${backendUrl}/api/customers`);
        setCustomers(await updated.json());
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast("error", "Failed to update customer.");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/masterlayout/customer/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md"
          >
            <UserPlus size={18} /> Add New Customer
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md"
          >
            <Upload size={18} /> Import CSV
          </button>
          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
              onClick={() => handleDeleteSelected()}
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

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">
                <div className="flex items-center gap-4">
                  {currentCustomers.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentCustomers.length &&
                        currentCustomers.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  )}
                  <span>Name</span>
                </div>
              </th>
              <th className="p-3">Business</th>
              <th className="p-3">medicalRepName</th>
              <th className="p-3">Address</th>
              <th className="p-3">Zone</th>
              <th className="p-3">Location</th>
              <th className="p-3">Created At</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentCustomers.length > 0 ? (
              currentCustomers.map((customer) => (
                <tr key={customer._id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selected.some((s) => s.id === customer._id)}
                        onChange={() => toggleSelect(customer)}
                      />
                      <span className="capitalize">{customer.name}</span>
                    </div>
                  </td>
                  <td className="p-3">{customer.typeOfBusiness}</td>
                  <td className="p-3 capitalize">{customer.medicalRepName}</td>
                  <td className="p-3 capitalize">{customer.address}</td>
                  <td className="p-3 capitalize">{customer.zone}</td>
                  <td className="p-3 capitalize">{customer.location}</td>
                  <td className="p-3">{formatDateToReadable(customer.date)}</td>
                  <td className="p-3 flex items-center justify-center gap-3">
                    <button className="text-blue-600 hover:text-blue-800">
                      <Eye onClick={() => handleView(customer)} size={18} />
                    </button>
                    <button className="text-green-600 hover:text-green-800">
                      <Edit onClick={() => editCustomer(customer)} size={18} />
                    </button>
                    <button
                      onClick={() => deleteCustomer(customer)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-3 text-center">
                  No customer records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {currentCustomers.length > 0 && (
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
      </div>

      {/* CSV Upload Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            {/* Close */}
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              disabled={isUploading}
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Import Customer
            </h2>

            <div className="mb-6">
              <label className="block text-gray-700 mb-2">File</label>
              <input
                type="file"
                accept=".csv, .xlsx"
                onChange={handleFileUpload}
                className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowImportModal(false)}
                disabled={isUploading}
                className={`px-5 py-2 rounded-lg ${
                  isUploading
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={isUploading}
                className={`px-5 py-2 rounded-lg ${
                  isUploading
                    ? "bg-blue-400 text-white cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isUploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Edit Customer
            </h2>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await axios.put(
                    `${backendUrl}/api/customers/${form._id}`,
                    form
                  );
                  if (res.status === 200) {
                    showToast("success", "Customer updated successfully");
                    setIsEditModalOpen(false);
                    const updated = await fetch(`${backendUrl}/api/customers`);
                    setCustomers(await updated.json());
                  }
                } catch (err) {
                  console.error("Update error:", err);
                  showToast("error", "Failed to update customer.");
                }
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {/* New fields similar to View Modal */}
              <div>
                <label className="block text-sm font-medium">
                  Customer Code
                </label>
                <input
                  type="text"
                  value={form.customerCode}
                  onChange={(e) =>
                    setForm({ ...form, customerCode: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Customer Number
                </label>
                <input
                  type="text"
                  value={form.customerNumber}
                  onChange={(e) =>
                    setForm({ ...form, customerNumber: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Customer Remark
                </label>
                <input
                  type="text"
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Type of Business
                </label>
                <input
                  type="text"
                  value={form.typeOfBusiness}
                  onChange={(e) =>
                    setForm({ ...form, typeOfBusiness: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Medical Rep Name
                </label>
                <input
                  type="text"
                  value={form.medicalRepName}
                  onChange={(e) =>
                    setForm({ ...form, medicalRepName: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Zone</label>
                <input
                  type="text"
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              {/* Existing Fields */}
              <div>
                <label className="block text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Date</label>
                <DatePicker
                  selected={form.date ? new Date(form.date) : null}
                  onChange={(date) =>
                    date ? setForm({ ...form, date: date.toISOString() }) : null
                  }
                  dateFormat="yyyy-MM-dd"
                  placeholderText="Select a date"
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>
            </form>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCustomer}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
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
              View Customer
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Existing fields */}
              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Customer Code
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.customerCode}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Name
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.name}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Customer Number
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.customerNumber}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Customer Remark
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.remark?.trim() ? form.remark : "No Remarks"}
                </p>
              </div>

              {/* New fields from the table */}
              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Type of Business
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.typeOfBusiness}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Medical Rep Name
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.medicalRepName}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Address
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.address}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Zone
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.zone}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Location
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.location}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Date
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                  {formatDateToReadable(form.date)}
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

      {showDeleteModal && selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">
              Delete Customer
            </h2>
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{selected.name}</strong>?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customer;
