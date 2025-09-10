import React, { useState, useEffect } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import SampleCSVDownload from '../../excels/SampleCSVDownload';

const Customer = () => {
  const navigate = useNavigate();
  const backendUrl = "http://localhost:3001";

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);

  const [selectedTab, setSelectedTab] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const customersPerPage = 5;
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
});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Fetch customers from backend
  useEffect(() => {
    const fetchCustomers = async () => {
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
    };

    fetchCustomers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = () => {
    setCustomers((prev) => prev.filter((c) => !selected.includes(c.id)));
    setSelected([]);
  };

const editCustomer = (customer) => {
  setForm(customer);        // populate the form with selected customer data
  setIsEditModalOpen(true); // open edit modal
};

const handleView = (customer) => {
  setForm(customer);        // populate form or display data as needed
  setIsViewModalOpen(true); // open view modal
};

  const filteredCustomers = customers.filter((c) => {
    const matchesTab =
      selectedTab === "All" ||
      (selectedTab === "To Pay" && c.type === "pay") ||
      (selectedTab === "To Collect" && c.type === "receive");

    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const indexOfLastCustomer = currentPage * customersPerPage;
  const indexOfFirstCustomer = indexOfLastCustomer - customersPerPage;
  const currentCustomers = filteredCustomers.slice(
    indexOfFirstCustomer,
    indexOfLastCustomer
  );
  const totalPages = Math.ceil(filteredCustomers.length / customersPerPage);

  // ----------------------------
  // IMPORT SUPPLIER EXCEL LOGIC
  // ----------------------------

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);

    const reader = new FileReader();

    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      setParsedData(jsonData);
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  const handleImport = async () => {
    try {
      const response = await axios.post(`${backendUrl}/api/customers/import`, parsedData);
      console.log('values of response', response);
      if (response.status === 200) {
        alert("Customers imported successfully!");
        setShowImportModal(false);
        // Optionally reload customers
        const updated = await fetch(`${backendUrl}/api/customers`);
        setCustomers(await updated.json());
      }
    } catch (error) {
      console.error("Import error:", error);
      alert("Failed to import customers.");
    }
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Master{" "}
        <span className="mx-2">{">"}</span> Customer
      </div>

      {/* Top Bar */}
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  checked={
                    selected.length === currentCustomers.length &&
                    currentCustomers.length > 0
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? displayedSuppliers.map((s) => s.id)
                        : []
                    )
                  }
                />
              </th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Created At</th>
              <th className="p-3 text-left">Balance</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentCustomers.map((customer) => (
              <tr key={customer._id} className="border-b hover:bg-gray-50">
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(customer.id)}
                    onChange={() => toggleSelect(customer.id)}
                  />
                </td>
                <td className="p-3">{customer.name}</td>
                <td className="p-3">{customer.email}</td>
                <td className="p-3">{customer.createdAt}</td>
                <td
                  className={`p-3 font-medium ${
                    customer.openingBalance < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {customer.openingBalance < 0
                    ? `₹${Math.abs(customer.openingBalance)}`
                    : `₹${customer.openingBalance}`}
                </td>
                <td className="p-3">{customer.status}</td>
                <td className="p-3 flex items-center justify-center gap-3">
                  <button className="text-blue-600 hover:text-blue-800">
                    <Eye onClick={editCustomer} size={18} />
                  </button>
                  <button className="text-green-600 hover:text-green-800">
                    <Edit size={18} />
                  </button>
                  <button className="text-red-600 hover:text-red-800">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="mt-4 flex justify-center gap-2">
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
              Import Supplier
            </h2>

            {/* Sample CSV link */}
            <SampleCSVDownload />

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
  );
};

export default Customer;
