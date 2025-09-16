import React, { useState, useEffect, useMemo } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import SampleExcelDownloadCustomer from "../../excels/SampleExcelDownloadCustomer";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";

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

  const [selectedTab, setSelectedTab] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [form, setForm] = useState({
    warehouse: "",
    name: "",
    phone: "",
    email: "",
    status: "enabled",
    password: "",
    taxNumber: "",
    openingBalance: "",
    type: "",
    creditPeriod: "",
    creditLimit: "",
    profileImage: null,
    _id: null,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Fetch customers from backend
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

  // Reset page when filters change
  useEffect(() => setCurrentPage(1), [searchTerm, selectedTab]);

  // Memoized filtered customers based on tab and search
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesTab =
        selectedTab === "All" ||
        (selectedTab === "To Pay" && c.type === "pay") ||
        (selectedTab === "To Collect" && c.type === "receive");

      const matchesSearch =
        c?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c?.email?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [customers, selectedTab, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredCustomers.length / customersPerPage);

  const currentCustomers = filteredCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
  );

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

    try {
      console.log("values of parsedData", parsedData);
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

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["All", "To Pay", "To Collect"].map((tab) => (
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
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={
                      selected.length === currentCustomers.length &&
                      currentCustomers.length > 0
                    }
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
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
            {currentCustomers.map((customer) => (
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
                <td className="p-3">
                  {formatDateToReadable(customer.date)}
                </td>
                {/* <td
                  className={`p-3 font-medium ${
                    customer.type == "pay" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {customer.openingBalance < 0
                    ? `₹${Math.abs(customer.openingBalance)}`
                    : `₹${customer.openingBalance}`}
                </td> */}
                {/* <td className="p-3">{customer.status}</td> */}
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
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {/* <div className="mt-4 p-5 flex justify-start gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded ${
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
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div> */}
        <div className="mt-4 p-5 flex justify-start gap-2">
          {/* Prev Button */}
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Prev
          </button>

          {/* Render only first 5 pages */}
          {Array.from(
            { length: Math.min(totalPages, 5) },
            (_, index) => index + 1
          ).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 rounded ${
                currentPage === page
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          ))}

          {/* Next Button */}
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
      </div>

      {/* CSV Upload Modal */}
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
              Import Customer
            </h2>

            {/* Sample CSV link */}

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
                Upload
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
                    // Refresh customers list
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
                <label className="block text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Warehouse</label>
                <input
                  type="text"
                  value={form.warehouse}
                  onChange={(e) =>
                    setForm({ ...form, warehouse: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Tax Number</label>
                <input
                  type="text"
                  value={form.taxNumber}
                  onChange={(e) =>
                    setForm({ ...form, taxNumber: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Opening Balance
                </label>
                <input
                  type="number"
                  value={form.openingBalance}
                  onChange={(e) =>
                    setForm({ ...form, openingBalance: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border px-3 py-2 rounded-lg"
                >
                  <option value="">Select</option>
                  <option value="pay">To Pay</option>
                  <option value="receive">To Collect</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Credit Period
                </label>
                <input
                  type="number"
                  value={form.creditPeriod}
                  onChange={(e) =>
                    setForm({ ...form, creditPeriod: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Credit Limit
                </label>
                <input
                  type="number"
                  value={form.creditLimit}
                  onChange={(e) =>
                    setForm({ ...form, creditLimit: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full border px-3 py-2 rounded-lg"
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>

              {/* Profile Image - you can add file upload here if needed */}
            </form>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    const res = await axios.put(
                      `${backendUrl}/api/customers/${form._id}`,
                      form
                    );
                    if (res.status === 200) {
                      showToast("success", "Customer updated successfully");
                      setIsEditModalOpen(false);
                      const updated = await fetch(
                        `${backendUrl}/api/customers`
                      );
                      setCustomers(await updated.json());
                    }
                  } catch (err) {
                    console.error("Update error:", err);
                    showToast("error", "Failed to update customer.");
                  }
                }}
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
                  Email
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                  {form.email}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Phone
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                  {form.phone}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Warehouse
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.warehouse}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Tax Number
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                  {form.taxNumber}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Opening Balance
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                  {form.openingBalance}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Type
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.type}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Credit Period
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                  {form.creditPeriod}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Credit Limit
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                  {form.creditLimit}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600">
                  Status
                </label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {form.status}
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
